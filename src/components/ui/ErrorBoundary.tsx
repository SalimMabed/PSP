import { Component, type ErrorInfo, type ReactNode } from "react";
import { ErrorState } from "./States";

interface Props {
  children: ReactNode;
  /** Change de valeur → l'erreur est réinitialisée (ex. navigation vers une autre route). */
  resetKey?: string;
}

interface State {
  error: Error | null;
}

/** Évite l'écran blanc : une erreur de rendu d'une page affiche un état d'erreur avec relance. */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidUpdate(prev: Props) {
    if (this.state.error && prev.resetKey !== this.props.resetKey) this.setState({ error: null });
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // Pas de télémétrie dans le prototype : journal console uniquement.
    console.error("Erreur de rendu", error, info.componentStack);
  }

  render() {
    if (this.state.error) {
      return (
        <ErrorState
          title="Cette page a rencontré un problème"
          message="Une erreur inattendue est survenue à l'affichage. Vos données locales ne sont pas modifiées."
          onRetry={() => this.setState({ error: null })}
        />
      );
    }
    return this.props.children;
  }
}
