import type { Command } from '../engine/moves';
import type { Level } from '../engine/generator';
import { FAMILIES } from '../engine/generator';
import { parseEquation } from '../engine/parser';

/**
 * Everything saved in the browser lives under one localStorage key. Nothing personal is
 * stored: no names, no emails. Loading never throws: anything missing, corrupted or from
 * an older version falls back to safe defaults, field by field.
 */

export const STORAGE_KEY = 'equation-explorer:v1';
export const STORAGE_VERSION = 1;
export const MAX_ASSIGNMENT_PROBLEMS = 100;
export const MAX_ASSIGNMENTS = 50;
export const MAX_SAVED_EQUATIONS = 20;
export const MAX_RESUME_COMMANDS = 100;

export type Speed = 'slow' | 'normal' | 'fast';
export type MotionPref = 'system' | 'reduced' | 'full';

export interface Prefs {
  speed: Speed;
  motion: MotionPref;
  showBalance: boolean;
  /** Show the "move it and change the sign" shortcut after each step. Off by default. */
  signShortcut: boolean;
  /** Explore mode: every lesson is unlocked. */
  explore: boolean;
  /** Percent of lesson questions that must be right the first time to unlock the next lesson. */
  masteryPercent: number;
}

export interface LessonProgress {
  completed: boolean;
  bestCorrect: number;
  attempts: number;
}

export interface LevelStats {
  attempted: number;
  correct: number;
}

export interface Progress {
  lessons: Record<string, LessonProgress>;
  practice: Record<'1' | '2' | '3' | '4', LevelStats>;
  currentLevel: Level;
}

export interface Assignment {
  id: string;
  title: string;
  instructions: string;
  level: Level;
  families: string[];
  seed: string;
  /** The final list of equations, as plain text. */
  equations: string[];
  /** Target number of questions for the student to complete. */
  target: number;
  updated: number;
}

export interface LastActivity {
  kind: 'lesson' | 'practice' | 'custom' | 'assignment';
  /** Human label for the Resume button. */
  label: string;
  /** Lesson id or assignment id, otherwise empty. */
  ref: string;
  /** The equation being worked on. */
  equation: string;
  /** Moves made so far, replayed on resume. */
  commands: Command[];
  /** Which problem in the lesson / practice set / assignment. */
  problemIndex: number;
  level: Level;
  seed: string;
}

export interface StoreData {
  version: number;
  prefs: Prefs;
  progress: Progress;
  savedEquations: string[];
  assignments: Assignment[];
  last: LastActivity | null;
}

export const defaultPrefs = (): Prefs => ({
  speed: 'normal',
  motion: 'system',
  showBalance: true,
  signShortcut: false,
  explore: false,
  masteryPercent: 80,
});

export const defaultData = (): StoreData => ({
  version: STORAGE_VERSION,
  prefs: defaultPrefs(),
  progress: {
    lessons: {},
    practice: { '1': { attempted: 0, correct: 0 }, '2': { attempted: 0, correct: 0 }, '3': { attempted: 0, correct: 0 }, '4': { attempted: 0, correct: 0 } },
    currentLevel: 1,
  },
  savedEquations: [],
  assignments: [],
  last: null,
});

// ---------------------------------------------------------------- small validators

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const str = (v: unknown, max: number, fallback = ''): string =>
  typeof v === 'string' ? v.replace(/\p{Cc}/gu, ' ').trim().slice(0, max) : fallback;
const int = (v: unknown, lo: number, hi: number, fallback: number): number =>
  typeof v === 'number' && Number.isFinite(v) ? Math.min(hi, Math.max(lo, Math.round(v))) : fallback;
const bool = (v: unknown, fallback: boolean): boolean => (typeof v === 'boolean' ? v : fallback);
const oneOf = <T extends string>(v: unknown, options: readonly T[], fallback: T): T =>
  typeof v === 'string' && (options as readonly string[]).includes(v) ? (v as T) : fallback;
const level = (v: unknown, fallback: Level = 1): Level => int(v, 1, 4, fallback) as Level;
const SIDES = ['left', 'right'] as const;

export function isCommand(v: unknown): v is Command {
  if (!isObj(v)) return false;
  const side = SIDES.includes(v.side as 'left') ;
  const idx = typeof v.index === 'number' && Number.isInteger(v.index) && v.index >= 0 && v.index < 50;
  switch (v.type) {
    case 'addsub':
    case 'distribute':
      return side && idx;
    case 'scale':
      return side && idx && (v.part === 'coef' || v.part === 'den');
    case 'combine':
      return side && (v.kind === 'const' || v.kind === 'var');
    default:
      return false;
  }
}

function validateLast(raw: unknown): LastActivity | null {
  if (!isObj(raw)) return null;
  const kind = oneOf(raw.kind, ['lesson', 'practice', 'custom', 'assignment'] as const, 'custom');
  const equation = str(raw.equation, 80);
  if (!equation || !parseEquation(equation).ok) return null;
  const commands = Array.isArray(raw.commands) ? raw.commands.filter(isCommand).slice(0, MAX_RESUME_COMMANDS) : [];
  return {
    kind,
    label: str(raw.label, 80, 'your last activity') || 'your last activity',
    ref: str(raw.ref, 64),
    equation,
    commands,
    problemIndex: int(raw.problemIndex, 0, 1000, 0),
    level: level(raw.level),
    seed: str(raw.seed, 40),
  };
}

// ---------------------------------------------------------------- assignments

const makeId = (): string => `a${Date.now().toString(36)}${Math.floor(Math.random() * 1e6).toString(36)}`;

export type AssignmentCheck = { ok: true; assignment: Assignment } | { ok: false; error: string };

/**
 * Strictly validate an assignment (used for imports). Every equation must be readable by
 * the engine, so an imported file can never put an unsupported problem in front of a student.
 */
export function checkAssignment(raw: unknown): AssignmentCheck {
  if (!isObj(raw)) return { ok: false, error: 'The assignment data is not in the expected format.' };
  const title = str(raw.title, 80);
  if (!title) return { ok: false, error: 'The assignment needs a title.' };
  if (!Array.isArray(raw.equations) || raw.equations.length === 0) {
    return { ok: false, error: 'The assignment has no problems in it.' };
  }
  if (raw.equations.length > MAX_ASSIGNMENT_PROBLEMS) {
    return { ok: false, error: `An assignment can have at most ${MAX_ASSIGNMENT_PROBLEMS} problems. This one has ${raw.equations.length}.` };
  }
  const equations: string[] = [];
  for (let i = 0; i < raw.equations.length; i++) {
    const text = typeof raw.equations[i] === 'string' ? (raw.equations[i] as string).trim() : '';
    const parsed = parseEquation(text);
    if (!parsed.ok) return { ok: false, error: `Problem ${i + 1} couldn't be used: ${parsed.message}` };
    equations.push(text);
  }
  const knownFamilies = new Set(FAMILIES.map((f) => f.id));
  const families = Array.isArray(raw.families) ? raw.families.filter((f): f is string => typeof f === 'string' && knownFamilies.has(f)).slice(0, 30) : [];
  return {
    ok: true,
    assignment: {
      id: str(raw.id, 64) || makeId(),
      title,
      instructions: str(raw.instructions, 600),
      level: level(raw.level),
      families,
      seed: str(raw.seed, 40),
      equations,
      target: int(raw.target, 1, equations.length, equations.length),
      updated: int(raw.updated, 0, Number.MAX_SAFE_INTEGER, Date.now()),
    },
  };
}

export const EXPORT_FORMAT = 'equation-explorer-assignment';

export function exportAssignment(a: Assignment): string {
  return JSON.stringify({ format: EXPORT_FORMAT, version: 1, assignment: a }, null, 2);
}

export function parseAssignmentImport(text: string): AssignmentCheck {
  if (text.length > 400_000) return { ok: false, error: 'That file is too large to be an assignment.' };
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    return { ok: false, error: 'That file is not valid JSON. Choose a file exported from Equation Explorer.' };
  }
  if (!isObj(data) || data.format !== EXPORT_FORMAT) {
    return { ok: false, error: 'That file is not an Equation Explorer assignment.' };
  }
  if (typeof data.version !== 'number' || data.version > 1) {
    return { ok: false, error: 'That assignment was made with a newer version of Equation Explorer.' };
  }
  const check = checkAssignment(data.assignment);
  // A fresh id keeps an imported copy from overwriting an existing assignment.
  return check.ok ? { ok: true, assignment: { ...check.assignment, id: makeId(), updated: Date.now() } } : check;
}

// ---------------------------------------------------------------- whole-store validation

/** Rebuild a StoreData from whatever was found in storage. Never throws. */
export function validateData(raw: unknown): StoreData {
  const d = defaultData();
  if (!isObj(raw)) return d;
  const prefs = isObj(raw.prefs) ? raw.prefs : {};
  d.prefs = {
    speed: oneOf(prefs.speed, ['slow', 'normal', 'fast'] as const, d.prefs.speed),
    motion: oneOf(prefs.motion, ['system', 'reduced', 'full'] as const, d.prefs.motion),
    showBalance: bool(prefs.showBalance, d.prefs.showBalance),
    signShortcut: bool(prefs.signShortcut, d.prefs.signShortcut),
    explore: bool(prefs.explore, d.prefs.explore),
    masteryPercent: int(prefs.masteryPercent, 20, 100, d.prefs.masteryPercent),
  };
  const progress = isObj(raw.progress) ? raw.progress : {};
  if (isObj(progress.lessons)) {
    for (const [id, v] of Object.entries(progress.lessons).slice(0, 50)) {
      if (!isObj(v) || id.length > 64) continue;
      d.progress.lessons[id] = {
        completed: bool(v.completed, false),
        bestCorrect: int(v.bestCorrect, 0, 5, 0),
        attempts: int(v.attempts, 0, 100000, 0),
      };
    }
  }
  if (isObj(progress.practice)) {
    for (const key of ['1', '2', '3', '4'] as const) {
      const v = progress.practice[key];
      if (isObj(v)) {
        const attempted = int(v.attempted, 0, 1_000_000, 0);
        d.progress.practice[key] = { attempted, correct: int(v.correct, 0, attempted, 0) };
      }
    }
  }
  d.progress.currentLevel = level(progress.currentLevel);
  if (Array.isArray(raw.savedEquations)) {
    d.savedEquations = raw.savedEquations
      .filter((e): e is string => typeof e === 'string' && e.length <= 80 && parseEquation(e).ok)
      .slice(0, MAX_SAVED_EQUATIONS);
  }
  if (Array.isArray(raw.assignments)) {
    for (const a of raw.assignments.slice(0, MAX_ASSIGNMENTS)) {
      const c = checkAssignment(a);
      if (c.ok) d.assignments.push(c.assignment);
    }
  }
  d.last = validateLast(raw.last);
  return d;
}

// ---------------------------------------------------------------- persistence

function getStorage(): Storage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null; // blocked (private mode, disabled cookies)
  }
}

export function loadData(storage: Storage | null = getStorage()): StoreData {
  if (!storage) return defaultData();
  try {
    const text = storage.getItem(STORAGE_KEY);
    if (!text) return defaultData();
    return validateData(JSON.parse(text));
  } catch {
    return defaultData();
  }
}

/** Returns false when the browser would not let us save (full or blocked storage). */
export function saveData(data: StoreData, storage: Storage | null = getStorage()): boolean {
  if (!storage) return false;
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(data));
    return true;
  } catch {
    return false;
  }
}

export function clearData(storage: Storage | null = getStorage()): void {
  try {
    storage?.removeItem(STORAGE_KEY);
  } catch {
    /* nothing to do */
  }
}

export function canPersist(storage: Storage | null = getStorage()): boolean {
  if (!storage) return false;
  try {
    const probe = `${STORAGE_KEY}:probe`;
    storage.setItem(probe, '1');
    storage.removeItem(probe);
    return true;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------- progress rules

/** Lesson i unlocks when lesson i-1 is complete (or Explore mode is on). */
export function isLessonUnlocked(data: StoreData, lessonIds: readonly string[], index: number): boolean {
  if (data.prefs.explore || index === 0) return true;
  return data.progress.lessons[lessonIds[index - 1]]?.completed === true;
}

/** Documented mastery rule: first-try-correct questions out of the lesson's questions. */
export function meetsMastery(correctFirstTry: number, total: number, masteryPercent: number): boolean {
  return total > 0 && (correctFirstTry / total) * 100 >= masteryPercent;
}
