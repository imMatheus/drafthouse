import { Files, GitPullRequest } from 'lucide-react'

export default function WelcomeView() {
  return (
    <div className="flex h-full items-center justify-center">
      <div className="border-border bg-surface max-w-xl rounded-2xl border p-8">
        <p className="text-foreground-subtle text-xs font-semibold tracking-[0.2em] uppercase">Workspace</p>
        <h1 className="text-foreground mt-3 text-2xl font-semibold">Open work from the left rail</h1>
        <p className="text-foreground-muted mt-3 text-sm leading-6">
          Use the explorer to open files in tabs, or jump into pull requests without leaving the workspace.
        </p>

        <div className="mt-6 grid gap-3 sm:grid-cols-2">
          <div className="border-border bg-background rounded-xl border p-4">
            <div className="text-foreground flex items-center gap-2">
              <Files size={16} strokeWidth={1.8} />
              <span className="text-sm font-medium">Explorer</span>
            </div>
            <p className="text-foreground-muted mt-2 text-sm">
              Browse the repo tree and open files into reusable editor tabs.
            </p>
          </div>

          <div className="border-border bg-background rounded-xl border p-4">
            <div className="text-foreground flex items-center gap-2">
              <GitPullRequest size={16} strokeWidth={1.8} />
              <span className="text-sm font-medium">Pull Requests</span>
            </div>
            <p className="text-foreground-muted mt-2 text-sm">
              Keep the pull request list and individual pull requests open side by side as tabs.
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
