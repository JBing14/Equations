import { LESSONS } from '../data/lessons';
import { useStore } from '../storage/StoreContext';
import { isLessonUnlocked } from '../storage/store';
import { LEVEL_NAMES } from './lessons/Lessons';
import type { View } from '../App';

export function Home({ go, onResume }: { go: (v: View) => void; onResume: () => void }) {
  const { data, persistent } = useStore();
  const ids = LESSONS.map((l) => l.id);
  const completed = LESSONS.filter((l) => data.progress.lessons[l.id]?.completed).length;
  const nextIdx = LESSONS.findIndex((l, i) => !data.progress.lessons[l.id]?.completed && isLessonUnlocked(data, ids, i));
  const totals = Object.values(data.progress.practice).reduce((a, s) => ({ attempted: a.attempted + s.attempted, correct: a.correct + s.correct }), { attempted: 0, correct: 0 });
  const last = data.last;

  return (
    <div className="page home">
      <section className="hero card">
        <div>
          <h1>Equation Explorer</h1>
          <p className="lead">Solve equations by moving terms across the equals sign, and see <em>why</em> every step keeps the equation balanced.</p>
          <div className="btn-row">
            <button type="button" className="btn primary big" onClick={() => go('lessons')} data-testid="start-learning">
              {completed === 0 ? 'Start Learning' : 'Keep Learning'}
            </button>
            {last && (
              <button type="button" className="btn big" onClick={onResume} data-testid="resume">
                ↻ Resume: {last.label.replace(/-/g, '−')}
              </button>
            )}
          </div>
        </div>
        <ol className="how" aria-label="How it works">
          <li><span className="how-n">1</span> Pick a term, or drag it across the equals sign.</li>
          <li><span className="how-n">2</span> The <strong>opposite</strong> operation is applied to <strong>both</strong> sides.</li>
          <li><span className="how-n">3</span> Watch terms cancel, then see the simpler equation in Your Moves.</li>
        </ol>
      </section>

      <section className="card progress-card" aria-labelledby="progress-title">
        <h2 id="progress-title">Your progress</h2>
        <ol className="dots big-dots" aria-label={`${completed} of ${LESSONS.length} lessons completed`}>
          {LESSONS.map((l, i) => (
            <li key={l.id} className={data.progress.lessons[l.id]?.completed ? 'done' : i === nextIdx ? 'now' : ''} title={l.title} aria-label={`${l.title}${data.progress.lessons[l.id]?.completed ? ', completed' : i === nextIdx ? ', up next' : ''}`}>
              {data.progress.lessons[l.id]?.completed ? '✓' : i + 1}
            </li>
          ))}
        </ol>
        <p>
          {completed === LESSONS.length
            ? 'You finished every lesson. Try Independent Practice at Level 4!'
            : nextIdx >= 0
              ? `Up next: ${LESSONS[nextIdx].title} (Level ${LESSONS[nextIdx].level}: ${LEVEL_NAMES[LESSONS[nextIdx].level]}).`
              : 'Start with the first lesson.'}
        </p>
        {totals.attempted > 0 && <p className="muted">Practice: {totals.correct} of {totals.attempted} right on the first try.</p>}
        <p className="muted">{persistent ? 'Your progress is saved in this browser and may not follow you to another device.' : 'This browser is not saving progress right now (a private window can cause this).'}</p>
      </section>

      <section className="tiles" aria-label="Sections">
        <button type="button" className="card tile" onClick={() => go('lessons')}>
          <span className="tile-icon" aria-hidden="true">📘</span>
          <h2>Guided Lessons</h2>
          <p>Eight short lessons with a worked example, hints and practice. {completed} of {LESSONS.length} done.</p>
        </button>
        <button type="button" className="card tile" onClick={() => go('practice')}>
          <span className="tile-icon" aria-hidden="true">🎯</span>
          <h2>Independent Practice</h2>
          <p>New problems at four difficulty levels, with hints and worked solutions.</p>
        </button>
        <button type="button" className="card tile" onClick={() => go('custom')}>
          <span className="tile-icon" aria-hidden="true">✏️</span>
          <h2>Custom Equation</h2>
          <p>Type your own equation, like 3x + 5 = x + 13, and solve it step by step.</p>
        </button>
        <button type="button" className="card tile" onClick={() => go('teacher')}>
          <span className="tile-icon" aria-hidden="true">🍎</span>
          <h2>Teacher Tools</h2>
          <p>Build assignments, preview them, export, import, and print with an answer key.</p>
        </button>
      </section>
    </div>
  );
}
