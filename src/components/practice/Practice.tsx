import { useMemo, useRef, useState } from 'react';
import type { Level } from '../../engine/generator';
import { generateProblem } from '../../engine/generator';
import { parseEquationOrThrow } from '../../engine/parser';
import type { Command } from '../../engine/moves';
import { useStore } from '../../storage/StoreContext';
import type { LastActivity } from '../../storage/store';
import { Workspace } from '../Workspace';
import { useRememberActivity } from '../useActivity';
import { LEVEL_NAMES } from '../lessons/Lessons';

const randomSeed = (): string => Math.random().toString(36).slice(2, 6).toUpperCase();
const pct = (a: number, b: number): number => (b === 0 ? 0 : Math.round((a / b) * 100));

export function Practice({ resume }: { resume: LastActivity | null }) {
  const { data, update } = useStore();
  const remember = useRememberActivity();
  const r = resume?.kind === 'practice' ? resume : null;
  const [level, setLevel] = useState<Level>(r ? r.level : data.progress.currentLevel);
  const [seed, setSeed] = useState<string>(r && r.seed ? r.seed : randomSeed());
  const [seedDraft, setSeedDraft] = useState<string>(r && r.seed ? r.seed : seed);
  const [index, setIndex] = useState<number>(r ? r.problemIndex : 0);
  const [attempt, setAttempt] = useState(0);
  const [session, setSession] = useState<{ text: string; correct: boolean }[]>([]);
  const counted = useRef(new Set<string>());
  const initialCommands = useRef<Command[]>(r ? r.commands : []);

  const text = useMemo(() => generateProblem(level, seed, index), [level, seed, index]);
  const equation = useMemo(() => parseEquationOrThrow(text), [text]);
  const key = `${level}|${seed}|${index}`;

  const chooseLevel = (l: Level): void => {
    initialCommands.current = [];
    setLevel(l);
    setIndex(0);
    setAttempt(0);
    update((d) => ({ ...d, progress: { ...d.progress, currentLevel: l } }));
  };
  const applySeed = (value: string): void => {
    const next = value.trim().slice(0, 20) || randomSeed();
    initialCommands.current = [];
    setSeed(next);
    setSeedDraft(next);
    setIndex(0);
    setAttempt(0);
  };

  const sessionCorrect = session.filter((s) => s.correct).length;
  const stats = data.progress.practice[String(level) as '1' | '2' | '3' | '4'];

  return (
    <div className="page">
      <h1>Independent Practice</h1>
      <p className="lead">Pick a level and solve a new equation. Every level is open: practice is your Explore mode.</p>

      <div className="card practice-setup">
        <fieldset className="seg wide">
          <legend>Difficulty</legend>
          {([1, 2, 3, 4] as const).map((l) => (
            <label key={l} className={level === l ? 'on' : ''}>
              <input type="radio" name="level" checked={level === l} onChange={() => chooseLevel(l)} />
              Level {l}: {LEVEL_NAMES[l]}
            </label>
          ))}
        </fieldset>
        <form
          className="seed-row"
          onSubmit={(e) => {
            e.preventDefault();
            applySeed(seedDraft);
          }}
        >
          <label htmlFor="seed-input">Problem set code</label>
          <input id="seed-input" className="text-input short" value={seedDraft} onChange={(e) => setSeedDraft(e.target.value)} maxLength={20} aria-describedby="seed-help" />
          <button type="submit" className="btn">Use this code</button>
          <button type="button" className="btn ghost" onClick={() => applySeed('')}>Shuffle</button>
          <p id="seed-help" className="muted">The same code gives the same problems in the same order, so a whole class can practice the same set.</p>
        </form>
      </div>

      <p className="progress-text" data-testid="problem-count">Problem {index + 1} · Level {level}</p>
      <Workspace
        key={`${key}-${attempt}`}
        equation={equation}
        initialCommands={initialCommands.current}
        allowReveal
        onCommands={(c) => remember({ kind: 'practice', label: `Level ${level} practice, problem ${index + 1}`, equation: text, problemIndex: index, level, seed }, c)}
        onCheck={(o) => {
          if (counted.current.has(key)) return;
          counted.current.add(key);
          const correct = o.correct && !o.revealed;
          setSession((s) => [...s, { text, correct }]);
          update((d) => {
            const k = String(level) as '1' | '2' | '3' | '4';
            const prev = d.progress.practice[k];
            return { ...d, progress: { ...d.progress, practice: { ...d.progress.practice, [k]: { attempted: prev.attempted + 1, correct: prev.correct + (correct ? 1 : 0) } } } };
          });
        }}
        onReveal={() => {
          if (counted.current.has(key)) return;
          counted.current.add(key);
          setSession((s) => [...s, { text, correct: false }]);
          update((d) => {
            const k = String(level) as '1' | '2' | '3' | '4';
            const prev = d.progress.practice[k];
            return { ...d, progress: { ...d.progress, practice: { ...d.progress.practice, [k]: { attempted: prev.attempted + 1, correct: prev.correct } } } };
          });
        }}
      />
      <div className="btn-row nav-row">
        <button type="button" className="btn" onClick={() => { initialCommands.current = []; setAttempt((a) => a + 1); }}>
          ⟲ Retry this problem
        </button>
        <button type="button" className="btn primary" onClick={() => { initialCommands.current = []; setIndex((i) => i + 1); setAttempt(0); }} data-testid="new-problem">
          New problem →
        </button>
      </div>

      <section className="card tally" aria-labelledby="tally-title">
        <h2 id="tally-title">Your practice summary</h2>
        <p data-testid="session-summary">
          This visit: <strong>{session.length}</strong> {session.length === 1 ? 'problem' : 'problems'} finished, <strong>{sessionCorrect}</strong> right on the first try
          {session.length > 0 ? ` (${pct(sessionCorrect, session.length)}%)` : ''}.
        </p>
        <p>
          All time at Level {level}: {stats.correct} of {stats.attempted} right on the first try{stats.attempted > 0 ? ` (${pct(stats.correct, stats.attempted)}%)` : ''}.
        </p>
        <div className="meter" role="img" aria-label={`${pct(stats.correct, stats.attempted)} percent correct at level ${level}`}>
          <span style={{ width: `${pct(stats.correct, stats.attempted)}%` }} />
        </div>
        {session.length > 0 && (
          <ul className="session-list">
            {session.map((s, i) => (
              <li key={i} className={s.correct ? 'ok' : 'no'}>
                <span aria-hidden="true">{s.correct ? '✔' : '✖'}</span> <span className="sr-only">{s.correct ? 'Right: ' : 'Not right on the first try: '}</span>
                {s.text.replace(/-/g, '−')}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
