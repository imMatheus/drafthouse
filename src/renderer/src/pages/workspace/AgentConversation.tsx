import { useEffect, useRef } from 'react'
import { FileCode, GitBranch } from 'lucide-react'
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

  return (
    <div
      onScroll={(e) => {
        const el = e.currentTarget
        isAtBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80
      }}
      className="flex-1 overflow-y-auto"
    >
      <div className="mx-auto max-w-3xl px-6 py-6">
        {session.context ? <AgentContextBox context={session.context} /> : null}

        <ErrorBoundary label="Failed to render the conversation">
          <AgentTimelineView session={session} events={events} allMentionedPRs={session.context?.prs} />
        </ErrorBoundary>

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
