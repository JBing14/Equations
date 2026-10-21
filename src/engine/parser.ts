import { Rational } from './rational';
import type { Core, Equation, Term } from './types';
import { VAR_CORE, constTerm, flipSign, scaleTerm } from './types';
import { sumLinear } from './linear';

/**
 * Safe tokenizer + recursive-descent parser. User text is never evaluated as code:
 * it is split into a fixed set of tokens, parsed with an explicit grammar, and
 * converted into the structured Equation model.
 *
 *   equation := sum '=' sum
 *   sum      := ['+'|'-'] product (('+'|'-') product)*
 *   product  := unary (('*'|'/'|implicit) unary)*
 *   unary    := ('+'|'-') unary | atom
 *   atom     := NUMBER | LETTER | '(' sum ')'
 */

export const MAX_INPUT_LENGTH = 80;
export const MAX_DEPTH = 5;
export const MAX_TERMS_PER_SIDE = 12;
const MAX_NUMBER_DIGITS = 9;

export type ParseErrorCode =
  | 'empty'
  | 'too-long'
  | 'bad-char'
  | 'missing-equals'
  | 'multiple-equals'
  | 'empty-side'
  | 'missing-operand'
  | 'missing-operator'
  | 'unbalanced'
  | 'too-deep'
  | 'too-complex'
  | 'two-variables'
  | 'no-variable'
  | 'nonlinear'
  | 'div-zero'
  | 'number-format'
  | 'letter-after-number'
  | 'unsupported'
  | 'not-a-number';

export class ParseError extends Error {
  readonly code: ParseErrorCode;
  constructor(code: ParseErrorCode, message: string) {
    super(message);
    this.code = code;
    this.name = 'ParseError';
  }
}

export type ParseResult =
  | { readonly ok: true; readonly equation: Equation }
  | { readonly ok: false; readonly code: ParseErrorCode; readonly message: string };

// ---------------------------------------------------------------- tokens

type Tok =
  | { t: 'num'; text: string; pos: number }
  | { t: 'var'; name: string; pos: number }
  | { t: 'op'; v: '+' | '-' | '*' | '/'; pos: number }
  | { t: '(' | ')' | '='; pos: number };

const MINUS = new Set(['-', '−', '–', '—']);
const TIMES = new Set(['*', '×', '·', '⋅', '∙']);
const DIVIDE = new Set(['/', '÷']);

function tokenize(src: string): Tok[] {
  const toks: Tok[] = [];
  let i = 0;
  while (i < src.length) {
    const c = src[i];
    if (/\s/.test(c)) {
      i++;
    } else if (/[0-9.]/.test(c)) {
      let j = i;
      let dots = 0;
      while (j < src.length && /[0-9.]/.test(src[j])) {
        if (src[j] === '.') dots++;
        j++;
      }
      const text = src.slice(i, j);
      if (dots > 1 || !/\d/.test(text)) {
        throw new ParseError('number-format', `“${text}” isn't a number I can read. Use digits with at most one decimal point, like 2.5.`);
      }
      if (text.replace('.', '').length > MAX_NUMBER_DIGITS) {
        throw new ParseError('number-format', 'That number has too many digits. Please use a smaller number.');
      }
      toks.push({ t: 'num', text: text.endsWith('.') ? text.slice(0, -1) : text, pos: i });
      i = j;
    } else if (/[A-Za-z]/.test(c)) {
      toks.push({ t: 'var', name: c.toLowerCase(), pos: i });
      i++;
    } else if (c === '+') {
      toks.push({ t: 'op', v: '+', pos: i++ });
    } else if (MINUS.has(c)) {
      toks.push({ t: 'op', v: '-', pos: i++ });
    } else if (TIMES.has(c)) {
      toks.push({ t: 'op', v: '*', pos: i++ });
    } else if (DIVIDE.has(c)) {
      toks.push({ t: 'op', v: '/', pos: i++ });
    } else if (c === '(' || c === ')' || c === '=') {
      toks.push({ t: c, pos: i++ });
    } else if (c === '^' || c === '²' || c === '³' || c === '√') {
      throw new ParseError('unsupported', 'Exponents and square roots aren’t supported yet. Equation Explorer solves equations where the letter is not squared (like 2x + 3 = 11).');
    } else {
      throw new ParseError('bad-char', `The character “${c}” can't be used here. Try numbers, one letter, + − × ÷ and parentheses.`);
    }
  }
  return toks;
}

// ---------------------------------------------------------------- raw tree

type Raw =
  | { t: 'num'; v: Rational; dec: boolean }
  | { t: 'var'; name: string }
  | { t: 'neg'; e: Raw }
  | { t: 'sum'; terms: { sign: 1 | -1; e: Raw }[] }
  | { t: 'mul'; a: Raw; b: Raw }
  | { t: 'div'; a: Raw; b: Raw }
  | { t: 'group'; e: Raw };

const tokText = (t: Tok): string => {
  switch (t.t) {
    case 'num':
      return t.text;
    case 'var':
      return t.name;
    case 'op':
      return t.v === '-' ? '−' : t.v === '*' ? '×' : t.v === '/' ? '÷' : '+';
    default:
      return t.t;
  }
};

class RawParser {
  private i = 0;
  private depth = 0;
  readonly letters = new Set<string>();
  sawDecimal = false;

  constructor(private readonly toks: Tok[]) {}

  private peek(): Tok | undefined {
    return this.toks[this.i];
  }

  atEnd(): boolean {
    return this.i >= this.toks.length;
  }

  private missingAfterPrevious(): ParseError {
    const prev = this.toks[this.i - 1];
    return new ParseError(
      'missing-operand',
      prev
        ? `Something is missing after “${tokText(prev)}”. Add a number or letter there.`
        : 'Something is missing at the start. Add a number or letter there.',
    );
  }

  parseSum(): Raw {
    const terms: { sign: 1 | -1; e: Raw }[] = [];
    let sign: 1 | -1 = 1;
    let next = this.peek();
    while (next && next.t === 'op' && (next.v === '+' || next.v === '-')) {
      if (next.v === '-') sign = sign === 1 ? -1 : 1;
      this.i++;
      next = this.peek();
    }
    for (;;) {
      terms.push({ sign, e: this.parseProduct() });
      const op = this.peek();
      if (op && op.t === 'op' && (op.v === '+' || op.v === '-')) {
        sign = op.v === '-' ? -1 : 1;
        this.i++;
        continue;
      }
      break;
    }
    return { t: 'sum', terms };
  }

  private parseProduct(): Raw {
    let left = this.parseUnary();
    for (;;) {
      const tok = this.peek();
      if (!tok) break;
      if (tok.t === 'op' && tok.v === '*') {
        this.i++;
        left = { t: 'mul', a: left, b: this.parseUnary() };
      } else if (tok.t === 'op' && tok.v === '/') {
        this.i++;
        left = { t: 'div', a: left, b: this.parseUnary() };
      } else if (tok.t === 'num' || tok.t === 'var' || tok.t === '(') {
        const prev = this.toks[this.i - 1];
        if (tok.t === 'num' && prev.t === 'var') {
          throw new ParseError('letter-after-number', `Write the number before the letter: “${tok.text}${prev.name}”, or use × if you mean ${prev.name} times ${tok.text}. (Exponents aren't supported yet.)`);
        }
        if (tok.t === 'num' && prev.t === 'num') {
          throw new ParseError('missing-operator', `There needs to be an operator (+, −, ×, ÷) between ${prev.text} and ${tok.text}.`);
        }
        left = { t: 'mul', a: left, b: this.parseAtom() };
      } else {
        break;
      }
    }
    return left;
  }

  private parseUnary(): Raw {
    const tok = this.peek();
    if (tok && tok.t === 'op' && (tok.v === '+' || tok.v === '-')) {
      this.i++;
      const e = this.parseUnary();
      return tok.v === '-' ? { t: 'neg', e } : e;
    }
    return this.parseAtom();
  }

  private parseAtom(): Raw {
    const tok = this.peek();
    if (!tok || tok.t === ')' || tok.t === '=' || tok.t === 'op') {
      throw this.missingAfterPrevious();
    }
    this.i++;
    if (tok.t === 'num') {
      const dec = tok.text.includes('.');
      if (dec) this.sawDecimal = true;
      return { t: 'num', v: Rational.fromDecimalString(tok.text), dec };
    }
    if (tok.t === 'var') {
      this.letters.add(tok.name);
      return { t: 'var', name: tok.name };
    }
    // '('
    this.depth++;
    if (this.depth > MAX_DEPTH) {
      throw new ParseError('too-deep', 'Those parentheses are nested too deeply. Try simplifying the equation.');
    }
    const next = this.peek();
    if (next && next.t === ')') {
      throw new ParseError('missing-operand', 'There is nothing inside the parentheses “( )”. Put an expression between them.');
    }
    const inner = this.parseSum();
    const close = this.peek();
    if (!close || close.t !== ')') {
      throw new ParseError('unbalanced', 'A “(” is missing its matching “)”. Check that every parenthesis is closed.');
    }
    this.i++;
    this.depth--;
    return { t: 'group', e: inner };
  }
}

// ---------------------------------------------------------------- raw -> terms

function constValue(t: Term): Rational | null {
  const k = t.sign === 1 ? t.coef : t.coef.neg();
  if (t.core.kind === 'const') return k;
  if (t.core.kind === 'group') {
    const l = sumLinear(t.core.terms);
    return l.a.isZero() ? l.b.mul(k) : null;
  }
  return null;
}

function multiply(a: Term, b: Term): Term {
  const sign: 1 | -1 = a.sign === b.sign ? 1 : -1;
  const coef = a.coef.mul(b.coef);
  if (a.core.kind === 'const') return { sign, coef, core: b.core };
  if (b.core.kind === 'const') return { sign, coef, core: a.core };
  if (a.core.kind === 'var' && b.core.kind === 'var') {
    throw new ParseError('nonlinear', 'Multiplying a letter by itself (like x · x) makes x², which Equation Explorer can’t solve yet.');
  }
  throw new ParseError('nonlinear', 'Multiplying two expressions that both contain the letter isn’t supported yet. Each term can have a number times one letter or one set of parentheses.');
}

function toTerms(r: Raw): Term[] {
  switch (r.t) {
    case 'num':
      return [constTerm(r.v)];
    case 'var':
      return [{ sign: 1, coef: Rational.ONE, core: VAR_CORE }];
    case 'neg':
      return toTerms(r.e).map(flipSign);
    case 'sum':
      return r.terms.flatMap(({ sign, e }) => {
        const ts = toTerms(e);
        return sign === 1 ? ts : ts.map(flipSign);
      });
    case 'group': {
      const inner = toTerms(r.e);
      if (inner.length === 1) return inner; // redundant parentheses around one term
      const core: Core = { kind: 'group', terms: inner };
      return [{ sign: 1, coef: Rational.ONE, core }];
    }
    case 'mul': {
      const a = toTerms(r.a);
      const b = toTerms(r.b);
      if (a.length !== 1 || b.length !== 1) {
        throw new ParseError('unsupported', 'That multiplication is too complicated for now.');
      }
      return [multiply(a[0], b[0])];
    }
    case 'div': {
      const a = toTerms(r.a);
      const b = toTerms(r.b);
      if (a.length !== 1 || b.length !== 1) {
        throw new ParseError('unsupported', 'That division is too complicated for now.');
      }
      const den = constValue(b[0]);
      if (den === null) {
        throw new ParseError('nonlinear', 'Dividing by the letter (or by parentheses containing the letter) isn’t supported yet. You can divide by a number.');
      }
      if (den.isZero()) {
        throw new ParseError('div-zero', 'Dividing by zero is undefined, so this equation can’t be used. Check the number after the ÷ sign.');
      }
      return [scaleTerm(a[0], Rational.ONE.div(den))];
    }
  }
}

/** Remove redundant outer parentheses such as "(x + 3) = 7". */
function unwrap(terms: Term[]): Term[] {
  if (terms.length === 1) {
    const t = terms[0];
    if (t.core.kind === 'group' && t.sign === 1 && t.coef.equals(Rational.ONE)) {
      return [...t.core.terms];
    }
  }
  return terms;
}

function ensureSize(terms: Term[]): void {
  if (terms.length > MAX_TERMS_PER_SIDE) {
    throw new ParseError('too-complex', `That side has more than ${MAX_TERMS_PER_SIDE} terms. Please use a shorter equation.`);
  }
}

// ---------------------------------------------------------------- public API

function preflight(text: string): string {
  const src = text.trim();
  if (src.length === 0) {
    throw new ParseError('empty', 'Type an equation first, like 3x + 5 = 20.');
  }
  if (src.length > MAX_INPUT_LENGTH) {
    throw new ParseError('too-long', `That equation is longer than ${MAX_INPUT_LENGTH} characters. Please shorten it.`);
  }
  return src;
}

export function parseEquationOrThrow(text: string): Equation {
  const src = preflight(text);
  const toks = tokenize(src);
  const eqIndexes = toks.map((t, i) => (t.t === '=' ? i : -1)).filter((i) => i >= 0);
  if (eqIndexes.length === 0) {
    throw new ParseError('missing-equals', 'An equation needs an equals sign (=). Example: 3x + 5 = 20.');
  }
  if (eqIndexes.length > 1) {
    throw new ParseError('multiple-equals', 'Use exactly one equals sign (=). Equation Explorer solves one equation at a time.');
  }
  const split = eqIndexes[0];
  const leftToks = toks.slice(0, split);
  const rightToks = toks.slice(split + 1);
  if (leftToks.length === 0) {
    throw new ParseError('empty-side', 'The left side of the equation is empty. Put something before the equals sign.');
  }
  if (rightToks.length === 0) {
    throw new ParseError('empty-side', 'The right side of the equation is empty. Put something after the equals sign.');
  }

  const sides: Term[][] = [];
  const letters = new Set<string>();
  let decimal = false;
  for (const sideToks of [leftToks, rightToks]) {
    const p = new RawParser(sideToks);
    const raw = p.parseSum();
    if (!p.atEnd()) {
      const stray = sideToks.find((t) => t.t === ')');
      throw new ParseError(
        stray ? 'unbalanced' : 'missing-operator',
        stray ? 'There is a “)” without a matching “(”. Check your parentheses.' : 'Something doesn’t look right there. Check the operators between your terms.',
      );
    }
    p.letters.forEach((l) => letters.add(l));
    decimal = decimal || p.sawDecimal;
    const terms = unwrap(toTerms(raw));
    ensureSize(terms);
    sides.push(terms);
  }

  if (letters.size === 0) {
    throw new ParseError('no-variable', 'Your equation needs a letter to solve for, like x. Example: 2x + 1 = 9.');
  }
  if (letters.size > 1) {
    throw new ParseError('two-variables', `Use only one letter for the unknown. I found ${[...letters].join(', ')}. Equation Explorer solves for one letter at a time.`);
  }
  const variable = [...letters][0];
  return { left: sides[0], right: sides[1], variable, decimal };
}

export function parseEquation(text: string): ParseResult {
  try {
    return { ok: true, equation: parseEquationOrThrow(text) };
  } catch (e) {
    if (e instanceof ParseError) return { ok: false, code: e.code, message: e.message };
    if (e instanceof RangeError) {
      return { ok: false, code: 'number-format', message: 'A number in that equation became too large to handle. Please use smaller numbers.' };
    }
    throw e;
  }
}

/**
 * Read a numeric answer such as "7", "-2.5", "3/4" or "x = 3". Returns null when the
 * text is not a plain number.
 */
export function parseNumber(text: string): Rational | null {
  try {
    let src = text.trim();
    const m = /^[A-Za-z]\s*=\s*(.+)$/.exec(src);
    if (m) src = m[1];
    if (src.length === 0 || src.length > MAX_INPUT_LENGTH) return null;
    const toks = tokenize(src);
    if (toks.some((t) => t.t === 'var' || t.t === '=')) return null;
    const p = new RawParser(toks);
    const raw = p.parseSum();
    if (!p.atEnd()) return null;
    const terms = toTerms(raw);
    const l = sumLinear(terms);
    return l.a.isZero() ? l.b : null;
  } catch {
    return null;
  }
}

