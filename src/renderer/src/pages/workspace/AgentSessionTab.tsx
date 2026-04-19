import { useRef, useState } from 'react'
import type { AgentContext, AgentSession, GitRepoInfo, PullRequestDetail } from '../../../../shared/types'
import { buildMentionedPRContextBlock, buildPullRequestMentionsAgentContext } from '../../lib/prMentions'
import AgentConversation from './AgentConversation'
import AgentEmptyState from './AgentEmptyState'
import AgentPromptBar, { type AgentPromptBarHandle } from './AgentPromptBar'

interface AgentSessionTabProps {
  session: AgentSession | null
  onStartSession: (prompt: string, files?: string[], context?: AgentContext) => Promise<void>
  onContinueSession: (sessionId: string, prompt: string, files?: string[], cliPrompt?: string) => Promise<void>
  onStopSession: (sessionId: string) => Promise<void>
  gitInfo?: GitRepoInfo | null
}

export default function AgentSessionTab({
  session,
  onStartSession,
  onContinueSession,
  onStopSession,
  gitInfo
}: AgentSessionTabProps) {
  const [text, setText] = useState('')
  const promptBarRef = useRef<AgentPromptBarHandle>(null)
  const isRunning = session?.status === 'running'
  const canContinue = session !== null && session.status !== 'running' && session.cliSessionId !== null

  const handleSubmit = async (
    prompt: string,
    files?: string[],
    mentionedPRs?: PullRequestDetail[]
  ): Promise<void> => {
    if (canContinue) {
      // Continuation can't re-apply a system prompt, so inline PR context at
      // the top of the message sent to the CLI. The UI bubble keeps the
      // user's clean text via the second `cliPrompt` arg.
      const contextBlock =
        mentionedPRs && gitInfo ? buildMentionedPRContextBlock(gitInfo.owner, gitInfo.repo, mentionedPRs) : null
      const cliPrompt = contextBlock ? `${contextBlock}\n\n---\n\n${prompt}` : undefined
      await onContinueSession(session.id, prompt, files, cliPrompt)
    } else {
      const context =
        mentionedPRs && gitInfo
          ? buildPullRequestMentionsAgentContext({ owner: gitInfo.owner, repo: gitInfo.repo, prs: mentionedPRs })
          : null
      await onStartSession(prompt, files, context ?? undefined)
    }
  }

  const handleSelectSuggestion = (prompt: string): void => {
    setText(prompt)
    promptBarRef.current?.focus()
  }

  return (
    <div className="bg-background flex h-full min-w-0 flex-col">
      {session ? (
        <>
          <AgentConversation session={session} />
          <AgentPromptBar
            ref={promptBarRef}
            onSubmit={handleSubmit}
            onStop={() => onStopSession(session.id)}
            isRunning={isRunning}
            gitInfo={gitInfo}
            text={text}
            onTextChange={setText}
          />
        </>
      ) : (
        <>
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
        </>
      )}
    </div>
  )
}
