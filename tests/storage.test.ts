import { describe, it, expect } from 'vitest';
import {
  STORAGE_KEY, canPersist, checkAssignment, defaultData, exportAssignment, isLessonUnlocked, loadData,
  meetsMastery, parseAssignmentImport, saveData, validateData, MAX_ASSIGNMENT_PROBLEMS,
} from '../src/storage/store';
import type { Assignment, StoreData } from '../src/storage/store';

class MemoryStorage implements Storage {
  private m = new Map<string, string>();
  get length() { return this.m.size; }
  clear() { this.m.clear(); }
  getItem(k: string) { return this.m.has(k) ? this.m.get(k)! : null; }
  key(i: number) { return [...this.m.keys()][i] ?? null; }
  removeItem(k: string) { this.m.delete(k); }
  setItem(k: string, v: string) { this.m.set(k, String(v)); }
}
class FullStorage extends MemoryStorage {
  setItem(): void { throw new Error('QuotaExceededError'); }
}

const sample = (): Assignment => ({
  id: 'a1', title: 'Warm-up', instructions: 'Show every step.', level: 2, families: ['two-add'],
  seed: 'room-5', equations: ['2x + 3 = 11', 'x/2 + 1 = 4'], target: 2, updated: 5,
});

describe('persistence', () => {
  it('round-trips data through storage', () => {
    const s = new MemoryStorage();
    const d = defaultData();
    d.prefs.speed = 'fast';
    d.prefs.signShortcut = true;
    d.progress.lessons['two-step'] = { completed: true, bestCorrect: 5, attempts: 2 };
    d.savedEquations = ['3x + 5 = 20'];
    d.assignments = [sample()];
    d.last = { kind: 'custom', label: 'My equation', ref: '', equation: '3x + 5 = 20', commands: [{ type: 'addsub', side: 'left', index: 1 }], problemIndex: 0, level: 1, seed: '' };
    expect(saveData(d, s)).toBe(true);
    const back = loadData(s);
    expect(back).toEqual(d);
  });

  it('returns defaults when nothing is stored', () => {
    expect(loadData(new MemoryStorage())).toEqual(defaultData());
    expect(loadData(null)).toEqual(defaultData());
  });

  it('recovers from corrupted JSON', () => {
    const s = new MemoryStorage();
    s.setItem(STORAGE_KEY, '{not json');
    expect(loadData(s)).toEqual(defaultData());
    s.setItem(STORAGE_KEY, 'null');
    expect(loadData(s)).toEqual(defaultData());
    s.setItem(STORAGE_KEY, '[1,2,3]');
    expect(loadData(s)).toEqual(defaultData());
  });

  it('repairs wrong types field by field instead of crashing', () => {
    const d = validateData({
      version: 'banana',
      prefs: { speed: 'warp', motion: 7, showBalance: 'yes', masteryPercent: 9999 },
      progress: { lessons: { good: { completed: true, bestCorrect: 99, attempts: -4 }, bad: 'oops' }, practice: { '1': { attempted: 5, correct: 50 } }, currentLevel: 'high' },
      savedEquations: ['3x + 5 = 20', 'not an equation', 42],
      assignments: [{ title: 5 }, 'x'],
      last: { equation: 'garbage' },
    });
    expect(d.prefs.speed).toBe('normal');
    expect(d.prefs.showBalance).toBe(true);
    expect(d.prefs.masteryPercent).toBe(100);
    expect(d.progress.lessons.good).toEqual({ completed: true, bestCorrect: 5, attempts: 0 });
    expect(d.progress.lessons.bad).toBeUndefined();
    expect(d.progress.practice['1']).toEqual({ attempted: 5, correct: 5 });
    expect(d.progress.currentLevel).toBe(1);
    expect(d.savedEquations).toEqual(['3x + 5 = 20']);
    expect(d.assignments).toEqual([]);
    expect(d.last).toBeNull();
  });

  it('accepts data from an older version that is missing newer fields', () => {
    const d = validateData({ version: 0, prefs: { speed: 'slow' } });
    expect(d.prefs.speed).toBe('slow');
    expect(d.prefs.signShortcut).toBe(false);
    expect(d.assignments).toEqual([]);
  });

  it('survives storage that is full or blocked', () => {
    expect(saveData(defaultData(), new FullStorage())).toBe(false);
    expect(saveData(defaultData(), null)).toBe(false);
    expect(canPersist(new FullStorage())).toBe(false);
    expect(canPersist(new MemoryStorage())).toBe(true);
  });

  it('never stores personal fields', () => {
    const d = validateData({ prefs: {}, name: 'Alex', email: 'a@b.c', progress: {} }) as StoreData & Record<string, unknown>;
    expect(JSON.stringify(d)).not.toContain('Alex');
    expect(d.name).toBeUndefined();
  });
});

describe('progress rules', () => {
  const ids = ['a', 'b', 'c'];
  it('unlocks lessons in order, or all in explore mode', () => {
    const d = defaultData();
    expect(isLessonUnlocked(d, ids, 0)).toBe(true);
    expect(isLessonUnlocked(d, ids, 1)).toBe(false);
    d.progress.lessons.a = { completed: true, bestCorrect: 5, attempts: 1 };
    expect(isLessonUnlocked(d, ids, 1)).toBe(true);
    expect(isLessonUnlocked(d, ids, 2)).toBe(false);
    d.prefs.explore = true;
    expect(isLessonUnlocked(d, ids, 2)).toBe(true);
  });
  it('applies the 4-of-5 (80%) mastery rule and a configurable one', () => {
    expect(meetsMastery(4, 5, 80)).toBe(true);
    expect(meetsMastery(3, 5, 80)).toBe(false);
    expect(meetsMastery(3, 5, 60)).toBe(true);
    expect(meetsMastery(0, 0, 80)).toBe(false);
  });
});

describe('teacher assignments: export and import', () => {
  it('exports then imports an identical assignment (new id)', () => {
    const text = exportAssignment(sample());
    const r = parseAssignmentImport(text);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.assignment.title).toBe('Warm-up');
      expect(r.assignment.equations).toEqual(['2x + 3 = 11', 'x/2 + 1 = 4']);
      expect(r.assignment.id).not.toBe('a1');
      expect(r.assignment.level).toBe(2);
    }
  });
  it('rejects files that are not JSON or not assignments', () => {
    expect(parseAssignmentImport('hello').ok).toBe(false);
    expect(parseAssignmentImport('{"format":"other"}').ok).toBe(false);
    expect(parseAssignmentImport('[]').ok).toBe(false);
    expect(parseAssignmentImport(JSON.stringify({ format: 'equation-explorer-assignment', version: 9, assignment: sample() })).ok).toBe(false);
  });
  it('rejects an unreadable problem and says which one', () => {
    const bad = { ...sample(), equations: ['2x + 3 = 11', 'x + = 5'] };
    const r = checkAssignment(bad);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain('Problem 2');
  });
  it('rejects code-like problems and empty or oversized assignments', () => {
    expect(checkAssignment({ ...sample(), equations: ['alert(1) = 2'] }).ok).toBe(false);
    expect(checkAssignment({ ...sample(), equations: [] }).ok).toBe(false);
    expect(checkAssignment({ ...sample(), title: '   ' }).ok).toBe(false);
    const many = Array.from({ length: MAX_ASSIGNMENT_PROBLEMS + 1 }, () => 'x + 1 = 2');
    const r = checkAssignment({ ...sample(), equations: many });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain('100');
    expect(checkAssignment({ ...sample(), equations: many.slice(0, MAX_ASSIGNMENT_PROBLEMS) }).ok).toBe(true);
  });
  it('clamps the target and trims long text', () => {
    const r = checkAssignment({ ...sample(), target: 999, title: 'T'.repeat(300) });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.assignment.target).toBe(2);
      expect(r.assignment.title).toHaveLength(80);
    }
  });
});
