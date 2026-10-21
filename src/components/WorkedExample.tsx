import { useMemo, useState } from 'react';
import { parseEquation } from '../engine/parser';
import { solveSteps } from '../engine/strategy';
import { useStore } from '../storage/StoreContext';
import { finishMessage } from '../engine/explain';
import { EquationRow, StepGrid } from './equation/Steps';

/** A read-only walk through an example, one step at a time, produced by the real engine. */
export function WorkedExample({ equation, title = 'Worked example' }: { equation: string; title?: string }) {
  const parsed = useMemo(() => parseEquation(equation), [equation]);
  const { allowDivideFirst, forceDistributeFirst } = useStore().data.prefs;
  const steps = useMemo(
    () => (parsed.ok ? solveSteps(parsed.equation, undefined, { allowDivideFirst, forceDistributeFirst }) : []),
    [parsed, allowDivideFirst, forceDistributeFirst],
  );
  const [shown, setShown] = useState(0);
  if (!parsed.ok) return null;
  const last = steps.length > 0 ? steps[steps.length - 1].after : parsed.equation;
  const done = shown >= steps.length;

  return (
    <section className="card worked" aria-label={title} data-testid="worked-example">
      <h3>{title}</h3>
      <p className="muted">Solve this equation by watching each step. Notice that every step happens to both sides.</p>
      <EquationRow eq={parsed.equation} divider={shown > 0} className="mini" />
      <ol className="solution-steps">
        {steps.slice(0, shown).map((m, i) => (
          <li key={i}>
            <h4>
              Step {i + 1}: {m.label}
            </h4>
            <StepGrid move={m} phase="all" className="mini" />
            <p>{m.intro}</p>
            <p className="muted">{m.result}</p>
          </li>
        ))}
      </ol>
      {done && shown > 0 && <p className="finish ok">{finishMessage(last)}</p>}
      <div className="btn-row">
        <button type="button" className="btn primary" onClick={() => setShown((n) => Math.min(steps.length, n + 1))} disabled={done}>
          {shown === 0 ? 'Show the first step' : 'Show the next step'}
        </button>
        <button type="button" className="btn" onClick={() => setShown(steps.length)} disabled={done}>
          Show all steps
        </button>
        <button type="button" className="btn ghost" onClick={() => setShown(0)} disabled={shown === 0}>
          Start over
        </button>
      </div>
    </section>
  );
}
