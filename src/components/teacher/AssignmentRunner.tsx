import { useMemo, useRef, useState } from 'react';
import { parseEquationOrThrow } from '../../engine/parser';
import type { Command } from '../../engine/moves';
import type { Assignment, LastActivity } from '../../storage/store';
import { Workspace } from '../Workspace';
import { useRememberActivity } from '../useActivity';

/** Runs an assignment as a student would see it. */
export function AssignmentRunner({ assignment, resume, preview, onClose }: { assignment: Assignment; resume: LastActivity | null; preview: boolean; onClose: () => void }) {
  const remember = useRememberActivity();
  const count = Math.min(assignment.target, assignment.equations.length);
  const [index, setIndex] = useState(resume ? Math.min(resume.problemIndex, count - 1) : 0);
  const [attempt, setAttempt] = useState(0);
  const [results, setResults] = useState<boolean[]>(() => Array.from({ length: count }, () => false));
  const [done, setDone] = useState<boolean[]>(() => Array.from({ length: count }, () => false));
  const [finished, setFinished] = useState(false);
  const initialCommands = useRef<Command[]>(resume?.commands ?? []);
  const equation = useMemo(() => parseEquationOrThrow(assignment.equations[index]), [assignment, index]);
  const mark = (arr: boolean[], i: number): boolean[] => arr.map((v, k) => (k === i ? true : v));
  const score = results.filter(Boolean).length;

  if (finished) {
    return (
      <div className="page">
        <div className="card summary pass" data-testid="assignment-summary">
          <h1>{assignment.title}: finished</h1>
          <p className="big">You got {score} of {count} right on the first try.</p>
          {preview && <p className="muted">This was a preview, so nothing was saved.</p>}
        </div>
        <div className="btn-row">
          <button type="button" className="btn primary" onClick={onClose}>Back to Teacher Tools</button>
        </div>
      </div>
    );
  }

  return (
    <div className="page">
      <button type="button" className="btn ghost back" onClick={onClose}>← {preview ? 'Close preview' : 'Back to Teacher Tools'}</button>
      {preview && <p className="notice">Student preview. This is how the assignment looks to a student.</p>}
      <h1>{assignment.title}</h1>
      {assignment.instructions && <p className="lead">{assignment.instructions}</p>}
      <p className="progress-text">Question {index + 1} of {count}</p>
      <Workspace
        key={`${assignment.id}-${index}-${attempt}`}
        equation={equation}
        initialCommands={initialCommands.current}
        allowReveal
        onCommands={(c) => {
          if (!preview) remember({ kind: 'assignment', label: `${assignment.title}, question ${index + 1}`, ref: assignment.id, equation: assignment.equations[index], problemIndex: index, level: assignment.level }, c);
        }}
        onCheck={(o) => {
          if (o.attempt === 1) setResults((r) => r.map((v, k) => (k === index ? o.correct && !o.revealed : v)));
          if (o.correct) setDone((d) => mark(d, index));
        }}
        onReveal={() => setDone((d) => mark(d, index))}
      />
      <div className="btn-row nav-row">
        <button type="button" className="btn" disabled={index === 0} onClick={() => { initialCommands.current = []; setIndex(index - 1); setAttempt(0); }}>
          ← Previous
        </button>
        <button type="button" className="btn" onClick={() => { initialCommands.current = []; setAttempt((a) => a + 1); }}>
          ⟲ Retry
        </button>
        {index < count - 1 ? (
          <button type="button" className="btn primary" disabled={!done[index]} onClick={() => { initialCommands.current = []; setIndex(index + 1); setAttempt(0); }}>
            Next →
          </button>
        ) : (
          <button type="button" className="btn primary" disabled={!done[index]} onClick={() => setFinished(true)}>
            Finish →
          </button>
        )}
      </div>
    </div>
  );
}
