import { Check, Plus, X } from 'lucide-react'
import { cn } from '../../lib/cn'
import type { AgentSession } from '../../../../shared/types'
import AgentSpinner from './AgentSpinner'

interface AgentSessionListProps {
  sessions: AgentSession[]
  activeSessionId: string | null
  onSelectSession: (id: string) => void
  onNewSession: () => void
}

function StatusIndicator({ status }: { status: AgentSession['status'] }) {
  if (status === 'running') {
    return <AgentSpinner />
  }

  if (status === 'completed') {
    return <Check size={12} className="shrink-0 text-success" />
  }

  if (status === 'error' || status === 'cancelled') {
    return <X size={12} className="shrink-0 text-foreground-subtle" />
  }

  return null
}

export default function AgentSessionList({
  sessions,
  activeSessionId,
  onSelectSession,
  onNewSession
}: AgentSessionListProps) {
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
                'flex w-full items-center gap-2.5 px-3 py-2.5 text-left transition-colors',
                session.id === activeSessionId
                  ? 'bg-surface-hover'
                  : 'hover:bg-surface-hover'
              )}
            >
              <StatusIndicator status={session.status} />
              <p className="min-w-0 flex-1 truncate text-xs text-foreground">{session.prompt}</p>
            </button>
          ))
        )}
      </div>
    </div>
  )
}
