import { Rational } from './rational';
import type { Equation, Side } from './types';
import { otherSide, sideTerms, signedCoef } from './types';
import type { Command, MoveData } from './moves';
import { applyCommand, availableCombines, factorOf } from './moves';
import { status } from './status';

/**
 * The "teacher inside the engine": given any equation, pick the next sensible step.
 * Hints, the worked-solution reveal and the practice-problem checks all use this, so
 * advice always matches the equation actually on screen.
 *
 * Order of thinking (like a careful student):
 *   1. parentheses   2. combine like terms   3. collect letters on one side
 *   4. undo added/subtracted numbers   5. undo the coefficient
 */

export type SuggestionReason = 'distribute' | 'divide-whole' | 'combine' | 'collect' | 'constant' | 'coefficient';

export interface Suggestion {
  readonly command: Command;
  readonly reason: SuggestionReason;
}

export function suggestMove(eq: Equation): Suggestion | null {
  if (status(eq).kind !== 'working') return null;

  // 1. Parentheses
  for (const side of ['left', 'right'] as const) {
    const terms = sideTerms(eq, side);
    const idx = terms.findIndex((t) => t.core.kind === 'group');
    if (idx < 0) continue;
    const t = terms[idx];
    const o = sideTerms(eq, otherSide(side));
    if (
      terms.length === 1 &&
      t.sign === 1 &&
      t.coef.isInteger() &&
      !t.coef.equals(Rational.ONE) &&
      o.length === 1 &&
      o[0].core.kind === 'const' &&
      o[0].coef.div(t.coef).isInteger()
    ) {
      // 2(x + 3) = 14: dividing both sides by 2 is the shortest route.
      return { command: { type: 'scale', side, index: 0, part: 'coef' }, reason: 'divide-whole' };
    }
    return { command: { type: 'distribute', side, index: idx }, reason: 'distribute' };
  }

  // 2. Like terms on one side
  const combos = availableCombines(eq);
  if (combos.length > 0) return { command: combos[0], reason: 'combine' };

  // 3. Letters on both sides: keep the larger coefficient so it stays positive
  const varIdx = (side: Side): number => sideTerms(eq, side).findIndex((t) => t.core.kind === 'var');
  const lv = varIdx('left');
  const rv = varIdx('right');
  if (lv >= 0 && rv >= 0) {
    const a1 = signedCoef(eq.left[lv]);
    const a2 = signedCoef(eq.right[rv]);
    return a1.compare(a2) > 0
      ? { command: { type: 'addsub', side: 'right', index: rv }, reason: 'collect' }
      : { command: { type: 'addsub', side: 'left', index: lv }, reason: 'collect' };
  }

  // 4. Numbers on the side that holds the letter
  const varSide: Side | null = lv >= 0 ? 'left' : rv >= 0 ? 'right' : null;
  if (varSide === null) return null;
  const vTerms = sideTerms(eq, varSide);
  const cIdx = vTerms.findIndex((t) => t.core.kind === 'const');
  if (cIdx >= 0) return { command: { type: 'addsub', side: varSide, index: cIdx }, reason: 'constant' };

  // 5. The coefficient (clear a denominator first, then divide)
  if (vTerms.length === 1) {
    const t = vTerms[0];
    if (factorOf(eq, t, 'den') !== null) return { command: { type: 'scale', side: varSide, index: 0, part: 'den' }, reason: 'coefficient' };
    if (factorOf(eq, t, 'coef') !== null) return { command: { type: 'scale', side: varSide, index: 0, part: 'coef' }, reason: 'coefficient' };
  }
  return null;
}

export const MAX_SOLVE_STEPS = 60;

/** Solve an equation by repeatedly applying the suggested move. */
export function solveSteps(eq: Equation, maxSteps = MAX_SOLVE_STEPS): MoveData[] {
  const steps: MoveData[] = [];
  let current = eq;
  while (steps.length < maxSteps) {
    const s = suggestMove(current);
    if (!s) break;
    const r = applyCommand(current, s.command);
    if (!r.ok) break;
    steps.push(r.move);
    current = r.move.after;
  }
  return steps;
}
