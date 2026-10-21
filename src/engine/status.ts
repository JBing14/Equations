import { Rational } from './rational';
import type { Equation, Side, Term } from './types';
import { otherSide, signedCoef, sideTerms } from './types';
import { termLinear } from './linear';

export type Status =
  /** The variable stands alone with coefficient 1 and the other side is one number. */
  | { readonly kind: 'solved'; readonly value: Rational; readonly variableSide: Side }
  /** Both sides reduced to numbers (or cancelled letters) that are never equal. */
  | { readonly kind: 'none' }
  /** Both sides reduced to the same expression: true for every value. */
  | { readonly kind: 'identity' }
  | { readonly kind: 'working' };

const isPlainVar = (t: Term): boolean =>
  t.core.kind === 'var' && t.sign === 1 && t.coef.equals(Rational.ONE);

export function status(eq: Equation): Status {
  for (const side of ['left', 'right'] as const) {
    const vs = sideTerms(eq, side);
    const os = sideTerms(eq, otherSide(side));
    if (vs.length === 1 && isPlainVar(vs[0]) && os.length === 1 && os[0].core.kind === 'const') {
      return { kind: 'solved', value: signedCoef(os[0]), variableSide: side };
    }
  }
  const { left, right } = eq;
  if (left.length === 1 && right.length === 1 && left[0].core.kind !== 'group' && right[0].core.kind !== 'group') {
    const l = termLinear(left[0]);
    const r = termLinear(right[0]);
    if (l.a.equals(r.a)) return l.b.equals(r.b) ? { kind: 'identity' } : { kind: 'none' };
  }
  return { kind: 'working' };
}

export const isSolved = (eq: Equation): boolean => status(eq).kind === 'solved';
export const isFinished = (eq: Equation): boolean => status(eq).kind !== 'working';
