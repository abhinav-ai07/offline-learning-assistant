import { Component, type ErrorInfo, type ReactNode } from "react";
import { WarningIcon } from "./icons";

interface Props {
  children: ReactNode;
  fallbackTitle?: string;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("Uncaught error caught by ErrorBoundary:", error, errorInfo);
  }

  private handleReload = () => {
    window.location.reload();
  };

  private handleReset = () => {
    window.localStorage.removeItem("ila.token");
    window.location.href = "/student/login";
  };

  public render() {
    if (this.state.hasError) {
      return (
        <div className="portal-error-card" style={{ maxWidth: 640, margin: "60px auto", padding: 32 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16 }}>
            <WarningIcon width={28} height={28} />
            <h3 style={{ margin: 0 }}>{this.props.fallbackTitle || "Something went wrong loading this view"}</h3>
          </div>
          <p style={{ color: "var(--color-text-secondary)", marginBottom: 20 }}>
            {this.state.error?.message || "An unexpected error occurred while rendering the page."}
          </p>
          <div style={{ display: "flex", gap: 12 }}>
            <button type="button" className="btn btn-primary" onClick={this.handleReload}>
              Reload Page
            </button>
            <button type="button" className="btn btn-outline" onClick={this.handleReset}>
              Reset Session &amp; Sign In
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
