import { useMemo, useRef, useState } from 'react';
import { parseEquation, parseEquationOrThrow } from '../../engine/parser';
import type { Command } from '../../engine/moves';
import type { LastActivity } from '../../storage/store';
import { Workspace } from '../Workspace';
import { useRememberActivity } from '../useActivity';

export function Custom({ resume }: { resume: LastActivity | null }) {
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

  return (
    <div className="page canvas-page">
      <form
        className="canvas-form"
        onSubmit={(e) => {
          e.preventDefault();
          start(text);
        }}
      >
        <label htmlFor="eq-input" className="sr-only">Your equation</label>
        <input
          id="eq-input"
          className="text-input"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Type an equation, for example 3x + 5 = 20"
          autoComplete="off"
          spellCheck={false}
          maxLength={120}
          aria-invalid={error ? 'true' : 'false'}
          aria-describedby={error ? 'eq-error' : undefined}
        />
        <button type="submit" className="btn primary" data-testid="start-custom">
          Start
        </button>
      </form>
      {error && (
        <p id="eq-error" className="error-msg" role="alert" data-testid="custom-error">
          {error}
        </p>
      )}

      {equation && active && (
        <Workspace
          key={`${active}-${runId}`}
          equation={equation}
          initialCommands={initialCommands.current}
          canvas
          onCommands={(c) => remember({ kind: 'custom', label: `Custom equation ${active.replace(/-/g, '−')}`, equation: active }, c)}
        />
      )}
    </div>
  );
}
