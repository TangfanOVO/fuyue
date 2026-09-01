import { Component, type ErrorInfo, type ReactNode } from "react";

type AppErrorBoundaryProps = { children: ReactNode };
type AppErrorBoundaryState = { failed: boolean };

export class AppErrorBoundary extends Component<AppErrorBoundaryProps, AppErrorBoundaryState> {
  state: AppErrorBoundaryState = { failed: false };

  static getDerivedStateFromError(): AppErrorBoundaryState {
    return { failed: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("Fuyue interface error", error, info.componentStack);
  }

  private reload = () => window.location.reload();

  private returnHome = () => {
    window.history.replaceState({ fuyuePanelDepth: 0 }, "", window.location.pathname + window.location.search);
    window.location.reload();
  };

  render() {
    if (!this.state.failed) return this.props.children;
    return <main className="state-screen app-crash-screen" role="alert">
      <span className="crash-mark" aria-hidden="true">赴</span>
      <h1>这一页刚才没有接住</h1>
      <p>本地聊天和记忆没有因此被删除。可以先重新打开；如果仍然出错，就回首页继续使用其他房间。</p>
      <div className="state-actions">
        <button className="primary-button" onClick={this.reload}>重新打开</button>
        <button className="secondary-button" onClick={this.returnHome}>回到首页</button>
      </div>
    </main>;
  }
}
