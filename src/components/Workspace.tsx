import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import type { KeyboardEvent as ReactKeyboardEvent, PointerEvent as ReactPointerEvent, ReactNode } from 'react';
import type { Rational } from '../engine/rational';
import type { Equation, Side } from '../engine/types';
import { sideTerms } from '../engine/types';
import type { Command } from '../engine/moves';
import type { MoveRules } from '../engine/moves';
import { applyCommand, availableCombines } from '../engine/moves';
import { formatSignedTerm, formatRational } from '../engine/format';
import { parseNumber } from '../engine/parser';
import { solutionSet } from '../engine/linear';
import { status } from '../engine/status';
import { solveSteps } from '../engine/strategy';
import { checkAnswer, finishMessage, hintsFor } from '../engine/explain';
import { activeCommands, canRedo, canUndo, currentEquation, displayedEquation } from '../history/history';
import type { DropZone, Selection } from '../state/drop';
import { commandForSelection, evaluateDrop, sameSelection } from '../state/drop';
import type { WorkspaceState } from '../state/workspace';
import { createWorkspace, workspaceReducer } from '../state/workspace';
import { useStore } from '../storage/StoreContext';
import type { Speed } from '../storage/store';
import { SPEED_FACTOR, useReducedMotion } from '../hooks';
import { Board } from './equation/Board';
import { History } from './equation/History';
import { StepGrid } from './equation/Steps';
import { spoken } from './equation/Terms';
import { BalanceScale } from './balance/BalanceScale';

export interface CheckOutcome {
  correct: boolean;
  /** 1 for the first time the student presses Check on this problem. */
  attempt: number;
  /** True when the worked solution was shown before this check. */
  revealed: boolean;
}

export interface WorkspaceProps {
  equation: Equation;
  initialCommands?: readonly Command[];
  allowReveal?: boolean;
  /** A bare canvas: just the equation, undo/redo/reset and the distribute/combine buttons. */
  canvas?: boolean;
  onCommands?: (commands: Command[]) => void;
  onCheck?: (outcome: CheckOutcome) => void;
  onReveal?: () => void;
}

interface DragInfo {
  id: number;
  x0: number;
  y0: number;
  source: Selection;
  label: string;
  active: boolean;
}

const DRAG_THRESHOLD = 6;
const APPLY_MS = 1100;
const SIMPLIFY_MS = 1000;

/** "+ 5" becomes "− 5", "− 5" becomes "+ 5", and a bare leading term gets a minus. */
function flipLabel(label: string): string {
  const t = label.trim();
  if (t.startsWith('+')) return '−' + t.slice(1);
  if (t.startsWith('−') || t.startsWith('-')) return '+' + t.slice(1);
  return '−' + t;
}

export function Workspace(props: WorkspaceProps) {
  const { data, update } = useStore();
  const prefs = data.prefs;
  const reduced = useReducedMotion(prefs.motion);
  const factor = reduced ? 0 : SPEED_FACTOR[prefs.speed];

  const [state, dispatch] = useReducer(workspaceReducer, null, () => createWorkspace(props.equation, props.initialCommands ?? []));
  const { history } = state;
  const eq = displayedEquation(history);
  const activeEq = currentEquation(history);
  const original = history.start;
  const inspecting = history.inspect !== null;
  const animating = state.phase === 'applying' || state.phase === 'simplifying';
  const busy = animating || inspecting;

  // ---- latest values for event handlers that live outside React's render
  const live = useRef({ eq: activeEq, busy, selection: state.selection });
  live.current = { eq: activeEq, busy, selection: state.selection };
  const callbacks = useRef(props);
  callbacks.current = props;

  // ---- hints (computed from the equation actually on screen)
  const rules: MoveRules = useMemo(
    () => ({ allowDivideFirst: prefs.allowDivideFirst, forceDistributeFirst: prefs.forceDistributeFirst }),
    [prefs.allowDivideFirst, prefs.forceDistributeFirst],
  );
  const rulesRef = useRef(rules);
  rulesRef.current = rules;
  const hints = useMemo(() => hintsFor(activeEq, rules), [activeEq, rules]);
  const hintTarget = state.hintsShown >= 4 && !busy ? hints.target : null;

  // ---- animation clock: purely visual, the move is already recorded
  useEffect(() => {
    if (!animating || !state.lastMove) return;
    const moveId = state.lastMove.id;
    const ms = (state.phase === 'applying' ? APPLY_MS : SIMPLIFY_MS) * factor;
    const t = window.setTimeout(() => dispatch({ type: 'advance', moveId }), ms);
    return () => window.clearTimeout(t);
  }, [animating, state.phase, state.lastMove, factor]);

  // ---- tell the parent which moves are active (used to resume later)
  const commands = useMemo(() => activeCommands(history), [history]);
  useEffect(() => {
    callbacks.current.onCommands?.(commands);
  }, [commands]);

  const commit = useCallback((command: Command) => dispatch({ type: 'commit', command, animate: factor > 0, rules }), [factor, rules]);

  const toggleSelect = useCallback((source: Selection) => {
    if (live.current.busy) return;
    if (sameSelection(live.current.selection, source)) dispatch({ type: 'deselect' });
    else dispatch({ type: 'select', selection: source });
  }, []);

  // ---- pointer drag (mouse, touch and pen) with a click fallback
  const dragRef = useRef<DragInfo | null>(null);
  const lastZoneKey = useRef('');
  const cleanupRef = useRef<(() => void) | null>(null);
  const [ghost, setGhost] = useState<{ x: number; y: number; label: string; valid: boolean | null; flipped: boolean } | null>(null);

  useEffect(() => () => cleanupRef.current?.(), []);

  const zoneAt = (x: number, y: number): DropZone => {
    let termHit: { side: Side; index: number } | null = null;
    let zoneSide: Side | null = null;
    for (const el of document.elementsFromPoint(x, y)) {
      if (!(el instanceof HTMLElement)) continue;
      if (!termHit && el.dataset.termSide) termHit = { side: el.dataset.termSide as Side, index: Number(el.dataset.termIndex) };
      if (!zoneSide && el.dataset.dropSide) zoneSide = el.dataset.dropSide as Side;
    }
    if (termHit) return { kind: 'term', side: termHit.side, index: termHit.index };
    if (zoneSide) return { kind: 'side', side: zoneSide };
    return null;
  };

  const onPointerDown = (e: ReactPointerEvent<HTMLElement>, source: Selection, label: string): void => {
    if (live.current.busy) return;
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    cleanupRef.current?.();
    dragRef.current = { id: e.pointerId, x0: e.clientX, y0: e.clientY, source, label, active: false };
    lastZoneKey.current = '';

    const stop = (): void => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', cancel);
      dragRef.current = null;
      cleanupRef.current = null;
      setGhost(null);
    };
    const move = (ev: PointerEvent): void => {
      const d = dragRef.current;
      if (!d || ev.pointerId !== d.id) return;
      if (!d.active) {
        if (Math.hypot(ev.clientX - d.x0, ev.clientY - d.y0) < DRAG_THRESHOLD) return;
        d.active = true;
        dispatch({ type: 'dragStart', source: d.source });
      }
      const zone = zoneAt(ev.clientX, ev.clientY);
      const evaluation = zone ? evaluateDrop(live.current.eq, d.source, zone, rulesRef.current) : null;
      // Live sign change: a term shows its opposite sign while it hovers over the other side.
      const crossing =
        d.source.kind === 'term' && zone !== null && zone.side !== d.source.side && evaluation !== null && evaluation.valid;
      setGhost({ x: ev.clientX, y: ev.clientY, label: crossing ? flipLabel(d.label) : d.label, valid: evaluation ? evaluation.valid : null, flipped: crossing });
      const key = `${JSON.stringify(zone)}|${evaluation ? evaluation.valid : 'n'}`;
      if (key !== lastZoneKey.current) {
        lastZoneKey.current = key;
        dispatch({ type: 'dragOver', evaluation, zone });
      }
    };
    const up = (ev: PointerEvent): void => {
      const d = dragRef.current;
      if (!d || ev.pointerId !== d.id) return;
      const wasActive = d.active;
      stop();
      if (!wasActive) {
        toggleSelect(d.source); // a click or tap, not a drag
        return;
      }
      const zone = zoneAt(ev.clientX, ev.clientY);
      dispatch({ type: 'dragEnd', evaluation: evaluateDrop(live.current.eq, d.source, zone, rulesRef.current) });
    };
    const cancel = (ev: PointerEvent): void => {
      const d = dragRef.current;
      if (!d || ev.pointerId !== d.id) return;
      const wasActive = d.active;
      stop();
      if (wasActive) dispatch({ type: 'dragCancel' });
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', cancel);
    cleanupRef.current = stop;
  };

  const onKeyDown = (e: ReactKeyboardEvent<HTMLElement>): void => {
    if (e.key === 'Escape') {
      cleanupRef.current?.();
      dispatch({ type: 'dragCancel' });
      dispatch({ type: 'deselect' });
    }
  };

  // ---- answer checking
  const [answer, setAnswer] = useState('');
  const [checkMsg, setCheckMsg] = useState<{ kind: 'success' | 'error'; text: string } | null>(null);
  const checks = useRef(0);
  const [revealed, setRevealed] = useState(false);
  const revealedRef = useRef(false);
  const st = status(activeEq);

  const runCheck = (): void => {
    const text = answer.trim();
    const set = solutionSet(original);
    let claim: { kind: 'number'; value: Rational } | { kind: 'none' } | { kind: 'all' };
    if (text) {
      const lower = text.toLowerCase();
      if (/no\s*solution|^none$/.test(lower)) claim = { kind: 'none' };
      else if (/all|infinite|every|any/.test(lower) && parseNumber(text) === null) claim = { kind: 'all' };
      else {
        const n = parseNumber(text);
        if (n === null) {
          setCheckMsg({ kind: 'error', text: `I couldn’t read “${text.slice(0, 20)}” as a number. Try something like 4, -2.5 or 3/4. If there is no answer, type “no solution”.` });
          return;
        }
        claim = { kind: 'number', value: n };
      }
    } else if (st.kind === 'solved') {
      claim = { kind: 'number', value: st.value };
    } else if (st.kind === 'none') {
      claim = { kind: 'none' };
    } else if (st.kind === 'identity') {
      claim = { kind: 'all' };
    } else {
      setCheckMsg({ kind: 'error', text: `Type your answer in the box, or keep solving until ${original.variable} is alone on one side.` });
      return;
    }

    let correct: boolean;
    let message: string;
    if (claim.kind === 'number') {
      if (set.kind === 'unique') {
        const r = checkAnswer(original, claim.value);
        correct = r.correct;
        message = r.message;
      } else if (set.kind === 'none') {
        correct = false;
        message = `That number doesn’t work. Look closely: this equation has no solution, because the two sides can never be equal.`;
      } else {
        correct = false;
        message = `That number works, but so does every other number. This equation has infinitely many solutions: both sides are always equal.`;
      }
    } else if (claim.kind === 'none') {
      correct = set.kind === 'none';
      message = correct ? 'Right: no solution. The two sides can never be equal, whatever number the letter is.' : set.kind === 'all' ? 'Not quite. Both sides are always equal here, so there are infinitely many solutions.' : `Not quite. This equation does have a solution: ${original.variable} = ${set.kind === 'unique' ? formatRational(set.value, original.decimal) : '?'}. Try checking it.`;
    } else {
      correct = set.kind === 'all';
      message = correct ? 'Right: infinitely many solutions. Both sides are equal for every value of the letter.' : set.kind === 'none' ? 'Not quite. The sides can never be equal, so there is no solution.' : 'Not quite. This equation has exactly one solution. Keep solving.';
    }
    checks.current += 1;
    setCheckMsg({ kind: correct ? 'success' : 'error', text: message });
    callbacks.current.onCheck?.({ correct, attempt: checks.current, revealed: revealedRef.current });
  };

  // ---- worked solution
  const solution = useMemo(() => (revealed ? solveSteps(original, undefined, rules) : []), [revealed, original, rules]);
  const reveal = (): void => {
    setRevealed(true);
    revealedRef.current = true;
    callbacks.current.onReveal?.();
  };

  // ---- derived UI data
  const combos = availableCombines(activeEq);
  const distributeCmd: Command | null = (() => {
    for (const side of ['left', 'right'] as const) {
      const i = sideTerms(activeEq, side).findIndex((t) => t.core.kind === 'group');
      if (i >= 0) return { type: 'distribute', side, index: i };
    }
    return null;
  })();
  const distributeLabel = distributeCmd ? applyCommand(activeEq, distributeCmd, rules) : null;
  const finish = !busy && state.phase !== 'dragging' ? finishMessage(activeEq) : null;
  const shownHints = hints.levels.slice(0, state.hintsShown);

  const setSpeed = (speed: Speed): void => update((d) => ({ ...d, prefs: { ...d.prefs, speed } }));
  const toggleMotion = (): void => update((d) => ({ ...d, prefs: { ...d.prefs, motion: reduced ? 'full' : 'reduced' } }));
  const toggleBalance = (): void => update((d) => ({ ...d, prefs: { ...d.prefs, showBalance: !d.prefs.showBalance } }));

  return (
    <div
      className={`workspace${props.canvas ? ' canvas' : ''}`}
      data-testid="workspace"
      data-phase={state.phase}
      data-divider={state.dividerShown ? 'on' : 'off'}
      style={{ ['--speed' as string]: factor }}
      onKeyDown={onKeyDown}
    >
      <div className="sr-only" role="status" aria-live="polite" data-testid="announcer">
        {state.announce}
      </div>

      <div className="workspace-grid">
        <section className="stage card" aria-labelledby="stage-title">
          <h2 id="stage-title" className="sr-only">Equation workspace</h2>
          <Board state={state} eq={eq} hintTarget={hintTarget} onPointerDown={onPointerDown} onActivate={toggleSelect} />

          {inspecting && <p className="inspect-note muted">Showing an earlier step. Use the cards below to return to your latest work.</p>}

          <Guide
            state={state}
            activeEq={activeEq}
            shortcut={prefs.signShortcut}
            canvas={!!props.canvas}
            rules={rules}
            onCommit={commit}
            onPreview={(command) => dispatch({ type: 'preview', command })}
            onDeselect={() => dispatch({ type: 'deselect' })}
          />

          {finish && !props.canvas && (
            <p className={`finish ${st.kind === 'solved' ? 'ok' : 'note'}`} data-testid="finish">
              <strong>{st.kind === 'solved' ? 'Solved! ' : 'Finished. '}</strong>
              {finish}
              {st.kind === 'solved' ? ' Now check it by substituting back into the original equation.' : ''}
            </p>
          )}

          {!props.canvas && shownHints.length > 0 && (
            <div className="hints" role="status" data-testid="hints">
              <strong>Hints</strong>
              <ol>
                {shownHints.map((h, i) => (
                  <li key={i}>{h}</li>
                ))}
              </ol>
            </div>
          )}
          {!props.canvas && state.hintsShown > 0 && hints.finished && <p className="muted">This equation is already finished. Press Check answer.</p>}

          <div className="controls" role="group" aria-label="Workspace controls">
            <button type="button" className="btn" onClick={() => dispatch({ type: 'undo' })} disabled={!canUndo(history)}>
              ↶ Undo
            </button>
            <button type="button" className="btn" onClick={() => dispatch({ type: 'redo' })} disabled={!canRedo(history)}>
              ↷ Redo
            </button>
            <button type="button" className="btn" onClick={() => dispatch({ type: 'reset' })} disabled={history.moves.length === 0 && !state.dividerShown}>
              ⟲ Reset
            </button>
            {!props.canvas && (
            <button type="button" className="btn" onClick={() => dispatch({ type: 'hint' })} disabled={busy || state.hintsShown >= 4 || hints.finished}>
              💡 Hint{state.hintsShown > 0 ? ` (${state.hintsShown}/4)` : ''}
            </button>
            )}
            {distributeCmd && distributeLabel && distributeLabel.ok && (
              <button type="button" className="btn" disabled={busy} onClick={() => commit(distributeCmd)} data-testid="distribute-btn">
                ✨ {distributeLabel.move.label}
              </button>
            )}
            {combos.length > 0 && (
              <button type="button" className="btn" disabled={busy} onClick={() => commit(combos[0])} data-testid="combine-btn">
                ➕ Combine like terms
              </button>
            )}
            {animating && (
              <button type="button" className="btn secondary" onClick={() => dispatch({ type: 'skipAnimation' })}>
                Skip animation
              </button>
            )}
          </div>

          {!props.canvas && (
          <div className="settings-strip">
            <fieldset className="seg">
              <legend>Animation speed</legend>
              {(['slow', 'normal', 'fast'] as const).map((s) => (
                <label key={s} className={prefs.speed === s ? 'on' : ''}>
                  <input type="radio" name="speed" value={s} checked={prefs.speed === s} onChange={() => setSpeed(s)} />
                  {s[0].toUpperCase() + s.slice(1)}
                </label>
              ))}
            </fieldset>
            <label className="check">
              <input type="checkbox" checked={reduced} onChange={toggleMotion} disabled={prefs.motion === 'system' && reduced} />
              Reduce motion
            </label>
            <label className="check">
              <input type="checkbox" checked={prefs.showBalance} onChange={toggleBalance} />
              Show balance scale
            </label>
          </div>
          )}

          {!props.canvas && (
          <form
            className="check-panel"
            onSubmit={(e) => {
              e.preventDefault();
              runCheck();
            }}
          >
            <label htmlFor="answer-input">
              My answer for <em>{original.variable}</em>
            </label>
            <div className="check-row">
              <input
                id="answer-input"
                className="text-input"
                inputMode="text"
                autoComplete="off"
                value={answer}
                placeholder={st.kind === 'solved' ? 'Type it here, or just press Check' : 'Type a number, or "no solution"'}
                onChange={(e) => setAnswer(e.target.value)}
                aria-describedby="check-result"
              />
              <button type="submit" className="btn primary" data-testid="check-btn">
                Check answer
              </button>
              {props.allowReveal && (
                <button type="button" className="btn" onClick={reveal} disabled={revealed}>
                  Show worked solution
                </button>
              )}
            </div>
            <p id="check-result" className={`check-result ${checkMsg ? checkMsg.kind : ''}`} role="status" data-testid="check-result">
              {checkMsg ? (checkMsg.kind === 'success' ? '✔ ' : '✖ ') + checkMsg.text : ''}
            </p>
          </form>
          )}
        </section>

        {prefs.showBalance && !props.canvas && (
          <aside className="card scale-card" aria-label="Balance scale">
            <h2 className="side-title">Balance scale</h2>
            <BalanceScale eq={eq} move={state.phase === 'applying' ? (state.lastMove?.data ?? null) : null} />
          </aside>
        )}
      </div>

      {revealed && !props.canvas && (
        <section className="card solution" aria-labelledby="solution-title" data-testid="solution">
          <div className="section-head">
            <h2 id="solution-title">Worked solution</h2>
            <p className="muted">Each step was found by the same engine that checks your moves.</p>
          </div>
          <ol className="solution-steps">
            {solution.map((m, i) => (
              <li key={i}>
                <h3>
                  Step {i + 1}: {m.label}
                </h3>
                <StepGrid move={m} phase="all" className="mini" />
                <p>{m.intro}</p>
                <p className="muted">{m.result}</p>
              </li>
            ))}
          </ol>
        </section>
      )}

      <History history={history} dispatch={dispatch} />

      {ghost && (
        <div className={`drag-ghost${ghost.valid === true ? ' ok' : ghost.valid === false ? ' no' : ''}${ghost.flipped ? ' flipped' : ''}`} style={{ left: ghost.x, top: ghost.y }} aria-hidden="true">
          {ghost.label}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------- the explanation / operation panel

interface GuideProps {
  state: WorkspaceState;
  activeEq: Equation;
  shortcut: boolean;
  canvas: boolean;
  rules: MoveRules;
  onCommit: (c: Command) => void;
  onPreview: (c: Command | null) => void;
  onDeselect: () => void;
}

function Guide({ state, activeEq, shortcut, canvas, rules, onCommit, onPreview, onDeselect }: GuideProps) {
  const { selection, drag, lastMove, phase, feedback, previewCommand } = state;
  const inspecting = state.history.inspect !== null;
  let content: ReactNode;

  if (inspecting) {
    content = <p className="muted">You are looking back. Nothing you do here changes your current equation.</p>;
  } else if (drag) {
    content = (
      <p className="explain-drag" data-testid="drag-explain">
        {drag.evaluation
          ? drag.evaluation.valid
            ? `Drop here: ${drag.evaluation.reason}.`
            : drag.evaluation.reason || 'Drag it somewhere else.'
          : 'Drag it to the other side of the equals sign. The opposite operation will be applied to both sides.'}
      </p>
    );
  } else if (selection) {
    content = <SelectionPanel rules={rules} eq={activeEq} selection={selection} previewCommand={previewCommand} onCommit={onCommit} onPreview={onPreview} onDeselect={onDeselect} />;
  } else if (canvas) {
    content = null; // a blank canvas: no tips and no explanations unless something needs attention
  } else if (lastMove) {
    const m = lastMove.data;
    content = (
      <div className="explain" data-testid="explain">
        <p className="move-tag">Move {lastMove.index}: {m.label}</p>
        <p>{m.intro}</p>
        {phase !== 'applying' && <p className="result">{m.result}</p>}
        {m.intermediate && phase !== 'applying' && (
          <p className="muted">
            Both sides at once: <span className="plain-eq">{m.intermediate}</span>
          </p>
        )}
        <p className="muted">{m.why}</p>
        {shortcut && m.shortcut && <p className="shortcut" data-testid="shortcut">{m.shortcut}</p>}
      </div>
    );
  } else {
    content = (
      <p className="tip" data-testid="tip">
        <strong>How to move:</strong> drag a term across the equals sign, or tap it and choose an operation. Whatever you do happens to <em>both</em> sides, so the equation stays balanced.
      </p>
    );
  }

  if (canvas && !content && !(feedback && feedback.kind === 'error')) return null;
  return (
    <div className="guide" aria-live="off" data-testid="guide">
      {feedback && feedback.kind === 'error' && (
        <p className="error-msg" role="alert" data-testid="error-msg">
          {feedback.text}
        </p>
      )}
      {content}
    </div>
  );
}

function SelectionPanel({ rules, eq, selection, previewCommand, onCommit, onPreview, onDeselect }: { rules: MoveRules; eq: Equation; selection: Selection; previewCommand: Command | null; onCommit: (c: Command) => void; onPreview: (c: Command | null) => void; onDeselect: () => void }) {
  const terms = sideTerms(eq, selection.side);
  const term = terms[selection.index];
  if (!term) return null;

  const options: Command[] = [commandForSelection(selection)];
  if (selection.kind === 'term' && term.core.kind === 'group') {
    // For parentheses the useful move is distributing; subtracting the whole group comes second.
    options.unshift({ type: 'distribute', side: selection.side, index: selection.index });
  }
  if (selection.kind === 'factor' && term.core.kind === 'var') {
    // Keyboard and tap route for moving the whole term (for example 5x) instead of dividing.
    options.push({ type: 'addsub', side: selection.side, index: selection.index });
  }
  if (selection.kind === 'term') {
    if (term.core.kind !== 'group' && terms.filter((t) => t.core.kind === term.core.kind).length >= 2) {
      options.push({ type: 'combine', side: selection.side, kind: term.core.kind as 'const' | 'var' });
    }
  }
  const title =
    selection.kind === 'term'
      ? `You picked ${formatSignedTerm(term, eq)} on the ${selection.side} side.`
      : `You picked the number attached to ${eq.variable} on the ${selection.side} side.`;
  const preview = previewCommand ? applyCommand(eq, previewCommand, rules) : null;

  return (
    <div className="selection-panel" data-testid="selection-panel">
      <p className="sel-title" aria-label={spoken(title)}>{title}</p>
      <p className="muted">Choose what to do:</p>
      <div className="btn-row">
        {options.map((cmd, i) => {
          const r = applyCommand(eq, cmd, rules);
          return (
            <button
              key={i}
              type="button"
              className={`btn ${i === 0 ? 'primary' : ''}`}
              disabled={!r.ok}
              onClick={() => onCommit(cmd)}
              onMouseEnter={() => onPreview(cmd)}
              onMouseLeave={() => onPreview(null)}
              onFocus={() => onPreview(cmd)}
              onBlur={() => onPreview(null)}
              data-testid={`op-${cmd.type}`}
            >
              {r.ok ? r.move.label : 'Not available'}
            </button>
          );
        })}
        <button type="button" className="btn ghost" onClick={onDeselect}>
          Cancel
        </button>
      </div>
      {options.map((cmd, i) => {
        const r = applyCommand(eq, cmd, rules);
        return !r.ok && i === 0 ? (
          <p key={i} className="error-msg" role="alert">
            {r.error.message}
          </p>
        ) : null;
      })}
      {preview && preview.ok && <p className="preview" data-testid="preview">{preview.move.intro}</p>}
    </div>
  );
}
