import { useRef, useState } from 'react'
import { ArrowUp, ExternalLink, Square } from 'lucide-react'
import type { AgentSessionMeta } from '../../../shared/types'
import { cn } from '../lib/cn'
import claudeLogoUrl from '../assets/claude.png'
import AgentTimelineView from '../pages/workspace/AgentTimelineView'
import ErrorBoundary from './ErrorBoundary'
import QueuedPromptList from './QueuedPromptList'
import Tooltip from './Tooltip'
import { useAgentSessionEvents } from '../contexts/AgentSessionsContext'
import { useWorkspaceContext } from '../contexts/WorkspaceContext'

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
  const [followUp, setFollowUp] = useState('')
  const followUpRef = useRef<HTMLTextAreaElement>(null)
  const isRunning = session.status === 'running'
  const events = useAgentSessionEvents(session.id)
  const workspace = useWorkspaceContext()
  const queued = workspace?.queuedAgentPrompts[session.id] ?? []

  const submitFollowUp = (): void => {
    if (!followUp.trim()) return
    onContinue(followUp.trim())
    setFollowUp('')
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
          <Tooltip label="Continue this session in a chat tab" side="bottom">
            <button
              onClick={onOpenInChat}
              className="text-foreground-muted hover:bg-surface-hover hover:text-foreground flex items-center gap-1 rounded-md px-2 py-1 text-xs transition-colors"
            >
              <ExternalLink size={12} />
              <span>Open in chat</span>
            </button>
          </Tooltip>
        </div>
      </div>

      <div className="px-4 py-3">
        {/* For Fix-with-Claude sessions the comment itself sits right above this card,
             so skip the full prompt bubble and show a compact chip instead. */}
        {session.context?.commentId !== undefined && (
          <div className="text-foreground-muted mb-3 flex items-center gap-1.5 text-xs">
            <img src={claudeLogoUrl} alt="" className="size-3 shrink-0" />
            <span>Fixing this comment</span>
          </div>
        )}

        <ErrorBoundary label="Failed to render the agent response">
          <AgentTimelineView
            session={session}
            events={events}
            compact={compact}
            hideFirstUserMessage={session.context?.commentId !== undefined}
            allMentionedPRs={session.context?.prs}
          />
        </ErrorBoundary>

        {queued.length > 0 && (
          <div className="mt-3">
            <QueuedPromptList
              items={queued}
              onCancel={(id) => workspace?.agentActions.cancelQueuedPrompt(session.id, id)}
              compact={compact}
            />
          </div>
        )}

        {/* Follow-up input (queues while a turn is running) */}
        <div className="border-border bg-background mt-3 flex items-end gap-2 rounded-lg border p-2">
          <textarea
            ref={followUpRef}
            value={followUp}
            onChange={(e) => setFollowUp(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey && followUp.trim()) {
                e.preventDefault()
                submitFollowUp()
              }
            }}
            onInput={() => {
              const el = followUpRef.current
              if (!el) return
              el.style.height = 'auto'
              el.style.height = `${Math.min(el.scrollHeight, 120)}px`
            }}
            placeholder={isRunning ? 'Queue a follow-up...' : 'Ask a follow-up...'}
            rows={1}
            className="text-foreground placeholder:text-foreground-subtle min-h-[24px] flex-1 resize-none bg-transparent text-sm focus:outline-none"
          />
          <button
            onClick={submitFollowUp}
            disabled={!followUp.trim()}
            className="bg-accent text-accent-foreground hover:bg-accent-hover flex size-6 shrink-0 items-center justify-center rounded-md transition-[background-color,transform,opacity] active:scale-[0.96] disabled:opacity-30"
            aria-label="Send follow-up"
          >
            <ArrowUp size={12} strokeWidth={2.5} />
          </button>
        </div>
      </div>
    </div>
  )
}
