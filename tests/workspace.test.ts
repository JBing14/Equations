import { describe, it, expect } from 'vitest';
import { createWorkspace, workspaceReducer } from '../src/state/workspace';
import type { WorkspaceAction, WorkspaceState } from '../src/state/workspace';
import { evaluateDrop } from '../src/state/drop';
import { currentEquation, displayedEquation } from '../src/history/history';
import type { Command } from '../src/engine/moves';
import { F, P } from './helpers';

const run = (s: WorkspaceState, ...actions: WorkspaceAction[]): WorkspaceState => actions.reduce(workspaceReducer, s);
const start = (text: string) => createWorkspace(P(text));
const sub5: Command = { type: 'addsub', side: 'left', index: 1 };

describe('dashed divider', () => {
  it('is hidden before any manipulation', () => {
    expect(start('x + 5 = 12').dividerShown).toBe(false);
  });
  it('appears on the first drag and stays for the whole session', () => {
    let s = start('x + 5 = 12');
    s = run(s, { type: 'dragStart', source: { kind: 'term', side: 'left', index: 1 } });
    expect(s.dividerShown).toBe(true);
    s = run(s, { type: 'dragCancel' });
    expect(s.dividerShown).toBe(true);
    s = run(s, { type: 'commit', command: sub5, animate: false }, { type: 'undo' }, { type: 'redo' });
    expect(s.dividerShown).toBe(true);
  });
  it('also appears on the first click-selection (the non-drag alternative)', () => {
    const s = run(start('x + 5 = 12'), { type: 'select', selection: { kind: 'term', side: 'left', index: 1 } });
    expect(s.dividerShown).toBe(true);
  });
  it('is hidden again by reset', () => {
    const s = run(start('x + 5 = 12'), { type: 'commit', command: sub5, animate: false }, { type: 'reset' });
    expect(s.dividerShown).toBe(false);
    expect(s.history.moves).toHaveLength(0);
  });
});

describe('drag and drop', () => {
  const eq = P('x + 5 = 12');
  const plus5 = { kind: 'term', side: 'left', index: 1 } as const;

  it('dropping +5 on the opposite side applies the inverse operation', () => {
    const e = evaluateDrop(eq, plus5, { kind: 'side', side: 'right' });
    expect(e.valid).toBe(true);
    expect(e.command).toEqual(sub5);
    expect(e.reason).toBe('Subtract 5 from both sides');
  });

  it('dropping on the same side is invalid and explained', () => {
    const e = evaluateDrop(eq, plus5, { kind: 'side', side: 'left' });
    expect(e.valid).toBe(false);
    expect(e.command).toBeNull();
    expect(e.reason).toContain('other side');
  });

  it('dropping nowhere is invalid', () => {
    expect(evaluateDrop(eq, plus5, null).valid).toBe(false);
  });

  it('a factor dropped across divides both sides', () => {
    const e = evaluateDrop(P('3x = 12'), { kind: 'factor', side: 'left', index: 0, part: 'coef' }, { kind: 'side', side: 'right' });
    expect(e.valid).toBe(true);
    expect(e.reason).toBe('Divide both sides by 3');
  });

  it('a factor on a multi-term side is rejected with an explanation', () => {
    const e = evaluateDrop(P('2x + 3 = 11'), { kind: 'factor', side: 'left', index: 0, part: 'coef' }, { kind: 'side', side: 'right' });
    expect(e.valid).toBe(false);
    expect(e.reason).toContain('only multiplies part');
  });

  it('dropping a term on a like term on the same side combines them', () => {
    const e = evaluateDrop(P('3x + 5 + 2x = 20'), { kind: 'term', side: 'left', index: 2 }, { kind: 'term', side: 'left', index: 0 });
    expect(e.valid).toBe(true);
    expect(e.command).toEqual({ type: 'combine', side: 'left', kind: 'var' });
    const bad = evaluateDrop(P('3x + 5 + 2x = 20'), { kind: 'term', side: 'left', index: 2 }, { kind: 'term', side: 'left', index: 1 });
    expect(bad.valid).toBe(false);
  });

  it('a valid drop commits one move; an invalid drop changes nothing', () => {
    let s = start('x + 5 = 12');
    s = run(s, { type: 'dragStart', source: plus5 });
    s = run(s, { type: 'dragOver', evaluation: evaluateDrop(eq, plus5, { kind: 'side', side: 'left' }) });
    expect(s.phase).toBe('invalid-target');
    s = run(s, { type: 'dragEnd', evaluation: evaluateDrop(eq, plus5, { kind: 'side', side: 'left' }) });
    expect(s.history.moves).toHaveLength(0);
    expect(F(currentEquation(s.history))).toBe('x + 5 = 12');
    expect(s.feedback?.kind).toBe('error');

    s = run(s, { type: 'dragStart', source: plus5 });
    const good = evaluateDrop(eq, plus5, { kind: 'side', side: 'right' });
    s = run(s, { type: 'dragOver', evaluation: good });
    expect(s.phase).toBe('valid-target');
    s = run(s, { type: 'dragEnd', evaluation: good });
    expect(s.history.moves).toHaveLength(1);
    expect(s.phase).toBe('applying');
  });

  it('duplicate pointer events cannot record a move twice', () => {
    let s = start('x + 5 = 12');
    const good = evaluateDrop(eq, plus5, { kind: 'side', side: 'right' });
    s = run(s, { type: 'dragStart', source: plus5 }, { type: 'dragEnd', evaluation: good }, { type: 'dragEnd', evaluation: good });
    expect(s.history.moves).toHaveLength(1);
    // a second commit while the first is animating is ignored too
    s = run(s, { type: 'commit', command: { type: 'scale', side: 'left', index: 0, part: 'coef' }, animate: true });
    expect(s.history.moves).toHaveLength(1);
  });
});

describe('animation phases', () => {
  it('walks applying -> simplifying -> completed with the history already recorded', () => {
    let s = run(start('x + 5 = 12'), { type: 'commit', command: sub5, animate: true });
    expect(s.phase).toBe('applying');
    expect(s.history.moves).toHaveLength(1);
    const id = s.lastMove!.id;
    s = run(s, { type: 'advance', moveId: id });
    expect(s.phase).toBe('simplifying');
    s = run(s, { type: 'advance', moveId: id });
    expect(s.phase).toBe('completed');
    expect(F(currentEquation(s.history))).toBe('x = 7');
  });
  it('ignores stale timers from an earlier move', () => {
    const s = run(start('2x + 3 = 11'), { type: 'commit', command: { type: 'addsub', side: 'left', index: 1 }, animate: true });
    const after = run(s, { type: 'advance', moveId: 'm99' });
    expect(after.phase).toBe('applying');
  });
  it('skips straight to completed without changing the math', () => {
    const slow = run(start('2x + 3 = 11'), { type: 'commit', command: { type: 'addsub', side: 'left', index: 1 }, animate: true }, { type: 'skipAnimation' });
    const instant = run(start('2x + 3 = 11'), { type: 'commit', command: { type: 'addsub', side: 'left', index: 1 }, animate: false });
    expect(slow.phase).toBe('completed');
    expect(instant.phase).toBe('completed');
    expect(F(currentEquation(slow.history))).toBe(F(currentEquation(instant.history)));
    expect(slow.history.moves[0].data.label).toBe(instant.history.moves[0].data.label);
  });
  it('disables selection and dragging while animating', () => {
    const s = run(start('2x + 3 = 11'), { type: 'commit', command: { type: 'addsub', side: 'left', index: 1 }, animate: true });
    const t = run(s, { type: 'select', selection: { kind: 'term', side: 'left', index: 0 } }, { type: 'dragStart', source: { kind: 'term', side: 'left', index: 0 } });
    expect(t.selection).toBeNull();
    expect(t.drag).toBeNull();
  });
});

describe('undo, redo, reset and inspection through the workspace', () => {
  it('undo and redo move through the recorded moves', () => {
    let s = run(start('2x + 3 = 11'),
      { type: 'commit', command: { type: 'addsub', side: 'left', index: 1 }, animate: false },
      { type: 'commit', command: { type: 'scale', side: 'left', index: 0, part: 'coef' }, animate: false });
    expect(F(currentEquation(s.history))).toBe('x = 4');
    s = run(s, { type: 'undo' });
    expect(F(currentEquation(s.history))).toBe('2x = 8');
    s = run(s, { type: 'redo' });
    expect(F(currentEquation(s.history))).toBe('x = 4');
  });
  it('inspecting a past step does not change the active equation and blocks moves', () => {
    let s = run(start('2x + 3 = 11'), { type: 'commit', command: { type: 'addsub', side: 'left', index: 1 }, animate: false });
    s = run(s, { type: 'inspect', index: 0 });
    expect(s.phase).toBe('inspecting');
    expect(F(displayedEquation(s.history))).toBe('2x + 3 = 11');
    expect(F(currentEquation(s.history))).toBe('2x = 8');
    const t = run(s, { type: 'commit', command: { type: 'scale', side: 'left', index: 0, part: 'coef' }, animate: false });
    expect(t.history.moves).toHaveLength(1);
    expect(F(currentEquation(t.history))).toBe('2x = 8');
    const back = run(s, { type: 'stopInspecting' });
    expect(back.phase).toBe('idle');
    expect(F(displayedEquation(back.history))).toBe('2x = 8');
  });
  it('an invalid commit leaves state and history unchanged', () => {
    const s0 = start('2x + 3 = 11');
    const s = run(s0, { type: 'commit', command: { type: 'scale', side: 'left', index: 0, part: 'coef' }, animate: true });
    expect(s.history).toBe(s0.history);
    expect(s.feedback?.kind).toBe('error');
    expect(s.phase).toBe('idle');
  });
  it('announces each committed move for assistive technology', () => {
    const s = run(start('x + 5 = 12'), { type: 'commit', command: sub5, animate: false });
    expect(s.announce).toContain('Move 1: Subtract 5 from both sides');
    expect(s.announce).toContain('x equals 7');
  });
  it('reveals hints one at a time up to four', () => {
    let s = start('2x + 3 = 11');
    for (let i = 0; i < 6; i++) s = run(s, { type: 'hint' });
    expect(s.hintsShown).toBe(4);
    s = run(s, { type: 'commit', command: { type: 'addsub', side: 'left', index: 1 }, animate: false });
    expect(s.hintsShown).toBe(0);
  });
});
