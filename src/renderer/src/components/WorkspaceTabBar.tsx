import type { ReactNode } from 'react'
import { FileCode2, GitPullRequest, Home, Rows3, X } from 'lucide-react'
import { getPathBasename } from '../lib/path'
import type { WorkspaceTab } from '../lib/workspaceTabs'

interface WorkspaceTabBarProps {
  tabs: WorkspaceTab[]
  activeTabId: WorkspaceTab['id'] | null
  onSelectTab: (tabId: WorkspaceTab['id']) => void
  onCloseTab: (tabId: WorkspaceTab['id']) => void
}

export default function WorkspaceTabBar({
  tabs,
  activeTabId,
  onSelectTab,
  onCloseTab
}: WorkspaceTabBarProps) {
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
                isActive
                  ? 'border-border bg-surface'
                  : 'border-transparent bg-background hover:bg-surface-hover/60'
              }`}
            >
              <button
                onClick={() => onSelectTab(tab.id)}
                className="flex min-w-0 flex-1 items-center gap-2 px-3 py-2 text-left"
              >
                <span className={isActive ? 'text-foreground' : 'text-foreground-subtle'}>{icon}</span>
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

function getWorkspaceTabPresentation(tab: WorkspaceTab): { icon: ReactNode; label: string } {
  switch (tab.kind) {
    case 'welcome':
      return {
        icon: <Home size={14} strokeWidth={1.8} />,
        label: 'Welcome'
      }
    case 'file':
      return {
        icon: <FileCode2 size={14} strokeWidth={1.8} />,
        label: getPathBasename(tab.path)
      }
    case 'pull-request-list':
      return {
        icon: <Rows3 size={14} strokeWidth={1.8} />,
        label: 'Pull Requests'
      }
    case 'pull-request':
      return {
        icon: <GitPullRequest size={14} strokeWidth={1.8} />,
        label: tab.title ?? `PR #${tab.number}`
      }
  }
}
