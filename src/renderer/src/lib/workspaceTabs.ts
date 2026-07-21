import { createEditorGroup, groupNode, type LayoutNode } from './editorLayout'

export type PullRequestSubview = 'conversation' | 'commits' | 'files'

export interface PullRequestFileTabInput {
  owner: string
  repo: string
  number: number
  path: string
  ref: string
}

export type WorkspaceTab =
  | {
      id: 'welcome'
      kind: 'welcome'
    }
  | {
      id: 'dashboard'
      kind: 'dashboard'
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
  | ({
      id: `pull-request-file:${string}`
      kind: 'pull-request-file'
    } & PullRequestFileTabInput)
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
  // The editor area is a tree of split groups. `activeGroupId` is the group that
  // receives newly opened files and keyboard actions.
  layout: LayoutNode
  activeGroupId: string
  activeView: WorkspaceActiveView
}

/** Build a layout containing a single group holding `tabs`. */
export function singleGroupLayout(
  tabs: WorkspaceTab[],
  activeTabId?: WorkspaceTab['id'] | null
): { layout: LayoutNode; activeGroupId: string } {
  const group = createEditorGroup(tabs, activeTabId)
  return { layout: groupNode(group), activeGroupId: group.id }
}

export function createWelcomeTab(): WorkspaceTab {
  return {
    id: 'welcome',
    kind: 'welcome'
  }
}

export function createDashboardTab(): WorkspaceTab {
  return {
    id: 'dashboard',
    kind: 'dashboard'
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
  const { layout, activeGroupId } = singleGroupLayout([createWelcomeTab()])

  return {
    folderPath,
    sidebar: {
      visible: true,
      activePanel: 'explorer'
    },
    layout,
    activeGroupId,
    activeView: 'workspace'
  }
}

export function getFileTabId(path: string): `file:${string}` {
  return `file:${path}`
}

export function getPullRequestTabId(number: number): `pull-request:${number}` {
  return `pull-request:${number}`
}

export function createPullRequestFileTab(input: PullRequestFileTabInput): WorkspaceTab {
  return {
    id: getPullRequestFileTabId(input),
    kind: 'pull-request-file',
    ...input
  }
}

export function getPullRequestFileTabId(input: PullRequestFileTabInput): `pull-request-file:${string}` {
  return `pull-request-file:${input.owner}/${input.repo}#${input.number}:${input.ref}:${input.path}`
}

export function createCommitTab(sha: string, title?: string): WorkspaceTab {
  return {
    id: getCommitTabId(sha),
    kind: 'commit',
    sha,
    title
  }
}

function getCommitTabId(sha: string): `commit:${string}` {
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

function getDiffTabId(path: string, staged: boolean): `diff:${string}` {
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
