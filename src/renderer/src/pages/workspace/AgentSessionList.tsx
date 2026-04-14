import { Plus } from 'lucide-react'
import { cn } from '../../lib/cn'
import type { AgentSession } from '../../../../shared/types'

interface AgentSessionListProps {
  sessions: AgentSession[]
  activeSessionId: string | null
  onSelectSession: (id: string) => void
  onNewSession: () => void
}

function formatRelativeTime(timestamp: number): string {
  const seconds = Math.floor((Date.now() - timestamp) / 1000)
  if (seconds < 60) return 'just now'
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  return `${days}d ago`
}

function StatusDot({ status }: { status: AgentSession['status'] }) {
  return (
    <span
      className={cn(
        'size-2 shrink-0 rounded-full',
        status === 'running' && 'animate-pulse bg-success',
        status === 'completed' && 'bg-foreground-subtle',
        status === 'error' && 'bg-danger',
        status === 'cancelled' && 'bg-foreground-subtle'
      )}
    />
  )
}

export default function AgentSessionList({
  sessions,
  activeSessionId,
  onSelectSession,
  onNewSession
}: AgentSessionListProps) {
  // Show newest first
  const sortedSessions = [...sessions].reverse()

  return (
    <div className="flex h-full w-60 shrink-0 flex-col border-r border-border bg-surface">
      <div className="flex items-center justify-between border-b border-border px-3 py-2">
        <span className="text-xs font-medium uppercase tracking-wide text-foreground-muted">Sessions</span>
        <button
          onClick={onNewSession}
          className="flex size-6 items-center justify-center rounded text-foreground-subtle transition-colors hover:bg-surface-hover hover:text-foreground"
          title="New session"
        >
          <Plus size={14} />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto">
        {sortedSessions.length === 0 ? (
          <p className="px-3 py-4 text-xs text-foreground-subtle">No sessions yet</p>
        ) : (
          sortedSessions.map((session) => (
            <button
              key={session.id}
              onClick={() => onSelectSession(session.id)}
              className={cn(
                'flex w-full items-start gap-2 px-3 py-2.5 text-left transition-colors',
                session.id === activeSessionId
                  ? 'bg-surface-hover'
                  : 'hover:bg-surface-hover'
              )}
            >
              <StatusDot status={session.status} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-xs text-foreground">{session.prompt}</p>
                <p className="mt-0.5 text-[10px] text-foreground-subtle">
                  {formatRelativeTime(session.startedAt)}
                </p>
              </div>
            </button>
          ))
        )}
      </div>
    </div>
  )
}
