import { useEffect, useRef, useState } from 'react'
import { ArrowUp, ChevronRight, ExternalLink, Square } from 'lucide-react'
import type { AgentSession, AgentStreamEvent, AgentStreamResult } from '../../../shared/types'
import { cn } from '../lib/cn'
import claudeLogoUrl from '../assets/claude.png'
import AgentMessageBlock from '../pages/workspace/AgentMessageBlock'
import AgentSpinner from '../pages/workspace/AgentSpinner'

function getThinkingStepLabel(name: string, input: Record<string, unknown>): string {
  switch (name) {
    case 'Bash':
      return typeof input.command === 'string' ? `${input.command.slice(0, 60)}` : name
    case 'Read':
      return typeof input.file_path === 'string' ? `Reading ${(input.file_path as string).split('/').pop()}` : name
    case 'Grep':
      return typeof input.pattern === 'string' ? `Searching for "${input.pattern}"` : name
    case 'Glob':
      return typeof input.pattern === 'string' ? `Finding files: ${input.pattern}` : name
    case 'Edit':
      return typeof input.file_path === 'string' ? `Editing ${(input.file_path as string).split('/').pop()}` : name
    case 'Write':
      return typeof input.file_path === 'string' ? `Writing ${(input.file_path as string).split('/').pop()}` : name
    default:
      return name
  }
}

export default function InlineAgentResponseCard({
  session,
  onStop,
  onContinue,
  onOpenInChat
}: {
  session: AgentSession
  onStop: () => void
  onContinue: (prompt: string) => void
  onOpenInChat: () => void
}) {
  const bottomRef = useRef<HTMLDivElement>(null)
  const [thinkingExpanded, setThinkingExpanded] = useState(false)
  const [followUp, setFollowUp] = useState('')
  const followUpRef = useRef<HTMLTextAreaElement>(null)
  const isRunning = session.status === 'running'
  const canContinue = !isRunning && session.cliSessionId !== null

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
  }, [session.events.length])

  // Separate thinking steps from the final response
  const thinkingEvents: AgentStreamEvent[] = []
  const responseEvents: AgentStreamEvent[] = []
  let thinkingStepCount = 0
  let latestThinkingLabel = ''

  for (const event of session.events) {
    if (event.type === 'assistant') {
      const hasToolUse = event.message.content.some((b) => b.type === 'tool_use')
      if (hasToolUse) {
        thinkingEvents.push(event)
        for (const b of event.message.content) {
          if (b.type === 'tool_use') {
            thinkingStepCount++
            latestThinkingLabel = getThinkingStepLabel(b.name, b.input)
          }
        }
      } else {
        responseEvents.push(event)
      }
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
  for (let i = session.events.length - 1; i >= 0; i--) {
    const e = session.events[i]
    if (e.type === 'result') {
      lastResultEvent = e
      break
    }
  }

  return (
    <div className="rounded-lg border border-border bg-surface">
      <div className="flex items-center gap-2 border-b border-border px-4 py-3">
        <img src={claudeLogoUrl} alt="Claude" className="size-6 rounded-full" />
        <span className="text-sm font-medium text-foreground">Claude</span>
        <span className="text-xs text-foreground-subtle">
          {session.prompt.length > 60 ? session.prompt.slice(0, 60) + '...' : session.prompt}
        </span>
        <div className="ml-auto flex items-center gap-1.5">
          {isRunning && (
            <button
              onClick={onStop}
              className="flex size-6 items-center justify-center rounded-md text-foreground-muted transition-colors hover:bg-surface-hover hover:text-danger"
              title="Stop agent"
            >
              <Square size={12} />
            </button>
          )}
          {session.cliSessionId && (
            <button
              onClick={onOpenInChat}
              className="flex items-center gap-1 rounded-md px-2 py-1 text-xs text-foreground-muted transition-colors hover:bg-surface-hover hover:text-foreground"
              title="Continue in chat tab"
            >
              <ExternalLink size={12} />
              <span>Open in chat</span>
            </button>
          )}
        </div>
      </div>

      <div className="px-4 py-3">
        {/* While thinking and no response yet: show latest step */}
        {isRunning && !hasResponse && thinkingStepCount > 0 && (
          <div className="flex items-center gap-2 py-1 text-accent">
            <AgentSpinner />
            <span className="truncate text-xs text-foreground-muted">{latestThinkingLabel}</span>
          </div>
        )}

        {/* While thinking with no steps yet */}
        {isRunning && !hasResponse && thinkingStepCount === 0 && (
          <div className="flex items-center gap-2 py-1 text-accent">
            <AgentSpinner />
            <span className="text-xs">Thinking...</span>
          </div>
        )}

        {/* Once response arrives (or agent is done): show collapsible thinking accordion */}
        {thinkingStepCount > 0 && (hasResponse || !isRunning) && (
          <div className="mb-3">
            <button
              onClick={() => setThinkingExpanded(!thinkingExpanded)}
              className="flex items-center gap-1.5 rounded-md px-1.5 py-1 text-xs text-foreground-muted transition-colors hover:bg-surface-hover hover:text-foreground"
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
              <div className="mt-2 rounded-md border border-border bg-background px-3 py-2">
                {thinkingEvents.map((event, i) => (
                  <AgentMessageBlock key={i} event={event} inlineToolIds={inlineToolIds} />
                ))}
              </div>
            )}
          </div>
        )}

        {/* The actual response */}
        {responseEvents.map((event, i) => (
          <AgentMessageBlock key={`response-${i}`} event={event} inlineToolIds={new Set()} />
        ))}

        {/* Streaming indicator when response is coming in */}
        {isRunning && hasResponse && (
          <div className="flex items-center gap-2 py-1 text-accent">
            <AgentSpinner />
          </div>
        )}

        {lastResultEvent && !isRunning && (
          <div className="mt-2 flex items-center gap-3 text-xs text-foreground-subtle">
            <span>{(lastResultEvent.duration_ms / 1000).toFixed(1)}s</span>
            <span>${lastResultEvent.total_cost_usd.toFixed(4)}</span>
          </div>
        )}

        {session.status === 'error' && !lastResultEvent && (
          <div className="mt-2 rounded-md border border-danger/30 bg-danger/5 px-3 py-2">
            <p className="text-xs text-danger">Agent encountered an error</p>
          </div>
        )}

        {/* Follow-up input */}
        {canContinue && (
          <div className="mt-3 flex items-end gap-2 rounded-lg border border-border bg-background p-2">
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
              className="min-h-[24px] flex-1 resize-none bg-transparent text-sm text-foreground placeholder:text-foreground-subtle focus:outline-none"
            />
            <button
              onClick={() => {
                if (!followUp.trim()) return
                onContinue(followUp.trim())
                setFollowUp('')
              }}
              disabled={!followUp.trim()}
              className="flex size-6 shrink-0 items-center justify-center rounded-md bg-foreground text-background transition-colors hover:opacity-80 disabled:opacity-30"
            >
              <ArrowUp size={12} strokeWidth={2.5} />
            </button>
          </div>
        )}

        <div ref={bottomRef} />
      </div>
    </div>
  )
}
