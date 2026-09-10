import { Component, type ReactNode } from "react";

export default class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  override state = { error: null as Error | null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  override componentDidCatch(error: Error) {
    console.error(error);
  }

  override render() {
    if (this.state.error) {
      return (
        <div className="app-shell items-center justify-center px-6 text-center">
          <div>
            <h1 className="text-lg font-bold">Something went wrong</h1>
            <p className="mt-2 text-sm text-ink-dim">
              Zivvvo hit an unexpected error. Your progress stays saved on this device.
            </p>
            <button
              className="mt-4 rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-slate-950 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
              onClick={() => window.location.reload()}
            >
              Reload
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}