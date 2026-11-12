/** Last-resort screen instead of a blank page, e.g. when a screen's code cannot be downloaded offline. */
import { Component, ReactNode } from "react";

export default class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  render() {
    if (!this.state.error) return this.props.children;
    const offline = typeof navigator !== "undefined" && !navigator.onLine;
    return (
      <div className="auth">
        <div className="card stack" role="alert" data-testid="app-error">
          <h3>{offline ? "אין חיבור לרשת" : "משהו השתבש"}</h3>
          <p className="small muted">
            {offline ? "המסך הזה עוד לא נשמר במכשיר. האימונים שכבר נשמרו לא יאבדו." : "אפשר לטעון את הדף מחדש."}
          </p>
          <p className="dev">{this.state.error.message}</p>
          <button onClick={() => location.reload()}>טעינה מחדש</button>
        </div>
      </div>
    );
  }
}
