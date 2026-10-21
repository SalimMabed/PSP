import { Component, type ErrorInfo, type ReactNode } from "react";
import { ErrorState } from "./States";

interface Props {
  children: ReactNode;
  /** When this value changes, the error is reset (e.g. navigation to another route). */
  resetKey?: string;
}

interface State {
  error: Error | null;
}

/** Avoids a blank screen: a page render error shows an error state with a retry button. */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidUpdate(prev: Props) {
    if (this.state.error && prev.resetKey !== this.props.resetKey) this.setState({ error: null });
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // No telemetry in the prototype: console logging only.
    console.error("Render error", error, info.componentStack);
  }

  render() {
    if (this.state.error) {
      return (
        <ErrorState
          title="This page ran into a problem"
          message="An unexpected error occurred while rendering. Your local data is unchanged."
          onRetry={() => this.setState({ error: null })}
        />
      );
    }
    return this.props.children;
  }
}
