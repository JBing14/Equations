import { useEffect, useRef, useState } from 'react';
import type { ChangeEvent } from 'react';
import type { Level } from '../../engine/generator';
import { familiesForLevel, generateSet } from '../../engine/generator';
import { parseEquation } from '../../engine/parser';
import { useStore } from '../../storage/StoreContext';
import {
  MAX_ASSIGNMENTS,
  MAX_ASSIGNMENT_PROBLEMS,
  checkAssignment,
  exportAssignment,
  parseAssignmentImport,
} from '../../storage/store';
import type { Assignment, LastActivity } from '../../storage/store';
import { LEVEL_NAMES } from '../lessons/Lessons';
import { AssignmentRunner } from './AssignmentRunner';
import { PrintSheet } from './PrintSheet';

const newId = (): string => `a${Date.now().toString(36)}${Math.floor(Math.random() * 1e6).toString(36)}`;
const randomSeed = (): string => Math.random().toString(36).slice(2, 6).toUpperCase();

const blankAssignment = (): Assignment => ({
  id: newId(),
  title: '',
  instructions: '',
  level: 1,
  families: [],
  seed: randomSeed(),
  equations: [],
  target: 5,
  updated: Date.now(),
});

function download(filename: string, text: string): void {
  const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

const fileName = (title: string): string => `${title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'assignment'}.json`;

export function Teacher({ resume }: { resume: LastActivity | null }) {
  const { data, update } = useStore();
  const [draft, setDraft] = useState<Assignment | null>(null);
  const [isNew, setIsNew] = useState(false);
  const [run, setRun] = useState<{ assignment: Assignment; preview: boolean; resume: LastActivity | null } | null>(() => {
    if (resume?.kind !== 'assignment') return null;
    const a = data.assignments.find((x) => x.id === resume.ref);
    return a ? { assignment: a, preview: false, resume } : null;
  });
  const [message, setMessage] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [printJob, setPrintJob] = useState<{ assignment: Assignment; includeKey: boolean } | null>(null);
  const [includeKey, setIncludeKey] = useState(true);
  const fileRef = useRef<HTMLInputElement | null>(null);

  // Print once the sheet is on the page, then remove it.
  useEffect(() => {
    if (!printJob) return;
    const onAfter = (): void => setPrintJob(null);
    window.addEventListener('afterprint', onAfter);
    const t = window.setTimeout(() => window.print(), 50);
    return () => {
      window.removeEventListener('afterprint', onAfter);
      window.clearTimeout(t);
    };
  }, [printJob]);

  if (run) {
    return <AssignmentRunner assignment={run.assignment} preview={run.preview} resume={run.resume} onClose={() => setRun(null)} />;
  }

  const save = (a: Assignment): void => {
    const check = checkAssignment({ ...a, updated: Date.now() });
    if (!check.ok) {
      setMessage({ kind: 'error', text: check.error });
      return;
    }
    if (isNew && data.assignments.length >= MAX_ASSIGNMENTS) {
      setMessage({ kind: 'error', text: `You can keep up to ${MAX_ASSIGNMENTS} assignments in this browser. Delete one first.` });
      return;
    }
    update((d) => ({
      ...d,
      assignments: d.assignments.some((x) => x.id === check.assignment.id)
        ? d.assignments.map((x) => (x.id === check.assignment.id ? check.assignment : x))
        : [...d.assignments, check.assignment],
    }));
    setDraft(null);
    setMessage({ kind: 'ok', text: `Saved “${check.assignment.title}” in this browser.` });
  };

  const onImport = async (e: ChangeEvent<HTMLInputElement>): Promise<void> => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (data.assignments.length >= MAX_ASSIGNMENTS) {
      setMessage({ kind: 'error', text: `You can keep up to ${MAX_ASSIGNMENTS} assignments in this browser. Delete one first.` });
      return;
    }
    const text = await file.text();
    const result = parseAssignmentImport(text);
    if (!result.ok) {
      setMessage({ kind: 'error', text: result.error });
      return;
    }
    update((d) => ({ ...d, assignments: [...d.assignments, result.assignment] }));
    setMessage({ kind: 'ok', text: `Imported “${result.assignment.title}” with ${result.assignment.equations.length} problems.` });
  };

  const duplicate = (a: Assignment): void => {
    if (data.assignments.length >= MAX_ASSIGNMENTS) {
      setMessage({ kind: 'error', text: `You can keep up to ${MAX_ASSIGNMENTS} assignments in this browser. Delete one first.` });
      return;
    }
    update((d) => ({ ...d, assignments: [...d.assignments, { ...a, id: newId(), title: `${a.title} (copy)`.slice(0, 80), updated: Date.now() }] }));
    setMessage({ kind: 'ok', text: `Duplicated “${a.title}”.` });
  };

  return (
    <div className="page">
      <h1>Teacher Tools</h1>
      <p className="notice" data-testid="local-note">
        Assignments are saved only in <strong>this browser on this device</strong>. They are not shared with other devices or students automatically. To share one, export it as a file and have the other person import it.
      </p>

      {message && (
        <p className={message.kind === 'ok' ? 'ok-msg' : 'error-msg'} role={message.kind === 'ok' ? 'status' : 'alert'} data-testid="teacher-message">
          {message.text}
        </p>
      )}

      {draft ? (
        <Editor
          draft={draft}
          setDraft={setDraft}
          onSave={() => save(draft)}
          onCancel={() => setDraft(null)}
          onPreview={() => {
            const check = checkAssignment(draft);
            if (!check.ok) setMessage({ kind: 'error', text: check.error });
            else {
              setMessage(null);
              setRun({ assignment: check.assignment, preview: true, resume: null });
            }
          }}
        />
      ) : (
        <>
          <div className="btn-row">
            <button type="button" className="btn primary" onClick={() => { setDraft(blankAssignment()); setIsNew(true); setMessage(null); }} data-testid="new-assignment">
              + New assignment
            </button>
            <button type="button" className="btn" onClick={() => fileRef.current?.click()}>
              Import assignment file
            </button>
            <input ref={fileRef} type="file" accept=".json,application/json" className="sr-only" onChange={onImport} aria-label="Import assignment file" data-testid="import-input" tabIndex={-1} />
          </div>

          <section aria-labelledby="my-assignments">
            <h2 id="my-assignments">Your assignments</h2>
            {data.assignments.length === 0 ? (
              <p className="muted">No assignments yet. Create one, or import a file.</p>
            ) : (
              <ul className="assignment-list">
                {data.assignments.map((a) => (
                  <li key={a.id} className="card assignment-card" data-testid="assignment-card">
                    <div>
                      <h3>{a.title}</h3>
                      <p className="muted">
                        {a.equations.length} problems · target {a.target} · Level {a.level} ({LEVEL_NAMES[a.level]})
                      </p>
                      {a.instructions && <p>{a.instructions}</p>}
                    </div>
                    <div className="btn-row">
                      <button type="button" className="btn primary" onClick={() => setRun({ assignment: a, preview: true, resume: null })}>Preview as student</button>
                      <button type="button" className="btn" onClick={() => { setDraft(a); setIsNew(false); setMessage(null); }}>Edit</button>
                      <button type="button" className="btn" onClick={() => duplicate(a)}>Duplicate</button>
                      <button type="button" className="btn" onClick={() => download(fileName(a.title), exportAssignment(a))}>Export file</button>
                      <button type="button" className="btn" onClick={() => setPrintJob({ assignment: a, includeKey })}>Print</button>
                      {confirmDelete === a.id ? (
                        <>
                          <button type="button" className="btn danger" onClick={() => { update((d) => ({ ...d, assignments: d.assignments.filter((x) => x.id !== a.id) })); setConfirmDelete(null); setMessage({ kind: 'ok', text: `Deleted “${a.title}”.` }); }}>
                            Yes, delete
                          </button>
                          <button type="button" className="btn ghost" onClick={() => setConfirmDelete(null)}>Keep it</button>
                        </>
                      ) : (
                        <button type="button" className="btn ghost" onClick={() => setConfirmDelete(a.id)}>Delete</button>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            )}
            <label className="check print-opt">
              <input type="checkbox" checked={includeKey} onChange={(e) => setIncludeKey(e.target.checked)} />
              Include an answer key page when printing
            </label>
          </section>
        </>
      )}

      {printJob && (
        <div className="print-only">
          <PrintSheet assignment={printJob.assignment} includeKey={printJob.includeKey} />
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------- editor

function Editor({ draft, setDraft, onSave, onCancel, onPreview }: { draft: Assignment; setDraft: (a: Assignment) => void; onSave: () => void; onCancel: () => void; onPreview: () => void }) {
  const [custom, setCustom] = useState('');
  const [customError, setCustomError] = useState<string | null>(null);
  const families = familiesForLevel(draft.level);
  const set = (patch: Partial<Assignment>): void => setDraft({ ...draft, ...patch });

  const generate = (): void => {
    const count = Math.min(Math.max(draft.target, 1), MAX_ASSIGNMENT_PROBLEMS);
    const eqs = generateSet(draft.level, draft.seed || randomSeed(), count, draft.families.filter((f) => families.some((x) => x.id === f)));
    set({ equations: eqs });
  };

  const addCustom = (): void => {
    const p = parseEquation(custom);
    if (!p.ok) {
      setCustomError(p.message);
      return;
    }
    if (draft.equations.length >= MAX_ASSIGNMENT_PROBLEMS) {
      setCustomError(`An assignment can have at most ${MAX_ASSIGNMENT_PROBLEMS} problems.`);
      return;
    }
    setCustomError(null);
    set({ equations: [...draft.equations, custom.trim()] });
    setCustom('');
  };

  return (
    <form
      className="card editor"
      onSubmit={(e) => {
        e.preventDefault();
        onSave();
      }}
      aria-label="Assignment editor"
    >
      <h2>{draft.title ? 'Edit assignment' : 'New assignment'}</h2>

      <div className="field">
        <label htmlFor="as-title">Title</label>
        <input id="as-title" className="text-input" value={draft.title} maxLength={80} onChange={(e) => set({ title: e.target.value })} data-testid="as-title" />
      </div>
      <div className="field">
        <label htmlFor="as-instr">Instructions for students</label>
        <textarea id="as-instr" className="text-input" rows={3} maxLength={600} value={draft.instructions} onChange={(e) => set({ instructions: e.target.value })} />
      </div>

      <div className="field-row">
        <div className="field">
          <label htmlFor="as-level">Difficulty</label>
          <select id="as-level" className="text-input" value={draft.level} onChange={(e) => set({ level: Number(e.target.value) as Level, families: [] })}>
            {([1, 2, 3, 4] as const).map((l) => (
              <option key={l} value={l}>Level {l}: {LEVEL_NAMES[l]}</option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="as-target">Number of questions</label>
          <input id="as-target" className="text-input short" type="number" min={1} max={MAX_ASSIGNMENT_PROBLEMS} value={draft.target} onChange={(e) => set({ target: Math.min(MAX_ASSIGNMENT_PROBLEMS, Math.max(1, Number(e.target.value) || 1)) })} data-testid="as-target" />
        </div>
        <div className="field">
          <label htmlFor="as-seed">Problem set code</label>
          <input id="as-seed" className="text-input short" value={draft.seed} maxLength={20} onChange={(e) => set({ seed: e.target.value })} />
        </div>
      </div>

      <fieldset className="field types">
        <legend>Problem types (leave all unchecked to mix them)</legend>
        {families.map((f) => (
          <label key={f.id} className="check">
            <input
              type="checkbox"
              checked={draft.families.includes(f.id)}
              onChange={(e) => set({ families: e.target.checked ? [...draft.families, f.id] : draft.families.filter((x) => x !== f.id) })}
            />
            {f.label}
          </label>
        ))}
      </fieldset>

      <div className="btn-row">
        <button type="button" className="btn" onClick={generate} data-testid="generate">
          Generate {draft.target} problems
        </button>
        <span className="muted">Replaces the list below. The same code and settings always make the same problems.</span>
      </div>

      <div className="field">
        <label htmlFor="as-custom">Add your own equation</label>
        <div className="check-row">
          <input id="as-custom" className="text-input" value={custom} onChange={(e) => setCustom(e.target.value)} placeholder="for example: 2(x + 3) = 14" aria-invalid={customError ? 'true' : 'false'} aria-describedby={customError ? 'as-custom-error' : undefined} data-testid="as-custom" />
          <button type="button" className="btn" onClick={addCustom} data-testid="add-custom">Add</button>
        </div>
        {customError && <p id="as-custom-error" className="error-msg" role="alert">{customError}</p>}
      </div>

      <section aria-labelledby="as-list-title">
        <h3 id="as-list-title">Problems ({draft.equations.length})</h3>
        {draft.equations.length === 0 ? (
          <p className="muted">No problems yet. Generate some or add your own.</p>
        ) : (
          <ol className="eq-edit-list" data-testid="eq-list">
            {draft.equations.map((eqText, i) => {
              const ok = parseEquation(eqText);
              return (
                <li key={i}>
                  <input
                    className="text-input"
                    value={eqText}
                    aria-label={`Problem ${i + 1}`}
                    aria-invalid={ok.ok ? 'false' : 'true'}
                    onChange={(e) => set({ equations: draft.equations.map((x, k) => (k === i ? e.target.value : x)) })}
                  />
                  <button type="button" className="btn ghost" onClick={() => set({ equations: draft.equations.filter((_, k) => k !== i) })} aria-label={`Remove problem ${i + 1}`}>
                    Remove
                  </button>
                  {!ok.ok && <span className="error-msg inline" role="alert">{ok.message}</span>}
                </li>
              );
            })}
          </ol>
        )}
      </section>

      <div className="btn-row">
        <button type="submit" className="btn primary" data-testid="save-assignment">Save assignment</button>
        <button type="button" className="btn" onClick={onPreview}>Preview as student</button>
        <button type="button" className="btn ghost" onClick={onCancel}>Cancel</button>
      </div>
    </form>
  );
}
