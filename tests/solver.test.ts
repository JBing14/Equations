import { describe, it, expect } from 'vitest';
import { solveSteps, suggestMove } from '../src/engine/strategy';
import { solutionSet, satisfies } from '../src/engine/linear';
import { status } from '../src/engine/status';
import { FAMILIES, generateProblem, generateSet, isSolvableProblem, makeRng } from '../src/engine/generator';
import { hintsFor, checkAnswer, finishMessage } from '../src/engine/explain';
import { LESSONS } from '../src/data/lessons';
import { Rational } from '../src/engine/rational';
import { F, P, plain } from './helpers';

function solveAndVerify(text: string): string {
  const eq = P(text);
  const steps = solveSteps(eq);
  expect(steps.length).toBeGreaterThan(0);
  const last = steps[steps.length - 1].after;
  const st = status(last);
  expect(st.kind).toBe('solved');
  const set = solutionSet(eq);
  expect(set.kind).toBe('unique');
  if (st.kind === 'solved' && set.kind === 'unique') {
    expect(st.value.equals(set.value)).toBe(true);
    expect(satisfies(eq, st.value)).toBe(true); // independent substitution into the ORIGINAL
  }
  return F(last);
}

describe('solver: worked solutions', () => {
  const cases: [string, string][] = [
    ['x + 5 = 12', 'x = 7'],
    ['3x - 4 = 11', 'x = 5'],
    ['2(x + 3) = 14', 'x = 4'],
    ['3x + 5 = x + 13', 'x = 4'],
    ['x/2 + 3 = 7', 'x = 8'],
    ['-2x - 6 = 4', 'x = -5'],
    ['5 = 2x + 1', '2 = x'],
    ['0.5x + 1.2 = 3.7', 'x = 5'],
    ['3(x - 1) + 2 = 2x + 9', 'x = 10'],
    ['7 + 3x = 5x + 1', '3 = x'],
    ['x/3 + x/6 = 4', 'x = 8'],
    ['3x/4 = 9', 'x = 12'],
    ['-(x + 3) = 2', 'x = -5'],
    ['5 - (x - 2) = 7', 'x = 0'],
    ['4x - 3 = 7x + 6', '-3 = x'],
    ['x = 3x - 8', '4 = x'],
  ];
  for (const [text, answer] of cases) {
    it(`${text}  =>  ${answer}`, () => {
      expect(solveAndVerify(text)).toBe(answer);
    });
  }
});

describe('solver: special cases terminate honestly', () => {
  it('reports no solution', () => {
    const steps = solveSteps(P('x + 1 = x + 3'));
    expect(status(steps[steps.length - 1].after).kind).toBe('none');
    expect(finishMessage(steps[steps.length - 1].after)).toContain('No solution');
  });
  it('reports infinitely many solutions', () => {
    const steps = solveSteps(P('2x + 4 = 2(x + 2)'));
    const last = steps[steps.length - 1].after;
    expect(status(last).kind).toBe('identity');
    expect(finishMessage(last)).toContain('Infinitely many');
  });
  it('does nothing for an already solved equation', () => {
    expect(suggestMove(P('x = 7'))).toBeNull();
    expect(solveSteps(P('x = 7'))).toHaveLength(0);
  });
});

describe('lessons: every curated equation is supported and solvable', () => {
  it('has the eight levels in order with five problems each', () => {
    expect(LESSONS).toHaveLength(8);
    for (const l of LESSONS) expect(l.problems).toHaveLength(5);
  });
  for (const lesson of LESSONS) {
    it(`${lesson.title}: worked example and practice`, () => {
      solveAndVerify(lesson.workedExample);
      for (const p of lesson.problems) solveAndVerify(p);
    });
  }
});

describe('generator: seeded, reproducible and always solvable', () => {
  it('makes the same problems for the same seed', () => {
    expect(generateSet(2, 'room-12', 6)).toEqual(generateSet(2, 'room-12', 6));
    expect(generateSet(2, 'room-12', 6)).not.toEqual(generateSet(2, 'room-13', 6));
  });
  it('every family produces supported, uniquely solvable equations', () => {
    for (const family of FAMILIES) {
      for (let i = 0; i < 150; i++) {
        const text = family.make(makeRng(`${family.id}:${i}`));
        expect(isSolvableProblem(text)).toBe(true);
      }
    }
  });
  it('generated problems always solve in the engine across levels and seeds', () => {
    for (const level of [1, 2, 3, 4] as const) {
      for (let i = 0; i < 60; i++) {
        solveAndVerify(generateProblem(level, `seed-${i}`, i));
      }
    }
  });
  it('level 1 problems need exactly one step', () => {
    for (let i = 0; i < 40; i++) {
      expect(solveSteps(P(generateProblem(1, 'one', i)))).toHaveLength(1);
    }
  });
  it('level 2 problems need two steps', () => {
    for (let i = 0; i < 40; i++) {
      expect(solveSteps(P(generateProblem(2, 'two', i)))).toHaveLength(2);
    }
  });
});

describe('hints match the equation on screen', () => {
  it('walks 2x + 3 = 11 through progressively clearer hints', () => {
    const h = hintsFor(P('2x + 3 = 11'));
    expect(h.levels).toHaveLength(4);
    expect(plain(h.levels[2])).toContain('Subtract 3 from both sides');
    expect(plain(h.levels[3])).toContain('+3');
    expect(h.target).toEqual({ type: 'addsub', side: 'left', index: 1 });
  });
  it('changes with the equation (not hard-coded)', () => {
    const h = hintsFor(P('2x = 8'));
    expect(plain(h.levels[2])).toContain('Divide both sides by 2');
    const g = hintsFor(P('x/5 = 3'));
    expect(plain(g.levels[2])).toContain('Multiply both sides by 5');
    const d = hintsFor(P('3(x + 1) + 2 = 14'));
    expect(plain(d.levels[3])).toContain('Distribute the 3');
  });
  it('has no hints once the equation is finished', () => {
    const h = hintsFor(P('x = 7'));
    expect(h.finished).toBe(true);
    expect(h.levels).toHaveLength(0);
  });
});

describe('answer checking substitutes into the original equation', () => {
  it('accepts a correct answer and rejects a wrong one', () => {
    const eq = P('3x + 5 = x + 13');
    expect(checkAnswer(eq, Rational.of(4)).correct).toBe(true);
    const wrong = checkAnswer(eq, Rational.of(3));
    expect(wrong.correct).toBe(false);
    expect(wrong.message).toContain('14');
  });
  it('accepts fractional answers exactly', () => {
    expect(checkAnswer(P('3x = 7'), Rational.of(7, 3)).correct).toBe(true);
  });
});
