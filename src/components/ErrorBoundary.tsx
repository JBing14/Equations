import { Component } from 'react';
import type { ErrorInfo, ReactNode } from 'react';

interface Props {
  children: ReactNode;
  /** Changing this value clears a previous error (for example when the student changes screens). */
  resetKey?: string;
}
interface State {
  failed: boolean;
}

/** Catches unexpected errors so a bug shows a friendly recovery path instead of a blank page. */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { failed: false };

  static getDerivedStateFromError(): State {
    return { failed: true };
  }

  componentDidUpdate(prev: Props): void {
    if (this.state.failed && prev.resetKey !== this.props.resetKey) this.setState({ failed: false });
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('Equation Explorer error:', error, info.componentStack);
  }

  render(): ReactNode {
    if (!this.state.failed) return this.props.children;
    return (
      <div className="card error-card" role="alert">
        <h2>Something went wrong</h2>
        <p>Sorry about that. Your saved progress is safe. You can try this screen again, or go back to the home page.</p>
        <div className="btn-row">
          <button type="button" className="btn primary" onClick={() => this.setState({ failed: false })}>
            Try again
          </button>
          <a className="btn" href="#/home" onClick={() => this.setState({ failed: false })}>
            Go to Home
          </a>
        </div>
      </div>
    );
  }
}
