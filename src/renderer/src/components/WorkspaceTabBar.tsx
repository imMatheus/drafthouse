import { type ReactNode, useState } from 'react'
import {
  GitCommit,
  GitMerge,
  GitPullRequest,
  GitPullRequestClosed,
  GitPullRequestDraft,
  Home,
  SplitSquareHorizontal,
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
  isActiveGroup: boolean
  showActiveIndicator: boolean
  // True while any tab (in this or another group) is being dragged.
  isDragActive: boolean
  onSelectTab: (tabId: WorkspaceTab['id']) => void
  onCloseTab: (tabId: WorkspaceTab['id']) => void
  onTabDragStart: (tab: WorkspaceTab) => void
  onTabDragEnd: () => void
  // Drop a dragged tab into this group's strip at the given insertion index.
  onDropAtIndex: (index: number) => void
  onSplit: () => void
}

export default function WorkspaceTabBar({
  tabs,
  activeTabId,
  isActiveGroup,
  showActiveIndicator,
  isDragActive,
  onSelectTab,
  onCloseTab,
  onTabDragStart,
  onTabDragEnd,
  onDropAtIndex,
  onSplit
}: WorkspaceTabBarProps) {
  const [dropIndex, setDropIndex] = useState<number | null>(null)

  if (tabs.length === 0) {
    return null
  }

  return (
    <div className={cn('border-border bg-background relative border-b', !isActiveGroup && 'opacity-80')}>
      {showActiveIndicator ? <div className="bg-accent absolute inset-x-0 top-0 z-10 h-0.5" /> : null}
      <div className="flex min-h-9 items-stretch">
        <div
          className="flex flex-1 items-stretch gap-1 overflow-x-auto px-2 pt-1"
          onDragOver={(e) => {
            if (!isDragActive) return
            e.preventDefault()
            e.dataTransfer.dropEffect = 'move'
            setDropIndex(tabs.length)
          }}
          onDrop={(e) => {
            e.preventDefault()
            setDropIndex(null)
            onDropAtIndex(tabs.length)
          }}
        >
          {tabs.map((tab, index) => {
            const { icon, label } = getWorkspaceTabPresentation(tab)
            const isActive = tab.id === activeTabId
            const showBar = isDragActive && dropIndex === index

            return (
              <div
                key={tab.id}
                draggable
                onDragStart={(e) => {
                  onTabDragStart(tab)
                  e.dataTransfer.effectAllowed = 'move'
                  e.dataTransfer.setData('text/plain', tab.id)
                }}
                onDragOver={(e) => {
                  if (!isDragActive) return
                  e.preventDefault()
                  e.stopPropagation()
                  e.dataTransfer.dropEffect = 'move'
                  setDropIndex(index)
                }}
                onDrop={(e) => {
                  e.preventDefault()
                  e.stopPropagation()
                  setDropIndex(null)
                  onDropAtIndex(index)
                }}
                onDragEnd={() => {
                  onTabDragEnd()
                  setDropIndex(null)
                }}
                className={cn(
                  'group flex max-w-52 min-w-0 shrink-0 cursor-pointer items-stretch rounded-t-md border border-b-0 transition-colors',
                  isActive ? 'border-border bg-surface' : 'hover:bg-surface-hover border-transparent',
                  showBar && 'border-l-accent border-l-2'
                )}
              >
                <button
                  onClick={() => onSelectTab(tab.id)}
                  className="flex min-w-0 flex-1 items-center gap-1.5 pr-1.5 pl-2.5 text-left"
                >
                  <span className="flex size-4 shrink-0 items-center justify-center">{icon}</span>
                  <span
                    className={cn(
                      'truncate text-xs font-medium',
                      isActive ? 'text-foreground' : 'text-foreground-muted'
                    )}
                  >
                    {label}
                  </span>
                </button>

                <Tooltip label={`Close ${label}`} side="bottom">
                  <button
                    onClick={() => onCloseTab(tab.id)}
                    className={cn(
                      'text-foreground-subtle hover:bg-interactive hover:text-foreground my-1 mr-1 flex items-center justify-center rounded px-1 transition-[opacity,background-color,color]',
                      isActive ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
                    )}
                    aria-label={`Close ${label}`}
                  >
                    <X size={12} />
                  </button>
                </Tooltip>
              </div>
            )
          })}

          {isDragActive && dropIndex === tabs.length ? (
            <div className="bg-accent my-1.5 w-0.5 shrink-0 self-stretch rounded" />
          ) : null}
        </div>

        <div className="flex shrink-0 items-center px-1.5">
          <Tooltip label="Split editor right" side="bottom">
            <button
              onClick={onSplit}
              className="text-foreground-subtle hover:bg-interactive hover:text-foreground flex size-7 items-center justify-center rounded transition-colors"
              aria-label="Split editor right"
            >
              <SplitSquareHorizontal size={15} strokeWidth={1.8} />
            </button>
          </Tooltip>
        </div>
      </div>
    </div>
  )
}

const TAB_ICON_SIZE = 14
const TAB_ICON_STROKE = 1.8

function PrStateIcon({ prState }: { prState: string | undefined }): React.JSX.Element {
  switch (prState) {
    case 'merged':
      return <GitMerge size={TAB_ICON_SIZE} strokeWidth={TAB_ICON_STROKE} className="text-purple" />
    case 'closed':
      return <GitPullRequestClosed size={TAB_ICON_SIZE} strokeWidth={TAB_ICON_STROKE} className="text-danger" />
    case 'draft':
      return (
        <GitPullRequestDraft size={TAB_ICON_SIZE} strokeWidth={TAB_ICON_STROKE} className="text-foreground-muted" />
      )
    case 'open':
      return <GitPullRequest size={TAB_ICON_SIZE} strokeWidth={TAB_ICON_STROKE} className="text-success" />
    default:
      return <GitPullRequest size={TAB_ICON_SIZE} strokeWidth={TAB_ICON_STROKE} className="text-foreground-subtle" />
  }
}

function getWorkspaceTabPresentation(tab: WorkspaceTab): { icon: ReactNode; label: string } {
  switch (tab.kind) {
    case 'welcome':
      return {
        icon: <Home size={TAB_ICON_SIZE} strokeWidth={TAB_ICON_STROKE} className="text-foreground-subtle" />,
        label: 'Welcome'
      }
    case 'file':
      return {
        icon: <FileIcon name={getPathBasename(tab.path)} size={TAB_ICON_SIZE} />,
        label: getPathBasename(tab.path)
      }
    case 'diff':
      return {
        icon: <FileIcon name={getPathBasename(tab.path)} size={TAB_ICON_SIZE} />,
        label: `${getPathBasename(tab.path)} (${tab.staged ? 'index' : 'working tree'})`
      }
    case 'agent':
      return {
        icon: <Terminal size={TAB_ICON_SIZE} strokeWidth={TAB_ICON_STROKE} className="text-accent" />,
        label: tab.title
      }
    case 'pull-request':
      return {
        icon: <PrStateIcon prState={tab.prState} />,
        label: tab.title ?? `PR #${tab.number}`
      }
    case 'commit':
      return {
        icon: <GitCommit size={TAB_ICON_SIZE} strokeWidth={TAB_ICON_STROKE} className="text-accent" />,
        label: tab.title ?? `Commit ${tab.sha.slice(0, 7)}`
      }
  }
}
