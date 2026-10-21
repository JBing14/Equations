import { Rational } from './rational';
import type { Equation, Term } from './types';
import { signedCoef } from './types';

/** value = a*x + b */
export interface Linear {
  readonly a: Rational;
  readonly b: Rational;
}

export function termLinear(t: Term): Linear {
  const k = signedCoef(t);
  switch (t.core.kind) {
    case 'const':
      return { a: Rational.ZERO, b: k };
    case 'var':
      return { a: k, b: Rational.ZERO };
    case 'group': {
      const inner = sumLinear(t.core.terms);
      return { a: inner.a.mul(k), b: inner.b.mul(k) };
    }
  }
}

export function sumLinear(terms: readonly Term[]): Linear {
  let a = Rational.ZERO;
  let b = Rational.ZERO;
  for (const t of terms) {
    const l = termLinear(t);
    a = a.add(l.a);
    b = b.add(l.b);
  }
  return { a, b };
}

export type SolutionSet =
  | { readonly kind: 'unique'; readonly value: Rational }
  | { readonly kind: 'none' }
  | { readonly kind: 'all' };

/** The complete solution set of a supported (linear) equation, over the real numbers. */
export function solutionSet(eq: Equation): SolutionSet {
  const l = sumLinear(eq.left);
  const r = sumLinear(eq.right);
  const a = l.a.sub(r.a);
  const b = r.b.sub(l.b);
  if (a.isZero()) return b.isZero() ? { kind: 'all' } : { kind: 'none' };
  return { kind: 'unique', value: b.div(a) };
}

export function sameSolution(x: SolutionSet, y: SolutionSet): boolean {
  if (x.kind !== y.kind) return false;
  if (x.kind === 'unique' && y.kind === 'unique') return x.value.equals(y.value);
  return true;
}

/** Evaluate both sides independently at a proposed value of the variable. */
export function evaluateSides(eq: Equation, x: Rational): { left: Rational; right: Rational } {
  const l = sumLinear(eq.left);
  const r = sumLinear(eq.right);
  return { left: l.a.mul(x).add(l.b), right: r.a.mul(x).add(r.b) };
}

export function satisfies(eq: Equation, x: Rational): boolean {
  const { left, right } = evaluateSides(eq, x);
  return left.equals(right);
}
