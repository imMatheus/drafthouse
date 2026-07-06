import { useEffect, useRef, useState } from 'react'
import type {
  AgentContext,
  AgentPermissionMode,
  AgentSessionMeta,
  AgentStartOptions,
  GitRepoInfo,
  PullRequestDetail
} from '../../../../shared/types'
import { buildMentionedPRContextBlock, buildPullRequestMentionsAgentContext } from '../../lib/prMentions'
import { useSettings } from '../../hooks/useSettings'
import { useWorkspaceContext } from '../../contexts/WorkspaceContext'
import AgentConversation from './AgentConversation'
import AgentEmptyState from './AgentEmptyState'
import AgentPromptBar, { type AgentPromptBarHandle, type AgentPromptMode } from './AgentPromptBar'

interface AgentSessionTabProps {
  session: AgentSessionMeta | null
  /** True for the "new session" placeholder tab (session id 'new'). */
  isPlaceholderTab?: boolean
  onStartSession: (
    prompt: string,
    files?: string[],
    context?: AgentContext,
    options?: AgentStartOptions
  ) => Promise<void>
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

export default function AgentSessionTab({
  session,
  isPlaceholderTab,
  onStartSession,
  onContinueSession,
  onStopSession,
  gitInfo
}: AgentSessionTabProps) {
  const [text, setText] = useState('')
  // Mode/model for a not-yet-started session; existing sessions read from meta.
  const [draftMode, setDraftMode] = useState<AgentPromptMode>('agent')
  const [draftModel, setDraftModel] = useState<string | null>(null)
  const promptBarRef = useRef<AgentPromptBarHandle>(null)
  const { settings } = useSettings()
  const workspace = useWorkspaceContext()
  const isRunning = session?.status === 'running'

  // Autofocus the prompt bar when this tab mounts or the active session changes,
  // so switching to / opening an agent tab drops the caret into the input.
  useEffect(() => {
    promptBarRef.current?.focus()
  }, [session?.id])

  const executionMode: AgentPermissionMode = settings.agentFullAccess ? 'bypassPermissions' : 'default'
  const mode: AgentPromptMode = session ? (session.permissionMode === 'plan' ? 'plan' : 'agent') : draftMode
  const model = session ? session.model : draftModel

  const handleModeChange = (next: AgentPromptMode): void => {
    if (session) {
      workspace?.agentActions.setPermissionMode(session.id, next === 'plan' ? 'plan' : executionMode)
    } else {
      setDraftMode(next)
    }
  }

  const handleModelChange = (next: string | null): void => {
    if (session) {
      workspace?.agentActions.setModel(session.id, next)
    } else {
      setDraftModel(next)
    }
  }

  const handleSubmit = async (prompt: string, files?: string[], mentionedPRs?: PullRequestDetail[]): Promise<void> => {
    if (session) {
      // The session-level system prompt is fixed at start, so inline any newly
      // mentioned PR context at the top of the message sent to the CLI. The UI
      // bubble keeps the user's clean text via the second `cliPrompt` arg.
      const contextBlock =
        mentionedPRs && gitInfo ? buildMentionedPRContextBlock(gitInfo.owner, gitInfo.repo, mentionedPRs) : null
      const cliPrompt = contextBlock ? `${contextBlock}\n\n---\n\n${prompt}` : undefined
      await onContinueSession(session.id, prompt, files, cliPrompt, mentionedPRs)
    } else {
      const context =
        mentionedPRs && gitInfo
          ? buildPullRequestMentionsAgentContext({ owner: gitInfo.owner, repo: gitInfo.repo, prs: mentionedPRs })
          : null
      await onStartSession(prompt, files, context ?? undefined, {
        permissionMode: draftMode === 'plan' ? 'plan' : undefined,
        model: draftModel
      })
    }
  }

  const handleSelectSuggestion = (prompt: string): void => {
    setText(prompt)
    promptBarRef.current?.focus()
  }

  // A restored tab whose session was deleted (or failed to load).
  if (!session && !isPlaceholderTab) {
    return (
      <div className="bg-background flex h-full min-w-0 flex-col items-center justify-center gap-2">
        <p className="text-foreground text-sm font-medium">Session not found</p>
        <p className="text-foreground-subtle text-xs">This agent session was deleted or is no longer available.</p>
      </div>
    )
  }

  const queued = session ? (workspace?.queuedAgentPrompts[session.id] ?? []) : []

  return (
    <div className="bg-background flex h-full min-w-0 flex-col">
      {session ? (
        <AgentConversation session={session} />
      ) : (
        <AgentEmptyState onSelectSuggestion={handleSelectSuggestion} />
      )}
      <AgentPromptBar
        ref={promptBarRef}
        onSubmit={handleSubmit}
        onStop={() => session && void onStopSession(session.id)}
        isRunning={isRunning === true}
        gitInfo={gitInfo}
        text={text}
        onTextChange={setText}
        mode={mode}
        onModeChange={handleModeChange}
        model={model}
        onModelChange={handleModelChange}
        detectedModel={session?.initModel ?? null}
        queued={queued}
        onCancelQueued={session ? (id) => workspace?.agentActions.cancelQueuedPrompt(session.id, id) : undefined}
      />
    </div>
  )
}
