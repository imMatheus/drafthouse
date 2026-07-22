import { useEffect, useRef, useState } from 'react'
import { ArrowDown, FileCode, GitBranch } from 'lucide-react'
import type { AgentContext, AgentSessionMeta } from '../../../../shared/types'
import AgentTimelineView from './AgentTimelineView'
import ErrorBoundary from '../../components/ErrorBoundary'
import PRStateIcon from '../../components/PRStateIcon'
import { useWorkspaceContext } from '../../contexts/WorkspaceContext'
import { useAgentSessionEvents } from '../../contexts/AgentSessionsContext'

interface AgentConversationProps {
  session: AgentSessionMeta
}

export default function AgentConversation({ session }: AgentConversationProps) {
  const bottomRef = useRef<HTMLDivElement>(null)
  const isAtBottomRef = useRef(true)
  // Mirrors the ref only at the 'left / returned to bottom' transitions, so
  // scroll events during streaming don't re-render the conversation.
  const [awayFromBottom, setAwayFromBottom] = useState(false)
  const events = useAgentSessionEvents(session.id)

  // Changes as streamed content grows (not only when new events are appended),
  // so autoscroll follows text/thinking/tool streaming rather than just new blocks.
  let streamCharCount = 0
  for (const event of events) {
    if (event.type === 'assistant') {
      for (const block of event.message.content) {
        if (block.type === 'text') streamCharCount += block.text.length
        else if (block.type === 'thinking') streamCharCount += block.thinking.length
        else if (block.type === 'tool_use') streamCharCount += block.partialJson?.length ?? 0
      }
    }
  }

  useEffect(() => {
    if (isAtBottomRef.current) {
      bottomRef.current?.scrollIntoView({ behavior: 'auto' })
    }
  }, [events.length, streamCharCount])

  const jumpToBottom = (): void => {
    isAtBottomRef.current = true
    setAwayFromBottom(false)
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }

  return (
    <div className="relative min-h-0 flex-1">
      <div
        onScroll={(e) => {
          const el = e.currentTarget
          const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 80
          isAtBottomRef.current = atBottom
          setAwayFromBottom(!atBottom)
        }}
        className="h-full overflow-y-auto"
      >
        <div className="mx-auto max-w-3xl px-6 py-6">
          {session.context ? <AgentContextBox context={session.context} /> : null}

          <ErrorBoundary label="Failed to render the conversation">
            <AgentTimelineView session={session} events={events} allMentionedPRs={session.context?.prs} />
          </ErrorBoundary>

          <div ref={bottomRef} />
        </div>
      </div>

      {awayFromBottom && (
        <button
          onClick={jumpToBottom}
          className="animate-card-in border-border bg-surface text-foreground-muted hover:bg-surface-hover hover:text-foreground absolute bottom-3 left-1/2 flex size-8 -translate-x-1/2 items-center justify-center rounded-full border shadow-lg transition-[background-color,color,transform] active:scale-[0.96]"
          aria-label="Scroll to latest"
        >
          <ArrowDown size={14} />
        </button>
      )}
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
