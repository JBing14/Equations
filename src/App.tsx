import { useCallback, useEffect, useState } from 'react';
import { StoreProvider, useStore } from './storage/StoreContext';
import { useReducedMotion } from './hooks';
import { Home } from './components/Home';
import { Lessons } from './components/lessons/Lessons';
import { Practice } from './components/practice/Practice';
import { Custom } from './components/custom/Custom';
import { Teacher } from './components/teacher/Teacher';
import { Settings } from './components/Settings';
import { ErrorBoundary } from './components/ErrorBoundary';
import type { LastActivity } from './storage/store';

export type View = 'home' | 'lessons' | 'practice' | 'custom' | 'teacher' | 'settings';

const VIEWS: { id: View; label: string }[] = [
  { id: 'home', label: 'Home' },
  { id: 'lessons', label: 'Lessons' },
  { id: 'practice', label: 'Practice' },
  { id: 'custom', label: 'Custom' },
  { id: 'teacher', label: 'Teacher Tools' },
  { id: 'settings', label: 'Settings' },
];

const viewFromHash = (): View => {
  const id = window.location.hash.replace(/^#\/?/, '') as View;
  return VIEWS.some((v) => v.id === id) ? id : 'home';
};

function Shell() {
  const { data } = useStore();
  const reduced = useReducedMotion(data.prefs.motion);
  const [view, setView] = useState<View>(viewFromHash);
  const [resume, setResume] = useState<LastActivity | null>(null);

  useEffect(() => {
    const onHash = (): void => {
      setResume(null);
      setView(viewFromHash());
    };
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  const go = useCallback((v: View, withResume: LastActivity | null = null) => {
    setResume(withResume);
    setView(v);
    const next = `#/${v}`;
    if (window.location.hash !== next) window.history.pushState(null, '', next);
    window.scrollTo?.(0, 0);
  }, []);

  const onResume = (): void => {
    const last = data.last;
    if (!last) return;
    const target: View = last.kind === 'lesson' ? 'lessons' : last.kind === 'assignment' ? 'teacher' : last.kind;
    go(target, last);
  };

  let screen;
  switch (view) {
    case 'lessons':
      screen = <Lessons resume={resume} />;
      break;
    case 'practice':
      screen = <Practice resume={resume} />;
      break;
    case 'custom':
      screen = <Custom resume={resume} />;
      break;
    case 'teacher':
      screen = <Teacher resume={resume} />;
      break;
    case 'settings':
      screen = <Settings />;
      break;
    default:
      screen = <Home go={go} onResume={onResume} />;
  }

  return (
    <div className="app" data-motion={reduced ? 'reduced' : 'full'}>
      <a className="skip-link" href="#main">Skip to main content</a>
      <header className="app-header">
        <a className="brand" href="#/home" onClick={() => { setResume(null); setView('home'); }}>
          <span className="brand-mark" aria-hidden="true">=</span> Equation Explorer
        </a>
        <nav aria-label="Main">
          <ul>
            {VIEWS.map((v) => (
              <li key={v.id}>
                <a href={`#/${v.id}`} aria-current={view === v.id ? 'page' : undefined} onClick={(e) => { e.preventDefault(); go(v.id); }}>
                  {v.label}
                </a>
              </li>
            ))}
          </ul>
        </nav>
      </header>
      <main id="main" tabIndex={-1}>
        <ErrorBoundary resetKey={view}>{screen}</ErrorBoundary>
      </main>
      <footer className="app-footer">
        <p>Equation Explorer runs entirely in your browser. No accounts, no tracking. Your progress stays on this device.</p>
      </footer>
    </div>
  );
}

export default function App() {
  return (
    <StoreProvider>
      <Shell />
    </StoreProvider>
  );
}
