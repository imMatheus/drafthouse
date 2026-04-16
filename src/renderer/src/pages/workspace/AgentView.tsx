import type { AgentSession } from '../../../../shared/types'
import AgentSessionList from './AgentSessionList'
import AgentConversation from './AgentConversation'
import AgentPromptBar from './AgentPromptBar'

interface AgentViewProps {
  sessions: AgentSession[]
  activeSessionId: string | null
  onSelectSession: (id: string | null) => void
  onStartSession: (prompt: string, files?: string[]) => Promise<void>
  onContinueSession: (sessionId: string, prompt: string, files?: string[]) => Promise<void>
  onStopSession: (sessionId: string) => Promise<void>
}

export default function AgentView({
  sessions,
  activeSessionId,
  onSelectSession,
  onStartSession,
  onContinueSession,
  onStopSession
}: AgentViewProps) {
  const activeSession = sessions.find((s) => s.id === activeSessionId) ?? null
  const isRunning = activeSession?.status === 'running'
  const canContinue =
    activeSession !== null && activeSession.status !== 'running' && activeSession.cliSessionId !== null

  const handleSubmit = async (prompt: string, files?: string[]): Promise<void> => {
    if (canContinue) {
      await onContinueSession(activeSession.id, prompt, files)
    } else {
      await onStartSession(prompt, files)
    }
  }

  const handleNewSession = (): void => {
    onSelectSession(null)
  }

  return (
    <div className="flex min-w-0 flex-1">
      <AgentSessionList
        sessions={sessions}
        activeSessionId={activeSessionId}
        onSelectSession={onSelectSession}
        onNewSession={handleNewSession}
      />

      <div className="bg-background flex min-w-0 flex-1 flex-col">
        {activeSession ? (
          <>
            <AgentConversation session={activeSession} />
            <AgentPromptBar
              onSubmit={handleSubmit}
              onStop={() => onStopSession(activeSession.id)}
              isRunning={isRunning}
            />
          </>
        ) : (
          <div className="flex flex-1 flex-col">
            <div className="flex flex-1 items-center justify-center">
              <p className="text-foreground-subtle text-sm">What would you like the agent to do?</p>
            </div>
            <AgentPromptBar onSubmit={handleSubmit} onStop={() => {}} isRunning={false} />
          </div>
        )}
      </div>
    </div>
  )
}
