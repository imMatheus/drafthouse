import type { ReactNode } from 'react'
import {
  FileCode2,
  GitMerge,
  GitPullRequest,
  GitPullRequestClosed,
  GitPullRequestDraft,
  Home,
  GitGraph,
  X
} from 'lucide-react'
import { getPathBasename } from '../lib/path'
import type { WorkspaceTab } from '../lib/workspaceTabs'

interface WorkspaceTabBarProps {
  tabs: WorkspaceTab[]
  activeTabId: WorkspaceTab['id'] | null
  onSelectTab: (tabId: WorkspaceTab['id']) => void
  onCloseTab: (tabId: WorkspaceTab['id']) => void
}

export default function WorkspaceTabBar({ tabs, activeTabId, onSelectTab, onCloseTab }: WorkspaceTabBarProps) {
  if (tabs.length === 0) {
    return null
  }

  return (
    <div className="border-b border-border bg-background">
      <div className="flex min-h-10 items-stretch overflow-x-auto px-2 pt-1.5">
        {tabs.map((tab) => {
          const { icon, label } = getWorkspaceTabPresentation(tab)
          const isActive = tab.id === activeTabId

          return (
            <div
              key={tab.id}
              className={`group mr-1.5 flex min-w-0 max-w-60 shrink-0 items-stretch rounded-t-lg border border-b-0 transition-colors ${
                isActive ? 'border-border bg-surface' : 'border-transparent bg-background hover:bg-surface-hover/60'
              }`}
            >
              <button
                onClick={() => onSelectTab(tab.id)}
                className="flex min-w-0 flex-1 items-center gap-2 px-3 py-2 text-left"
              >
                {icon}
                <span
                  className={`truncate text-sm font-medium ${isActive ? 'text-foreground' : 'text-foreground-muted'}`}
                >
                  {label}
                </span>
              </button>

              <button
                onClick={() => onCloseTab(tab.id)}
                className={`mr-1 flex w-7 items-center justify-center rounded-md transition-colors ${
                  isActive
                    ? 'text-foreground-subtle hover:bg-background hover:text-foreground'
                    : 'text-foreground-subtle hover:bg-surface hover:text-foreground'
                }`}
                title={`Close ${label}`}
              >
                <X size={14} />
              </button>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function PrStateBadge({ prState }: { prState: string | undefined }): React.JSX.Element {
  switch (prState) {
    case 'merged':
      return (
        <span className="inline-flex size-5 items-center justify-center rounded-full bg-purple/15">
          <GitMerge size={12} strokeWidth={2} className="text-purple" />
        </span>
      )
    case 'closed':
      return (
        <span className="inline-flex size-5 items-center justify-center rounded-full bg-danger/15">
          <GitPullRequestClosed size={12} strokeWidth={2} className="text-danger" />
        </span>
      )
    case 'draft':
      return (
        <span className="inline-flex size-5 items-center justify-center rounded-full bg-foreground-muted/15">
          <GitPullRequestDraft size={12} strokeWidth={2} className="text-foreground-muted" />
        </span>
      )
    case 'open':
      return (
        <span className="inline-flex size-5 items-center justify-center rounded-full bg-success/15">
          <GitPullRequest size={12} strokeWidth={2} className="text-success" />
        </span>
      )
    default:
      return (
        <span className="inline-flex size-5 items-center justify-center rounded-full bg-foreground-subtle/15">
          <GitPullRequest size={12} strokeWidth={2} className="text-foreground-subtle" />
        </span>
      )
  }
}

function getWorkspaceTabPresentation(tab: WorkspaceTab): { icon: ReactNode; label: string } {
  switch (tab.kind) {
    case 'welcome':
      return {
        icon: <Home size={14} strokeWidth={1.8} className="text-foreground-subtle" />,
        label: 'Welcome'
      }
    case 'file':
      return {
        icon: <FileCode2 size={14} strokeWidth={1.8} className="text-foreground-subtle" />,
        label: getPathBasename(tab.path)
      }
    case 'pull-request-list':
      return {
        icon: (
          <span className="inline-flex size-5 items-center justify-center rounded-full bg-accent/15">
            <GitGraph size={12} strokeWidth={2} className="text-accent" />
          </span>
        ),
        label: 'Pull Requests'
      }
    case 'pull-request':
      return {
        icon: <PrStateBadge prState={tab.prState} />,
        label: tab.title ?? `PR #${tab.number}`
      }
  }
}
