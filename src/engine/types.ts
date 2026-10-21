import { Rational } from './rational';

/**
 * The structured equation model.
 *
 * An equation is two sums (left and right). A sum is a list of signed terms.
 * A term is  sign x coef x core,  where
 *   - coef is a positive rational (it can be zero only for a literal 0),
 *   - core is a plain number, the one variable, or a parenthesised sum.
 *
 * The display, the animation, the move history and the validation all read
 * this model; nothing ever edits equation text with string replacement.
 */

export type Side = 'left' | 'right';

export type Core =
  | { readonly kind: 'const' }
  | { readonly kind: 'var' }
  | { readonly kind: 'group'; readonly terms: readonly Term[] };

export interface Term {
  readonly sign: 1 | -1;
  readonly coef: Rational;
  readonly core: Core;
}

export interface Equation {
  readonly left: readonly Term[];
  readonly right: readonly Term[];
  /** The single letter that is the unknown, such as "x". */
  readonly variable: string;
  /** True when the student typed decimals; terminating decimals are then shown as decimals. */
  readonly decimal: boolean;
}

export const CONST_CORE: Core = { kind: 'const' };
export const VAR_CORE: Core = { kind: 'var' };

export const otherSide = (s: Side): Side => (s === 'left' ? 'right' : 'left');
export const sideTerms = (eq: Equation, s: Side): readonly Term[] => (s === 'left' ? eq.left : eq.right);
export const withSide = (eq: Equation, s: Side, terms: readonly Term[]): Equation =>
  s === 'left' ? { ...eq, left: terms } : { ...eq, right: terms };

/** The signed value of a term, such as -3 for "- 3" or 1/2 for "+ 1/2". */
export const signedCoef = (t: Term): Rational => (t.sign === 1 ? t.coef : t.coef.neg());

export const constTerm = (r: Rational): Term => ({
  sign: r.sign() < 0 ? -1 : 1,
  coef: r.abs(),
  core: CONST_CORE,
});

export const zeroTerm = (): Term => constTerm(Rational.ZERO);

export const varTerm = (r: Rational): Term => ({
  sign: r.sign() < 0 ? -1 : 1,
  coef: r.abs(),
  core: VAR_CORE,
});

export const flipSign = (t: Term): Term => ({ ...t, sign: t.sign === 1 ? -1 : 1 });

/** Multiply a term by a non-zero (or zero) rational, keeping sign and coefficient separate. */
export function scaleTerm(t: Term, r: Rational): Term {
  const coef = t.coef.mul(r.abs());
  // Zero never carries a minus sign ("-0" must not appear).
  const sign: 1 | -1 = coef.isZero() ? 1 : r.sign() < 0 ? (t.sign === 1 ? -1 : 1) : t.sign;
  return { sign, coef, core: t.core };
}

export function coreEquals(a: Core, b: Core): boolean {
  if (a.kind !== b.kind) return false;
  if (a.kind === 'group' && b.kind === 'group') {
    return a.terms.length === b.terms.length && a.terms.every((t, i) => termEquals(t, b.terms[i]));
  }
  return true;
}

export function termEquals(a: Term, b: Term): boolean {
  return a.sign === b.sign && a.coef.equals(b.coef) && coreEquals(a.core, b.core);
}

/** Terms are "like" when both are plain numbers or both are multiples of the variable. */
export const areLike = (a: Term, b: Term): boolean =>
  a.core.kind === b.core.kind && a.core.kind !== 'group';

export const hasVariable = (terms: readonly Term[]): boolean =>
  terms.some((t) => t.core.kind === 'var' || (t.core.kind === 'group' && hasVariable(t.core.terms)));
