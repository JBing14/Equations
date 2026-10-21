import type { Equation, Side } from '../engine/types';
import { areLike, otherSide, sideTerms } from '../engine/types';
import type { Command } from '../engine/moves';
import { applyCommand } from '../engine/moves';

/**
 * What is being picked up: a whole additive term (such as "+5"), or a factor attached to
 * the variable (the "3" in 3x, or the "4" under x/4).
 */
export type Selection =
  | { readonly kind: 'term'; readonly side: Side; readonly index: number }
  | { readonly kind: 'factor'; readonly side: Side; readonly index: number; readonly part: 'coef' | 'den' };

/** Where a pointer currently is: over a side's drop area, over a specific term, or nowhere useful. */
export type DropZone =
  | { readonly kind: 'side'; readonly side: Side }
  | { readonly kind: 'term'; readonly side: Side; readonly index: number }
  | null;

export interface DropEvaluation {
  readonly valid: boolean;
  /** Present only when valid. */
  readonly command: Command | null;
  /** Valid: what will happen. Invalid: a short, friendly reason. */
  readonly reason: string;
}

const SAME_SIDE_TERM =
  'That term is already on that side. Drop it on the other side of the equals sign to apply the opposite operation to both sides.';
const SAME_SIDE_FACTOR =
  'Drop the number on the other side of the equals sign to apply the opposite operation to both sides.';
const NOWHERE = 'Drop it on the other side of the equals sign to apply the opposite operation to both sides.';

/** The command a selection stands for when it is moved across the equals sign. */
export function commandForSelection(sel: Selection): Command {
  return sel.kind === 'term'
    ? { type: 'addsub', side: sel.side, index: sel.index }
    : { type: 'scale', side: sel.side, index: sel.index, part: sel.part };
}

/** Decide whether dropping `source` on `zone` is a valid operation. Nothing is changed here. */
export function evaluateDrop(eq: Equation, source: Selection, zone: DropZone): DropEvaluation {
  if (zone === null) return { valid: false, command: null, reason: NOWHERE };

  if (zone.side !== otherSide(source.side)) {
    // Same side as the source.
    if (source.kind === 'term' && zone.kind === 'term' && zone.index !== source.index) {
      const terms = sideTerms(eq, source.side);
      const a = terms[source.index];
      const b = terms[zone.index];
      if (a && b && areLike(a, b)) {
        const command: Command = { type: 'combine', side: source.side, kind: a.core.kind as 'const' | 'var' };
        const r = applyCommand(eq, command);
        if (r.ok) return { valid: true, command, reason: r.move.label };
      }
      return { valid: false, command: null, reason: 'Only like terms can be combined: plain numbers with numbers, or the letter with the letter.' };
    }
    if (zone.kind === 'term' && source.kind === 'term' && zone.index === source.index) {
      return { valid: false, command: null, reason: '' };
    }
    return { valid: false, command: null, reason: source.kind === 'term' ? SAME_SIDE_TERM : SAME_SIDE_FACTOR };
  }

  const command = commandForSelection(source);
  const r = applyCommand(eq, command);
  if (!r.ok) return { valid: false, command: null, reason: r.error.message };
  return { valid: true, command, reason: r.move.label };
}

export const selectionKey = (s: Selection): string =>
  s.kind === 'term' ? `term:${s.side}:${s.index}` : `factor:${s.side}:${s.index}:${s.part}`;

export const sameSelection = (a: Selection | null, b: Selection | null): boolean =>
  a !== null && b !== null && selectionKey(a) === selectionKey(b);
