import { createContext, useContext, type ReactNode } from 'react'
import type { GitRepoInfo } from '../../../shared/types'

interface WorkspaceContextValue {
  gitInfo: GitRepoInfo | null
  folderPath: string
  onOpenPullRequest: (number: number) => void
}

const WorkspaceContext = createContext<WorkspaceContextValue | null>(null)

export function WorkspaceContextProvider({ value, children }: { value: WorkspaceContextValue; children: ReactNode }) {
  return <WorkspaceContext.Provider value={value}>{children}</WorkspaceContext.Provider>
}

export function useWorkspaceContext(): WorkspaceContextValue | null {
  return useContext(WorkspaceContext)
}
