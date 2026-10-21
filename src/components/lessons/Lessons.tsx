import { useMemo, useRef, useState } from 'react';
import { LESSONS, lessonById } from '../../data/lessons';
import type { Lesson } from '../../data/lessons';
import { parseEquationOrThrow } from '../../engine/parser';
import type { Command } from '../../engine/moves';
import { useStore } from '../../storage/StoreContext';
import { isLessonUnlocked, meetsMastery } from '../../storage/store';
import type { LastActivity } from '../../storage/store';
import { Workspace } from '../Workspace';
import { WorkedExample } from '../WorkedExample';
import { useRememberActivity } from '../useActivity';

export const LEVEL_NAMES = { 1: 'One-step', 2: 'Two-step', 3: 'Multistep', 4: 'Challenge' } as const;

export function Lessons({ resume }: { resume: LastActivity | null }) {
  const { data } = useStore();
  const resumeLesson = resume?.kind === 'lesson' ? lessonById(resume.ref) : undefined;
  const [openId, setOpenId] = useState<string | null>(resumeLesson?.id ?? null);
  const [resumeInfo, setResumeInfo] = useState<LastActivity | null>(resumeLesson ? resume : null);
  const lessonIds = LESSONS.map((l) => l.id);

  const open = openId ? lessonById(openId) : undefined;
  if (open) {
    const idx = LESSONS.findIndex((l) => l.id === open.id);
    const next = LESSONS[idx + 1];
    return (
      <LessonRunner
        key={open.id}
        lesson={open}
        resume={resumeInfo}
        nextLesson={next}
        onExit={() => {
          setOpenId(null);
          setResumeInfo(null);
        }}
        onNext={(l) => {
          setResumeInfo(null);
          setOpenId(l.id);
        }}
      />
    );
  }

  return (
    <div className="page">
      <h1>Guided Lessons</h1>
      <p className="lead">Work through the lessons in order. Each one explains an idea, shows a worked example, and then lets you practice. Get {Math.round((data.prefs.masteryPercent / 100) * 5)} of 5 right on the first try to unlock the next lesson.</p>
      {data.prefs.explore && <p className="notice">Explore mode is on, so every lesson is unlocked.</p>}
      <ol className="lesson-list">
        {LESSONS.map((lesson, i) => {
          const unlocked = isLessonUnlocked(data, lessonIds, i);
          const prog = data.progress.lessons[lesson.id];
          return (
            <li key={lesson.id} className={`card lesson-card${unlocked ? '' : ' locked'}${prog?.completed ? ' done' : ''}`}>
              <div className="lesson-num" aria-hidden="true">{prog?.completed ? '✓' : i + 1}</div>
              <div className="lesson-body">
                <h2>{lesson.title}</h2>
                <p className="muted">
                  Level {lesson.level} · {LEVEL_NAMES[lesson.level]}
                </p>
                <p>{lesson.objective}</p>
                <p className="status-line">
                  {prog?.completed
                    ? `Completed. Best score: ${prog.bestCorrect} of 5.`
                    : unlocked
                      ? prog
                        ? `Not yet mastered. Best score: ${prog.bestCorrect} of 5.`
                        : 'Ready to start.'
                      : `Locked. Finish “${LESSONS[i - 1].title}” first, or turn on Explore mode in Settings.`}
                </p>
              </div>
              <button type="button" className="btn primary" disabled={!unlocked} onClick={() => setOpenId(lesson.id)}>
                {prog?.completed ? 'Review' : 'Start'}
                <span className="sr-only"> {lesson.title}</span>
              </button>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

type Stage = 'learn' | 'practice' | 'summary';

function LessonRunner({ lesson, resume, nextLesson, onExit, onNext }: { lesson: Lesson; resume: LastActivity | null; nextLesson?: Lesson; onExit: () => void; onNext: (l: Lesson) => void }) {
  const { data, update } = useStore();
  const remember = useRememberActivity();
  const total = lesson.problems.length;
  const [stage, setStage] = useState<Stage>(resume ? 'practice' : 'learn');
  const [index, setIndex] = useState(resume ? Math.min(resume.problemIndex, total - 1) : 0);
  const [results, setResults] = useState<boolean[]>(() => lesson.problems.map(() => false));
  const [done, setDone] = useState<boolean[]>(() => lesson.problems.map(() => false));
  const [attempt, setAttempt] = useState(0);
  const startedMidway = useRef(resume !== null && resume.problemIndex > 0);
  const recorded = useRef(false);
  const initialCommands = useRef<Command[]>(resume?.commands ?? []);

  const equation = useMemo(() => parseEquationOrThrow(lesson.problems[index]), [lesson, index]);
  const score = results.filter(Boolean).length;
  const pass = meetsMastery(score, total, data.prefs.masteryPercent);

  const mark = (arr: boolean[], i: number): boolean[] => arr.map((v, k) => (k === i ? true : v));

  const finish = (): void => {
    setStage('summary');
    if (recorded.current || startedMidway.current) return;
    recorded.current = true;
    update((d) => {
      const prev = d.progress.lessons[lesson.id] ?? { completed: false, bestCorrect: 0, attempts: 0 };
      return {
        ...d,
        progress: {
          ...d.progress,
          lessons: {
            ...d.progress.lessons,
            [lesson.id]: {
              completed: prev.completed || meetsMastery(score, total, d.prefs.masteryPercent),
              bestCorrect: Math.max(prev.bestCorrect, score),
              attempts: prev.attempts + 1,
            },
          },
        },
      };
    });
  };

  const goto = (i: number): void => {
    initialCommands.current = [];
    setIndex(i);
    setAttempt(0);
  };

  if (stage === 'learn') {
    return (
      <div className="page">
        <button type="button" className="btn ghost back" onClick={onExit}>← All lessons</button>
        <h1>{lesson.title}</h1>
        <div className="card lesson-intro">
          <p className="objective"><strong>Goal:</strong> {lesson.objective}</p>
          <p>{lesson.intro}</p>
          <p>{lesson.explanation}</p>
        </div>
        <WorkedExample equation={lesson.workedExample} />
        <div className="btn-row">
          <button type="button" className="btn primary" onClick={() => setStage('practice')}>
            Start practice →
          </button>
        </div>
      </div>
    );
  }

  if (stage === 'summary') {
    const midway = startedMidway.current;
    return (
      <div className="page">
        <h1>{lesson.title}: summary</h1>
        <div className={`card summary ${pass && !midway ? 'pass' : ''}`} data-testid="lesson-summary">
          <p className="big">You got {score} of {total} right on the first try.</p>
          {midway ? (
            <p>You picked this lesson up partway through, so this run doesn’t count toward unlocking. Start the lesson again from the beginning to earn mastery.</p>
          ) : pass ? (
            <p>Great work! You met the mastery goal ({data.prefs.masteryPercent}% on the first try).{nextLesson ? ' The next lesson is unlocked.' : ' You finished every lesson!'}</p>
          ) : (
            <p>You need {Math.ceil((data.prefs.masteryPercent / 100) * total)} of {total} on the first try to unlock the next lesson. Review the example and try again; you can do it.</p>
          )}
          <h2>What you learned</h2>
          <p>{lesson.summary}</p>
        </div>
        <div className="btn-row">
          {pass && !midway && nextLesson && (
            <button type="button" className="btn primary" onClick={() => onNext(nextLesson)}>
              Next lesson: {nextLesson.title} →
            </button>
          )}
          <button
            type="button"
            className="btn"
            onClick={() => {
              recorded.current = false;
              startedMidway.current = false;
              setResults(lesson.problems.map(() => false));
              setDone(lesson.problems.map(() => false));
              goto(0);
              setStage('practice');
            }}
          >
            Try the practice again
          </button>
          <button type="button" className="btn" onClick={() => setStage('learn')}>
            Review the lesson
          </button>
          <button type="button" className="btn ghost" onClick={onExit}>
            All lessons
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="page">
      <button type="button" className="btn ghost back" onClick={onExit}>← All lessons</button>
      <h1>{lesson.title}</h1>
      <div className="progress-line" role="group" aria-label={`Question ${index + 1} of ${total}`}>
        <span className="progress-text">Question {index + 1} of {total}</span>
        <ol className="dots">
          {lesson.problems.map((_, i) => (
            <li key={i} className={`${i === index ? 'now' : ''}${done[i] ? ' done' : ''}`} aria-label={`Question ${i + 1}${done[i] ? ', finished' : i === index ? ', current' : ''}`} />
          ))}
        </ol>
      </div>
      <p className="objective"><strong>Goal:</strong> {lesson.objective}</p>
      <Workspace
        key={`${lesson.id}-${index}-${attempt}`}
        equation={equation}
        initialCommands={initialCommands.current}
        allowReveal
        onCommands={(c) => remember({ kind: 'lesson', label: `${lesson.title}, question ${index + 1}`, ref: lesson.id, equation: lesson.problems[index], problemIndex: index, level: lesson.level }, c)}
        onCheck={(o) => {
          if (o.attempt === 1) setResults((r) => r.map((v, k) => (k === index ? o.correct && !o.revealed : v)));
          if (o.correct) setDone((d) => mark(d, index));
        }}
        onReveal={() => setDone((d) => mark(d, index))}
      />
      <div className="btn-row nav-row">
        <button type="button" className="btn" onClick={() => (index === 0 ? setStage('learn') : goto(index - 1))}>
          ← {index === 0 ? 'Back to the lesson' : 'Previous question'}
        </button>
        <button type="button" className="btn" onClick={() => { initialCommands.current = []; setAttempt((a) => a + 1); }}>
          ⟲ Retry this question
        </button>
        {index < total - 1 ? (
          <button type="button" className="btn primary" disabled={!done[index]} onClick={() => goto(index + 1)} data-testid="next-question">
            Next question →
          </button>
        ) : (
          <button type="button" className="btn primary" disabled={!done[index]} onClick={finish} data-testid="finish-lesson">
            Finish lesson →
          </button>
        )}
      </div>
      {!done[index] && <p className="muted">Solve the equation, then press Check answer to continue.</p>}
    </div>
  );
}
