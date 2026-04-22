import { useRef, useState } from 'react'
import type { AgentContext, AgentSessionMeta, GitRepoInfo, PullRequestDetail } from '../../../../shared/types'
import { buildMentionedPRContextBlock, buildPullRequestMentionsAgentContext } from '../../lib/prMentions'
import AgentSessionList from './AgentSessionList'
import AgentConversation from './AgentConversation'
import AgentEmptyState from './AgentEmptyState'
import AgentPromptBar, { type AgentPromptBarHandle } from './AgentPromptBar'

interface AgentViewProps {
  sessions: AgentSessionMeta[]
  activeSessionId: string | null
  onSelectSession: (id: string | null) => void
  onStartSession: (prompt: string, files?: string[], context?: AgentContext) => Promise<void>
  onContinueSession: (
    sessionId: string,
    prompt: string,
    files?: string[],
    cliPrompt?: string,
    mentionedPRs?: PullRequestDetail[]
  ) => Promise<void>
  onStopSession: (sessionId: string) => Promise<void>
  gitInfo?: GitRepoInfo | null
}

export default function AgentView({
  sessions,
  activeSessionId,
  onSelectSession,
  onStartSession,
  onContinueSession,
  onStopSession,
  gitInfo
}: AgentViewProps) {
  const [text, setText] = useState('')
  const promptBarRef = useRef<AgentPromptBarHandle>(null)
  const activeSession = sessions.find((s) => s.id === activeSessionId) ?? null
  const isRunning = activeSession?.status === 'running'
  const canContinue =
    activeSession !== null && activeSession.status !== 'running' && activeSession.cliSessionId !== null

  const handleSubmit = async (prompt: string, files?: string[], mentionedPRs?: PullRequestDetail[]): Promise<void> => {
    if (canContinue) {
      const contextBlock =
        mentionedPRs && gitInfo ? buildMentionedPRContextBlock(gitInfo.owner, gitInfo.repo, mentionedPRs) : null
      const cliPrompt = contextBlock ? `${contextBlock}\n\n---\n\n${prompt}` : undefined
      await onContinueSession(activeSession.id, prompt, files, cliPrompt, mentionedPRs)
    } else {
      const context =
        mentionedPRs && gitInfo
          ? buildPullRequestMentionsAgentContext({ owner: gitInfo.owner, repo: gitInfo.repo, prs: mentionedPRs })
          : null
      await onStartSession(prompt, files, context ?? undefined)
    }
  }

  const handleNewSession = (): void => {
    onSelectSession(null)
  }

  const handleSelectSuggestion = (prompt: string): void => {
    setText(prompt)
    promptBarRef.current?.focus()
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
              ref={promptBarRef}
              onSubmit={handleSubmit}
              onStop={() => onStopSession(activeSession.id)}
              isRunning={isRunning}
              gitInfo={gitInfo}
              text={text}
              onTextChange={setText}
            />
          </>
        ) : (
          <div className="flex flex-1 flex-col">
            <AgentEmptyState onSelectSuggestion={handleSelectSuggestion} />
            <AgentPromptBar
              ref={promptBarRef}
              onSubmit={handleSubmit}
              onStop={() => {}}
              isRunning={false}
              gitInfo={gitInfo}
              text={text}
              onTextChange={setText}
            />
          </div>
        )}
      </div>
    </div>
  )
}
