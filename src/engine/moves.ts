import { Rational } from './rational';
import type { Equation, Side, Term } from './types';
import {
  areLike,
  constTerm,
  flipSign,
  otherSide,
  scaleTerm,
  sideTerms,
  signedCoef,
  termEquals,
  varTerm,
  withSide,
  zeroTerm,
} from './types';
import { sameSolution, solutionSet } from './linear';
import {
  MINUS,
  formatEquation,
  formatRational,
  formatSignedTerm,
  formatSum,
  formatTermBody,
  termParts,
} from './format';
import { status } from './status';

/**
 * The transformation engine. Every change to an equation is one of four Commands.
 * applyCommand validates the command, builds the "before / operation / after" record,
 * and independently re-checks that the new equation has exactly the same solution set.
 * Nothing in the interface changes an equation without going through here.
 */

export type Command =
  /** Undo the selected additive term by adding/subtracting it on both sides. */
  | { readonly type: 'addsub'; readonly side: Side; readonly index: number }
  /** Undo a multiplying coefficient ('coef') or a dividing denominator ('den') on both sides. */
  | { readonly type: 'scale'; readonly side: Side; readonly index: number; readonly part: 'coef' | 'den' }
  /** Multiply out the parentheses of one term. */
  | { readonly type: 'distribute'; readonly side: Side; readonly index: number }
  /** Combine all plain numbers, or all variable terms, on one side. */
  | { readonly type: 'combine'; readonly side: Side; readonly kind: 'const' | 'var' };

export type MoveKind = 'subtract' | 'add' | 'multiply' | 'divide' | 'distribute' | 'combine';

export interface Anchor {
  readonly side: Side;
  readonly index: number;
}

export interface MoveData {
  readonly command: Command;
  readonly kind: MoveKind;
  /** "Subtract 5 from both sides" */
  readonly label: string;
  /** Text written under the left / right side, such as "− 5" or "÷ 3". */
  readonly opLeft: string | null;
  readonly opRight: string | null;
  /** The term the operation is attached to (in `before`). */
  readonly anchor: Anchor;
  /** Terms of `before` that cancel away in this move (for the cancellation animation). */
  readonly cancelled: readonly Anchor[];
  readonly before: Equation;
  /** The operation applied to both sides, before simplifying: "x + 5 − 5 = 12 − 5". */
  readonly intermediate: string | null;
  readonly after: Equation;
  /** What we are doing and why (shown before the result). */
  readonly intro: string;
  /** What happened (shown after the result). */
  readonly result: string;
  /** Why the move is valid. */
  readonly why: string;
  /** The "move it and change the sign" shorthand, shown only when the student turns it on. */
  readonly shortcut: string | null;
  /** For distribute: the side written out with every product shown, such as "3·x + 3·2". */
  readonly expansion?: string | null;
}

export type MoveErrorCode =
  | 'bad-target'
  | 'needs-isolated'
  | 'no-factor'
  | 'nothing-to-remove'
  | 'div-zero'
  | 'not-group'
  | 'nothing-to-combine'
  | 'too-large'
  | 'divide-first-blocked'
  | 'distribute-first'
  | 'internal';

export interface MoveError {
  readonly code: MoveErrorCode;
  readonly message: string;
}

export type MoveResult =
  | { readonly ok: true; readonly move: MoveData }
  | { readonly ok: false; readonly error: MoveError };

const fail = (code: MoveErrorCode, message: string): MoveResult => ({ ok: false, error: { code, message } });

export function commandKey(c: Command): string {
  switch (c.type) {
    case 'addsub':
      return `addsub:${c.side}:${c.index}`;
    case 'scale':
      return `scale:${c.side}:${c.index}:${c.part}`;
    case 'distribute':
      return `distribute:${c.side}:${c.index}`;
    case 'combine':
      return `combine:${c.side}:${c.kind}`;
  }
}

// ---------------------------------------------------------------- helpers

/** After a move, parentheses that wrap a whole side and multiply nothing are redundant. */
function unwrapSide(terms: readonly Term[]): readonly Term[] {
  if (terms.length === 1) {
    const t = terms[0];
    if (t.core.kind === 'group' && t.sign === 1 && t.coef.equals(Rational.ONE)) return t.core.terms;
  }
  return terms;
}

const nonEmpty = (terms: readonly Term[]): readonly Term[] => (terms.length === 0 ? [zeroTerm()] : terms);

function lastLikeIndex(terms: readonly Term[], t: Term): number {
  for (let i = terms.length - 1; i >= 0; i--) if (areLike(terms[i], t)) return i;
  return -1;
}

function mergedLike(kind: 'const' | 'var', sum: Rational): Term {
  if (kind === 'const') return constTerm(sum);
  return sum.isZero() ? zeroTerm() : varTerm(sum);
}

function joinWords(parts: string[]): string {
  if (parts.length <= 1) return parts.join('');
  if (parts.length === 2) return `${parts[0]} and ${parts[1]}`;
  return `${parts.slice(0, -1).join(', ')}, and ${parts[parts.length - 1]}`;
}

/**
 * The number you would divide (part 'coef') or multiply (part 'den') both sides by to
 * undo the factor attached to this term, or null when the term has no such factor.
 * The sign of a one-term side belongs to its coefficient, so -3x gives -3.
 */
export function factorOf(eq: Equation, t: Term, part: 'coef' | 'den'): Rational | null {
  if (t.core.kind === 'const') return null;
  const wholeDecimal = eq.decimal && !t.coef.isInteger() && t.coef.toDecimalString() !== null;
  if (part === 'coef') {
    const mag = wholeDecimal ? t.coef : Rational.of(t.coef.n);
    const q = t.sign === 1 ? mag : mag.neg();
    return q.equals(Rational.ONE) ? null : q;
  }
  if (wholeDecimal || t.coef.isInteger()) return null;
  return Rational.of(t.coef.d);
}

/** Which combine commands are currently possible (two or more like terms on a side). */
export function availableCombines(eq: Equation): Extract<Command, { type: 'combine' }>[] {
  const out: Extract<Command, { type: 'combine' }>[] = [];
  for (const side of ['left', 'right'] as const) {
    const terms = sideTerms(eq, side);
    for (const kind of ['var', 'const'] as const) {
      if (terms.filter((t) => t.core.kind === kind).length >= 2) out.push({ type: 'combine', side, kind });
    }
  }
  return out;
}

const isolatedNote = (after: Equation): string =>
  status(after).kind === 'solved' ? ` The variable ${after.variable} is now isolated.` : '';

// ---------------------------------------------------------------- the four moves

function addSub(eq: Equation, side: Side, index: number): MoveResult {
  const terms = sideTerms(eq, side);
  const t = terms[index];
  if (!t) return fail('bad-target', 'That term is no longer in the equation.');
  const other = otherSide(side);
  const otherTerms = sideTerms(eq, other);
  const appended = flipSign(t);
  const kind: MoveKind = t.sign === 1 ? 'subtract' : 'add';
  const body = formatTermBody(t, eq);

  // Step 1 (shown as the operation row): the same term is added/subtracted on both sides.
  const selectedInter = [...terms.slice(0, index + 1), appended, ...terms.slice(index + 1)];
  const at = lastLikeIndex(otherTerms, t) + 1 || otherTerms.length;
  const otherInter = [...otherTerms.slice(0, at), appended, ...otherTerms.slice(at)];
  const interEq = withSide(withSide(eq, side, selectedInter), other, otherInter);

  // Step 2: simplify. On the selected side the term and its opposite cancel to zero.
  const cancelled: Anchor[] = [{ side, index }];
  const selectedAfter = nonEmpty(terms.filter((_, i) => i !== index));
  let otherAfter: readonly Term[];
  const cancelIdx = otherTerms.findIndex((u) => termEquals(u, t));
  if (cancelIdx >= 0) {
    // The other side already holds the same term, so it cancels there too (x - x = 0).
    cancelled.push({ side: other, index: cancelIdx });
    otherAfter = nonEmpty(otherTerms.filter((_, i) => i !== cancelIdx));
  } else if (otherTerms.length === 1 && areLike(otherTerms[0], appended)) {
    // One like term meets the new one: this is plain arithmetic (12 - 5 = 7).
    const sum = signedCoef(otherTerms[0]).add(signedCoef(appended));
    otherAfter = [mergedLike(appended.core.kind as 'const' | 'var', sum)];
  } else {
    otherAfter = otherInter;
  }
  const after = withSide(withSide(eq, side, selectedAfter), other, otherAfter);

  const verb = kind === 'subtract' ? 'Subtract' : 'Add';
  const prep = kind === 'subtract' ? 'from' : 'to';
  const opText = `${kind === 'subtract' ? MINUS : '+'} ${body}`;
  return {
    ok: true,
    move: {
      command: { type: 'addsub', side, index },
      kind,
      label: `${verb} ${body} ${prep} both sides`,
      opLeft: opText,
      opRight: opText,
      anchor: { side, index },
      cancelled,
      before: eq,
      intermediate: formatEquation(interEq),
      after,
      intro: `To remove ${formatSignedTerm(t, eq)} from the ${side} side, ${verb.toLowerCase()} ${body} ${prep} both sides.`,
      result: `We ${kind === 'subtract' ? 'subtracted' : 'added'} ${body} ${prep} both sides, so the equation stayed balanced. The ${formatSignedTerm(t, eq)} and ${formatSignedTerm(appended, eq)} cancel because they add up to zero.${isolatedNote(after)}`,
      why: 'Doing exactly the same thing to both sides keeps the equation balanced.',
      shortcut: `Shortcut: the ${formatSignedTerm(t, eq)} moved across the equals sign and became ${formatSignedTerm(appended, eq)}.`,
    },
  };
}

function scale(eq: Equation, side: Side, index: number, part: 'coef' | 'den'): MoveResult {
  const terms = sideTerms(eq, side);
  const t = terms[index];
  if (!t) return fail('bad-target', 'That term is no longer in the equation.');
  if (terms.length !== 1) {
    return fail(
      'needs-isolated',
      `That number only multiplies part of the ${side} side. To divide or multiply the whole side, first add or subtract the other terms on both sides so this term stands alone.`,
    );
  }
  if (t.core.kind === 'const') {
    return fail('no-factor', 'A plain number has no factor to undo here. Try the number multiplying or dividing the letter, or add or subtract this number.');
  }
  const q = factorOf(eq, t, part);
  if (q === null) {
    return fail(
      'nothing-to-remove',
      part === 'coef' ? 'There is no number multiplying here: the coefficient is already 1.' : 'There is no denominator to clear here.',
    );
  }
  if (q.isZero()) return fail('div-zero', 'Dividing by zero is undefined, so that operation isn’t allowed.');

  const kind: MoveKind = part === 'coef' ? 'divide' : 'multiply';
  const r = part === 'coef' ? Rational.ONE.div(q) : q;
  const scaleSide = (ts: readonly Term[]): readonly Term[] => ts.map((u) => scaleTerm(u, r));
  const after: Equation = {
    ...eq,
    left: unwrapSide(scaleSide(eq.left)),
    right: unwrapSide(scaleSide(eq.right)),
  };

  const qText = formatRational(q, eq.decimal);
  const sym = part === 'coef' ? '÷' : '×';
  const opText = q.sign() < 0 ? `${sym} (${qText})` : `${sym} ${qText}`;
  const wrap = (ts: readonly Term[]): string => (ts.length > 1 ? `(${formatSum(ts, eq)})` : formatSum(ts, eq));
  const p = termParts(t, eq);
  const what = `${p.coefText}${p.coreText}` || eq.variable;
  const intro =
    part === 'coef'
      ? q.equals(Rational.ONE.neg())
        ? `The negative sign multiplies ${t.core.kind === 'var' ? eq.variable : p.coreText} by −1. To undo that, divide both sides by −1.`
        : `${qText} is multiplying ${t.core.kind === 'var' ? eq.variable : p.coreText}. To undo that, divide both sides by ${qText}.`
      : `${what} is being divided by ${qText}. To undo that, multiply both sides by ${qText}.`;
  return {
    ok: true,
    move: {
      command: { type: 'scale', side, index, part },
      kind,
      label: `${part === 'coef' ? 'Divide' : 'Multiply'} both sides by ${qText}`,
      opLeft: opText,
      opRight: opText,
      anchor: { side, index },
      cancelled: [],
      before: eq,
      intermediate: `${wrap(eq.left)} ${sym} ${q.sign() < 0 ? `(${qText})` : qText} = ${wrap(eq.right)} ${sym} ${q.sign() < 0 ? `(${qText})` : qText}`,
      after,
      intro,
      result: `We ${part === 'coef' ? 'divided' : 'multiplied'} both sides by ${qText}, so the equation stayed balanced.${isolatedNote(after)}`,
      why: 'Multiplying or dividing both sides by the same non-zero number keeps the equation balanced.',
      shortcut: null,
    },
  };
}

function distribute(eq: Equation, side: Side, index: number): MoveResult {
  const terms = sideTerms(eq, side);
  const t = terms[index];
  if (!t) return fail('bad-target', 'That term is no longer in the equation.');
  if (t.core.kind !== 'group') return fail('not-group', 'There are no parentheses on that term to multiply out.');
  const factor = signedCoef(t);
  const inner = factor.isZero() ? [] : t.core.terms.map((u) => scaleTerm(u, factor));
  const newTerms = nonEmpty([...terms.slice(0, index), ...inner, ...terms.slice(index + 1)]);
  const after = withSide(eq, side, unwrapSide(newTerms));

  // The side with each multiplication spelled out: 3(x + 2) becomes "3·x + 3·2".
  const wrap = (text: string, negative: boolean): string => (negative ? `(${MINUS}${text})` : text);
  const fWrapped = wrap(formatRational(factor.abs(), eq.decimal), factor.sign() < 0);
  const products = t.core.terms.map((u) => `${fWrapped}·${wrap(formatTermBody(u, eq), u.sign === -1)}`).join(' + ');
  const expansion = terms
    .map((u, i) => {
      const body = i === index ? products : formatTermBody(u, eq);
      if (i === 0) return i === index || u.sign === 1 ? body : `${MINUS}${body}`;
      return i === index ? `+ ${body}` : `${u.sign === 1 ? '+' : MINUS} ${body}`;
    })
    .join(' ');

  const plain = t.sign === 1 && t.coef.equals(Rational.ONE);
  const minusOnly = t.sign === -1 && t.coef.equals(Rational.ONE);
  const fText = formatRational(factor, eq.decimal);
  const label = plain ? 'Remove the parentheses' : minusOnly ? 'Distribute the minus sign' : `Distribute the ${fText}`;
  const opText = plain ? 'remove ( )' : `× ${factor.sign() < 0 ? `(${fText})` : fText}`;
  return {
    ok: true,
    move: {
      command: { type: 'distribute', side, index },
      kind: 'distribute',
      label,
      opLeft: side === 'left' ? opText : null,
      opRight: side === 'right' ? opText : null,
      anchor: { side, index },
      cancelled: [],
      before: eq,
      intermediate: null,
      after,
      intro: plain
        ? 'Nothing multiplies these parentheses, so they can simply be removed.'
        : `Distribute ${minusOnly ? 'the minus sign' : `the ${fText}`}: multiply every term inside the parentheses by ${fText}.`,
      result: plain
        ? `Without the parentheses the side reads ${formatSum(inner, eq)}.`
        : `${fText} times each term inside gives ${formatSum(inner.length ? inner : [zeroTerm()], eq)}. Only the form changed, so the equation is still balanced.`,
      why: 'The distributive property says a(b + c) = ab + ac.',
      shortcut: null,
      expansion: plain ? null : expansion,
    },
  };
}

function combine(eq: Equation, side: Side, kind: 'const' | 'var'): MoveResult {
  const terms = sideTerms(eq, side);
  const idxs = terms.map((t, i) => (t.core.kind === kind ? i : -1)).filter((i) => i >= 0);
  if (idxs.length < 2) {
    return fail(
      'nothing-to-combine',
      kind === 'var'
        ? `There is only one ${eq.variable}-term on the ${side} side, so there is nothing to combine.`
        : `There is only one plain number on the ${side} side, so there is nothing to combine.`,
    );
  }
  const picked = idxs.map((i) => terms[i]);
  const sum = picked.reduce((acc, t) => acc.add(signedCoef(t)), Rational.ZERO);
  const merged = mergedLike(kind, sum);
  const out: Term[] = [];
  terms.forEach((t, i) => {
    if (i === idxs[0]) {
      if (!sum.isZero()) out.push(merged);
    } else if (!idxs.includes(i)) {
      out.push(t);
    }
  });
  const after = withSide(eq, side, nonEmpty(out));
  const names = picked.map((t, i) => (i === 0 && t.sign === 1 ? formatTermBody(t, eq) : formatSignedTerm(t, eq)));
  const noun = kind === 'var' ? `${eq.variable}-terms` : 'plain numbers';
  const resultText = formatSum([merged], eq);
  return {
    ok: true,
    move: {
      command: { type: 'combine', side, kind },
      kind: 'combine',
      label: `Combine like terms on the ${side} side`,
      opLeft: side === 'left' ? 'combine like terms' : null,
      opRight: side === 'right' ? 'combine like terms' : null,
      anchor: { side, index: idxs[0] },
      cancelled: [],
      before: eq,
      intermediate: null,
      after,
      intro: `${joinWords(names)} are all ${noun}, so they are like terms and can be combined.`,
      result: `Adding them: ${formatSum(picked, eq)} = ${resultText}. Only the form changed, so the equation is still balanced.`,
      why: 'Like terms count the same kind of thing, so they can be added together.',
      shortcut: null,
    },
  };
}

// ---------------------------------------------------------------- public entry point

/**
 * Optional classroom rules. The defaults change nothing, so the engine, the generator and the
 * tests behave exactly as before unless the interface passes rules in from Settings.
 */
export interface MoveRules {
  /** When false, "divide both sides" cannot be used on a term that still has parentheses. */
  readonly allowDivideFirst: boolean;
  /** When true, parentheses anywhere in the equation must be distributed before any other move. */
  readonly forceDistributeFirst: boolean;
}

export const NO_RULES: MoveRules = { allowDivideFirst: true, forceDistributeFirst: false };

const hasGroup = (eq: Equation): boolean => [...eq.left, ...eq.right].some((t) => t.core.kind === 'group');

const isZeroConst = (t: Term): boolean => t.core.kind === 'const' && t.coef.isZero();

/** "0 - 3x" is shown as "-3x": a zero next to other terms is simply dropped. */
const dropExtraZeros = (terms: readonly Term[]): readonly Term[] =>
  terms.length > 1 && terms.some(isZeroConst) ? terms.filter((t) => !isZeroConst(t)) : terms;

function checkRules(eq: Equation, cmd: Command, rules: MoveRules): MoveResult | null {
  if (rules.forceDistributeFirst && cmd.type !== 'distribute' && hasGroup(eq)) {
    return fail('distribute-first', 'There are parentheses in this equation. Distribute them first (select the part in parentheses), then continue.');
  }
  if (!rules.allowDivideFirst && cmd.type === 'scale') {
    const t = sideTerms(eq, cmd.side)[cmd.index];
    if (t && t.core.kind === 'group') {
      return fail('divide-first-blocked', 'Dividing everything first is not allowed here. Distribute the number into the parentheses first.');
    }
    // Dividing (or multiplying) both sides is a last step: the other side must already be one plain number,
    // so nothing else gets divided along with it (for example 5x - 9 = 2x must be combined first).
    const other = sideTerms(eq, otherSide(cmd.side));
    if (other.length !== 1 || other[0].core.kind !== 'const') {
      return fail(
        'divide-first-blocked',
        'Not yet. Dividing both sides now would also divide other terms. First combine like terms and move terms so the other side is just a number.',
      );
    }
  }
  return null;
}

export function applyCommand(eq: Equation, cmd: Command, rules: MoveRules = NO_RULES): MoveResult {
  try {
    const blocked = checkRules(eq, cmd, rules);
    if (blocked) return blocked;
    let result: MoveResult;
    switch (cmd.type) {
      case 'addsub':
        result = addSub(eq, cmd.side, cmd.index);
        break;
      case 'scale':
        result = scale(eq, cmd.side, cmd.index, cmd.part);
        break;
      case 'distribute':
        result = distribute(eq, cmd.side, cmd.index);
        break;
      case 'combine':
        result = combine(eq, cmd.side, cmd.kind);
        break;
      default:
        return fail('bad-target', 'That action is not supported.');
    }
    if (!result.ok) return result;
    result = { ok: true, move: { ...result.move, after: { ...result.move.after, left: dropExtraZeros(result.move.after.left), right: dropExtraZeros(result.move.after.right) } } };
    // Independent safety net: a committed move must never change the solution set.
    if (!sameSolution(solutionSet(eq), solutionSet(result.move.after))) {
      return fail('internal', 'That step would have changed the answer, so it was blocked. Please try a different move.');
    }
    return result;
  } catch (e) {
    if (e instanceof RangeError) {
      return fail('too-large', 'The numbers in that step became too large to handle.');
    }
    throw e;
  }
}
