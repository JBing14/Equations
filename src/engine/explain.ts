import type { Rational } from './rational';
import type { Equation } from './types';
import { sideTerms } from './types';
import type { Command, MoveRules } from './moves';
import { applyCommand, NO_RULES } from './moves';
import { formatRational, formatSignedTerm } from './format';
import { evaluateSides, solutionSet } from './linear';
import { status } from './status';
import { suggestMove } from './strategy';

/** Plain-language description of a command's target, e.g. "the +5 on the left side". */
export function describeTarget(eq: Equation, cmd: Command): string {
  switch (cmd.type) {
    case 'addsub':
    case 'distribute': {
      const t = sideTerms(eq, cmd.side)[cmd.index];
      return t ? `the ${formatSignedTerm(t, eq)} on the ${cmd.side} side` : 'that term';
    }
    case 'scale':
      return `the number attached to ${eq.variable} on the ${cmd.side} side`;
    case 'combine':
      return `the like terms on the ${cmd.side} side`;
  }
}

export interface HintSet {
  /** Progressive hints, gentlest first. Empty when the equation is already finished. */
  readonly levels: readonly string[];
  /** The command the last hint points at (used to highlight it). */
  readonly target: Command | null;
  readonly finished: boolean;
}

/** Hints computed from the equation that is on screen right now. */
export function hintsFor(eq: Equation, rules: MoveRules = NO_RULES): HintSet {
  const st = status(eq);
  if (st.kind !== 'working') {
    return { levels: [], target: null, finished: true };
  }
  const s = suggestMove(eq, rules);
  if (!s) {
    return {
      levels: ['This equation is outside what Equation Explorer can step through. Try undoing a move or starting over.'],
      target: null,
      finished: false,
    };
  }
  const v = eq.variable;
  const applied = applyCommand(eq, s.command, rules);
  const label = applied.ok ? applied.move.label : 'the next operation';
  const targetText = describeTarget(eq, s.command);
  const t = 'index' in s.command ? sideTerms(eq, s.command.side)[s.command.index] : undefined;
  const adding = t ? t.sign === 1 : true;

  let first: string;
  let second: string;
  switch (s.reason) {
    case 'distribute':
      first = 'Look for parentheses with a number or minus sign in front. They hide what is inside.';
      second = 'Multiply the number outside by every term inside the parentheses (distribute it).';
      break;
    case 'divide-whole':
      first = 'One side is a number times a group in parentheses.';
      second = 'The opposite of multiplying is dividing.';
      break;
    case 'combine':
      first = 'Look for terms on the same side that are alike: plain numbers together, or the same letter together.';
      second = 'Like terms can be combined by adding their coefficients.';
      break;
    case 'collect':
      first = `There is a ${v}-term on both sides. Choose one side to hold all the ${v}'s.`;
      second = `To remove a ${v}-term from one side, do the opposite of what it does: ${adding ? 'subtract' : 'add'} it.`;
      break;
    case 'constant':
      first = `Look at the side with ${v}. Which number is added or subtracted and keeps ${v} from standing alone?`;
      second = `The opposite of ${adding ? 'adding' : 'subtracting'} is ${adding ? 'subtracting' : 'adding'}.`;
      break;
    case 'coefficient':
      first = `${v} is being multiplied or divided by a number. Find the number attached to ${v}.`;
      second = 'The opposite of multiplying is dividing, and the opposite of dividing is multiplying.';
      break;
  }
  const third = `Apply it to both sides so the equation stays balanced: “${label}”.`;
  const fourth = `Next step: select ${targetText} and choose “${label}”.`;
  return { levels: [first, second, third, fourth], target: s.command, finished: false };
}

export interface AnswerCheck {
  readonly correct: boolean;
  readonly message: string;
}

/**
 * Check a proposed answer against the ORIGINAL equation by substituting it and
 * evaluating both sides independently (exact arithmetic).
 */
export function checkAnswer(original: Equation, answer: Rational): AnswerCheck {
  const { left, right } = evaluateSides(original, answer);
  const l = formatRational(left, original.decimal);
  const r = formatRational(right, original.decimal);
  const x = formatRational(answer, original.decimal);
  if (left.equals(right)) {
    return { correct: true, message: `Check: when ${original.variable} = ${x}, the left side is ${l} and the right side is ${r}. They match, so ${x} is a solution.` };
  }
  return { correct: false, message: `Not yet. When ${original.variable} = ${x}, the left side is ${l} but the right side is ${r}. They are different, so ${x} is not a solution.` };
}

/** A sentence describing how an equation finished: solved, no solution, or identity. */
export function finishMessage(eq: Equation): string | null {
  const st = status(eq);
  if (st.kind === 'solved') return `${eq.variable} = ${formatRational(st.value, eq.decimal)}`;
  if (st.kind === 'none') return 'No solution: the two sides can never be equal, no matter what number the letter is.';
  if (st.kind === 'identity') return `Infinitely many solutions: both sides are the same for every value of ${eq.variable}.`;
  return null;
}

/** The final answer to an equation as text, for answer keys: "x = 4", "No solution", ... */
export function answerFor(eq: Equation): string {
  const set = solutionSet(eq);
  if (set.kind === 'unique') return `${eq.variable} = ${formatRational(set.value, eq.decimal)}`;
  if (set.kind === 'none') return 'No solution';
  return 'Infinitely many solutions';
}
