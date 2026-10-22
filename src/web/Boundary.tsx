// When drawing throws. A cell shows that it can't be drawn and stays selectable, so the rest of the document
// works and the cell can be fixed or deleted; a page says what happened, with a way back, instead of going blank.

import { Component, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
  fallback: (error: Error) => ReactNode;
  /** When any of these change (the cell, its value, the page), drawing is tried again. */
  resetKeys: unknown[];
}

interface State {
  error: Error | null;
  keys: unknown[];
}

const changed = (a: unknown[], b: unknown[]) => a.length !== b.length || a.some((x, i) => !Object.is(x, b[i]));

export class Boundary extends Component<Props, State> {
  state: State = { error: null, keys: this.props.resetKeys };

  static getDerivedStateFromError(error: unknown): Partial<State> {
    return { error: error instanceof Error ? error : new Error(String(error)) };
  }

  static getDerivedStateFromProps(props: Props, state: State): Partial<State> | null {
    return changed(props.resetKeys, state.keys) ? { error: null, keys: props.resetKeys } : null;
  }

  render() {
    return this.state.error ? this.props.fallback(this.state.error) : this.props.children;
  }
}

/** A newer build replaced the one this tab loaded: the page it asks for is gone from the server. */
export const isStaleBuild = (e: Error) => /dynamically imported module|importing a module script failed|error loading dynamically imported|failed to load module script/i.test(e.message);

/** What a page shows when it can't be drawn. */
export function PageError({ error }: { error: Error }) {
  const stale = isStaleBuild(error);
  return (
    <div className="screen-note page-error" role="alert">
      <div>
        <p className="page-error-title">{stale ? 'edgy was updated while this page was open.' : 'Something went wrong on this page.'}</p>
        {!stale && <p className="page-error-detail">{error.message}</p>}
        <p className="page-error-actions">
          <button type="button" className="btn solid" onClick={() => window.location.reload()}>Reload</button>
          <a className="btn ghost" href="/">Back to the library</a>
        </p>
      </div>
    </div>
  );
}
