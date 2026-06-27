import {
  createCommitTab,
  createDiffTab,
  createFileTab,
  createInitialWorkspaceSession,
  createPullRequestFileTab,
  createWelcomeTab,
  getPullRequestTabId,
  singleGroupLayout,
  type PullRequestSubview,
  type WorkspaceActiveView,
  type WorkspaceSidebarPanel,
  type WorkspaceSession,
  type WorkspaceSidebarState,
  type WorkspaceTab
} from './workspaceTabs'
import {
  collectGroups,
  createGroupId,
  createSplitId,
  flattenLayout,
  type EditorGroup,
  type LayoutNode,
  type SplitDirection
} from './editorLayout'

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
    tabs?: unknown
    activeTabId?: unknown
  }

  const parsedFolderPath =
    typeof session.folderPath === 'string' && session.folderPath.length > 0 ? session.folderPath : folderPath

  const sidebar = parseWorkspaceSidebarState(session.sidebar, session.explorerVisible)
  const rawActiveView = (session as { activeView?: unknown }).activeView
  const activeView: WorkspaceActiveView = rawActiveView === 'settings' ? 'settings' : 'workspace'

  const { layout, activeGroupId } = parseWorkspaceLayout(session)

  return {
    folderPath: parsedFolderPath,
    sidebar,
    layout,
    activeGroupId,
    activeView
  }
}

/**
 * Resolve a session's editor layout, supporting three persisted shapes:
 *  - new format: a `layout` tree + `activeGroupId`
 *  - legacy: a flat `tabs` array + `activeTabId` → migrated into one group
 *  - oldest: a single `selectedFilePath` → migrated into one group
 * Falls back to a single group with the Welcome tab when nothing is restorable.
 */
function parseWorkspaceLayout(session: {
  layout?: unknown
  activeGroupId?: unknown
  tabs?: unknown
  activeTabId?: unknown
  selectedFilePath?: string | null
}): { layout: LayoutNode; activeGroupId: string } {
  if (session.layout && typeof session.layout === 'object') {
    const parsed = parseLayoutNode(session.layout)
    if (parsed) {
      const layout = flattenLayout(parsed)
      const groups = collectGroups(layout)
      const activeGroupId =
        typeof session.activeGroupId === 'string' && groups.some((group) => group.id === session.activeGroupId)
          ? session.activeGroupId
          : (groups[0]?.id ?? createGroupId())
      return { layout, activeGroupId }
    }
  }

  if (Array.isArray(session.tabs)) {
    const tabs = parseWorkspaceTabs(session.tabs)
    const activeTabId =
      typeof session.activeTabId === 'string' && tabs.some((tab) => tab.id === session.activeTabId)
        ? (session.activeTabId as WorkspaceTab['id'])
        : (tabs[0]?.id ?? null)
    return singleGroupLayout(tabs.length > 0 ? tabs : [createWelcomeTab()], tabs.length > 0 ? activeTabId : 'welcome')
  }

  if (typeof session.selectedFilePath === 'string' && session.selectedFilePath.length > 0) {
    return singleGroupLayout([createFileTab(session.selectedFilePath)])
  }

  return singleGroupLayout([createWelcomeTab()])
}

function parseLayoutNode(value: unknown): LayoutNode | null {
  if (!value || typeof value !== 'object') return null

  const node = value as { type?: unknown }

  if (node.type === 'group') {
    const group = parseEditorGroup(value)
    return group ? { type: 'group', group } : null
  }

  if (node.type === 'split') {
    const split = value as { id?: unknown; direction?: unknown; children?: unknown; sizes?: unknown }
    const rawChildren = Array.isArray(split.children) ? split.children : []
    const rawSizes = Array.isArray(split.sizes) ? split.sizes : []

    const children: LayoutNode[] = []
    const sizes: number[] = []
    rawChildren.forEach((child, index) => {
      const parsedChild = parseLayoutNode(child)
      if (parsedChild) {
        children.push(parsedChild)
        const size = rawSizes[index]
        sizes.push(typeof size === 'number' && size > 0 ? size : 1)
      }
    })

    if (children.length === 0) return null
    if (children.length === 1) return children[0]

    const direction: SplitDirection = split.direction === 'column' ? 'column' : 'row'
    const total = sizes.reduce((sum, size) => sum + size, 0)
    const normalized = total > 0 ? sizes.map((size) => size / total) : children.map(() => 1 / children.length)

    return {
      type: 'split',
      id: typeof split.id === 'string' && split.id.length > 0 ? split.id : createSplitId(),
      direction,
      children,
      sizes: normalized
    }
  }

  return null
}

function parseEditorGroup(value: unknown): EditorGroup | null {
  if (!value || typeof value !== 'object') return null

  const group = value as { id?: unknown; tabs?: unknown; activeTabId?: unknown }
  const tabs = parseWorkspaceTabs(group.tabs)

  // Agent tabs are ephemeral and dropped on restore — a group left with no tabs
  // is collapsed away rather than restored empty.
  if (tabs.length === 0) return null

  const activeTabId =
    typeof group.activeTabId === 'string' && tabs.some((tab) => tab.id === group.activeTabId)
      ? (group.activeTabId as WorkspaceTab['id'])
      : tabs[tabs.length - 1].id

  return {
    id: typeof group.id === 'string' && group.id.length > 0 ? group.id : createGroupId(),
    tabs,
    activeTabId
  }
}

const VALID_SIDEBAR_PANELS: WorkspaceSidebarPanel[] = ['explorer', 'search', 'source-control', 'pull-requests', 'agent']

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
    case 'pull-request-file': {
      if (
        typeof tab.owner !== 'string' ||
        tab.owner.length === 0 ||
        typeof tab.repo !== 'string' ||
        tab.repo.length === 0 ||
        typeof tab.number !== 'number' ||
        Number.isNaN(tab.number) ||
        typeof tab.path !== 'string' ||
        tab.path.length === 0 ||
        typeof tab.ref !== 'string' ||
        tab.ref.length === 0
      ) {
        return null
      }

      return createPullRequestFileTab({
        owner: tab.owner,
        repo: tab.repo,
        number: tab.number,
        path: tab.path,
        ref: tab.ref
      })
    }
    case 'commit':
      if (typeof tab.sha !== 'string' || tab.sha.length === 0) {
        return null
      }
      return createCommitTab(tab.sha, typeof tab.title === 'string' && tab.title.length > 0 ? tab.title : undefined)
    case 'agent':
      // Agent tabs are ephemeral — don't restore from session
      return null
    case 'pull-request': {
      if (typeof tab.number !== 'number' || Number.isNaN(tab.number)) {
        return null
      }

      return {
        id: getPullRequestTabId(tab.number),
        kind: 'pull-request',
        number: tab.number,
        subview: isPullRequestSubview(tab.subview) ? tab.subview : 'conversation',
        title: typeof tab.title === 'string' && tab.title.length > 0 ? tab.title : undefined,
        prState: isPRState(tab.prState) ? tab.prState : undefined
      }
    }
    default:
      return null
  }
}

function isPullRequestSubview(value: unknown): value is PullRequestSubview {
  return value === 'conversation' || value === 'commits' || value === 'files'
}

function isPRState(value: unknown): value is 'open' | 'closed' | 'merged' | 'draft' {
  return value === 'open' || value === 'closed' || value === 'merged' || value === 'draft'
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
