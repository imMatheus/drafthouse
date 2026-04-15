import { Check, Plus, X } from 'lucide-react'
import { cn } from '../lib/cn'
import type { AgentSession } from '../../../shared/types'
import AgentSpinner from '../pages/workspace/AgentSpinner'

interface AgentPanelProps {
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

export default function AgentPanel({
  sessions,
  activeSessionId,
  onSelectSession,
  onNewSession
}: AgentPanelProps) {
  const sortedSessions = [...sessions].filter((s) => !s.context?.inline).reverse()

  return (
    <div className="flex h-screen w-60 shrink-0 flex-col border-r border-border bg-surface">
      <div className="flex items-center justify-between px-4 py-3">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-foreground-muted">
          Agent
        </p>
        <button
          onClick={onNewSession}
          className="flex size-5 items-center justify-center rounded text-foreground-subtle transition-colors hover:bg-surface-hover hover:text-foreground"
          title="New session"
        >
          <Plus size={14} />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto">
        {sortedSessions.length === 0 ? (
          <p className="px-4 py-4 text-xs text-foreground-subtle">No sessions yet</p>
        ) : (
          sortedSessions.map((session) => (
            <button
              key={session.id}
              onClick={() => onSelectSession(session.id)}
              className={cn(
                'flex w-full items-center gap-2 px-4 py-[3px] text-left transition-colors hover:bg-surface-hover',
                session.id === activeSessionId
                  ? 'bg-surface-hover text-foreground'
                  : 'text-foreground-muted'
              )}
            >
              <StatusIndicator status={session.status} />
              <p className="min-w-0 flex-1 truncate text-xs">{session.prompt}</p>
            </button>
          ))
        )}
      </div>
    </div>
  )
}
