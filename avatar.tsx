import { Component, ReactNode } from "react";

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error?: Error;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    // לוגינג — ניתן לחבר ל-Sentry/Datadog בעתיד
    console.error("[VetTrack] Uncaught error:", error, info.componentStack);
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback;

      return (
        <div className="min-h-screen flex items-center justify-center p-6 text-center">
          <div className="max-w-sm">
            <div className="w-14 h-14 rounded-2xl bg-red-50 flex items-center justify-center mx-auto mb-4">
              <span className="text-2xl">⚠️</span>
            </div>
            <h2 className="text-xl font-semibold mb-2">משהו השתבש</h2>
            <p className="text-muted-foreground text-sm mb-1">
              {this.state.error?.message ?? "שגיאה לא ידועה"}
            </p>
            <p className="text-xs text-muted-foreground/60 mb-5">
              אם הבעיה חוזרת, פנה לתמיכה טכנית.
            </p>
            <button
              className="px-5 py-2 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 transition-colors"
              onClick={() => this.setState({ hasError: false, error: undefined })}
            >
              נסה שוב
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
