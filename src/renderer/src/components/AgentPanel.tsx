import { Ban, Check, Plus, Trash2, X } from 'lucide-react'
import { cn } from '../lib/cn'
import type { AgentSessionMeta } from '../../../shared/types'
import AgentSpinner from '../pages/workspace/AgentSpinner'
import Tooltip from './Tooltip'

interface AgentPanelProps {
  sessions: AgentSessionMeta[]
  activeSessionId: string | null
  onSelectSession: (id: string) => void
  onNewSession: () => void
  onDeleteSession?: (id: string) => void
  onSessionDragStart?: (session: AgentSessionMeta) => void
  onDragEnd?: () => void
}

function StatusIndicator({ status }: { status: AgentSessionMeta['status'] }) {
  if (status === 'running') {
    return <AgentSpinner />
  }

  if (status === 'completed') {
    return <Check size={12} className="text-success shrink-0" />
  }

  if (status === 'interrupted') {
    return <Ban size={12} className="text-foreground-subtle shrink-0" />
  }

  if (status === 'error' || status === 'cancelled') {
    return <X size={12} className="text-foreground-subtle shrink-0" />
  }

  return null
}

function relativeTime(timestamp: number): string {
  const seconds = Math.floor((Date.now() - timestamp) / 1000)
  if (seconds < 60) return 'now'
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h`
  const days = Math.floor(hours / 24)
  return `${days}d`
}

export default function AgentPanel({
  sessions,
  activeSessionId,
  onSelectSession,
  onNewSession,
  onDeleteSession,
  onSessionDragStart,
  onDragEnd
}: AgentPanelProps) {
  const sortedSessions = [...sessions].reverse()

  return (
    <div className="border-border bg-surface flex min-h-0 w-60 shrink-0 flex-col border-r">
      <div className="flex items-center justify-between px-4 py-3">
        <p className="text-foreground-muted text-[10px] font-semibold tracking-wider uppercase">Agent</p>
        <Tooltip label="New session" side="bottom">
          <button
            onClick={onNewSession}
            className="text-foreground-subtle hover:bg-surface-hover hover:text-foreground flex size-5 items-center justify-center rounded transition-colors"
            aria-label="New session"
          >
            <Plus size={14} />
          </button>
        </Tooltip>
      </div>

      <div className="flex-1 overflow-y-auto">
        {sortedSessions.length === 0 ? (
          <p className="text-foreground-subtle px-4 py-4 text-xs">No sessions yet</p>
        ) : (
          sortedSessions.map((session) => (
            <div
              key={session.id}
              draggable={onSessionDragStart != null}
              onDragStart={(e) => {
                onSessionDragStart?.(session)
                e.dataTransfer.effectAllowed = 'copyMove'
                e.dataTransfer.setData('text/plain', session.prompt)
              }}
              onDragEnd={() => onDragEnd?.()}
              onClick={() => onSelectSession(session.id)}
              className={cn(
                'group flex w-full cursor-pointer items-center gap-2 px-4 py-[3px] text-left transition-colors',
                session.id === activeSessionId
                  ? 'bg-surface-hover text-foreground'
                  : 'text-foreground-muted hover:bg-surface-hover/60'
              )}
            >
              <StatusIndicator status={session.status} />
              <p className="min-w-0 flex-1 truncate text-xs">
                {session.context?.label ? (
                  <span className="text-foreground-subtle">{session.context.label} · </span>
                ) : null}
                {session.prompt}
              </p>
              <span className="text-foreground-subtle shrink-0 text-[10px] tabular-nums group-hover:hidden">
                {relativeTime(session.lastActivityAt)}
              </span>
              {onDeleteSession && (
                <Tooltip label="Delete session" side="bottom">
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      onDeleteSession(session.id)
                    }}
                    className="text-foreground-subtle hover:text-danger hidden size-4 shrink-0 items-center justify-center rounded transition-colors group-hover:flex"
                    aria-label="Delete session"
                  >
                    <Trash2 size={11} />
                  </button>
                </Tooltip>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  )
}
