import { describe, it, expect } from 'vitest';
import { applyCommand } from '../src/engine/moves';
import { solutionSet, sameSolution, satisfies } from '../src/engine/linear';
import { status } from '../src/engine/status';
import { Rational } from '../src/engine/rational';
import { F, P, move, plain } from './helpers';

describe('inverse operations on additive terms', () => {
  it('subtracts +5 from both sides: x + 5 = 12', () => {
    const m = move('x + 5 = 12', { type: 'addsub', side: 'left', index: 1 });
    expect(m.kind).toBe('subtract');
    expect(m.label).toBe('Subtract 5 from both sides');
    expect(plain(m.intermediate)).toBe('x + 5 - 5 = 12 - 5');
    expect(F(m.after)).toBe('x = 7');
    expect(m.opLeft).toBe('− 5');
    expect(m.opRight).toBe('− 5');
    expect(m.intro).toBe('To remove +5 from the left side, subtract 5 from both sides.');
    expect(m.result).toContain('We subtracted 5 from both sides, so the equation stayed balanced.');
    expect(m.result).toContain('The variable x is now isolated.');
    expect(m.cancelled).toEqual([{ side: 'left', index: 1 }]);
  });

  it('adds when the selected term is subtracted: x - 3 = 8', () => {
    const m = move('x - 3 = 8', { type: 'addsub', side: 'left', index: 1 });
    expect(m.kind).toBe('add');
    expect(m.label).toBe('Add 3 to both sides');
    expect(plain(m.intermediate)).toBe('x - 3 + 3 = 8 + 3');
    expect(F(m.after)).toBe('x = 11');
  });

  it('works when the constant is on the right: 12 = x + 5', () => {
    const m = move('12 = x + 5', { type: 'addsub', side: 'right', index: 1 });
    expect(F(m.after)).toBe('7 = x');
    expect(status(m.after).kind).toBe('solved');
  });

  it('subtracts a variable term and shows the full both-sides operation', () => {
    const m = move('3x + 5 = x + 13', { type: 'addsub', side: 'right', index: 0 });
    expect(plain(m.intermediate)).toBe('3x - x + 5 = x - x + 13');
    expect(F(m.after)).toBe('3x - x + 5 = 13');
    expect(m.cancelled).toHaveLength(1);
  });

  it('moves a term when the same term is on both sides, cancelling both', () => {
    const m = move('x + 3 = x + 7', { type: 'addsub', side: 'left', index: 0 });
    expect(F(m.after)).toBe('3 = 7');
    expect(m.cancelled).toHaveLength(2);
  });

  it('keeps a negative result correct: x + 7 = 2', () => {
    const m = move('x + 7 = 2', { type: 'addsub', side: 'left', index: 1 });
    expect(F(m.after)).toBe('x = -5');
  });

  it('cancels to zero on an emptied side: 5 = x', () => {
    const m = move('5 = x', { type: 'addsub', side: 'left', index: 0 });
    expect(F(m.after)).toBe('0 = x - 5');
  });
});

describe('inverse operations on factors', () => {
  it('divides both sides by the coefficient: 3x = 12', () => {
    const m = move('3x = 12', { type: 'scale', side: 'left', index: 0, part: 'coef' });
    expect(m.kind).toBe('divide');
    expect(plain(m.intermediate)).toBe('3x ÷ 3 = 12 ÷ 3');
    expect(F(m.after)).toBe('x = 4');
  });

  it('multiplies both sides to undo a denominator: x/4 = 3', () => {
    const m = move('x/4 = 3', { type: 'scale', side: 'left', index: 0, part: 'den' });
    expect(m.kind).toBe('multiply');
    expect(plain(m.intermediate)).toBe('x/4 × 4 = 3 × 4');
    expect(F(m.after)).toBe('x = 12');
  });

  it('handles a negative coefficient: -3x = 12', () => {
    const m = move('-3x = 12', { type: 'scale', side: 'left', index: 0, part: 'coef' });
    expect(m.label).toBe('Divide both sides by −3');
    expect(F(m.after)).toBe('x = -4');
  });

  it('handles -x = 5 by dividing by -1', () => {
    const m = move('-x = 5', { type: 'scale', side: 'left', index: 0, part: 'coef' });
    expect(F(m.after)).toBe('x = -5');
  });

  it('clears a fractional coefficient in two steps: 3x/4 = 9', () => {
    const a = move('3x/4 = 9', { type: 'scale', side: 'left', index: 0, part: 'den' });
    expect(F(a.after)).toBe('3x = 36');
    const b = move(a.after, { type: 'scale', side: 'left', index: 0, part: 'coef' });
    expect(F(b.after)).toBe('x = 12');
  });

  it('scales every term on the other side', () => {
    const m = move('2x = 4x - 6', { type: 'scale', side: 'left', index: 0, part: 'coef' });
    expect(F(m.after)).toBe('x = 2x - 3');
    expect(plain(m.intermediate)).toBe('2x ÷ 2 = (4x - 6) ÷ 2');
  });

  it('produces fractions when a division is not exact: 3x = 7', () => {
    const m = move('3x = 7', { type: 'scale', side: 'left', index: 0, part: 'coef' });
    expect(F(m.after)).toBe('x = 7/3');
  });

  it('divides by a decimal coefficient as a whole: 0.5x = 2', () => {
    const m = move('0.5x = 2', { type: 'scale', side: 'left', index: 0, part: 'coef' });
    expect(F(m.after)).toBe('x = 4');
  });

  it('removes parentheses that no longer multiply anything: 2(x + 3) = 14', () => {
    const m = move('2(x + 3) = 14', { type: 'scale', side: 'left', index: 0, part: 'coef' });
    expect(F(m.after)).toBe('x + 3 = 7');
  });
});

describe('invalid operations leave the equation unchanged', () => {
  it('refuses to divide only part of a side', () => {
    const eq = P('2x + 3 = 11');
    const r = applyCommand(eq, { type: 'scale', side: 'left', index: 0, part: 'coef' });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error.code).toBe('needs-isolated');
      expect(r.error.message).toContain('left side');
    }
  });
  it('refuses to scale a plain number', () => {
    const r = applyCommand(P('x = 7'), { type: 'scale', side: 'right', index: 0, part: 'coef' });
    expect(r.ok).toBe(false);
  });
  it('refuses when there is no factor to undo', () => {
    const r1 = applyCommand(P('x = 7'), { type: 'scale', side: 'left', index: 0, part: 'coef' });
    expect(r1.ok).toBe(false);
    const r2 = applyCommand(P('3x = 7'), { type: 'scale', side: 'left', index: 0, part: 'den' });
    expect(r2.ok).toBe(false);
  });
  it('refuses to divide by zero', () => {
    const r = applyCommand(P('0x = 5'), { type: 'scale', side: 'left', index: 0, part: 'coef' });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe('div-zero');
  });
  it('rejects targets that do not exist', () => {
    expect(applyCommand(P('x + 5 = 12'), { type: 'addsub', side: 'left', index: 9 }).ok).toBe(false);
    expect(applyCommand(P('x + 5 = 12'), { type: 'distribute', side: 'left', index: 0 }).ok).toBe(false);
    expect(applyCommand(P('x + 5 = 12'), { type: 'combine', side: 'left', kind: 'var' }).ok).toBe(false);
  });
});

describe('distribution and combining like terms', () => {
  it('distributes: 2(x + 3) = 14 becomes 2x + 6 = 14', () => {
    const m = move('2(x + 3) = 14', { type: 'distribute', side: 'left', index: 0 });
    expect(F(m.after)).toBe('2x + 6 = 14');
    expect(m.label).toBe('Distribute the 2');
  });
  it('distributes a minus sign: 5 - (x - 2) = 7', () => {
    const m = move('5 - (x - 2) = 7', { type: 'distribute', side: 'left', index: 1 });
    expect(F(m.after)).toBe('5 - x + 2 = 7');
    expect(m.label).toBe('Distribute the minus sign');
  });
  it('distributes a fraction factor: (2x + 6)/2 = 5', () => {
    const m = move('(2x + 6)/2 = 5', { type: 'distribute', side: 'left', index: 0 });
    expect(F(m.after)).toBe('x + 3 = 5');
  });
  it('removes plain parentheses inside a longer side', () => {
    const m = move('(x + 1) + 4 = 9', { type: 'distribute', side: 'left', index: 0 });
    expect(F(m.after)).toBe('x + 1 + 4 = 9');
    expect(m.label).toBe('Remove the parentheses');
  });
  it('combines like variable terms and constants as its own announced step', () => {
    const a = move('3x - x + 5 = 13', { type: 'combine', side: 'left', kind: 'var' });
    expect(F(a.after)).toBe('2x + 5 = 13');
    expect(a.intro).toContain('x-terms');
    const b = move('x + 2 + 3 = 9', { type: 'combine', side: 'left', kind: 'const' });
    expect(F(b.after)).toBe('x + 5 = 9');
  });
  it('drops a term that combines to zero', () => {
    expect(F(move('x + 3 - 3 = 5', { type: 'combine', side: 'left', kind: 'const' }).after)).toBe('x = 5');
    expect(F(move('2x - 2x + 4 = 4', { type: 'combine', side: 'left', kind: 'var' }).after)).toBe('4 = 4');
  });
  it('combines exact decimals without rounding error', () => {
    const m = move('0.1x + 0.2x = 3', { type: 'combine', side: 'left', kind: 'var' });
    expect(F(m.after)).toBe('0.3x = 3');
  });
});

describe('every committed operation preserves equivalence', () => {
  const equations = [
    'x + 5 = 12', '3x - 4 = 11', '2(x + 3) = 14', '3x + 5 = x + 13', 'x/2 + 3 = 7', '-2x - 6 = 4',
    '0.5x + 1.2 = 3.7', '5x - 2 = 2x + 7', '3(x - 1) + 2 = 2x + 9', '(2x + 1)/3 = 5', 'x + 1 = x + 3', '2x + 4 = 2(x + 2)',
  ];
  for (const text of equations) {
    it(`all single moves from "${text}" keep the same solution set`, () => {
      const eq = P(text);
      const before = solutionSet(eq);
      let tried = 0;
      for (const side of ['left', 'right'] as const) {
        const terms = side === 'left' ? eq.left : eq.right;
        terms.forEach((_, index) => {
          for (const cmd of [
            { type: 'addsub', side, index } as const,
            { type: 'scale', side, index, part: 'coef' } as const,
            { type: 'scale', side, index, part: 'den' } as const,
            { type: 'distribute', side, index } as const,
          ]) {
            const r = applyCommand(eq, cmd);
            if (r.ok) {
              tried++;
              expect(sameSolution(before, solutionSet(r.move.after))).toBe(true);
              if (before.kind === 'unique') expect(satisfies(r.move.after, before.value)).toBe(true);
            }
          }
        });
        for (const kind of ['var', 'const'] as const) {
          const r = applyCommand(eq, { type: 'combine', side, kind });
          if (r.ok) {
            tried++;
            expect(sameSolution(before, solutionSet(r.move.after))).toBe(true);
          }
        }
      }
      expect(tried).toBeGreaterThan(0);
    });
  }
});

describe('special cases', () => {
  it('detects no solution: x + 1 = x + 3', () => {
    const eq = P('x + 1 = x + 3');
    expect(solutionSet(eq).kind).toBe('none');
    const m = move(eq, { type: 'addsub', side: 'left', index: 0 });
    expect(F(m.after)).toBe('1 = x + 3 - x'.replace('x + 3 - x', '3'));
    expect(status(m.after).kind).toBe('none');
  });
  it('detects infinitely many solutions: 2x + 4 = 2(x + 2)', () => {
    const eq = P('2x + 4 = 2(x + 2)');
    expect(solutionSet(eq).kind).toBe('all');
    const d = move(eq, { type: 'distribute', side: 'right', index: 0 });
    expect(F(d.after)).toBe('2x + 4 = 2x + 4');
  });
  it('treats zero coefficients correctly', () => {
    expect(solutionSet(P('0x + 5 = 5')).kind).toBe('all');
    expect(solutionSet(P('0x + 5 = 6')).kind).toBe('none');
    expect(status(P('0x = 0')).kind).toBe('identity');
    expect(status(P('0x = 4')).kind).toBe('none');
  });
  it('finds a unique solution and verifies it by substitution', () => {
    const eq = P('3x + 5 = x + 13');
    const s = solutionSet(eq);
    expect(s.kind).toBe('unique');
    if (s.kind === 'unique') {
      expect(s.value.toString()).toBe('4');
      expect(satisfies(eq, s.value)).toBe(true);
      expect(satisfies(eq, Rational.of(5))).toBe(false);
    }
  });
  it('recognises equivalent expressions written differently', () => {
    expect(sameSolution(solutionSet(P('2x + 6 = 14')), solutionSet(P('2(x + 3) = 14')))).toBe(true);
    expect(sameSolution(solutionSet(P('x/2 = 4')), solutionSet(P('0.5x = 4')))).toBe(true);
  });
  it('keeps fractions that simplify to integers as integers', () => {
    expect(F(P('x + 6/3 = 5'))).toBe('x + 2 = 5');
  });
});
