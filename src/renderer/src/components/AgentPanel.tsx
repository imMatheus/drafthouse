import { Check, Plus, X } from 'lucide-react'
import { cn } from '../lib/cn'
import type { AgentSession } from '../../../shared/types'
import AgentSpinner from '../pages/workspace/AgentSpinner'
import Tooltip from './Tooltip'

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
    return <Check size={12} className="text-success shrink-0" />
  }

  if (status === 'error' || status === 'cancelled') {
    return <X size={12} className="text-foreground-subtle shrink-0" />
  }

  return null
}

export default function AgentPanel({ sessions, activeSessionId, onSelectSession, onNewSession }: AgentPanelProps) {
  const sortedSessions = [...sessions].filter((s) => !s.context?.inline).reverse()

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
            <button
              key={session.id}
              onClick={() => onSelectSession(session.id)}
              className={cn(
                'flex w-full items-center gap-2 px-4 py-[3px] text-left transition-colors',
                session.id === activeSessionId
                  ? 'bg-surface-hover text-foreground'
                  : 'text-foreground-muted hover:bg-surface-hover/60'
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
