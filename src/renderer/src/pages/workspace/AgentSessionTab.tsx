import type { AgentSession } from '../../../../shared/types'
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
  const canContinue =
    session !== null &&
    session.status !== 'running' &&
    session.cliSessionId !== null

  const handleSubmit = async (prompt: string, files?: string[]): Promise<void> => {
    if (canContinue) {
      await onContinueSession(session.id, prompt, files)
    } else {
      await onStartSession(prompt, files)
    }
  }

  return (
    <div className="flex h-full min-w-0 flex-col bg-background">
      {session ? (
        <>
          <AgentConversation session={session} />
          <AgentPromptBar
            onSubmit={handleSubmit}
            onStop={() => onStopSession(session.id)}
            isRunning={isRunning}
          />
        </>
      ) : (
        <>
          <div className="flex flex-1 items-center justify-center">
            <p className="text-sm text-foreground-subtle">What would you like the agent to do?</p>
          </div>
          <AgentPromptBar onSubmit={handleSubmit} onStop={() => {}} isRunning={false} />
        </>
      )}
    </div>
  )
}
