import type { Equation } from '../engine/types';
import type { Command } from '../engine/moves';
import { speakEquation } from '../engine/format';
import type { HistoryState, MoveRecord } from '../history/history';
import {
  createHistory,
  currentEquation,
  inspectState,
  jumpTo,
  redo,
  replayCommands,
  resetHistory,
  stopInspecting,
  tryCommand,
  undo,
} from '../history/history';
import type { DropEvaluation, DropZone, Selection } from './drop';

/**
 * Predictable interaction state for the equation workspace.
 *
 * Phases:  idle -> selected -> (preview) -> applying -> simplifying -> completed
 *          idle -> dragging -> valid-target | invalid-target -> (drop) -> applying ...
 *          inspecting  = looking at an earlier step (read-only)
 *
 * The mathematical result is committed to history the instant the engine validates a move.
 * `applying` and `simplifying` are purely visual phases that animate that already-recorded
 * move, so interrupting or skipping an animation can never lose or duplicate a history record.
 * While an animation runs, new selections, drags and commits are ignored (disabled).
 */

export type Phase =
  | 'idle'
  | 'selected'
  | 'preview'
  | 'dragging'
  | 'valid-target'
  | 'invalid-target'
  | 'applying'
  | 'simplifying'
  | 'completed'
  | 'inspecting';

export interface Feedback {
  readonly kind: 'info' | 'error' | 'success';
  readonly text: string;
}

export interface DragState {
  readonly source: Selection;
  /** What dropping at the pointer's current position would do (null when over nothing). */
  readonly evaluation: DropEvaluation | null;
  /** The zone under the pointer, for highlighting. */
  readonly zone: DropZone | null;
}

export interface WorkspaceState {
  readonly history: HistoryState;
  readonly selection: Selection | null;
  readonly previewCommand: Command | null;
  readonly drag: DragState | null;
  readonly phase: Phase;
  /** The dashed center divider appears at the first manipulation and stays for the session. */
  readonly dividerShown: boolean;
  readonly feedback: Feedback | null;
  /** The move being animated or just completed. */
  readonly lastMove: MoveRecord | null;
  /** Text for the polite screen-reader live region. */
  readonly announce: string;
  /** How many progressive hints have been revealed for the current equation. */
  readonly hintsShown: number;
}

export function createWorkspace(start: Equation, commands: readonly Command[] = []): WorkspaceState {
  const history = commands.length > 0 ? replayCommands(start, commands) : createHistory(start);
  return {
    history,
    selection: null,
    previewCommand: null,
    drag: null,
    phase: 'idle',
    dividerShown: history.moves.length > 0,
    feedback: null,
    lastMove: null,
    announce: '',
    hintsShown: 0,
  };
}

export type WorkspaceAction =
  | { type: 'select'; selection: Selection }
  | { type: 'deselect' }
  | { type: 'preview'; command: Command | null }
  | { type: 'dragStart'; source: Selection }
  | { type: 'dragOver'; evaluation: DropEvaluation | null; zone?: DropZone | null }
  | { type: 'dragEnd'; evaluation: DropEvaluation | null }
  | { type: 'dragCancel' }
  | { type: 'commit'; command: Command; animate: boolean; now?: number }
  | { type: 'advance'; moveId: string }
  | { type: 'skipAnimation' }
  | { type: 'undo' }
  | { type: 'redo' }
  | { type: 'reset' }
  | { type: 'inspect'; index: number }
  | { type: 'stopInspecting' }
  | { type: 'jump'; index: number }
  | { type: 'hint' };

const isAnimating = (s: WorkspaceState): boolean => s.phase === 'applying' || s.phase === 'simplifying';
const isBusy = (s: WorkspaceState): boolean => isAnimating(s) || s.history.inspect !== null;

const calm = (s: WorkspaceState): WorkspaceState => ({
  ...s,
  selection: null,
  previewCommand: null,
  drag: null,
  phase: s.history.inspect !== null ? 'inspecting' : 'idle',
  lastMove: null,
  hintsShown: 0,
});

export function workspaceReducer(s: WorkspaceState, a: WorkspaceAction): WorkspaceState {
  switch (a.type) {
    case 'select': {
      if (isBusy(s)) return s;
      return { ...s, selection: a.selection, previewCommand: null, drag: null, phase: 'selected', dividerShown: true, feedback: null };
    }
    case 'deselect': {
      if (isAnimating(s)) return s;
      return { ...s, selection: null, previewCommand: null, drag: null, phase: s.history.inspect !== null ? 'inspecting' : 'idle' };
    }
    case 'preview': {
      if (isBusy(s) || s.selection === null) return s;
      return { ...s, previewCommand: a.command, phase: a.command ? 'preview' : 'selected' };
    }
    case 'dragStart': {
      if (isBusy(s)) return s;
      return { ...s, selection: a.source, previewCommand: null, drag: { source: a.source, evaluation: null, zone: null }, phase: 'dragging', dividerShown: true, feedback: null };
    }
    case 'dragOver': {
      if (s.drag === null) return s;
      const phase: Phase = a.evaluation === null ? 'dragging' : a.evaluation.valid ? 'valid-target' : 'invalid-target';
      return { ...s, drag: { ...s.drag, evaluation: a.evaluation, zone: a.zone ?? null }, phase };
    }
    case 'dragEnd': {
      // Ignore duplicate pointer events: only the first drop of an active drag counts.
      if (s.drag === null) return s;
      const evaluation = a.evaluation;
      if (evaluation !== null && evaluation.valid && evaluation.command !== null) {
        // Hand over to the commit path below (cleared drag first so it cannot fire twice).
        return workspaceReducer({ ...s, drag: null }, { type: 'commit', command: evaluation.command, animate: true });
      }
      const text = evaluation && evaluation.reason ? evaluation.reason : '';
      return {
        ...s,
        drag: null,
        phase: 'idle',
        selection: null,
        feedback: text ? { kind: 'error', text } : null,
        announce: text ? `That move wasn't made. ${text}` : s.announce,
      };
    }
    case 'dragCancel': {
      if (s.drag === null) return s;
      return { ...s, drag: null, selection: null, phase: 'idle' };
    }
    case 'commit': {
      if (isBusy(s)) return s;
      const r = tryCommand(s.history, a.command, a.now);
      if (!r.ok) {
        return {
          ...s,
          drag: null,
          phase: s.selection ? 'selected' : 'idle',
          feedback: { kind: 'error', text: r.error.message },
          announce: `That move wasn't made. ${r.error.message}`,
        };
      }
      const m = r.record.data;
      return {
        ...s,
        history: r.state,
        selection: null,
        previewCommand: null,
        drag: null,
        phase: a.animate ? 'applying' : 'completed',
        dividerShown: true,
        feedback: { kind: 'success', text: `${m.intro} ${m.result}` },
        lastMove: r.record,
        hintsShown: 0,
        announce: `Move ${r.record.index}: ${m.label}. ${speakEquation(m.after)}.`,
      };
    }
    case 'advance': {
      if (s.lastMove === null || s.lastMove.id !== a.moveId) return s; // stale timer
      if (s.phase === 'applying') return { ...s, phase: 'simplifying' };
      if (s.phase === 'simplifying') return { ...s, phase: 'completed' };
      return s;
    }
    case 'skipAnimation': {
      return isAnimating(s) ? { ...s, phase: 'completed' } : s;
    }
    case 'undo': {
      const history = undo(s.history);
      if (history === s.history) return s;
      const prev = currentEquation(history);
      return { ...calm({ ...s, history }), feedback: null, announce: `Undid the last move. ${speakEquation(prev)}.` };
    }
    case 'redo': {
      const history = redo(s.history);
      if (history === s.history) return s;
      return { ...calm({ ...s, history }), feedback: null, announce: `Redid the move. ${speakEquation(currentEquation(history))}.` };
    }
    case 'reset': {
      const history = resetHistory(s.history);
      return { ...calm({ ...s, history }), history, dividerShown: false, feedback: null, announce: `Started over. ${speakEquation(history.start)}.` };
    }
    case 'inspect': {
      const history = inspectState(s.history, a.index);
      if (history === s.history) return s;
      return { ...calm({ ...s, history }), feedback: null };
    }
    case 'stopInspecting': {
      const history = stopInspecting(s.history);
      return history === s.history ? s : { ...calm({ ...s, history }), feedback: null };
    }
    case 'jump': {
      const history = jumpTo(s.history, a.index);
      if (history === s.history) return s;
      return { ...calm({ ...s, history }), feedback: null, announce: `Went back to step ${a.index}.` };
    }
    case 'hint': {
      if (isBusy(s)) return s;
      return { ...s, hintsShown: Math.min(4, s.hintsShown + 1) };
    }
  }
}
