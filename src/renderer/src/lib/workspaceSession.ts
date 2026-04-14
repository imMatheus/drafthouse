import {
  createDiffTab,
  createFileTab,
  createInitialWorkspaceSession,
  createPullRequestListTab,
  createPullRequestTab,
  createWelcomeTab,
  type PullRequestSubview,
  type WorkspaceActiveView,
  type WorkspaceSidebarPanel,
  type WorkspaceSession,
  type WorkspaceSidebarState,
  type WorkspaceTab
} from './workspaceTabs'

interface WorkspaceSessionStore {
  currentFolderPath: string | null
  sessionsByFolder: Record<string, WorkspaceSession>
}

const WORKSPACE_SESSION_KEY = 'drafthouse.workspace-session'

function loadWorkspaceSessionStore(): WorkspaceSessionStore {
  try {
    const rawValue = window.localStorage.getItem(WORKSPACE_SESSION_KEY)

    if (!rawValue) {
      return {
        currentFolderPath: null,
        sessionsByFolder: {}
      }
    }

    const parsedValue = JSON.parse(rawValue) as Partial<WorkspaceSessionStore>
    const currentFolderPath =
      typeof parsedValue.currentFolderPath === 'string' && parsedValue.currentFolderPath.length > 0
        ? parsedValue.currentFolderPath
        : null
    const sessionsByFolder =
      parsedValue.sessionsByFolder && typeof parsedValue.sessionsByFolder === 'object'
        ? parsedValue.sessionsByFolder
        : {}

    return {
      currentFolderPath,
      sessionsByFolder: Object.fromEntries(
        Object.entries(sessionsByFolder)
          .map(([folderPath, session]) => [folderPath, parseWorkspaceSession(folderPath, session)])
          .filter((entry): entry is [string, WorkspaceSession] => entry[1] !== null)
      )
    }
  } catch {
    return {
      currentFolderPath: null,
      sessionsByFolder: {}
    }
  }
}

function parseWorkspaceSession(folderPath: string, value: unknown): WorkspaceSession | null {
  if (!value || typeof value !== 'object') return null

  const session = value as Partial<WorkspaceSession> & {
    explorerVisible?: boolean
    selectedFilePath?: string | null
  }

  const parsedFolderPath =
    typeof session.folderPath === 'string' && session.folderPath.length > 0 ? session.folderPath : folderPath

  const sidebar = parseWorkspaceSidebarState(session.sidebar, session.explorerVisible)
  const hasTabsField = Array.isArray(session.tabs)
  const tabs = parseWorkspaceTabs(session.tabs)
  const activeTabId =
    typeof session.activeTabId === 'string' && tabs.some((tab) => tab.id === session.activeTabId)
      ? session.activeTabId
      : tabs[0]?.id ?? null
  const activeView: WorkspaceActiveView =
    (session as { activeView?: unknown }).activeView === 'agent' ? 'agent' : 'workspace'

  if (hasTabsField) {
    return {
      folderPath: parsedFolderPath,
      sidebar,
      tabs,
      activeTabId,
      activeView
    }
  }

  if (typeof session.selectedFilePath === 'string' && session.selectedFilePath.length > 0) {
    const fileTab = createFileTab(session.selectedFilePath)

    return {
      folderPath: parsedFolderPath,
      sidebar,
      tabs: [fileTab],
      activeTabId: fileTab.id,
      activeView
    }
  }

  return {
    folderPath: parsedFolderPath,
    sidebar,
    tabs: [createWelcomeTab()],
    activeTabId: 'welcome',
    activeView
  }
}

const VALID_SIDEBAR_PANELS: WorkspaceSidebarPanel[] = ['explorer', 'source-control']

function parseWorkspaceSidebarState(value: unknown, explorerVisible?: boolean): WorkspaceSidebarState {
  if (value && typeof value === 'object') {
    const sidebar = value as Partial<WorkspaceSidebarState>
    const panel = VALID_SIDEBAR_PANELS.includes(sidebar.activePanel as WorkspaceSidebarPanel)
      ? (sidebar.activePanel as WorkspaceSidebarPanel)
      : null

    return {
      visible: sidebar.visible !== false,
      activePanel: panel
    }
  }

  return {
    visible: explorerVisible !== false,
    activePanel: explorerVisible === false ? null : 'explorer'
  }
}

function parseWorkspaceTabs(value: unknown): WorkspaceTab[] {
  if (!Array.isArray(value)) {
    return []
  }

  return value.flatMap((item) => {
    const tab = parseWorkspaceTab(item)
    return tab ? [tab] : []
  })
}

function parseWorkspaceTab(value: unknown): WorkspaceTab | null {
  if (!value || typeof value !== 'object') return null

  const tab = value as Partial<WorkspaceTab>

  switch (tab.kind) {
    case 'welcome':
      return createWelcomeTab()
    case 'file':
      return typeof tab.path === 'string' && tab.path.length > 0 ? createFileTab(tab.path) : null
    case 'diff':
      return typeof tab.path === 'string' && tab.path.length > 0
        ? createDiffTab(tab.path, typeof tab.staged === 'boolean' ? tab.staged : false)
        : null
    case 'pull-request-list':
      return createPullRequestListTab()
    case 'pull-request': {
      if (typeof tab.number !== 'number' || Number.isNaN(tab.number)) {
        return null
      }

      const subview = isPullRequestSubview(tab.subview) ? tab.subview : 'conversation'
      const nextTab = createPullRequestTab(tab.number)

      if (nextTab.kind !== 'pull-request') {
        return null
      }

      return {
        id: nextTab.id,
        kind: nextTab.kind,
        number: nextTab.number,
        subview,
        title: typeof tab.title === 'string' && tab.title.length > 0 ? tab.title : undefined
      }
    }
    default:
      return null
  }
}

function isPullRequestSubview(value: unknown): value is PullRequestSubview {
  return value === 'conversation' || value === 'commits' || value === 'checks' || value === 'files'
}

function saveWorkspaceSessionStore(store: WorkspaceSessionStore): void {
  window.localStorage.setItem(WORKSPACE_SESSION_KEY, JSON.stringify(store))
}

export function loadWorkspaceSession(): WorkspaceSession | null {
  const store = loadWorkspaceSessionStore()

  if (!store.currentFolderPath) {
    return null
  }

  return store.sessionsByFolder[store.currentFolderPath] ?? null
}

export function loadWorkspaceSessionForFolder(folderPath: string): WorkspaceSession | null {
  const store = loadWorkspaceSessionStore()
  return store.sessionsByFolder[folderPath] ?? null
}

export function saveWorkspaceSession(session: WorkspaceSession): void {
  const store = loadWorkspaceSessionStore()

  store.currentFolderPath = session.folderPath
  store.sessionsByFolder[session.folderPath] = session

  saveWorkspaceSessionStore(store)
}

export function clearWorkspaceSession(): void {
  const store = loadWorkspaceSessionStore()
  store.currentFolderPath = null
  saveWorkspaceSessionStore(store)
}

export { createInitialWorkspaceSession }
export type { WorkspaceSession }
