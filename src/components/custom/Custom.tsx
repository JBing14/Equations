import { useMemo, useRef, useState } from 'react';
import { parseEquation, parseEquationOrThrow } from '../../engine/parser';
import type { Command } from '../../engine/moves';
import { useStore } from '../../storage/StoreContext';
import { MAX_SAVED_EQUATIONS } from '../../storage/store';
import type { LastActivity } from '../../storage/store';
import { Workspace } from '../Workspace';
import { useRememberActivity } from '../useActivity';

const EXAMPLES = ['x + 5 = 12', '3x - 4 = 11', '2(x + 3) = 14', '3x + 5 = x + 13', 'x/2 + 3 = 7'];

export function Custom({ resume }: { resume: LastActivity | null }) {
  const { data, update } = useStore();
  const remember = useRememberActivity();
  const r = resume?.kind === 'custom' ? resume : null;
  const [text, setText] = useState(r ? r.equation : '');
  const [active, setActive] = useState<string | null>(r ? r.equation : null);
  const [error, setError] = useState<string | null>(null);
  const [runId, setRunId] = useState(0);
  const initialCommands = useRef<Command[]>(r ? r.commands : []);

  const equation = useMemo(() => (active ? parseEquationOrThrow(active) : null), [active]);

  const start = (value: string): void => {
    const parsed = parseEquation(value);
    if (!parsed.ok) {
      setError(parsed.message);
      return;
    }
    setError(null);
    initialCommands.current = [];
    setText(value.trim());
    setActive(value.trim());
    setRunId((n) => n + 1);
  };

  const saved = data.savedEquations;
  const isSaved = active !== null && saved.includes(active);

  return (
    <div className="page">
      <h1>Custom Equation</h1>
      <p className="lead">Type your own equation with one unknown letter. It opens in the same workspace as the lessons.</p>

      <form
        className="card custom-form"
        onSubmit={(e) => {
          e.preventDefault();
          start(text);
        }}
      >
        <label htmlFor="eq-input">Your equation</label>
        <div className="check-row">
          <input
            id="eq-input"
            className="text-input"
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="for example: 3x + 5 = 20"
            autoComplete="off"
            spellCheck={false}
            maxLength={120}
            aria-invalid={error ? 'true' : 'false'}
            aria-describedby={error ? 'eq-error eq-help' : 'eq-help'}
          />
          <button type="submit" className="btn primary" data-testid="start-custom">
            Start solving
          </button>
        </div>
        <p id="eq-help" className="muted">
          You can use numbers, one letter, + − × ÷ and parentheses. Fractions like 1/2 and decimals like 0.5 work too. Equation Explorer solves equations where the letter is not squared.
        </p>
        {error && (
          <p id="eq-error" className="error-msg" role="alert" data-testid="custom-error">
            {error}
          </p>
        )}
        <div className="examples">
          <span className="muted">Try an example:</span>
          {EXAMPLES.map((ex) => (
            <button key={ex} type="button" className="btn chip-btn" onClick={() => start(ex)}>
              {ex.replace(/-/g, '−')}
            </button>
          ))}
        </div>
      </form>

      {saved.length > 0 && (
        <section className="card" aria-labelledby="saved-title">
          <h2 id="saved-title">Saved equations</h2>
          <ul className="saved-list">
            {saved.map((s) => (
              <li key={s}>
                <button type="button" className="btn chip-btn" onClick={() => start(s)}>
                  {s.replace(/-/g, '−')}
                </button>
                <button type="button" className="btn ghost" onClick={() => update((d) => ({ ...d, savedEquations: d.savedEquations.filter((e) => e !== s) }))} aria-label={`Remove saved equation ${s}`}>
                  Remove
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {equation && active && (
        <>
          <div className="btn-row">
            <button
              type="button"
              className="btn"
              disabled={isSaved || saved.length >= MAX_SAVED_EQUATIONS}
              onClick={() => update((d) => ({ ...d, savedEquations: [...d.savedEquations, active].slice(0, MAX_SAVED_EQUATIONS) }))}
            >
              {isSaved ? '✔ Saved' : 'Save this equation'}
            </button>
          </div>
          <Workspace
            key={`${active}-${runId}`}
            equation={equation}
            initialCommands={initialCommands.current}
            allowReveal
            onCommands={(c) => remember({ kind: 'custom', label: `Custom equation ${active.replace(/-/g, '−')}`, equation: active }, c)}
          />
        </>
      )}
    </div>
  );
}
