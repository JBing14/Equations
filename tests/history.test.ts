import { describe, it, expect } from 'vitest';
import {
  activeCommands, activeMoves, canRedo, canUndo, createHistory, currentEquation, displayedEquation,
  inspectState, jumpTo, redo, replayCommands, stopInspecting, tryCommand, undo,
} from '../src/history/history';
import type { Command } from '../src/engine/moves';
import { F, P } from './helpers';

const sub5: Command = { type: 'addsub', side: 'left', index: 1 };
const div2: Command = { type: 'scale', side: 'left', index: 0, part: 'coef' };

function play(text: string, ...cmds: Command[]) {
  let h = createHistory(P(text));
  for (const c of cmds) {
    const r = tryCommand(h, c, 1000);
    if (!r.ok) throw new Error(r.error.message);
    h = r.state;
  }
  return h;
}

describe('history records', () => {
  it('records the original equation as the start state', () => {
    const h = createHistory(P('x + 5 = 12'));
    expect(F(h.start)).toBe('x + 5 = 12');
    expect(h.moves).toHaveLength(0);
    expect(F(currentEquation(h))).toBe('x + 5 = 12');
  });

  it('each successful operation creates exactly one entry, in order', () => {
    const h = play('2x + 3 = 11', sub5, div2);
    expect(h.moves.map((m) => m.index)).toEqual([1, 2]);
    expect(h.moves.map((m) => m.id)).toEqual(['m1', 'm2']);
    expect(h.moves.map((m) => F(m.data.after))).toEqual(['2x = 8', 'x = 4']);
    expect(h.cursor).toBe(2);
  });

  it('stores structured data that matches the real transformation', () => {
    const h = play('2x + 3 = 11', sub5);
    const rec = h.moves[0];
    expect(rec.data.command).toEqual(sub5);
    expect(rec.data.kind).toBe('subtract');
    expect(F(rec.data.before)).toBe('2x + 3 = 11');
    expect(F(rec.data.after)).toBe('2x = 8');
    expect(rec.timestamp).toBe(1000);
    expect(rec.data.label).toBe('Subtract 3 from both sides');
  });

  it('does not record invalid operations', () => {
    const h = play('2x + 3 = 11');
    const bad = tryCommand(h, div2); // divides only part of the left side
    expect(bad.ok).toBe(false);
    expect(bad.state).toBe(h);
    expect(h.moves).toHaveLength(0);
    const gone = tryCommand(h, { type: 'addsub', side: 'left', index: 7 });
    expect(gone.ok).toBe(false);
    expect(gone.state.moves).toHaveLength(0);
  });
});

describe('undo and redo', () => {
  it('undo restores the previous mathematical state and redo reapplies it', () => {
    let h = play('2x + 3 = 11', sub5, div2);
    h = undo(h);
    expect(F(currentEquation(h))).toBe('2x = 8');
    h = undo(h);
    expect(F(currentEquation(h))).toBe('2x + 3 = 11');
    expect(canUndo(h)).toBe(false);
    expect(canRedo(h)).toBe(true);
    h = redo(h);
    expect(F(currentEquation(h))).toBe('2x = 8');
    h = redo(h);
    expect(F(currentEquation(h))).toBe('x = 4');
    expect(canRedo(h)).toBe(false);
  });

  it('a new move after undo discards the abandoned redo branch', () => {
    let h = play('2x + 3 = 11', sub5, div2);
    h = undo(h);
    h = undo(h);
    const other: Command = { type: 'scale', side: 'right', index: 0, part: 'coef' };
    expect(tryCommand(h, other).ok).toBe(false); // right side is a plain number
    const r = tryCommand(h, { type: 'addsub', side: 'left', index: 1 });
    if (!r.ok) throw new Error('expected success');
    h = r.state;
    expect(h.moves).toHaveLength(1);
    expect(canRedo(h)).toBe(false);
    expect(h.moves[0].id).toBe('m3'); // ids keep increasing, never reused
  });

  it('undo with nothing to undo does nothing', () => {
    const h = createHistory(P('x + 1 = 2'));
    expect(undo(h)).toBe(h);
    expect(redo(h)).toBe(h);
  });
});

describe('historical inspection', () => {
  it('shows an earlier state without changing the active equation', () => {
    let h = play('2x + 3 = 11', sub5, div2);
    h = inspectState(h, 1);
    expect(F(displayedEquation(h))).toBe('2x = 8');
    expect(F(currentEquation(h))).toBe('x = 4');
    expect(h.cursor).toBe(2);
    expect(h.moves).toHaveLength(2);
  });

  it('blocks new moves, undo and redo while inspecting', () => {
    let h = play('2x + 3 = 11', sub5);
    h = inspectState(h, 0);
    expect(tryCommand(h, { type: 'scale', side: 'left', index: 0, part: 'coef' }).ok).toBe(false);
    expect(canUndo(h)).toBe(false);
    expect(canRedo(h)).toBe(false);
    expect(undo(h)).toBe(h);
  });

  it('returns to the latest state without losing history', () => {
    let h = play('2x + 3 = 11', sub5, div2);
    h = inspectState(h, 0);
    h = stopInspecting(h);
    expect(F(displayedEquation(h))).toBe('x = 4');
    expect(h.moves).toHaveLength(2);
  });

  it('inspecting the active step is just the normal view', () => {
    const h = inspectState(play('2x + 3 = 11', sub5), 1);
    expect(h.inspect).toBeNull();
  });

  it('jumping back keeps later moves available for redo', () => {
    let h = play('2x + 3 = 11', sub5, div2);
    h = jumpTo(h, 1);
    expect(F(currentEquation(h))).toBe('2x = 8');
    expect(canRedo(h)).toBe(true);
    expect(activeMoves(h)).toHaveLength(1);
  });

  it('ignores out-of-range indexes', () => {
    const h = play('2x + 3 = 11', sub5);
    expect(inspectState(h, 9)).toBe(h);
    expect(jumpTo(h, -1)).toBe(h);
  });
});

describe('replay', () => {
  it('rebuilds the same history from saved commands', () => {
    const h = play('2x + 3 = 11', sub5, div2);
    const again = replayCommands(h.start, activeCommands(h), 1000);
    expect(again.moves.map((m) => F(m.data.after))).toEqual(h.moves.map((m) => F(m.data.after)));
  });
  it('stops at the first command that no longer applies', () => {
    const again = replayCommands(P('2x + 3 = 11'), [sub5, sub5, div2]);
    expect(again.moves).toHaveLength(1);
  });
});
