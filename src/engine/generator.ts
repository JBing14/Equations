import { Rational, R } from './rational';
import { parseEquation } from './parser';
import { solutionSet } from './linear';
import { solveSteps } from './strategy';
import { status } from './status';

/**
 * Seeded practice-problem generator. Every family picks the solution first and builds
 * the equation around it, then the result is re-parsed and solved by the real engine
 * before being offered, so a generated problem is always supported and always solvable.
 * The same seed always gives the same problems, so a teacher can reproduce a set.
 */

export interface Rng {
  next(): number;
  int(lo: number, hi: number): number;
  pick<T>(items: readonly T[]): T;
}

export function hashString(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function makeRng(seed: string): Rng {
  let a = hashString(seed) || 1;
  const next = (): number => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    next,
    int: (lo, hi) => lo + Math.floor(next() * (hi - lo + 1)),
    pick: (items) => items[Math.floor(next() * items.length)],
  };
}

export type Level = 1 | 2 | 3 | 4;

export interface Family {
  readonly id: string;
  readonly label: string;
  readonly level: Level;
  readonly make: (rng: Rng) => string;
}

/** ASCII text for a rational: "7", "-3", "5/3". */
const t = (r: Rational): string => r.toString();
/** ASCII text for a coefficient placed before x ("" for 1, "-" for -1). */
const co = (n: number): string => (n === 1 ? '' : n === -1 ? '-' : String(n));
/** "+ 5" / "- 5" for a constant after the first term. */
const add = (n: number): string => (n < 0 ? `- ${-n}` : `+ ${n}`);
const nonzero = (rng: Rng, lo: number, hi: number): number => {
  let v = 0;
  while (v === 0) v = rng.int(lo, hi);
  return v;
};

export const FAMILIES: readonly Family[] = [
  // ---- Level 1: one step
  { id: 'add-1', label: 'x + a = b', level: 1, make: (g) => { const x = g.int(1, 20); const a = g.int(1, 15); return `x + ${a} = ${x + a}`; } },
  { id: 'sub-1', label: 'x − a = b', level: 1, make: (g) => { const b = g.int(1, 15); const a = g.int(1, 12); return `x - ${a} = ${b}`; } },
  { id: 'add-left', label: 'a + x = b', level: 1, make: (g) => { const x = g.int(1, 15); const a = g.int(1, 15); return `${a} + x = ${x + a}`; } },
  { id: 'mul-1', label: 'ax = b', level: 1, make: (g) => { const a = g.int(2, 9); const x = g.int(1, 12); return `${a}x = ${a * x}`; } },
  { id: 'div-1', label: 'x ÷ a = b', level: 1, make: (g) => { const a = g.int(2, 9); const b = g.int(1, 12); return `x/${a} = ${b}`; } },
  { id: 'var-right-1', label: 'b = x + a', level: 1, make: (g) => { const x = g.int(1, 20); const a = g.int(1, 15); return `${x + a} = x + ${a}`; } },
  // ---- Level 2: two steps (including negatives)
  { id: 'two-add', label: 'ax + b = c', level: 2, make: (g) => { const a = g.int(2, 9); const x = g.int(-6, 12); const b = g.int(1, 15); return `${a}x + ${b} = ${a * x + b}`; } },
  { id: 'two-sub', label: 'ax − b = c', level: 2, make: (g) => { const a = g.int(2, 9); const x = g.int(-6, 12); const b = g.int(1, 15); return `${a}x - ${b} = ${a * x - b}`; } },
  { id: 'two-div', label: 'x ÷ a + b = c', level: 2, make: (g) => { const a = g.int(2, 6); const k = g.int(-5, 10); const b = g.int(1, 12); return `x/${a} + ${b} = ${k + b}`; } },
  { id: 'two-neg', label: '−ax + b = c', level: 2, make: (g) => { const a = g.int(2, 9); const x = g.int(-6, 10); const b = g.int(1, 15); return `-${a}x + ${b} = ${-a * x + b}`; } },
  { id: 'two-flip', label: 'b − ax = c', level: 2, make: (g) => { const a = g.int(2, 9); const x = g.int(-6, 10); const b = g.int(1, 20); return `${b} - ${a}x = ${b - a * x}`; } },
  // ---- Level 3: multistep
  { id: 'like-var', label: 'ax + b + cx = d', level: 3, make: (g) => { const a = g.int(1, 6); const c = g.int(1, 6); const x = g.int(-5, 10); const b = nonzero(g, -9, 12); return `${co(a)}x ${add(b)} + ${co(c)}x = ${(a + c) * x + b}`; } },
  { id: 'both-sides', label: 'ax + b = cx + d', level: 3, make: (g) => { const c = g.int(1, 5); const a = c + g.int(1, 5); const x = g.int(-6, 10); const b = nonzero(g, -12, 12); return `${co(a)}x ${add(b)} = ${co(c)}x + ${(a - c) * x + b}`.replace('+ -', '- '); } },
  { id: 'distribute', label: 'a(x + b) = c', level: 3, make: (g) => { const a = g.int(2, 6); const b = g.int(1, 9); const x = g.int(-6, 10); return `${a}(x + ${b}) = ${a * (x + b)}`; } },
  { id: 'distribute-2', label: 'a(x − b) + c = d', level: 3, make: (g) => { const a = g.int(2, 6); const b = g.int(1, 9); const c = g.int(1, 12); const x = g.int(-4, 12); return `${a}(x - ${b}) + ${c} = ${a * (x - b) + c}`; } },
  { id: 'combine-const', label: 'x + a + b = c', level: 3, make: (g) => { const x = g.int(1, 15); const a = g.int(1, 9); const b = g.int(1, 9); return `x + ${a} + ${b} = ${x + a + b}`; } },
  // ---- Level 4: fractions, decimals, harder multistep
  { id: 'frac-const', label: 'x ÷ a + p/q = r', level: 4, make: (g) => { const a = g.pick([2, 3, 4, 5, 6]); const x = g.int(1, 12); const q = g.pick([2, 3, 4, 6]); const p = g.int(1, q - 1); return `x/${a} + ${p}/${q} = ${t(R(x, a).add(R(p, q)))}`; } },
  { id: 'frac-group', label: '(ax + b) ÷ c = d', level: 4, make: (g) => { const a = g.int(2, 5); const c = g.int(2, 5); const b = g.int(1, 9); const x = g.int(-4, 10); return `(${a}x + ${b})/${c} = ${t(R(a * x + b, c))}`; } },
  { id: 'frac-two-x', label: 'x ÷ a + x ÷ b = c', level: 4, make: (g) => { const a = g.pick([2, 3, 4]); const b = g.pick([5, 6, 8]); const x = g.int(1, 12); return `x/${a} + x/${b} = ${t(R(x, a).add(R(x, b)))}`; } },
  { id: 'frac-coef', label: 'ax ÷ b = c', level: 4, make: (g) => { const b = g.pick([2, 3, 4, 5]); const a = g.pick([2, 3, 4, 5, 7].filter((n) => n % b !== 0 && b % n !== 0)); const x = g.int(-6, 12); return `${a}x/${b} = ${t(R(a * x, b))}`; } },
  { id: 'decimal', label: '0.5x + 1.2 = 3.7', level: 4, make: (g) => { const c = g.pick(['0.2', '0.5', '1.5', '2.5', '0.25']); const x = g.int(2, 12); const b = g.int(1, 20) / 10; const cr = Rational.fromDecimalString(c); const rhs = cr.mul(R(x)).add(Rational.fromDecimalString(b.toFixed(1))); return `${c}x + ${b.toFixed(1)} = ${rhs.toDecimalString()}`; } },
  { id: 'both-distribute', label: 'a(x + b) = cx + d', level: 4, make: (g) => { const c = g.int(1, 3); const a = c + g.int(1, 3); const b = g.int(1, 6); const x = g.int(-4, 10); return `${a}(x + ${b}) = ${co(c)}x + ${a * (x + b) - c * x}`; } },
];

export const familiesForLevel = (level: Level): Family[] => FAMILIES.filter((f) => f.level === level);

const FALLBACK: Record<Level, string> = {
  1: 'x + 6 = 15',
  2: '3x + 4 = 19',
  3: '2(x + 3) = 14',
  4: 'x/2 + 1/3 = 5/6',
};

/** True when the engine can parse the text and solve it to a single number. */
export function isSolvableProblem(text: string): boolean {
  const p = parseEquation(text);
  if (!p.ok) return false;
  if (solutionSet(p.equation).kind !== 'unique') return false;
  const steps = solveSteps(p.equation);
  return steps.length > 0 && status(steps[steps.length - 1].after).kind === 'solved';
}

/** Problem number `index` (0-based) of the set identified by `seed` at this level. */
export function generateProblem(level: Level, seed: string, index: number, familyIds?: readonly string[]): string {
  const pool = familyIds && familyIds.length > 0 ? FAMILIES.filter((f) => familyIds.includes(f.id)) : familiesForLevel(level);
  const families = pool.length > 0 ? pool : familiesForLevel(level);
  for (let attempt = 0; attempt < 30; attempt++) {
    const rng = makeRng(`${seed}|${level}|${index}|${attempt}`);
    const family = rng.pick(families);
    const text = family.make(rng);
    if (isSolvableProblem(text)) return text;
  }
  return FALLBACK[level];
}

/** A whole set of distinct problems for one seed. */
export function generateSet(level: Level, seed: string, count: number, familyIds?: readonly string[]): string[] {
  const out: string[] = [];
  let index = 0;
  while (out.length < count && index < count * 8) {
    const text = generateProblem(level, seed, index++, familyIds);
    if (!out.includes(text)) out.push(text);
  }
  return out;
}
