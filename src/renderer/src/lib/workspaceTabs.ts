export type PullRequestSubview = 'conversation' | 'commits' | 'files'

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
      id: `diff:${string}`
      kind: 'diff'
      path: string
      staged: boolean
    }
  | {
      id: `pull-request:${number}`
      kind: 'pull-request'
      number: number
      subview: PullRequestSubview
      title?: string
      prState?: 'open' | 'closed' | 'merged' | 'draft'
    }
  | {
      id: `commit:${string}`
      kind: 'commit'
      sha: string
      title?: string
    }
  | {
      id: `agent:${string}`
      kind: 'agent'
      sessionId: string
      title: string
    }

export type WorkspaceActiveView = 'workspace' | 'settings'

export type WorkspaceSidebarPanel = 'explorer' | 'search' | 'source-control' | 'pull-requests' | 'agent'

export interface WorkspaceSidebarState {
  visible: boolean
  activePanel: WorkspaceSidebarPanel | null
}

export interface WorkspaceSession {
  folderPath: string
  sidebar: WorkspaceSidebarState
  tabs: WorkspaceTab[]
  activeTabId: WorkspaceTab['id'] | null
  activeView: WorkspaceActiveView
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
    activeTabId: welcomeTab.id,
    activeView: 'workspace'
  }
}

export function getFileTabId(path: string): `file:${string}` {
  return `file:${path}`
}

export function getPullRequestTabId(number: number): `pull-request:${number}` {
  return `pull-request:${number}`
}

export function createCommitTab(sha: string, title?: string): WorkspaceTab {
  return {
    id: getCommitTabId(sha),
    kind: 'commit',
    sha,
    title
  }
}

export function getCommitTabId(sha: string): `commit:${string}` {
  return `commit:${sha}`
}

export function createDiffTab(path: string, staged: boolean): WorkspaceTab {
  return {
    id: getDiffTabId(path, staged),
    kind: 'diff',
    path,
    staged
  }
}

export function getDiffTabId(path: string, staged: boolean): `diff:${string}` {
  return `diff:${staged ? 'staged' : 'unstaged'}:${path}`
}

export function createAgentTab(sessionId: string, title: string): WorkspaceTab {
  return {
    id: getAgentTabId(sessionId),
    kind: 'agent',
    sessionId,
    title
  }
}

export function getAgentTabId(sessionId: string): `agent:${string}` {
  return `agent:${sessionId}`
}
