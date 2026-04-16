import { FileCode, GitBranch, GitPullRequest } from 'lucide-react'
import type { AgentContext, AgentSession } from '../../../../shared/types'
import AgentConversation from './AgentConversation'
import AgentPromptBar from './AgentPromptBar'

interface AgentSessionTabProps {
  session: AgentSession | null
  onStartSession: (prompt: string, files?: string[]) => Promise<void>
  onContinueSession: (sessionId: string, prompt: string, files?: string[]) => Promise<void>
  onStopSession: (sessionId: string) => Promise<void>
}

export default function AgentSessionTab({
  session,
  onStartSession,
  onContinueSession,
  onStopSession
}: AgentSessionTabProps) {
  const isRunning = session?.status === 'running'
  const canContinue = session !== null && session.status !== 'running' && session.cliSessionId !== null

  const handleSubmit = async (prompt: string, files?: string[]): Promise<void> => {
    if (canContinue) {
      await onContinueSession(session.id, prompt, files)
    } else {
      await onStartSession(prompt, files)
    }
  }

  return (
    <div className="bg-background flex h-full min-w-0 flex-col">
      {session?.context ? <AgentContextBanner context={session.context} /> : null}
      {session ? (
        <>
          <AgentConversation session={session} />
          <AgentPromptBar onSubmit={handleSubmit} onStop={() => onStopSession(session.id)} isRunning={isRunning} />
        </>
      ) : (
        <>
          <div className="flex flex-1 items-center justify-center">
            <p className="text-foreground-subtle text-sm">What would you like the agent to do?</p>
          </div>
          <AgentPromptBar onSubmit={handleSubmit} onStop={() => {}} isRunning={false} />
        </>
      )}
    </div>
  )
}

function AgentContextBanner({ context }: { context: AgentContext }) {
  if (context.source !== 'pull-request' || !context.prNumber) {
    return null
  }

  return (
    <div className="border-border bg-surface flex flex-wrap items-center gap-x-4 gap-y-1 border-b px-4 py-2">
      <div className="text-foreground flex items-center gap-1.5 text-xs">
        <GitPullRequest size={13} className="text-success shrink-0" />
        <span className="font-semibold">#{context.prNumber}</span>
        {context.prTitle ? <span className="text-foreground-muted">{context.prTitle}</span> : null}
      </div>

      {context.repoFullName ? <span className="text-foreground-subtle text-xs">{context.repoFullName}</span> : null}

      {context.headBranch ? (
        <div className="text-foreground-muted flex items-center gap-1 text-xs">
          <GitBranch size={12} className="shrink-0" />
          <code className="bg-interactive rounded px-1 py-0.5 text-[11px]">{context.headBranch}</code>
          <span className="text-foreground-subtle">&rarr;</span>
          <code className="bg-interactive rounded px-1 py-0.5 text-[11px]">{context.baseBranch}</code>
        </div>
      ) : null}

      {context.filePath ? (
        <div className="text-foreground-muted flex items-center gap-1 text-xs">
          <FileCode size={12} className="shrink-0" />
          <code className="bg-interactive rounded px-1 py-0.5 text-[11px]">{context.filePath}</code>
          {context.lineNumber ? <span className="text-foreground-subtle">:{context.lineNumber}</span> : null}
        </div>
      ) : null}
    </div>
  )
}
