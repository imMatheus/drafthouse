export type PullRequestSubview = 'conversation' | 'commits' | 'checks' | 'files'

export type WorkspaceTab =
  | {
      id: 'welcome'
      kind: 'welcome'
    }
  | {
      id: `file:${string}`
      kind: 'file'
      path: string
    }
  | {
      id: 'pull-request-list'
      kind: 'pull-request-list'
    }
  | {
      id: `pull-request:${number}`
      kind: 'pull-request'
      number: number
      subview: PullRequestSubview
      title?: string
    }

export interface WorkspaceSidebarState {
  visible: boolean
  activePanel: 'explorer' | null
}

export interface WorkspaceSession {
  folderPath: string
  sidebar: WorkspaceSidebarState
  tabs: WorkspaceTab[]
  activeTabId: WorkspaceTab['id'] | null
}

export function createWelcomeTab(): WorkspaceTab {
  return {
    id: 'welcome',
    kind: 'welcome'
  }
}

export function createFileTab(path: string): WorkspaceTab {
  return {
    id: getFileTabId(path),
    kind: 'file',
    path
  }
}

export function createPullRequestListTab(): WorkspaceTab {
  return {
    id: 'pull-request-list',
    kind: 'pull-request-list'
  }
}

export function createPullRequestTab(number: number): WorkspaceTab {
  return {
    id: getPullRequestTabId(number),
    kind: 'pull-request',
    number,
    subview: 'conversation'
  }
}

export function createInitialWorkspaceSession(folderPath: string): WorkspaceSession {
  const welcomeTab = createWelcomeTab()

  return {
    folderPath,
    sidebar: {
      visible: true,
      activePanel: 'explorer'
    },
    tabs: [welcomeTab],
    activeTabId: welcomeTab.id
  }
}

export function getFileTabId(path: string): `file:${string}` {
  return `file:${path}`
}

export function getPullRequestTabId(number: number): `pull-request:${number}` {
  return `pull-request:${number}`
}

export function isPullRequestWorkspaceTab(tab: WorkspaceTab | null | undefined): boolean {
  return tab?.kind === 'pull-request-list' || tab?.kind === 'pull-request'
}
