import type { Rational } from './rational';
import type { Equation, Side, Term } from './types';
import { sideTerms } from './types';

/** The proper minus sign (not a hyphen) used everywhere text is shown. */
export const MINUS = '−';

/** Format a rational for display: decimals when the student used decimals, else fractions. */
export function formatRational(r: Rational, decimal: boolean): string {
  if (decimal) {
    const d = r.toDecimalString();
    if (d !== null) return d.replace('-', MINUS);
  }
  const text = r.toString();
  return text.replace('-', MINUS);
}

/**
 * Pieces needed to draw one term (without its sign). The same description is used for
 * the on-screen layout and for the plain-text form, so the two can never disagree.
 *
 *   3x      -> coefText "3",  core "x",        den null
 *   x/4     -> coefText "",   core "x",        den "4"
 *   3x/4    -> coefText "3",  core "x",        den "4"
 *   2(x+3)  -> coefText "2",  core "(x + 3)",  den null
 *   1/2     -> coefText "1",  core "",         den "2"
 *   5       -> coefText "5",  core "",         den null
 */
export interface TermParts {
  readonly kind: 'const' | 'var' | 'group';
  readonly coefText: string;
  readonly coreText: string;
  readonly den: string | null;
}

export function termParts(t: Term, eq: Pick<Equation, 'variable' | 'decimal'>): TermParts {
  const kind = t.core.kind;
  const coreText =
    t.core.kind === 'var'
      ? eq.variable
      : t.core.kind === 'group'
        ? `(${formatSum(t.core.terms, eq)})`
        : '';
  const asDecimal = eq.decimal ? t.coef.toDecimalString() : null;
  if (asDecimal !== null) {
    const hide = kind !== 'const' && t.coef.n === 1n && t.coef.d === 1n;
    return { kind, coefText: hide ? '' : asDecimal, coreText, den: null };
  }
  const num = t.coef.n.toString();
  const den = t.coef.d === 1n ? null : t.coef.d.toString();
  const hideNum = kind !== 'const' && t.coef.n === 1n;
  return { kind, coefText: hideNum ? '' : num, coreText, den };
}

/** Plain text for the body of a term, without its sign: "3x", "x/4", "2(x + 3)". */
export function formatTermBody(t: Term, eq: Pick<Equation, 'variable' | 'decimal'>): string {
  const p = termParts(t, eq);
  const top = `${p.coefText}${p.coreText}`;
  return p.den === null ? top : `${top}/${p.den}`;
}

/** "+5" or "−x": the term with its own sign attached. */
export function formatSignedTerm(t: Term, eq: Pick<Equation, 'variable' | 'decimal'>): string {
  return `${t.sign === 1 ? '+' : MINUS}${formatTermBody(t, eq)}`;
}

export function formatSum(terms: readonly Term[], eq: Pick<Equation, 'variable' | 'decimal'>): string {
  return terms
    .map((t, i) => {
      const body = formatTermBody(t, eq);
      if (i === 0) return t.sign === 1 ? body : `${MINUS}${body}`;
      return `${t.sign === 1 ? '+' : MINUS} ${body}`;
    })
    .join(' ');
}

export function formatSide(eq: Equation, side: Side): string {
  return formatSum(sideTerms(eq, side), eq);
}

export function formatEquation(eq: Equation): string {
  return `${formatSide(eq, 'left')} = ${formatSide(eq, 'right')}`;
}

/** Accessible, spoken-style description: "3x plus 5 equals 20". */
export function speakEquation(eq: Equation): string {
  const speak = (terms: readonly Term[]): string =>
    terms
      .map((t, i) => {
        const body = formatTermBody(t, eq).replace(/\//g, ' over ');
        if (i === 0) return t.sign === 1 ? body : `negative ${body}`;
        return `${t.sign === 1 ? 'plus' : 'minus'} ${body}`;
      })
      .join(' ');
  return `${speak(eq.left)} equals ${speak(eq.right)}`;
}

/** ASCII version of equation text, for exports and storage (no unicode minus). */
export function toAscii(text: string): string {
  return text.replaceAll(MINUS, '-');
}
