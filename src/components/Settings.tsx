import { useState } from 'react';
import { useStore } from '../storage/StoreContext';
import type { MotionPref, Speed } from '../storage/store';

export function Settings() {
  const { data, update, reset, persistent } = useStore();
  const p = data.prefs;
  const [confirming, setConfirming] = useState(false);
  const [resetDone, setResetDone] = useState(false);
  const set = (patch: Partial<typeof p>): void => update((d) => ({ ...d, prefs: { ...d.prefs, ...patch } }));

  return (
    <div className="page">
      <h1>Settings</h1>

      <section className="card" aria-labelledby="set-motion">
        <h2 id="set-motion">Animation</h2>
        <fieldset className="seg">
          <legend>Animation speed</legend>
          {(['slow', 'normal', 'fast'] as const).map((s: Speed) => (
            <label key={s} className={p.speed === s ? 'on' : ''}>
              <input type="radio" name="s-speed" checked={p.speed === s} onChange={() => set({ speed: s })} />
              {s[0].toUpperCase() + s.slice(1)}
            </label>
          ))}
        </fieldset>
        <div className="field">
          <label htmlFor="s-motion">Motion</label>
          <select id="s-motion" className="text-input" value={p.motion} onChange={(e) => set({ motion: e.target.value as MotionPref })}>
            <option value="system">Follow my device setting</option>
            <option value="reduced">Reduce motion (no animations)</option>
            <option value="full">Always animate</option>
          </select>
          <p className="muted">Turning animations off never changes the math. Every step is still recorded in Your Moves.</p>
        </div>
      </section>

      <section className="card" aria-labelledby="set-learn">
        <h2 id="set-learn">Learning</h2>
        <label className="check">
          <input type="checkbox" checked={p.showBalance} onChange={(e) => set({ showBalance: e.target.checked })} />
          Show the balance scale
        </label>
        <label className="check">
          <input type="checkbox" checked={p.signShortcut} onChange={(e) => set({ signShortcut: e.target.checked })} data-testid="sign-shortcut" />
          Show the “move it and change the sign” shortcut after each step
        </label>
        <p className="muted">Off by default. The shortcut is a shorthand for “do the opposite to both sides.” Turn it on once you understand why it works.</p>
        <label className="check">
          <input type="checkbox" checked={p.allowDivideFirst} onChange={(e) => set({ allowDivideFirst: e.target.checked })} data-testid="allow-divide-first" />
          Allow dividing everything first (for example dividing both sides of 2(x + 3) = 14 by 2)
        </label>
        <p className="muted">Off by default, because dividing before the parentheses are gone can be confusing. When it is off, students distribute first.</p>
        <label className="check">
          <input type="checkbox" checked={p.forceDistributeFirst} onChange={(e) => set({ forceDistributeFirst: e.target.checked })} data-testid="force-distribute-first" />
          Require distributing first when there are parentheses
        </label>
        <p className="muted">When it is on, no other move is allowed until every set of parentheses has been distributed.</p>
        <label className="check">
          <input type="checkbox" checked={p.explore} onChange={(e) => set({ explore: e.target.checked })} />
          Explore mode: unlock every lesson
        </label>
        <div className="field">
          <label htmlFor="s-mastery">Mastery needed to unlock the next lesson</label>
          <select id="s-mastery" className="text-input short" value={p.masteryPercent} onChange={(e) => set({ masteryPercent: Number(e.target.value) })}>
            {[60, 80, 100].map((v) => (
              <option key={v} value={v}>{v}% ({Math.ceil((v / 100) * 5)} of 5 right on the first try){v === 80 ? ' (default)' : ''}</option>
            ))}
          </select>
        </div>
      </section>

      <section className="card" aria-labelledby="set-data">
        <h2 id="set-data">Your progress</h2>
        <p>
          Progress and settings are saved in <strong>this browser on this device</strong>. They may not follow you to another device or browser. Equation Explorer never asks for your name or any personal information.
        </p>
        {!persistent && <p className="notice">This browser is not letting Equation Explorer save, so progress will be forgotten when you close the page. A private window can cause this.</p>}
        {resetDone && <p className="ok-msg" role="status">Your saved progress was cleared.</p>}
        {confirming ? (
          <div className="btn-row">
            <span>This clears lessons, practice scores, assignments and saved equations on this device. Are you sure?</span>
            <button type="button" className="btn danger" onClick={() => { reset(); setConfirming(false); setResetDone(true); }} data-testid="confirm-reset">
              Yes, clear everything
            </button>
            <button type="button" className="btn" onClick={() => setConfirming(false)}>Cancel</button>
          </div>
        ) : (
          <button type="button" className="btn" onClick={() => { setConfirming(true); setResetDone(false); }} data-testid="reset-progress">
            Reset my progress…
          </button>
        )}
      </section>

      <section className="card" aria-labelledby="set-limits">
        <h2 id="set-limits">What Equation Explorer can solve</h2>
        <p>Linear equations with one unknown letter, using exact fractions and decimals: one-step, two-step and multistep equations, with parentheses and the letter on both sides. It tells you when an equation has no solution or infinitely many solutions.</p>
        <p className="muted">Not supported yet: exponents (like x²), square roots, the letter in a denominator, and equations with two different letters.</p>
      </section>
    </div>
  );
}
