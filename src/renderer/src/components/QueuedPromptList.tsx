import { FileText, X } from 'lucide-react'
import { cn } from '../lib/cn'
import type { QueuedAgentPrompt } from '../contexts/WorkspaceContext'
import HighlightedMentionText from './HighlightedMentionText'
import Tooltip from './Tooltip'

/**
 * Follow-ups waiting for the running turn to finish. Rendered above the
 * prompt bar as dimmed user bubbles, each cancellable until it's sent.
 */
export default function QueuedPromptList({
  items,
  onCancel,
  compact
}: {
  items: QueuedAgentPrompt[]
  onCancel: (promptId: string) => void
  compact?: boolean
}) {
  if (items.length === 0) return null

  return (
    <div className="flex flex-col items-end gap-1.5">
      {items.map((item) => (
        <div key={item.id} className="group flex max-w-[80%] items-center gap-1.5">
          <Tooltip label="Remove from queue" side="left">
            <button
              onClick={() => onCancel(item.id)}
              className="text-foreground-subtle hover:bg-surface-hover hover:text-danger flex size-5 shrink-0 items-center justify-center rounded-full opacity-0 transition-opacity group-hover:opacity-100"
              aria-label="Remove from queue"
            >
              <X size={12} />
            </button>
          </Tooltip>
          <div
            className={cn(
              'bg-interactive/60 text-foreground-subtle min-w-0 rounded-2xl px-3 py-2',
              compact ? 'text-xs' : 'text-sm'
            )}
          >
            <span className="line-clamp-3 whitespace-pre-wrap">
              <HighlightedMentionText text={item.prompt} />
            </span>
            {item.files && item.files.length > 0 && (
              <span className="mt-1 flex items-center gap-1 text-[11px]">
                <FileText size={11} className="shrink-0" />
                {item.files.length} file{item.files.length !== 1 ? 's' : ''}
              </span>
            )}
          </div>
        </div>
      ))}
    </div>
  )
}
