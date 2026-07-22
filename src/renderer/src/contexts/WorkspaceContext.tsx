import { createContext, useContext, type ReactNode } from 'react'
import type { AgentEffortLevel, AgentPermissionMode, GitRepoInfo, PullRequestDetail } from '../../../shared/types'

/**
 * A follow-up submitted while a turn was still running. Held in the renderer
 * (never sent to the CLI yet) so it can be reviewed and cancelled; sent
 * automatically when the running turn completes.
 */
export interface QueuedAgentPrompt {
  id: string
  prompt: string
  files?: string[]
  cliPrompt?: string
  mentionedPRs?: PullRequestDetail[]
}

/**
 * Agent actions reachable from anywhere in the tree (permission cards and plan
 * approvals render deep inside PR views) without threading props through every
 * intermediate component.
 */
export interface WorkspaceAgentActions {
  respondPermission: (
    sessionId: string,
    requestId: string,
    behavior: 'allow' | 'deny',
    /** `updatedInput` replaces the tool input on allow (AskUserQuestion answers); `message` is shown to the model on deny. */
    options?: { updatedInput?: Record<string, unknown>; message?: string }
  ) => void
  approvePlan: (sessionId: string, requestId: string) => void
  rejectPlan: (sessionId: string, requestId: string) => void
  setPermissionMode: (sessionId: string, mode: AgentPermissionMode) => void
  setModel: (sessionId: string, model: string | null) => void
  setEffort: (sessionId: string, effort: AgentEffortLevel | null) => void
  cancelQueuedPrompt: (sessionId: string, promptId: string) => void
}

interface WorkspaceContextValue {
  gitInfo: GitRepoInfo | null
  folderPath: string
  onOpenPullRequest: (number: number) => void
  agentActions: WorkspaceAgentActions
  /** Pending follow-ups per session, shown above the prompt bar until sent. */
  queuedAgentPrompts: Record<string, QueuedAgentPrompt[]>
}

const WorkspaceContext = createContext<WorkspaceContextValue | null>(null)

export function WorkspaceContextProvider({ value, children }: { value: WorkspaceContextValue; children: ReactNode }) {
  return <WorkspaceContext.Provider value={value}>{children}</WorkspaceContext.Provider>
}

export function useWorkspaceContext(): WorkspaceContextValue | null {
  return useContext(WorkspaceContext)
}
