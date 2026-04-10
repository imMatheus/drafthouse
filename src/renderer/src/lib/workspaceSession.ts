export interface WorkspaceSession {
  folderPath: string
  explorerVisible: boolean
  selectedFilePath: string | null
}

const WORKSPACE_SESSION_KEY = 'drafthouse.workspace-session'

export function loadWorkspaceSession(): WorkspaceSession | null {
  try {
    const rawValue = window.localStorage.getItem(WORKSPACE_SESSION_KEY)
    if (!rawValue) return null

    const parsedValue = JSON.parse(rawValue) as Partial<WorkspaceSession>
    if (typeof parsedValue.folderPath !== 'string' || parsedValue.folderPath.length === 0) {
      return null
    }

    return {
      folderPath: parsedValue.folderPath,
      explorerVisible: parsedValue.explorerVisible !== false,
      selectedFilePath: typeof parsedValue.selectedFilePath === 'string' ? parsedValue.selectedFilePath : null
    }
  } catch {
    return null
  }
}

export function saveWorkspaceSession(session: WorkspaceSession): void {
  window.localStorage.setItem(WORKSPACE_SESSION_KEY, JSON.stringify(session))
}

export function clearWorkspaceSession(): void {
  window.localStorage.removeItem(WORKSPACE_SESSION_KEY)
}
