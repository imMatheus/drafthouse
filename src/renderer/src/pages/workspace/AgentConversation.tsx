import { useEffect, useRef } from 'react'
import { Loader2 } from 'lucide-react'
import type { AgentSession, AgentStreamEvent, AgentStreamResult } from '../../../../shared/types'
import AgentMessageBlock, { type PermissionCallbacks } from './AgentMessageBlock'

const PERMISSION_DENIAL_PREFIX = 'Claude requested permissions to'

interface AgentConversationProps {
  session: AgentSession
  onAllowOnce: () => void
  onAlwaysAllow: () => void
  onRespondDifferently: (message: string) => void
}

function isPermissionDenialEvent(event: AgentStreamEvent): boolean {
  return (
    event.type === 'user' &&
    event.message.content.some(
      (c) =>
        c.type === 'tool_result' &&
        'is_error' in c &&
        typeof c.content === 'string' &&
        c.content.startsWith(PERMISSION_DENIAL_PREFIX)
    )
  )
}

function findLastDenialIndex(events: AgentStreamEvent[]): number {
  let lastInitIndex = -1
  for (let i = events.length - 1; i >= 0; i--) {
    if (events[i].type === 'system' && (events[i] as { subtype?: string }).subtype === 'init') {
      lastInitIndex = i
      break
    }
  }

  for (let i = events.length - 1; i > lastInitIndex; i--) {
    if (isPermissionDenialEvent(events[i])) return i
  }
  return -1
}

export default function AgentConversation({
  session,
  onAllowOnce,
  onAlwaysAllow,
  onRespondDifferently
}: AgentConversationProps) {
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [session.events.length])

  let lastResultEvent: AgentStreamResult | null = null
  for (let i = session.events.length - 1; i >= 0; i--) {
    const e = session.events[i]
    if (e.type === 'result') {
      lastResultEvent = e
      break
    }
  }

  const lastDenialIndex = session.status !== 'running' ? findLastDenialIndex(session.events) : -1

  const permissionCallbacks: PermissionCallbacks = {
    onAllowOnce,
    onAlwaysAllow,
    onRespondDifferently
  }

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="mx-auto max-w-3xl px-6 py-6">
        {/* Initial user prompt — right-aligned bubble */}
        <div className="mb-6 flex justify-end">
          <div className="max-w-[80%] rounded-2xl bg-surface px-4 py-2.5">
            <p className="text-sm text-foreground whitespace-pre-wrap">{session.prompt}</p>
          </div>
        </div>

        {/* Agent messages */}
        {session.events.map((event, i) => (
          <AgentMessageBlock
            key={i}
            event={event}
            permissionCallbacks={permissionCallbacks}
            isLastDenial={i === lastDenialIndex}
          />
        ))}

        {/* Running indicator */}
        {session.status === 'running' && (
          <div className="flex items-center gap-2 py-2 text-foreground-muted">
            <Loader2 size={14} className="animate-spin" />
            <span className="text-xs">Agent is working...</span>
          </div>
        )}

        {/* Result summary */}
        {lastResultEvent && session.status !== 'running' && (
          <div className="mt-4 rounded-md border border-border bg-surface px-3 py-2">
            <div className="flex items-center gap-3 text-xs text-foreground-subtle">
              <span>{lastResultEvent.num_turns} turn{lastResultEvent.num_turns !== 1 ? 's' : ''}</span>
              <span>{(lastResultEvent.duration_ms / 1000).toFixed(1)}s</span>
              <span>${lastResultEvent.total_cost_usd.toFixed(4)}</span>
            </div>
          </div>
        )}

        {/* Error state */}
        {session.status === 'error' && !lastResultEvent && (
          <div className="mt-4 rounded-md border border-danger/30 bg-danger/5 px-3 py-2">
            <p className="text-xs text-danger">Agent encountered an error</p>
          </div>
        )}

        <div ref={bottomRef} />
      </div>
    </div>
  )
}
