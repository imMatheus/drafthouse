import { Component, type ErrorInfo, type ReactNode } from 'react'

interface ErrorBoundaryProps {
  children: ReactNode
  /** Short label for what failed, shown in the fallback. */
  label?: string
}

interface ErrorBoundaryState {
  error: Error | null
}

/**
 * Catches render/runtime errors in a subtree so a crash shows a readable
 * message (and logs the component stack) instead of blanking the whole window.
 */
export default class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error(
      `ErrorBoundary${this.props.label ? ` (${this.props.label})` : ''} caught:`,
      error,
      info.componentStack
    )
  }

  render(): ReactNode {
    const { error } = this.state
    if (error) {
      return (
        <div className="flex h-full min-h-0 items-center justify-center p-6">
          <div className="border-border bg-surface w-full max-w-lg rounded-xl border p-4">
            <h2 className="text-foreground text-sm font-semibold">{this.props.label ?? 'Something went wrong'}</h2>
            <p className="text-danger mt-2 font-mono text-xs break-words">{error.message}</p>
            {error.stack ? (
              <pre className="text-foreground-muted bg-background mt-2 max-h-48 overflow-auto rounded p-2 font-mono text-[11px] whitespace-pre-wrap">
                {error.stack}
              </pre>
            ) : null}
            <button
              type="button"
              onClick={() => this.setState({ error: null })}
              className="border-border bg-interactive text-foreground hover:bg-interactive-hover mt-3 rounded-md border px-3 py-1.5 text-xs font-medium transition-colors"
            >
              Retry
            </button>
          </div>
        </div>
      )
    }
    return this.props.children
  }
}
