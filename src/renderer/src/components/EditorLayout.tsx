import { Fragment, type ReactNode, useRef, useState } from 'react'
import { cn } from '../lib/cn'
import { MIN_SPLIT_FRACTION, type LayoutNode, type SplitNode } from '../lib/editorLayout'
import type { WorkspaceTab } from '../lib/workspaceTabs'
import EditorGroupView, { type EditorGroupHandlers } from './EditorGroupView'

interface EditorLayoutProps {
  node: LayoutNode
  activeGroupId: string
  totalGroups: number
  dragActive: boolean
  handlers: EditorGroupHandlers
  renderContent: (tab: WorkspaceTab | null) => ReactNode
}

export default function EditorLayout(props: EditorLayoutProps) {
  const { node, ...rest } = props

  if (node.type === 'group') {
    return (
      <EditorGroupView
        group={node.group}
        isActiveGroup={node.group.id === rest.activeGroupId}
        totalGroups={rest.totalGroups}
        dragActive={rest.dragActive}
        handlers={rest.handlers}
        renderContent={rest.renderContent}
      />
    )
  }

  return <SplitContainer node={node} {...rest} />
}

function childKey(node: LayoutNode): string {
  return node.type === 'group' ? node.group.id : node.id
}

function SplitContainer({ node, ...props }: EditorLayoutProps & { node: SplitNode }) {
  const containerRef = useRef<HTMLDivElement>(null)
  const finalSizesRef = useRef<number[]>(node.sizes)
  const [liveSizes, setLiveSizes] = useState<number[] | null>(null)
  const sizes = liveSizes ?? node.sizes
  const isRow = node.direction === 'row'

  const handleResizeStart = (index: number, event: React.MouseEvent): void => {
    event.preventDefault()
    const container = containerRef.current
    if (!container) return

    const rect = container.getBoundingClientRect()
    const total = isRow ? rect.width : rect.height
    if (total <= 0) return

    const startPos = isRow ? event.clientX : event.clientY
    const startSizes = [...sizes]
    const a = startSizes[index]
    const b = startSizes[index + 1]
    const pairSum = a + b
    finalSizesRef.current = startSizes

    const handleMove = (moveEvent: MouseEvent): void => {
      const pos = isRow ? moveEvent.clientX : moveEvent.clientY
      const deltaFraction = (pos - startPos) / total
      let nextA = a + deltaFraction
      let nextB = b - deltaFraction
      if (nextA < MIN_SPLIT_FRACTION) {
        nextA = MIN_SPLIT_FRACTION
        nextB = pairSum - MIN_SPLIT_FRACTION
      }
      if (nextB < MIN_SPLIT_FRACTION) {
        nextB = MIN_SPLIT_FRACTION
        nextA = pairSum - MIN_SPLIT_FRACTION
      }
      const next = [...startSizes]
      next[index] = nextA
      next[index + 1] = nextB
      finalSizesRef.current = next
      setLiveSizes(next)
    }

    const handleUp = (): void => {
      window.removeEventListener('mousemove', handleMove)
      window.removeEventListener('mouseup', handleUp)
      setLiveSizes(null)
      props.handlers.onResizeSplit(node.id, finalSizesRef.current)
    }

    window.addEventListener('mousemove', handleMove)
    window.addEventListener('mouseup', handleUp)
  }

  return (
    <div
      ref={containerRef}
      className={cn(
        'flex min-h-0 min-w-0 flex-1',
        isRow ? 'flex-row' : 'flex-col',
        liveSizes !== null && 'select-none'
      )}
    >
      {node.children.map((child, index) => (
        <Fragment key={childKey(child)}>
          <div
            className="flex min-h-0 min-w-0 overflow-hidden"
            style={{ flexGrow: sizes[index] ?? 1, flexShrink: 1, flexBasis: 0 }}
          >
            <EditorLayout {...props} node={child} />
          </div>

          {index < node.children.length - 1 ? (
            <div
              onMouseDown={(e) => handleResizeStart(index, e)}
              className={cn(
                'group relative z-10 shrink-0',
                isRow ? 'w-px cursor-col-resize' : 'h-px cursor-row-resize'
              )}
            >
              <div className={cn('bg-border absolute', isRow ? 'inset-y-0 left-0 w-px' : 'inset-x-0 top-0 h-px')} />
              <div
                className={cn(
                  'group-hover:bg-accent/40 absolute transition-colors',
                  isRow ? 'inset-y-0 -left-1 w-2' : 'inset-x-0 -top-1 h-2'
                )}
              />
            </div>
          ) : null}
        </Fragment>
      ))}
    </div>
  )
}
