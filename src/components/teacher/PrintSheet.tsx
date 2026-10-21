import { parseEquation } from '../../engine/parser';
import { formatEquation } from '../../engine/format';
import { answerFor } from '../../engine/explain';
import type { Assignment } from '../../storage/store';

/** A clean printable worksheet, with an optional answer key on its own page. */
export function PrintSheet({ assignment, includeKey }: { assignment: Assignment; includeKey: boolean }) {
  const rows = assignment.equations.slice(0, assignment.target).map((text) => {
    const p = parseEquation(text);
    return p.ok ? { text: formatEquation(p.equation), answer: answerFor(p.equation) } : { text, answer: '' };
  });
  return (
    <div className="print-sheet" data-testid="print-sheet">
      <section className="print-page">
        <h1>{assignment.title}</h1>
        <p className="print-meta">Name: ______________________ &nbsp;&nbsp; Date: ______________</p>
        {assignment.instructions && <p className="print-instructions">{assignment.instructions}</p>}
        <ol className="print-problems">
          {rows.map((r, i) => (
            <li key={i}>
              <span className="print-eq">{r.text}</span>
              <span className="print-work" aria-hidden="true" />
            </li>
          ))}
        </ol>
      </section>
      {includeKey && (
        <section className="print-page print-key" data-testid="answer-key">
          <h1>{assignment.title}: answer key</h1>
          <ol className="print-answers">
            {rows.map((r, i) => (
              <li key={i}>
                <span className="print-eq">{r.text}</span> <span className="print-ans">→ {r.answer}</span>
              </li>
            ))}
          </ol>
        </section>
      )}
    </div>
  );
}
