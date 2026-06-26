import { useEffect, useRef, useState } from 'react'
import { ChevronRight, FileCode, FileText, GitBranch } from 'lucide-react'
import { cn } from '../../lib/cn'
import AgentSpinner from './AgentSpinner'
import type { AgentContext, AgentSessionMeta, AgentStreamEvent, AgentStreamResult } from '../../../../shared/types'
import AgentMessageBlock, { getThinkingStepLabel } from './AgentMessageBlock'
import HighlightedMentionText from '../../components/HighlightedMentionText'
import MessagePRMentions from '../../components/MessagePRMentions'
import PRStateIcon from '../../components/PRStateIcon'
import { useWorkspaceContext } from '../../contexts/WorkspaceContext'
import { useAgentSessionEvents } from '../../contexts/AgentSessionsContext'
import { getPathBasename, isImageFile } from '../../lib/path'

// Tool calls that render inline as part of the response (not hidden in the thinking accordion)
const VISIBLE_TOOL_NAMES = new Set(['Edit'])

interface AgentConversationProps {
  session: AgentSessionMeta
}

export default function AgentConversation({ session }: AgentConversationProps) {
  const bottomRef = useRef<HTMLDivElement>(null)
  const scrollContainerRef = useRef<HTMLDivElement>(null)
  const isAtBottomRef = useRef(true)
  const [thinkingExpanded, setThinkingExpanded] = useState(false)
  const isRunning = session.status === 'running'
  const events = useAgentSessionEvents(session.id)

  // Changes as streamed content grows (not only when new events are appended),
  // so autoscroll follows text/tool streaming rather than just new blocks.
  let streamCharCount = 0
  for (const event of events) {
    if (event.type === 'assistant') {
      for (const b of event.message.content) {
        if (b.type === 'text') streamCharCount += b.text.length
        else if (b.type === 'tool_use') streamCharCount += b.partialJson?.length ?? 0
      }
    }
  }

  useEffect(() => {
    if (isAtBottomRef.current) {
      bottomRef.current?.scrollIntoView({ behavior: 'auto' })
    }
  }, [events.length, streamCharCount])

  // Separate thinking steps from the final response
  const thinkingEvents: AgentStreamEvent[] = []
  const responseEvents: AgentStreamEvent[] = []
  let thinkingStepCount = 0
  let latestThinkingLabel = ''

  for (const event of events) {
    if (event.type === 'assistant') {
      const hasVisibleToolUse = event.message.content.some(
        (b) => b.type === 'tool_use' && VISIBLE_TOOL_NAMES.has(b.name)
      )
      const hasHiddenToolUse = event.message.content.some(
        (b) => b.type === 'tool_use' && !VISIBLE_TOOL_NAMES.has(b.name)
      )

      if (hasVisibleToolUse) {
        // Show text + visible tool_use blocks in the response; hide other tool_uses in thinking
        const visibleContent = event.message.content.filter(
          (b) => b.type !== 'tool_use' || VISIBLE_TOOL_NAMES.has(b.name)
        )
        responseEvents.push({ ...event, message: { ...event.message, content: visibleContent } })

        if (hasHiddenToolUse) {
          const hiddenContent = event.message.content.filter(
            (b) => b.type === 'tool_use' && !VISIBLE_TOOL_NAMES.has(b.name)
          )
          thinkingEvents.push({ ...event, message: { ...event.message, content: hiddenContent } })
          for (const b of hiddenContent) {
            if (b.type === 'tool_use') {
              thinkingStepCount++
              latestThinkingLabel = getThinkingStepLabel(b.name, b.input)
            }
          }
        }
      } else if (hasHiddenToolUse) {
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

  // Collect tool_use ids whose tool_results should be hidden everywhere:
  // - Read/Glob/Grep (shown as inline label; noisy result text suppressed)
  // - Visible tools like Edit (the diff block is the signal; tool_result is just confirmation)
  const inlineToolIds = new Set<string>()
  for (const event of events) {
    if (event.type === 'assistant') {
      for (const b of event.message.content) {
        if (
          b.type === 'tool_use' &&
          (VISIBLE_TOOL_NAMES.has(b.name) || b.name === 'Read' || b.name === 'Glob' || b.name === 'Grep')
        ) {
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
    <div
      ref={scrollContainerRef}
      onScroll={(e) => {
        const el = e.currentTarget
        isAtBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80
      }}
      className="flex-1 overflow-y-auto"
    >
      <div className="mx-auto max-w-3xl px-6 py-6">
        {session.context ? <AgentContextBox context={session.context} /> : null}

        {/* Initial user prompt */}
        <div className="mb-6 flex flex-col items-end gap-2">
          {session.prompt ? <MessagePRMentions text={session.prompt} allPRs={session.context?.prs} /> : null}
          {session.files.length > 0 && (
            <div className="flex max-w-[80%] flex-wrap gap-1.5">
              {session.files.map((filePath) => (
                <FileAttachment key={filePath} filePath={filePath} />
              ))}
            </div>
          )}
          {session.prompt && (
            <div className="bg-accent-bg text-accent max-w-[80%] rounded-2xl px-3 py-2">
              <p className="text-sm whitespace-pre-wrap">
                <HighlightedMentionText text={session.prompt} />
              </p>
            </div>
          )}
        </div>

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
              <div className="border-border bg-surface mt-2 rounded-md border px-3 py-2">
                {thinkingEvents.map((event, i) => (
                  <AgentMessageBlock key={i} event={event} inlineToolIds={inlineToolIds} />
                ))}
              </div>
            )}
          </div>
        )}

        {/* The actual response */}
        {responseEvents.map((event, i) => (
          <AgentMessageBlock
            key={`response-${i}`}
            event={event}
            inlineToolIds={inlineToolIds}
            allMentionedPRs={session.context?.prs}
          />
        ))}

        {/* Streaming indicator when response is coming in */}
        {isRunning && hasResponse && (
          <div className="text-accent flex items-center gap-2 py-1">
            <AgentSpinner />
          </div>
        )}

        {/* Result summary */}
        {lastResultEvent && !isRunning && (
          <div className="border-border bg-surface mt-4 rounded-md border px-3 py-2">
            <div className="text-foreground-subtle flex items-center gap-3 text-xs">
              <span>
                {lastResultEvent.num_turns} turn{lastResultEvent.num_turns !== 1 ? 's' : ''}
              </span>
              <span>{(lastResultEvent.duration_ms / 1000).toFixed(1)}s</span>
            </div>
          </div>
        )}

        {/* Error state */}
        {session.status === 'error' && !lastResultEvent && (
          <div className="border-danger/30 bg-danger/5 mt-4 rounded-md border px-3 py-2">
            <p className="text-danger text-xs">Agent encountered an error</p>
          </div>
        )}

        <div ref={bottomRef} />
      </div>
    </div>
  )
}

function AgentContextBox({ context }: { context: AgentContext }) {
  const workspace = useWorkspaceContext()
  if (context.source !== 'pull-request') return null

  const openPR = workspace?.onOpenPullRequest

  // Mention-based contexts (only `prs` is populated) render per-message, not here.
  if (!context.prNumber) return null

  const prNumber = context.prNumber

  return (
    <div className="border-border bg-surface mb-2 ml-auto flex w-max flex-col items-end gap-y-1 rounded-lg border p-1">
      <button
        type="button"
        onClick={() => openPR?.(prNumber)}
        className="hover:bg-surface-hover text-foreground flex items-center gap-1.5 rounded-md px-2 py-1 text-xs transition-colors"
      >
        <PRStateIcon state={context.prState ?? 'open'} size={13} />
        <span className="font-semibold">#{prNumber}</span>
        {context.prTitle ? (
          <span className="text-foreground-muted max-w-[200px] truncate">{context.prTitle}</span>
        ) : null}
      </button>

      {context.headBranch ? (
        <div className="text-foreground-muted flex items-center gap-1 px-2 pb-1 text-xs">
          <GitBranch size={12} className="shrink-0" />
          <code className="bg-interactive rounded px-1 py-0.5 text-[11px]">{context.headBranch}</code>
          <span className="text-foreground-subtle">&rarr;</span>
          <code className="bg-interactive rounded px-1 py-0.5 text-[11px]">{context.baseBranch}</code>
        </div>
      ) : null}

      {context.filePath ? (
        <div className="text-foreground-muted flex items-center gap-1 px-2 pb-1 text-xs">
          <FileCode size={12} className="shrink-0" />
          <code className="bg-interactive rounded px-1 py-0.5 text-[11px]">{context.filePath}</code>
          {context.lineNumber ? <span className="text-foreground-subtle">:{context.lineNumber}</span> : null}
        </div>
      ) : null}
    </div>
  )
}

function FileAttachment({ filePath }: { filePath: string }) {
  const fileName = getPathBasename(filePath)
  const isImage = isImageFile(filePath)
  const [dataUrl, setDataUrl] = useState<string | null>(null)

  useEffect(() => {
    if (!isImage) return
    let cancelled = false
    window.api.fs
      .readFileDataUrl(filePath)
      .then((url) => {
        if (!cancelled) setDataUrl(url)
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [filePath, isImage])

  if (isImage) {
    return (
      <div className="border-border overflow-hidden rounded-md border">
        {dataUrl ? (
          <img src={dataUrl} alt={fileName} className="max-h-48 max-w-xs object-contain" />
        ) : (
          <div className="flex items-center gap-1.5 px-2 py-1">
            <FileText size={12} className="text-foreground-subtle shrink-0" />
            <span className="text-foreground-muted text-xs">{fileName}</span>
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="border-border bg-interactive flex items-center gap-1.5 rounded-md border px-2 py-1">
      <FileText size={12} className="text-foreground-subtle shrink-0" />
      <span className="text-foreground-muted max-w-[100px] truncate text-xs">{fileName}</span>
    </div>
  )
}
