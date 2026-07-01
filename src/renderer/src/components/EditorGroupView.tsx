import { type ReactNode, useState } from 'react'
import { cn } from '../lib/cn'
import type { DropPosition, EditorGroup } from '../lib/editorLayout'
import type { WorkspaceTab } from '../lib/workspaceTabs'
import WorkspaceTabBar from './WorkspaceTabBar'

// Where a drag lands. The thing being dragged (a tab moved between groups, or a
// file/PR/session dragged in from the sidebar) lives in the lifted drag state.
export interface EditorDropTarget {
  targetGroupId: string
  position: DropPosition
  // Insertion index within the target group's tab list (center drops only).
  index?: number
}

export interface EditorGroupHandlers {
  onSelectTab: (groupId: string, tabId: WorkspaceTab['id']) => void
  onCloseTab: (groupId: string, tabId: WorkspaceTab['id']) => void
  onFocusGroup: (groupId: string) => void
  onSplitGroup: (groupId: string) => void
  onTabDragStart: (tab: WorkspaceTab, fromGroupId: string) => void
  onTabDragEnd: () => void
  onDrop: (target: EditorDropTarget) => void
  onResizeSplit: (splitId: string, sizes: number[]) => void
}

interface EditorGroupViewProps {
  group: EditorGroup
  isActiveGroup: boolean
  // True while any drag (internal tab or external sidebar item) is in progress.
  dragActive: boolean
  handlers: EditorGroupHandlers
  renderContent: (tab: WorkspaceTab | null) => ReactNode
}

export default function EditorGroupView({
  group,
  isActiveGroup,
  dragActive,
  handlers,
  renderContent
}: EditorGroupViewProps) {
  const [dropZone, setDropZone] = useState<DropPosition | null>(null)
  const activeTab = group.tabs.find((tab) => tab.id === group.activeTabId) ?? null

  const contentClass =
    activeTab &&
    (activeTab.kind === 'file' ||
      activeTab.kind === 'pull-request-file' ||
      activeTab.kind === 'diff' ||
      activeTab.kind === 'agent')
      ? 'overflow-hidden'
      : activeTab
        ? 'overflow-y-auto p-5'
        : 'overflow-hidden'

  return (
    <div
      className={cn('flex min-h-0 min-w-0 flex-1 flex-col')}
      onMouseDownCapture={() => {
        if (!isActiveGroup) handlers.onFocusGroup(group.id)
      }}
    >
      <WorkspaceTabBar
        tabs={group.tabs}
        activeTabId={group.activeTabId}
        isActiveGroup={isActiveGroup}
        isDragActive={dragActive}
        onSelectTab={(tabId) => handlers.onSelectTab(group.id, tabId)}
        onCloseTab={(tabId) => handlers.onCloseTab(group.id, tabId)}
        onTabDragStart={(tab) => handlers.onTabDragStart(tab, group.id)}
        onTabDragEnd={handlers.onTabDragEnd}
        onDropAtIndex={(index) => handlers.onDrop({ targetGroupId: group.id, position: 'center', index })}
        onSplit={() => handlers.onSplitGroup(group.id)}
      />

      <div className="relative min-h-0 flex-1">
        <div className={cn('h-full', contentClass)}>{renderContent(activeTab)}</div>

        {dragActive ? (
          <div
            className="absolute inset-0 z-20"
            onDragOver={(e) => {
              e.preventDefault()
              e.dataTransfer.dropEffect = 'move'
              setDropZone(computeDropZone(e.clientX, e.clientY, e.currentTarget.getBoundingClientRect()))
            }}
            onDragLeave={(e) => {
              // Only clear when actually leaving the overlay, not when moving over
              // a child highlight rectangle.
              if (e.currentTarget === e.target) setDropZone(null)
            }}
            onDrop={(e) => {
              e.preventDefault()
              const zone = computeDropZone(e.clientX, e.clientY, e.currentTarget.getBoundingClientRect())
              setDropZone(null)
              handlers.onDrop({ targetGroupId: group.id, position: zone })
            }}
          >
            {dropZone ? (
              <div
                className={cn(
                  'bg-accent/20 border-accent pointer-events-none absolute rounded-sm border-2',
                  dropZoneClass(dropZone)
                )}
              />
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  )
}

function computeDropZone(clientX: number, clientY: number, rect: DOMRect): DropPosition {
  const x = (clientX - rect.left) / rect.width
  const y = (clientY - rect.top) / rect.height
  const left = x
  const right = 1 - x
  const up = y
  const down = 1 - y
  const min = Math.min(left, right, up, down)

  if (min > 0.25) return 'center'
  if (min === left) return 'left'
  if (min === right) return 'right'
  if (min === up) return 'up'
  return 'down'
}

function dropZoneClass(zone: DropPosition): string {
  switch (zone) {
    case 'center':
      return 'inset-2'
    case 'left':
      return 'top-2 bottom-2 left-2 w-[calc(50%-0.5rem)]'
    case 'right':
      return 'top-2 bottom-2 right-2 w-[calc(50%-0.5rem)]'
    case 'up':
      return 'left-2 right-2 top-2 h-[calc(50%-0.5rem)]'
    case 'down':
      return 'left-2 right-2 bottom-2 h-[calc(50%-0.5rem)]'
  }
}
