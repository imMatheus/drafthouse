import { type ReactNode, useState } from 'react'
import {
  GitCommit,
  GitMerge,
  GitPullRequest,
  GitPullRequestClosed,
  GitPullRequestDraft,
  Home,
  Terminal,
  X
} from 'lucide-react'
import { cn } from '../lib/cn'
import { getPathBasename } from '../lib/path'
import { FileIcon } from './FileIcon'
import Tooltip from './Tooltip'
import type { WorkspaceTab } from '../lib/workspaceTabs'

interface WorkspaceTabBarProps {
  tabs: WorkspaceTab[]
  activeTabId: WorkspaceTab['id'] | null
  onSelectTab: (tabId: WorkspaceTab['id']) => void
  onCloseTab: (tabId: WorkspaceTab['id']) => void
  onReorderTabs: (tabs: WorkspaceTab[]) => void
}

export default function WorkspaceTabBar({
  tabs,
  activeTabId,
  onSelectTab,
  onCloseTab,
  onReorderTabs
}: WorkspaceTabBarProps) {
  const [dragTabId, setDragTabId] = useState<WorkspaceTab['id'] | null>(null)
  const [dropTargetId, setDropTargetId] = useState<WorkspaceTab['id'] | null>(null)

  if (tabs.length === 0) {
    return null
  }

  const handleDrop = (targetTabId: WorkspaceTab['id']): void => {
    if (!dragTabId || dragTabId === targetTabId) return

    const dragIndex = tabs.findIndex((t) => t.id === dragTabId)
    const targetIndex = tabs.findIndex((t) => t.id === targetTabId)
    if (dragIndex === -1 || targetIndex === -1) return

    const reordered = [...tabs]
    const [moved] = reordered.splice(dragIndex, 1)
    reordered.splice(targetIndex, 0, moved)
    onReorderTabs(reordered)
  }

  return (
    <div className="border-border bg-background border-b">
      <div className="flex min-h-10 items-stretch overflow-x-auto px-2 pt-1.5">
        {tabs.map((tab) => {
          const { icon, label } = getWorkspaceTabPresentation(tab)
          const isActive = tab.id === activeTabId
          const isDropTarget = tab.id === dropTargetId && dragTabId !== null && dragTabId !== tab.id

          return (
            <div
              key={tab.id}
              draggable
              onDragStart={(e) => {
                setDragTabId(tab.id)
                e.dataTransfer.effectAllowed = 'move'
              }}
              onDragOver={(e) => {
                e.preventDefault()
                e.dataTransfer.dropEffect = 'move'
                setDropTargetId(tab.id)
              }}
              onDragLeave={() => setDropTargetId(null)}
              onDrop={(e) => {
                e.preventDefault()
                setDropTargetId(null)
                handleDrop(tab.id)
              }}
              onDragEnd={() => {
                setDragTabId(null)
                setDropTargetId(null)
              }}
              className={cn(
                'group mr-1.5 flex max-w-60 min-w-0 shrink-0 cursor-pointer items-stretch rounded-t-lg border border-b-0 transition-colors',
                isActive ? 'border-border bg-surface' : 'bg-background hover:bg-surface-hover/60 border-transparent',
                isDropTarget && 'border-l-accent border-l-2'
              )}
            >
              <button
                onClick={() => onSelectTab(tab.id)}
                className="flex min-w-0 flex-1 items-center gap-2 px-3 py-2 text-left"
              >
                {icon}
                <span
                  className={cn('truncate text-xs font-medium', isActive ? 'text-foreground' : 'text-foreground-muted')}
                >
                  {label}
                </span>
              </button>

              <Tooltip label={`Close ${label}`} side="bottom">
                <button
                  onClick={() => onCloseTab(tab.id)}
                  className="text-foreground-subtle hover:text-foreground flex items-center justify-center rounded-md px-2 transition-colors"
                  aria-label={`Close ${label}`}
                >
                  <X size={14} />
                </button>
              </Tooltip>
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
        <span className="bg-purple/15 inline-flex size-5 items-center justify-center rounded-full">
          <GitMerge size={12} strokeWidth={2} className="text-purple" />
        </span>
      )
    case 'closed':
      return (
        <span className="bg-danger/15 inline-flex size-5 items-center justify-center rounded-full">
          <GitPullRequestClosed size={12} strokeWidth={2} className="text-danger" />
        </span>
      )
    case 'draft':
      return (
        <span className="bg-foreground-muted/15 inline-flex size-5 items-center justify-center rounded-full">
          <GitPullRequestDraft size={12} strokeWidth={2} className="text-foreground-muted" />
        </span>
      )
    case 'open':
      return (
        <span className="bg-success/15 inline-flex size-5 items-center justify-center rounded-full">
          <GitPullRequest size={12} strokeWidth={2} className="text-success" />
        </span>
      )
    default:
      return (
        <span className="bg-foreground-subtle/15 inline-flex size-5 items-center justify-center rounded-full">
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
        icon: <FileIcon name={getPathBasename(tab.path)} size={14} />,
        label: getPathBasename(tab.path)
      }
    case 'diff':
      return {
        icon: <FileIcon name={getPathBasename(tab.path)} size={14} />,
        label: `${getPathBasename(tab.path)} (${tab.staged ? 'index' : 'working tree'})`
      }
    case 'agent':
      return {
        icon: <Terminal size={14} strokeWidth={1.8} className="text-accent" />,
        label: tab.title
      }
    case 'pull-request':
      return {
        icon: <PrStateBadge prState={tab.prState} />,
        label: tab.title ?? `PR #${tab.number}`
      }
    case 'commit':
      return {
        icon: <GitCommit size={14} strokeWidth={1.8} className="text-accent" />,
        label: tab.title ?? `Commit ${tab.sha.slice(0, 7)}`
      }
  }
}
