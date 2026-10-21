import { describe, it, expect } from 'vitest';
import { P, F } from './helpers';
import { applyCommand, type MoveRules } from '../src/engine/moves';
import { solveSteps, suggestMove } from '../src/engine/strategy';
import { sameSolution, solutionSet } from '../src/engine/linear';
import { generateProblem } from '../src/engine/generator';
import { status } from '../src/engine/status';

const STRICT: MoveRules = { allowDivideFirst: false, forceDistributeFirst: false };
const FORCE: MoveRules = { allowDivideFirst: true, forceDistributeFirst: true };

describe('a leftover zero is dropped', () => {
  it('moving a term back to a side that holds only 0 leaves no "0 +" behind', () => {
    // 0 = -2x + 8 ... move the 8 back to the left
    const eq = P('0 = -2x + 8');
    const r = applyCommand(eq, { type: 'addsub', side: 'right', index: 1 });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(F(r.move.after)).toBe('-8 = -2x');
      expect(F(r.move.after)).not.toContain('0');
    }
  });
  it('a variable term moved back onto a lone zero also drops the zero', () => {
    const r = applyCommand(P('0 = 3x - 6'), { type: 'addsub', side: 'right', index: 0 });
    expect(r.ok).toBe(true);
    if (r.ok) expect(F(r.move.after)).toBe('-3x = -6');
  });
  it('a lone zero by itself is kept', () => {
    const r = applyCommand(P('x + 5 = 5'), { type: 'addsub', side: 'left', index: 1 });
    expect(r.ok).toBe(true);
    if (r.ok) expect(F(r.move.after)).toBe('x = 0');
  });
});

describe('classroom rules', () => {
  it('blocks dividing a parenthesised term when dividing first is not allowed', () => {
    const eq = P('2(x + 3) = 14');
    const cmd = { type: 'scale', side: 'left', index: 0, part: 'coef' } as const;
    expect(applyCommand(eq, cmd).ok).toBe(true); // default: allowed
    const r = applyCommand(eq, cmd, STRICT);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe('divide-first-blocked');
  });
  it('blocks dividing both sides before terms are combined', () => {
    const div = { type: 'scale', side: 'right', index: 0, part: 'coef' } as const;
    const r = applyCommand(P('5x - 9 = 2x'), div, STRICT);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe('divide-first-blocked');
    expect(applyCommand(P('5x - 9 = 2x'), div).ok).toBe(true); // default engine unchanged
    expect(applyCommand(P('2x = 3 + 5'), { type: 'scale', side: 'left', index: 0, part: 'coef' }, STRICT).ok).toBe(false);
  });
  it('still allows dividing as the last step', () => {
    expect(applyCommand(P('3x = 12'), { type: 'scale', side: 'left', index: 0, part: 'coef' }, STRICT).ok).toBe(true);
    expect(applyCommand(P('12 = 3x'), { type: 'scale', side: 'right', index: 0, part: 'coef' }, STRICT).ok).toBe(true);
  });
  it('every generated problem still solves with dividing-first off', () => {
    for (const level of [1, 2, 3, 4] as const) {
      for (let i = 0; i < 25; i++) {
        const eq = P(generateProblem(level, `rules-${level}`, i));
        const steps = solveSteps(eq, undefined, STRICT);
        expect(steps.length).toBeGreaterThan(0);
        expect(sameSolution(solutionSet(steps[steps.length - 1].after), solutionSet(eq))).toBe(true);
        expect(status(steps[steps.length - 1].after).kind).not.toBe('working');
      }
    }
  });
  it('hints and the worked solution distribute instead when dividing first is not allowed', () => {
    const eq = P('2(x + 3) = 14');
    expect(suggestMove(eq)?.reason).toBe('divide-whole');
    expect(suggestMove(eq, STRICT)?.reason).toBe('distribute');
    const steps = solveSteps(eq, undefined, STRICT);
    expect(steps[0].kind).toBe('distribute');
    expect(sameSolution(solutionSet(steps[steps.length - 1].after), solutionSet(eq))).toBe(true);
  });
  it('requires distributing before any other move when forced', () => {
    const eq = P('3(x + 1) + 2 = 14');
    const sub = applyCommand(eq, { type: 'addsub', side: 'left', index: 1 }, FORCE);
    expect(sub.ok).toBe(false);
    if (!sub.ok) expect(sub.error.code).toBe('distribute-first');
    expect(applyCommand(eq, { type: 'distribute', side: 'left', index: 0 }, FORCE).ok).toBe(true);
  });
  it('does not restrict equations without parentheses', () => {
    expect(applyCommand(P('x + 5 = 12'), { type: 'addsub', side: 'left', index: 1 }, FORCE).ok).toBe(true);
  });
  it('still solves every problem when both rules are on', () => {
    for (const text of ['2(x + 3) = 14', '3(x - 1) + 2 = 11', '4(2x + 1) = 3(x + 6)', '-2(x + 4) = 6']) {
      const eq = P(text);
      const steps = solveSteps(eq, undefined, { allowDivideFirst: false, forceDistributeFirst: true });
      expect(steps.length).toBeGreaterThan(0);
      expect(steps[0].kind).toBe('distribute');
      expect(sameSolution(solutionSet(steps[steps.length - 1].after), solutionSet(eq))).toBe(true);
    }
  });
});
