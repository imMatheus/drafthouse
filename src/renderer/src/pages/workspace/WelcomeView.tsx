import { Files, GitPullRequest } from 'lucide-react'

export default function WelcomeView() {
  return (
    <div className="flex h-full items-center justify-center">
      <div className="max-w-xl rounded-2xl border border-border bg-surface p-8">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-foreground-subtle">Workspace</p>
        <h1 className="mt-3 text-2xl font-semibold text-foreground">Open work from the left rail</h1>
        <p className="mt-3 text-sm leading-6 text-foreground-muted">
          Use the explorer to open files in tabs, or jump into pull requests without leaving the workspace.
        </p>

        <div className="mt-6 grid gap-3 sm:grid-cols-2">
          <div className="rounded-xl border border-border bg-background p-4">
            <div className="flex items-center gap-2 text-foreground">
              <Files size={16} strokeWidth={1.8} />
              <span className="text-sm font-medium">Explorer</span>
            </div>
            <p className="mt-2 text-sm text-foreground-muted">
              Browse the repo tree and open files into reusable editor tabs.
            </p>
          </div>

          <div className="rounded-xl border border-border bg-background p-4">
            <div className="flex items-center gap-2 text-foreground">
              <GitPullRequest size={16} strokeWidth={1.8} />
              <span className="text-sm font-medium">Pull Requests</span>
            </div>
            <p className="mt-2 text-sm text-foreground-muted">
              Keep the pull request list and individual pull requests open side by side as tabs.
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
