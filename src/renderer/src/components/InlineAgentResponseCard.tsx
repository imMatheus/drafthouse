import { useRef, useState } from 'react'
import { ArrowUp, ChevronRight, ExternalLink, Square } from 'lucide-react'
import type { AgentSessionMeta, AgentStreamEvent, AgentStreamResult } from '../../../shared/types'
import { cn } from '../lib/cn'
import claudeLogoUrl from '../assets/claude.png'
import AgentMessageBlock, {
  eventHasVisibleResponse,
  FILE_EDIT_TOOLS,
  getThinkingStepLabel,
  UserBubble
} from '../pages/workspace/AgentMessageBlock'
import AgentSpinner from '../pages/workspace/AgentSpinner'
import Tooltip from './Tooltip'
import { useAgentSessionEvents } from '../contexts/AgentSessionsContext'

export default function InlineAgentResponseCard({
  session,
  onStop,
  onContinue,
  onOpenInChat,
  variant = 'standalone',
  compact = false
}: {
  session: AgentSessionMeta
  onStop: () => void
  onContinue: (prompt: string) => void
  onOpenInChat: () => void
  variant?: 'standalone' | 'nested'
  compact?: boolean
}) {
  const [thinkingExpanded, setThinkingExpanded] = useState(false)
  const [followUp, setFollowUp] = useState('')
  const followUpRef = useRef<HTMLTextAreaElement>(null)
  const isRunning = session.status === 'running'
  const canContinue = !isRunning && session.cliSessionId !== null
  const events = useAgentSessionEvents(session.id)

  // Separate thinking steps from the response. File-edit tool uses (Edit/Write/MultiEdit)
  // are rendered inline in the response area; other tool uses stay in the collapsible
  // thinking accordion. An event can appear in both lists — response renders only the
  // visible blocks, thinking renders only the hidden tool uses.
  const thinkingEvents: AgentStreamEvent[] = []
  const responseEvents: AgentStreamEvent[] = []
  let thinkingStepCount = 0
  let latestThinkingLabel = ''

  for (const event of events) {
    if (event.type === 'assistant') {
      const hasVisible = eventHasVisibleResponse(event)
      let hasHiddenToolUse = false
      for (const b of event.message.content) {
        if (b.type === 'tool_use') {
          if (!FILE_EDIT_TOOLS.has(b.name)) {
            hasHiddenToolUse = true
            thinkingStepCount++
            latestThinkingLabel = getThinkingStepLabel(b.name, b.input)
          }
        }
      }
      if (hasVisible) responseEvents.push(event)
      if (hasHiddenToolUse) thinkingEvents.push(event)
    } else if (event.type === 'user') {
      const hasText = event.message.content.some((b) => b.type === 'text')
      if (hasText) {
        responseEvents.push(event)
      } else {
        thinkingEvents.push(event)
      }
    } else if (event.type === 'system' && event.subtype !== 'init') {
      thinkingEvents.push(event)
    }
  }

  const hasResponse = responseEvents.length > 0

  // Collect inline tool IDs for the expanded thinking view
  const inlineToolIds = new Set<string>()
  for (const event of thinkingEvents) {
    if (event.type === 'assistant') {
      for (const b of event.message.content) {
        if (b.type === 'tool_use' && (b.name === 'Read' || b.name === 'Glob' || b.name === 'Grep')) {
          inlineToolIds.add(b.id)
        }
      }
    }
  }

  let lastResultEvent: AgentStreamResult | null = null
  for (let i = events.length - 1; i >= 0; i--) {
    const e = events[i]
    if (e.type === 'result') {
      lastResultEvent = e
      break
    }
  }

  return (
    <div className={cn('bg-surface', variant === 'standalone' && 'border-border rounded-lg border')}>
      <div className={cn('flex items-center gap-2 px-4 py-3', variant === 'standalone' && 'border-border border-b')}>
        <img src={claudeLogoUrl} alt="Claude" className="size-6 rounded-full" />
        <span className="text-foreground text-sm font-medium">Claude</span>
        <div className="ml-auto flex items-center gap-1.5">
          {isRunning && (
            <Tooltip label="Stop agent" side="bottom">
              <button
                onClick={onStop}
                className="text-foreground-muted hover:bg-surface-hover hover:text-danger flex size-6 items-center justify-center rounded-md transition-colors"
                aria-label="Stop agent"
              >
                <Square size={12} />
              </button>
            </Tooltip>
          )}
          {session.cliSessionId && (
            <Tooltip label="Continue this session in a chat tab" side="bottom">
              <button
                onClick={onOpenInChat}
                className="text-foreground-muted hover:bg-surface-hover hover:text-foreground flex items-center gap-1 rounded-md px-2 py-1 text-xs transition-colors"
              >
                <ExternalLink size={12} />
                <span>Open in chat</span>
              </button>
            </Tooltip>
          )}
        </div>
      </div>

      <div className="px-4 py-3">
        {/* For Fix-with-Claude sessions the comment itself sits right above this card,
             so skip the full prompt bubble and show a compact chip instead. */}
        {session.context?.commentId !== undefined ? (
          <div className="text-foreground-muted mb-3 flex items-center gap-1.5 text-xs">
            <img src={claudeLogoUrl} alt="" className="size-3 shrink-0" />
            <span>Fixing this comment</span>
          </div>
        ) : (
          <UserBubble text={session.prompt} compact={compact} />
        )}
        {/* While thinking and no response yet: show latest step */}
        {isRunning && !hasResponse && thinkingStepCount > 0 && (
          <div className="text-accent flex items-center gap-2 py-1">
            <AgentSpinner />
            <span className="text-foreground-muted truncate text-xs">{latestThinkingLabel}</span>
          </div>
        )}

        {/* While thinking with no steps yet */}
        {isRunning && !hasResponse && thinkingStepCount === 0 && (
          <div className="text-accent flex items-center gap-2 py-1">
            <AgentSpinner />
            <span className="text-xs">Thinking...</span>
          </div>
        )}

        {/* Once response arrives (or agent is done): show collapsible thinking accordion */}
        {thinkingStepCount > 0 && (hasResponse || !isRunning) && (
          <div className="mb-3">
            <button
              onClick={() => setThinkingExpanded(!thinkingExpanded)}
              className="text-foreground-muted hover:bg-surface-hover hover:text-foreground flex items-center gap-1.5 rounded-md px-1.5 py-1 text-xs transition-colors"
            >
              <ChevronRight
                size={12}
                className={cn('shrink-0 transition-transform', thinkingExpanded && 'rotate-90')}
              />
              <span>
                {thinkingStepCount} thinking step{thinkingStepCount !== 1 ? 's' : ''}
              </span>
            </button>

            {thinkingExpanded && (
              <div className="border-border bg-background mt-2 rounded-md border px-3 py-2">
                {thinkingEvents.map((event, i) => (
                  <AgentMessageBlock key={i} event={event} inlineToolIds={inlineToolIds} compact={compact} />
                ))}
              </div>
            )}
          </div>
        )}

        {/* The actual response — text and file-edit tool uses only */}
        {responseEvents.map((event, i) => (
          <AgentMessageBlock
            key={`response-${i}`}
            event={event}
            inlineToolIds={new Set()}
            visibleOnly
            compact={compact}
          />
        ))}

        {/* Streaming indicator when response is coming in */}
        {isRunning && hasResponse && (
          <div className="text-accent flex items-center gap-2 py-1">
            <AgentSpinner />
          </div>
        )}

        {lastResultEvent && !isRunning && (
          <div className="text-foreground-subtle mt-2 flex items-center gap-3 text-xs">
            <span>{(lastResultEvent.duration_ms / 1000).toFixed(1)}s</span>
          </div>
        )}

        {session.status === 'error' && !lastResultEvent && (
          <div className="border-danger/30 bg-danger/5 mt-2 rounded-md border px-3 py-2">
            <p className="text-danger text-xs">Agent encountered an error</p>
          </div>
        )}

        {/* Follow-up input */}
        {canContinue && (
          <div className="border-border bg-background mt-3 flex items-end gap-2 rounded-lg border p-2">
            <textarea
              ref={followUpRef}
              value={followUp}
              onChange={(e) => setFollowUp(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey && followUp.trim()) {
                  e.preventDefault()
                  onContinue(followUp.trim())
                  setFollowUp('')
                }
              }}
              onInput={() => {
                const el = followUpRef.current
                if (!el) return
                el.style.height = 'auto'
                el.style.height = `${Math.min(el.scrollHeight, 120)}px`
              }}
              placeholder="Ask a follow-up..."
              rows={1}
              className="text-foreground placeholder:text-foreground-subtle min-h-[24px] flex-1 resize-none bg-transparent text-sm focus:outline-none"
            />
            <button
              onClick={() => {
                if (!followUp.trim()) return
                onContinue(followUp.trim())
                setFollowUp('')
              }}
              disabled={!followUp.trim()}
              className="bg-foreground text-background flex size-6 shrink-0 items-center justify-center rounded-md transition-colors hover:opacity-80 disabled:opacity-30"
            >
              <ArrowUp size={12} strokeWidth={2.5} />
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
