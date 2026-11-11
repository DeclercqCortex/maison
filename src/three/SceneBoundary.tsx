import { Component, type ReactNode } from 'react';

/** Keeps a failure in the 3D view from taking the plan editor down with it. */
export class SceneBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error: unknown) {
    console.error('The 3D view failed', error);
  }

  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <div className="scene-note">
        <strong>The 3D view ran into a problem</strong>
        <span>Your plan is safe. You can keep working in the Plan tab.</span>
        <button onClick={() => this.setState({ failed: false })}>Try again</button>
      </div>
    );
  }
}
