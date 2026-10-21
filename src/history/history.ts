import type { Equation } from '../engine/types';
import type { Command, MoveData, MoveError } from '../engine/moves';
import { applyCommand } from '../engine/moves';

/**
 * Chronological move history with undo, redo and read-only inspection.
 *
 *   start  --move 1-->  state 1  --move 2-->  state 2
 *                                  ^ cursor
 *
 * `cursor` is the active state (0 = the original equation). Undo/redo only move the cursor,
 * so redo can replay recorded moves. A NEW move after an undo discards the abandoned redo
 * branch. `inspect` lets a student look at any earlier state without changing the active
 * equation; while inspecting, no new move can be made.
 *
 * Records come straight from the transformation engine (MoveData), never from animation labels.
 */

export interface MoveRecord {
  /** Unique id, e.g. "m3". */
  readonly id: string;
  /** 1-based position in the timeline. */
  readonly index: number;
  readonly data: MoveData;
  /** Milliseconds since the epoch, for display only. */
  readonly timestamp: number;
}

export interface HistoryState {
  readonly start: Equation;
  readonly moves: readonly MoveRecord[];
  readonly cursor: number;
  readonly inspect: number | null;
  readonly counter: number;
}

export function createHistory(start: Equation): HistoryState {
  return { start, moves: [], cursor: 0, inspect: null, counter: 0 };
}

export function equationAt(h: HistoryState, index: number): Equation {
  if (index <= 0) return h.start;
  return h.moves[Math.min(index, h.moves.length) - 1].data.after;
}

/** The active equation (what the student is working on). */
export const currentEquation = (h: HistoryState): Equation => equationAt(h, h.cursor);

/** What is on screen: the inspected state if any, otherwise the active equation. */
export const displayedEquation = (h: HistoryState): Equation => equationAt(h, h.inspect ?? h.cursor);

export const isInspecting = (h: HistoryState): boolean => h.inspect !== null;
export const canUndo = (h: HistoryState): boolean => h.inspect === null && h.cursor > 0;
export const canRedo = (h: HistoryState): boolean => h.inspect === null && h.cursor < h.moves.length;

/** Moves that are part of the active timeline (up to the cursor). */
export const activeMoves = (h: HistoryState): readonly MoveRecord[] => h.moves.slice(0, h.cursor);

export type CommitResult =
  | { readonly ok: true; readonly state: HistoryState; readonly record: MoveRecord }
  | { readonly ok: false; readonly state: HistoryState; readonly error: MoveError };

/** Validate a command against the active equation and, only if valid, record exactly one move. */
export function tryCommand(h: HistoryState, command: Command, now: number = Date.now()): CommitResult {
  if (h.inspect !== null) {
    return {
      ok: false,
      state: h,
      error: { code: 'bad-target', message: 'You are looking at an earlier step. Return to the latest step to keep working.' },
    };
  }
  const result = applyCommand(currentEquation(h), command);
  if (!result.ok) return { ok: false, state: h, error: result.error };
  const counter = h.counter + 1;
  const record: MoveRecord = { id: `m${counter}`, index: h.cursor + 1, data: result.move, timestamp: now };
  const state: HistoryState = {
    ...h,
    moves: [...h.moves.slice(0, h.cursor), record], // abandoned redo branch is dropped here
    cursor: h.cursor + 1,
    inspect: null,
    counter,
  };
  return { ok: true, state, record };
}

export function undo(h: HistoryState): HistoryState {
  return canUndo(h) ? { ...h, cursor: h.cursor - 1 } : h;
}

export function redo(h: HistoryState): HistoryState {
  return canRedo(h) ? { ...h, cursor: h.cursor + 1 } : h;
}

/** Look at a past (or undone) state without changing the active equation. */
export function inspectState(h: HistoryState, index: number): HistoryState {
  if (index < 0 || index > h.moves.length) return h;
  return index === h.cursor ? { ...h, inspect: null } : { ...h, inspect: index };
}

export const stopInspecting = (h: HistoryState): HistoryState => (h.inspect === null ? h : { ...h, inspect: null });

/** Make an inspected state the active one (like undoing several moves at once; redo stays available). */
export function jumpTo(h: HistoryState, index: number): HistoryState {
  if (index < 0 || index > h.moves.length) return h;
  return { ...h, cursor: index, inspect: null };
}

export const resetHistory = (h: HistoryState): HistoryState => createHistory(h.start);

/** Rebuild a history by replaying saved commands (used to resume where a student left off). */
export function replayCommands(start: Equation, commands: readonly Command[], now: number = Date.now()): HistoryState {
  let h = createHistory(start);
  for (const c of commands) {
    const r = tryCommand(h, c, now);
    if (!r.ok) break;
    h = r.state;
  }
  return h;
}

export const activeCommands = (h: HistoryState): Command[] => activeMoves(h).map((m) => m.data.command);
