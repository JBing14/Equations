import { useEffect, useRef } from 'react';
import type { Dispatch } from 'react';
import type { HistoryState } from '../../history/history';
import { speakEquation } from '../../engine/format';
import type { WorkspaceAction } from '../../state/workspace';
import { EquationRow, StepGrid } from './Steps';

/**
 * "Your Moves": the original equation, then one card per recorded move, in order.
 * Every card is generated from the engine's MoveData, never from animation labels.
 */
export function History({ history, dispatch }: { history: HistoryState; dispatch: Dispatch<WorkspaceAction> }) {
  const { moves, cursor, inspect, start } = history;
  const viewing = inspect !== null;
  const endRef = useRef<HTMLLIElement | null>(null);

  useEffect(() => {
    // Scroll only the strip of cards, never the page (scrollIntoView would jump the whole screen).
    const list = endRef.current?.parentElement;
    if (list) list.scrollLeft = list.scrollWidth;
  }, [moves.length]);

  return (
    <section className="history" aria-labelledby="history-title" data-testid="history">
      <div className="section-head">
        <h2 id="history-title">Your Moves</h2>
        <p className="muted">Every step you take is saved here, in order. Select a card to look back at that step.</p>
      </div>

      {viewing && (
        <div className="viewing-banner" role="status">
          <span>
            You are looking at {inspect === 0 ? 'the starting equation' : `move ${inspect}`}. This is a preview, so your current work has not changed.
          </span>
          <span className="btn-row">
            <button type="button" className="btn" onClick={() => dispatch({ type: 'stopInspecting' })}>
              Return to latest
            </button>
            <button type="button" className="btn secondary" onClick={() => dispatch({ type: 'jump', index: inspect })}>
              Continue from here
            </button>
          </span>
        </div>
      )}

      <ol className="moves" aria-label="Move history">
        <li className={`move-card start${inspect === 0 || (!viewing && cursor === 0) ? ' current' : ''}`} onClick={() => dispatch({ type: 'inspect', index: 0 })} data-testid="history-start">
          <button type="button" className="card-title" aria-current={(!viewing && cursor === 0) || inspect === 0 ? 'step' : undefined} aria-label={`Start: original equation. ${speakEquation(start)}`}>
            <span className="move-no">Start</span>
            <span className="move-label">Original equation</span>
          </button>
          <EquationRow eq={start} divider={moves.length > 0} className="mini" />
        </li>

        {moves.map((rec, i) => {
          const n = i + 1;
          const isCurrent = viewing ? inspect === n : cursor === n;
          const undone = n > cursor;
          return (
            <li
              key={rec.id}
              ref={n === moves.length ? endRef : undefined}
              className={`move-card${isCurrent ? ' current' : ''}${undone ? ' undone' : ''}`}
              onClick={() => dispatch({ type: 'inspect', index: n })}
              data-testid="history-move"
            >
              <button type="button" className="card-title" aria-current={isCurrent ? 'step' : undefined} aria-label={`Move ${n}: ${rec.data.label}. Result: ${speakEquation(rec.data.after)}${undone ? '. This move was undone.' : ''}`}>
                <span className="move-no">Move {n}</span>
                <span className="move-label">{rec.data.label}</span>
                {undone && <span className="badge">undone</span>}
              </button>
              <StepGrid move={rec.data} phase="all" className="mini" />
              <p className="move-why">{rec.data.why}</p>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
