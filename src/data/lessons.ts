import type { Level } from '../engine/generator';

/**
 * Guided lesson definitions. Every equation here is verified by tests/data.test.ts:
 * it must parse, have exactly one solution, and be solved step by step by the engine.
 */

export interface Lesson {
  readonly id: string;
  readonly title: string;
  readonly level: Level;
  readonly objective: string;
  readonly intro: string;
  /** A short explanation of the idea, shown before the worked example. */
  readonly explanation: string;
  readonly workedExample: string;
  /** Five practice equations. */
  readonly problems: readonly string[];
  readonly summary: string;
}

export const LESSONS: readonly Lesson[] = [
  {
    id: 'one-step-add-sub',
    title: 'One-Step: Add and Subtract',
    level: 1,
    objective: 'Undo adding or subtracting a number by doing the opposite to both sides.',
    intro: 'An equation is a balance. Whatever you do to one side, you must do to the other.',
    explanation:
      'In x + 5 = 12, the 5 is being added to x. The opposite of adding 5 is subtracting 5. If you subtract 5 from both sides, the scale stays balanced and x ends up alone.',
    workedExample: 'x + 5 = 12',
    problems: ['x + 4 = 9', 'x - 3 = 8', '7 + x = 15', 'x - 6 = 2', '11 = x + 4'],
    summary: 'To undo addition, subtract. To undo subtraction, add. Always do it to both sides.',
  },
  {
    id: 'one-step-mul-div',
    title: 'One-Step: Multiply and Divide',
    level: 1,
    objective: 'Undo multiplying or dividing the letter by doing the opposite to both sides.',
    intro: 'A number written right next to a letter means multiply: 3x means 3 times x.',
    explanation:
      'In 3x = 12, x is multiplied by 3. The opposite of multiplying by 3 is dividing by 3. In x/4 = 3, x is divided by 4, so multiply both sides by 4.',
    workedExample: '3x = 12',
    problems: ['5x = 20', 'x/4 = 3', '6x = 18', 'x/2 = 7', '20 = 4x'],
    summary: 'To undo multiplication, divide. To undo division, multiply. Do it to both sides.',
  },
  {
    id: 'two-step',
    title: 'Two-Step Equations',
    level: 2,
    objective: 'Solve equations that need two inverse operations, in a sensible order.',
    intro: 'Some equations need two moves. First deal with the number added or subtracted, then the one multiplying or dividing.',
    explanation:
      'In 2x + 3 = 11, the 2 is multiplying x and the 3 is added. Remove the +3 first so that 2x stands alone, then divide both sides by 2.',
    workedExample: '2x + 3 = 11',
    problems: ['3x - 5 = 10', 'x/2 + 4 = 9', '4x + 1 = 13', '5x - 2 = 18', 'x/3 - 1 = 4'],
    summary: 'Undo adding or subtracting first, then undo multiplying or dividing.',
  },
  {
    id: 'like-terms',
    title: 'Combining Like Terms',
    level: 3,
    objective: 'Combine terms that are alike before solving.',
    intro: 'Terms with the same letter are like terms. Plain numbers are like terms with each other too.',
    explanation:
      'In 2x + 3x = 15, both terms are x-terms. Two x’s plus three x’s make five x’s, so the equation becomes 5x = 15. Combining is a step of its own, and it keeps the equation balanced.',
    workedExample: '2x + 3x = 15',
    problems: ['4x + x = 20', '3x + 2 + 2x = 17', 'x + 2 + 3 = 9', '5x + 2x - 4 = 10', '3x + 4 + 2x - 1 = 18'],
    summary: 'Add the coefficients of like terms. Then solve the simpler equation.',
  },
  {
    id: 'negatives',
    title: 'Negative Numbers',
    level: 2,
    objective: 'Solve equations with negative coefficients and negative answers.',
    intro: 'Signs matter. A minus in front of a term belongs to that term.',
    explanation:
      'In -3x = 12, x is multiplied by -3, so divide both sides by -3. Dividing a positive number by a negative number gives a negative answer, so x = -4.',
    workedExample: '-3x = 12',
    problems: ['x + 7 = 2', '2x - 9 = -5', '-x + 4 = 10', '-2x - 6 = 4', '-4x = 20'],
    summary: 'Keep each sign with its term. Dividing by a negative number flips the sign.',
  },
  {
    id: 'both-sides',
    title: 'Variables on Both Sides',
    level: 3,
    objective: 'Collect the letters on one side, then solve.',
    intro: 'When the letter appears on both sides, first gather all of it on one side.',
    explanation:
      'In 3x + 5 = x + 13, subtract x from both sides to collect the letters. Then 2x + 5 = 13 is a two-step equation you already know how to solve.',
    workedExample: '3x + 5 = x + 13',
    problems: ['5x = 2x + 9', '4x + 1 = 2x + 9', '6x - 4 = 2x + 12', '7 + 3x = 5x + 1', '2x + 9 = 5x'],
    summary: 'Subtract (or add) one letter term on both sides to gather the letters together.',
  },
  {
    id: 'distribution',
    title: 'Parentheses and Distribution',
    level: 3,
    objective: 'Multiply out parentheses, or divide them away, to solve.',
    intro: 'A number in front of parentheses multiplies everything inside.',
    explanation:
      'In 2(x + 3) = 14, you can distribute the 2 to get 2x + 6 = 14, or divide both sides by 2 to get x + 3 = 7. Both ways are valid.',
    workedExample: '2(x + 3) = 14',
    problems: ['3(x + 2) = 18', '2(x - 4) = 6', '4(x + 1) - 3 = 17', '-(x + 3) = 2', '5(x - 2) = 3x + 4'],
    summary: 'Distribute the outside number to each term inside, then solve as usual.',
  },
  {
    id: 'fractions',
    title: 'Fractions and Challenge Equations',
    level: 4,
    objective: 'Solve multistep equations that include fractions and decimals.',
    intro: 'Fractions and decimals follow the same rules. Every step still keeps the equation balanced.',
    explanation:
      'In x/2 + 1/3 = 5/6, subtract 1/3 from both sides, then multiply both sides by 2. Doing the same operation to both sides works for fractions too.',
    workedExample: 'x/2 + 1/3 = 5/6',
    problems: ['x/3 + x/6 = 4', '(2x + 1)/3 = 5', '0.5x + 1.2 = 3.7', '2(x + 1) = 3x - 4', 'x/4 - 2 = 1/2'],
    summary: 'Treat fractions and decimals like any numbers: do the opposite operation to both sides.',
  },
];

export const lessonById = (id: string): Lesson | undefined => LESSONS.find((l) => l.id === id);
