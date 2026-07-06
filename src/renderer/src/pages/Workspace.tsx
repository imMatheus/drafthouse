import type { ReactNode } from 'react'
import { useEffect, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Files, GitBranch, GitGraph, LayoutDashboard, Search, Terminal } from 'lucide-react'
import type {
  AgentContext,
  AgentPermissionMode,
  AgentSessionMeta,
  AgentStartOptions,
  GitChangedFile,
  GitRepoInfo,
  PullRequestDetail
} from '../../../shared/types'
import { prStateLabel } from '../lib/prMentions'
import { getPathBasename } from '../lib/path'
import ActivityBar from '../components/ActivityBar'
import CommandPalette from '../components/CommandPalette'
import FilePalette from '../components/FilePalette'
import AgentPanel from '../components/AgentPanel'
import ExplorerPanel from '../components/ExplorerPanel'
import SearchPanel from '../components/SearchPanel'
import PullRequestsPanel from '../components/PullRequestsPanel'
import SourceControlPanel from '../components/SourceControlPanel'
import EditorLayout from '../components/EditorLayout'
import type { EditorGroupHandlers, EditorDropTarget } from '../components/EditorGroupView'
import WorkspaceTopBar from '../components/WorkspaceTopBar'
import type { WorkspaceSession } from '../lib/workspaceSession'
import {
  createAgentTab,
  createCommitTab,
  createDashboardTab,
  createDiffTab,
  createFileTab,
  createPullRequestFileTab,
  createPullRequestTab,
  getAgentTabId,
  getFileTabId,
  type PullRequestFileTabInput,
  type PullRequestSubview,
  type WorkspaceSidebarPanel,
  type WorkspaceTab
} from '../lib/workspaceTabs'
import {
  addTabToGroup,
  collectGroups,
  countGroups,
  createEditorGroup,
  findGroup,
  findGroupContainingTab,
  firstGroupId,
  mapAllGroups,
  removeGroup,
  removeTabAndCollapse,
  removeTabFromGroup,
  replaceGroup,
  setSplitSizes,
  splitWithGroup,
  type LayoutNode
} from '../lib/editorLayout'
import AgentSessionTab from './workspace/AgentSessionTab'
import SettingsView from './workspace/SettingsView'
import DashboardView from './workspace/DashboardView'
import DiffView from './workspace/DiffView'
import FilesView, { type FileReveal } from './workspace/FilesView'
import PlaceholderView from './workspace/PlaceholderView'
import PullRequestDetailView from './workspace/PullRequestDetailView'
import PullRequestFileView from './workspace/PullRequestFileView'
import CommitDetailView from './workspace/CommitDetailView'
import WelcomeView from './workspace/WelcomeView'
import AsciiArt from '../components/AsciiArt'
import {
  WorkspaceContextProvider,
  type QueuedAgentPrompt,
  type WorkspaceAgentActions
} from '../contexts/WorkspaceContext'
import WorkerPoolProvider from '../components/WorkerPoolProvider'
import { AgentSessionsProvider, AgentSessionsStore } from '../contexts/AgentSessionsContext'
import { LoadingView } from '../components/Loading'
import { useSettings } from '../hooks/useSettings'

function mergePRsIntoContext(
  existing: AgentContext | undefined,
  newPRs: PullRequestDetail[] | undefined
): AgentContext | undefined {
  if (!newPRs || newPRs.length === 0) return existing
  const incoming = newPRs.map((pr) => ({ number: pr.number, title: pr.title, state: prStateLabel(pr) }))
  if (!existing) {
    return {
      source: 'pull-request',
      systemPromptSuffix: '',
      label: incoming.length === 1 ? `PR #${incoming[0].number}` : `${incoming.length} PRs`,
      prs: incoming
    }
  }
  // Seed `prs` from the existing single-PR fields when it wasn't populated
  // (e.g. sessions started from the PR detail view).
  const base =
    existing.prs && existing.prs.length > 0
      ? existing.prs
      : existing.prNumber != null && existing.prTitle != null
        ? [{ number: existing.prNumber, title: existing.prTitle, state: existing.prState ?? 'open' }]
        : []
  const seen = new Set(base.map((p) => p.number))
  const merged = [...base]
  for (const pr of incoming) {
    if (!seen.has(pr.number)) {
      merged.push(pr)
      seen.add(pr.number)
    }
  }
  return { ...existing, prs: merged }
}

interface WorkspaceProps {
  session: WorkspaceSession
  onCloseWorkspace: () => void
  onUpdateSession: (patch: Partial<WorkspaceSession>) => void
}

export default function Workspace({ session, onCloseWorkspace, onUpdateSession }: WorkspaceProps) {
  const { folderPath, sidebar, layout, activeGroupId, activeView } = session
  const activeGroup = findGroup(layout, activeGroupId)
  const activeTabId = activeGroup?.activeTabId ?? null
  const activeTab = activeGroup?.tabs.find((tab) => tab.id === activeTabId) ?? null
  const activeFilePath = activeTab?.kind === 'file' ? activeTab.path : null
  const activeSourceControlFile =
    activeTab?.kind === 'diff'
      ? { path: activeTab.path, staged: activeTab.staged }
      : activeTab?.kind === 'file'
        ? { path: getWorkspaceRelativePath(activeTab.path, folderPath), staged: null }
        : null
  const totalGroups = countGroups(layout)

  // The thing currently being dragged. `fromGroupId` is the source group for an
  // internal tab drag, or null for an external drag from the sidebar (a file,
  // PR or agent session being dragged into the editor area).
  const [pendingDrag, setPendingDrag] = useState<{ tab: WorkspaceTab; fromGroupId: string | null } | null>(null)

  const findTabAnywhere = (tabId: WorkspaceTab['id']): WorkspaceTab | null =>
    collectGroups(layout)
      .flatMap((group) => group.tabs)
      .find((tab) => tab.id === tabId) ?? null

  // Agent state: session metadata lives in React state (infrequent — only on
  // session start / status changes). Per-session stream events live in a
  // mutable external store so each token update re-renders only the
  // components subscribed to *that* specific session's events (AgentConversation,
  // InlineAgentResponseCard), never the whole workspace tree.
  const [sessionMetas, setSessionMetas] = useState<AgentSessionMeta[]>([])
  const agentSessionsStoreRef = useRef<AgentSessionsStore | null>(null)
  if (agentSessionsStoreRef.current === null) agentSessionsStoreRef.current = new AgentSessionsStore()
  const agentSessionsStore = agentSessionsStoreRef.current
  const [activeAgentSessionId, setActiveAgentSessionId] = useState<string | null>(null)
  const { settings } = useSettings()

  // Follow-ups submitted while a turn was still running. Held here — not yet
  // sent to the CLI — so they render above the prompt bar and can be
  // cancelled; one is sent each time a running turn completes successfully.
  // The ref mirrors the state so the IPC event handler (subscribed once)
  // always reads the current queue instead of a stale closure.
  const [queuedAgentPrompts, setQueuedAgentPromptsState] = useState<Record<string, QueuedAgentPrompt[]>>({})
  const queuedAgentPromptsRef = useRef<Record<string, QueuedAgentPrompt[]>>({})
  const updateQueuedPrompts = (
    updater: (prev: Record<string, QueuedAgentPrompt[]>) => Record<string, QueuedAgentPrompt[]>
  ): void => {
    queuedAgentPromptsRef.current = updater(queuedAgentPromptsRef.current)
    setQueuedAgentPromptsState(queuedAgentPromptsRef.current)
  }

  const sendPromptToSession = (sessionId: string, item: QueuedAgentPrompt): void => {
    setSessionMetas((prev) =>
      prev.map((s) => {
        if (s.id !== sessionId) return s
        return { ...s, status: 'running' as const, context: mergePRsIntoContext(s.context, item.mentionedPRs) }
      })
    )
    window.api.agent
      .send({ sessionId, prompt: item.prompt, cliPrompt: item.cliPrompt, files: item.files })
      .catch((error: unknown) => console.error('Failed to send agent message', error))
  }

  const flushNextQueuedPrompt = (sessionId: string): void => {
    const queue = queuedAgentPromptsRef.current[sessionId]
    if (!queue || queue.length === 0) return
    const [head, ...rest] = queue
    updateQueuedPrompts((prev) => {
      const next = { ...prev }
      if (rest.length > 0) next[sessionId] = rest
      else delete next[sessionId]
      return next
    })
    sendPromptToSession(sessionId, head)
  }
  const [activePalette, setActivePalette] = useState<'command' | 'file' | null>(null)
  const [searchFocusNonce, setSearchFocusNonce] = useState(0)

  // A one-shot request to scroll a file tab to a given line (e.g. a search hit).
  // Transient (not persisted): only the matching active file view consumes it.
  // The globally-monotonic nonce lets re-clicking the same result re-trigger it.
  const [pendingReveal, setPendingReveal] = useState<{ tabId: WorkspaceTab['id']; reveal: FileReveal } | null>(null)
  const revealCounterRef = useRef(0)

  // Tab navigation history (back/forward buttons in the top bar). Tracks visited
  // {group, tab} locations so the user can move through them like a browser.
  // Local-only state — history doesn't persist across reloads.
  type NavLocation = { groupId: string; tabId: WorkspaceTab['id'] }
  const [navState, setNavState] = useState<{ history: NavLocation[]; index: number }>(() =>
    activeTabId ? { history: [{ groupId: activeGroupId, tabId: activeTabId }], index: 0 } : { history: [], index: -1 }
  )
  const skipNextHistoryPushRef = useRef(false)

  useEffect(() => {
    if (!activeGroupId || !activeTabId) return
    if (skipNextHistoryPushRef.current) {
      skipNextHistoryPushRef.current = false
      return
    }
    setNavState((prev) => {
      const top = prev.history[prev.index]
      if (top && top.groupId === activeGroupId && top.tabId === activeTabId) return prev
      const truncated = prev.history.slice(0, prev.index + 1)
      return { history: [...truncated, { groupId: activeGroupId, tabId: activeTabId }], index: truncated.length }
    })
  }, [activeGroupId, activeTabId])

  // Drop nav entries whose group no longer exists after a structural change.
  const pruneNavHistory = (nextLayout: LayoutNode): void => {
    const validGroupIds = new Set(collectGroups(nextLayout).map((group) => group.id))
    setNavState((prev) => {
      const history: NavLocation[] = []
      let index = prev.index
      prev.history.forEach((entry, i) => {
        if (validGroupIds.has(entry.groupId)) {
          history.push(entry)
        } else if (i <= prev.index) {
          index--
        }
      })
      return { history, index: Math.max(index, history.length === 0 ? -1 : 0) }
    })
  }

  const canGoBack = navState.index > 0
  const canGoForward = navState.index < navState.history.length - 1

  const navigateTo = (targetIndex: number): void => {
    const target = navState.history[targetIndex]
    if (!target) return
    const group = findGroup(layout, target.groupId)
    if (!group) {
      setNavState({ ...navState, index: targetIndex })
      return
    }
    skipNextHistoryPushRef.current = true
    setNavState({ ...navState, index: targetIndex })
    const tabExists = group.tabs.some((tab) => tab.id === target.tabId)
    onUpdateSession({
      layout: tabExists ? replaceGroup(layout, target.groupId, (g) => ({ ...g, activeTabId: target.tabId })) : layout,
      activeGroupId: target.groupId
    })
  }

  const handleGoBack = (): void => {
    if (canGoBack) navigateTo(navState.index - 1)
  }

  const handleGoForward = (): void => {
    if (canGoForward) navigateTo(navState.index + 1)
  }

  const {
    data: gitInfo,
    isLoading: isLoadingGitInfo,
    error: gitInfoError
  } = useQuery<GitRepoInfo | null, Error>({
    queryKey: ['git-info', folderPath],
    queryFn: () => window.api.fs.getGitInfo(folderPath),
    retry: false
  })

  const { data: gitStatus } = useQuery<GitChangedFile[]>({
    queryKey: ['git-status', folderPath],
    queryFn: () => window.api.git.status(folderPath),
    refetchInterval: 3000,
    retry: false
  })

  useEffect(() => {
    let cancelled = false

    void window.api.fs
      .openRecent(folderPath)
      .then((resolvedFolderPath) => {
        if (cancelled || resolvedFolderPath === folderPath) return

        onUpdateSession({
          folderPath: resolvedFolderPath
        })
      })
      .catch((error: unknown) => {
        if (cancelled) return
        console.error('Failed to restore workspace', error)
        onCloseWorkspace()
      })

    return () => {
      cancelled = true
    }
  }, [folderPath, onCloseWorkspace, onUpdateSession])

  // Subscribe to agent events. Token events mutate the external events store
  // which notifies only the specific session's subscribers. Metadata updates
  // (status / cliSessionId / cost) happen on init / result / lifecycle only
  // and go through React state so the session list & status chrome update.
  useEffect(() => {
    return window.api.agent.onEvent(({ sessionId, seq, event }) => {
      agentSessionsStore.ingest(sessionId, seq, event)

      const affectsMeta =
        (event.type === 'system' && event.subtype === 'init') ||
        event.type === 'result' ||
        (event.type === 'lifecycle' && (event.failedTurn === true || event.subtype !== 'exit')) ||
        (event.type === 'user' && event.synthetic === true)
      if (!affectsMeta) return

      setSessionMetas((prev) =>
        prev.map((s) => {
          if (s.id !== sessionId) return s
          const next: AgentSessionMeta = { ...s, lastActivityAt: Date.now() }
          if (event.type === 'system' && event.subtype === 'init') {
            if ('session_id' in event && typeof event.session_id === 'string') next.cliSessionId = event.session_id
            if ('model' in event && typeof event.model === 'string') next.initModel = event.model
          } else if (event.type === 'result') {
            // A user-initiated stop can race the turn's own result — cancel wins.
            next.status = event.is_error ? 'error' : s.status === 'cancelled' ? 'cancelled' : 'completed'
            if (typeof event.total_cost_usd === 'number') next.totalCostUsd = event.total_cost_usd
          } else if (event.type === 'lifecycle') {
            next.status = 'error'
          } else if (event.type === 'user') {
            // A prompt echo means a turn started.
            next.status = 'running'
          }
          return next
        })
      )

      // A turn finished cleanly — fire the next queued follow-up, if any.
      // Errored/stopped turns keep their queue so nothing sends into a broken
      // session unreviewed; the queue resumes on the user's next send.
      if (event.type === 'result' && !event.is_error) {
        flushNextQueuedPrompt(sessionId)
      }
    })
  }, [agentSessionsStore])

  // Hydrate persisted sessions for this workspace: metadata into React state,
  // events into the store. Sessions started in this window are hydrated at
  // start time; anything already hydrated is skipped.
  useEffect(() => {
    let cancelled = false
    void window.api.agent
      .list(folderPath)
      .then(async (snapshots) => {
        if (cancelled) return
        setSessionMetas((prev) => {
          const known = new Set(prev.map((s) => s.id))
          const restored = snapshots.map((snapshot) => snapshot.meta).filter((meta) => !known.has(meta.id))
          if (restored.length === 0) return prev
          return [...prev, ...restored].sort((a, b) => a.startedAt - b.startedAt)
        })
        for (const snapshot of snapshots) {
          if (agentSessionsStore.isHydrated(snapshot.meta.id)) continue
          const { events, nextSeq } = await window.api.agent.events(snapshot.meta.id)
          if (cancelled) return
          agentSessionsStore.hydrate(snapshot.meta.id, events, nextSeq)
        }
      })
      .catch((error: unknown) => {
        console.error('Failed to restore agent sessions', error)
      })
    return () => {
      cancelled = true
    }
  }, [folderPath, agentSessionsStore])

  // Resolve which group new tabs should open into, falling back to the first
  // group if the active group id is somehow stale.
  const resolveActiveGroupId = (): string => (findGroup(layout, activeGroupId) ? activeGroupId : firstGroupId(layout))

  // Open (or focus) a tab in the active group. Per the chosen behavior the same
  // file may be open in multiple groups at once.
  const openInActiveGroup = (nextTab: WorkspaceTab): void => {
    const targetGroupId = resolveActiveGroupId()
    onUpdateSession({
      layout: replaceGroup(layout, targetGroupId, (group) => addTabToGroup(group, nextTab)),
      activeGroupId: targetGroupId
    })
  }

  // Focus an existing copy of a tab wherever it lives, else open it in the
  // active group. Used for agent tabs to avoid duplicate live sessions.
  const focusOrOpenTab = (nextTab: WorkspaceTab): void => {
    const existingGroup = findGroupContainingTab(layout, nextTab.id)
    if (existingGroup) {
      onUpdateSession({
        layout: replaceGroup(layout, existingGroup.id, (group) => ({ ...group, activeTabId: nextTab.id })),
        activeGroupId: existingGroup.id
      })
      return
    }
    openInActiveGroup(nextTab)
  }

  const handleSelectTab = (groupId: string, tabId: WorkspaceTab['id']): void => {
    const group = findGroup(layout, groupId)
    const selectedTab = group?.tabs.find((tab) => tab.id === tabId)
    if (selectedTab?.kind === 'agent') {
      setActiveAgentSessionId(selectedTab.sessionId)
    }

    if (groupId === activeGroupId && group?.activeTabId === tabId) return

    onUpdateSession({
      layout: replaceGroup(layout, groupId, (g) => ({ ...g, activeTabId: tabId })),
      activeGroupId: groupId
    })
  }

  const handleFocusGroup = (groupId: string): void => {
    if (groupId === activeGroupId) return
    const group = findGroup(layout, groupId)
    const groupActiveTab = group?.tabs.find((tab) => tab.id === group.activeTabId)
    if (groupActiveTab?.kind === 'agent') {
      setActiveAgentSessionId(groupActiveTab.sessionId)
    }
    onUpdateSession({ activeGroupId: groupId })
  }

  const handleCloseTab = (groupId: string, tabId: WorkspaceTab['id']): void => {
    const group = findGroup(layout, groupId)
    if (!group || !group.tabs.some((tab) => tab.id === tabId)) return

    const updatedGroup = removeTabFromGroup(group, tabId)
    let nextLayout: LayoutNode
    let nextActiveGroupId = activeGroupId

    if (updatedGroup.tabs.length === 0 && totalGroups > 1) {
      // Collapse the now-empty group and reparent focus to a survivor.
      nextLayout = removeGroup(layout, groupId) ?? layout
      if (activeGroupId === groupId) nextActiveGroupId = firstGroupId(nextLayout)
    } else {
      nextLayout = replaceGroup(layout, groupId, () => updatedGroup)
    }

    pruneNavHistory(nextLayout)
    onUpdateSession({ layout: nextLayout, activeGroupId: nextActiveGroupId })
  }

  const handleResizeSplit = (splitId: string, sizes: number[]): void => {
    onUpdateSession({ layout: setSplitSizes(layout, splitId, sizes) })
  }

  // Sync the active agent session whenever an agent tab becomes the active tab.
  const syncAgentSelection = (tab: WorkspaceTab): void => {
    if (tab.kind === 'agent') setActiveAgentSessionId(tab.sessionId)
  }

  // Split button: move the active tab out into a new group to the right, so the
  // source group keeps its other tabs (e.g. [1,2,3] active on 2 → [1,3] and [2]).
  const handleSplitGroup = (groupId: string): void => {
    const group = findGroup(layout, groupId)
    const tabToMove = group?.tabs.find((tab) => tab.id === group.activeTabId)
    // A single-tab group can't be split — moving its only tab would just relocate it.
    if (!group || !tabToMove || group.tabs.length <= 1) return

    const newGroup = createEditorGroup([tabToMove], tabToMove.id)
    const afterRemoval = replaceGroup(layout, groupId, (g) => removeTabFromGroup(g, tabToMove.id))
    onUpdateSession({
      layout: splitWithGroup(afterRemoval, groupId, 'right', newGroup),
      activeGroupId: newGroup.id
    })
  }

  const handleTabDragStart = (tab: WorkspaceTab, fromGroupId: string): void => {
    setPendingDrag({ tab, fromGroupId })
  }

  const handleDragEnd = (): void => {
    setPendingDrag(null)
  }

  // Start an external drag of a sidebar item (file / PR / agent session).
  const handleExternalDragStart = (tab: WorkspaceTab): void => {
    setPendingDrag({ tab, fromGroupId: null })
  }

  const handleEditorDrop = ({ targetGroupId, position, index }: EditorDropTarget): void => {
    const drag = pendingDrag
    if (!drag) return

    // External drag from the sidebar — nothing to remove from a source group.
    if (drag.fromGroupId === null) {
      if (position === 'center') {
        const nextLayout = replaceGroup(layout, targetGroupId, (g) => addTabToGroup(g, drag.tab, index))
        onUpdateSession({ layout: nextLayout, activeGroupId: targetGroupId })
      } else {
        const newGroup = createEditorGroup([drag.tab], drag.tab.id)
        onUpdateSession({
          layout: splitWithGroup(layout, targetGroupId, position, newGroup),
          activeGroupId: newGroup.id
        })
      }
      syncAgentSelection(drag.tab)
      return
    }

    const fromGroupId = drag.fromGroupId
    const sourceGroup = findGroup(layout, fromGroupId)
    const tab = sourceGroup?.tabs.find((t) => t.id === drag.tab.id)
    if (!sourceGroup || !tab) return

    if (position === 'center') {
      if (fromGroupId === targetGroupId) {
        // A center drop on the group's own content (no target index) is a no-op;
        // only strip drops (which carry an index) reorder.
        if (index === undefined) return
        const origIndex = sourceGroup.tabs.findIndex((t) => t.id === tab.id)
        const without = sourceGroup.tabs.filter((t) => t.id !== tab.id)
        let insertIndex = index
        if (origIndex < insertIndex) insertIndex -= 1
        insertIndex = Math.max(0, Math.min(insertIndex, without.length))
        without.splice(insertIndex, 0, tab)
        onUpdateSession({
          layout: replaceGroup(layout, fromGroupId, (g) => ({ ...g, tabs: without, activeTabId: tab.id })),
          activeGroupId: fromGroupId
        })
        return
      }

      // Move the tab into another existing group.
      let nextLayout = removeTabAndCollapse(layout, fromGroupId, tab.id)
      nextLayout = replaceGroup(nextLayout, targetGroupId, (g) => addTabToGroup(g, tab, index))
      pruneNavHistory(nextLayout)
      onUpdateSession({ layout: nextLayout, activeGroupId: targetGroupId })
      return
    }

    // Edge drop → split. Dragging a group's only tab onto its own edge is a no-op.
    if (fromGroupId === targetGroupId && sourceGroup.tabs.length <= 1) return

    const newGroup = createEditorGroup([tab], tab.id)
    const afterRemoval = removeTabAndCollapse(layout, fromGroupId, tab.id)
    const nextLayout = splitWithGroup(afterRemoval, targetGroupId, position, newGroup)
    pruneNavHistory(nextLayout)
    onUpdateSession({ layout: nextLayout, activeGroupId: newGroup.id })
  }

  const handleOpenFile = (filePath: string, line?: number): void => {
    openInActiveGroup(createFileTab(filePath))
    if (line != null) {
      setPendingReveal({ tabId: getFileTabId(filePath), reveal: { line, nonce: ++revealCounterRef.current } })
    }
  }

  const handleOpenPullRequest = (number: number): void => {
    openInActiveGroup(createPullRequestTab(number))
  }

  // Same as openInActiveGroup, but also leaves the settings view if it's
  // showing — the dashboard is reached from the activity bar, like settings.
  const handleOpenDashboard = (): void => {
    const targetGroupId = resolveActiveGroupId()
    onUpdateSession({
      activeView: 'workspace',
      layout: replaceGroup(layout, targetGroupId, (group) => addTabToGroup(group, createDashboardTab())),
      activeGroupId: targetGroupId
    })
  }

  const handleOpenPullRequestFile = (input: PullRequestFileTabInput): void => {
    openInActiveGroup(createPullRequestFileTab(input))
  }

  const handleOpenCommit = (sha: string, title?: string): void => {
    openInActiveGroup(createCommitTab(sha, title))
  }

  const handleToggleSidebar = (panel: WorkspaceSidebarPanel): void => {
    if (activeView === 'settings') {
      onUpdateSession({
        activeView: 'workspace',
        sidebar: { visible: true, activePanel: panel }
      })
      return
    }

    const isActive = sidebar.visible && sidebar.activePanel === panel

    onUpdateSession({
      sidebar: isActive ? { visible: false, activePanel: panel } : { visible: true, activePanel: panel }
    })
  }

  // Cmd+Shift+F: reveal the search panel and (re)focus its input every time.
  const handleOpenSearch = (): void => {
    setSearchFocusNonce((n) => n + 1)
    if (activeView !== 'workspace' || !sidebar.visible || sidebar.activePanel !== 'search') {
      onUpdateSession({ activeView: 'workspace', sidebar: { visible: true, activePanel: 'search' } })
    }
  }

  const handleToggleSidebarVisibility = (): void => {
    const panelToRestore = sidebar.activePanel ?? 'explorer'

    onUpdateSession({
      sidebar: sidebar.visible
        ? { visible: false, activePanel: sidebar.activePanel }
        : { visible: true, activePanel: panelToRestore }
    })
  }

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent): void => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'b') {
        e.preventDefault()
        handleToggleSidebarVisibility()
      }
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault()
        setActivePalette((prev) => (prev === 'command' ? null : 'command'))
      }
      if ((e.metaKey || e.ctrlKey) && e.key === 'p' && !e.shiftKey) {
        e.preventDefault()
        setActivePalette((prev) => (prev === 'file' ? null : 'file'))
      }
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key.toLowerCase() === 'f') {
        e.preventDefault()
        handleOpenSearch()
      }
      if ((e.metaKey || e.ctrlKey) && e.key === '1') {
        e.preventDefault()
        handleToggleSidebar('agent')
      }
      if ((e.metaKey || e.ctrlKey) && e.key === '2') {
        e.preventDefault()
        handleToggleSidebar('pull-requests')
      }
      if ((e.metaKey || e.ctrlKey) && e.key === '3') {
        e.preventDefault()
        handleToggleSidebar('source-control')
      }
      if ((e.metaKey || e.ctrlKey) && e.key === '4') {
        e.preventDefault()
        handleToggleSidebar('explorer')
      }
      if ((e.metaKey || e.ctrlKey) && e.key === '5') {
        e.preventDefault()
        handleOpenDashboard()
      }
      if ((e.metaKey || e.ctrlKey) && e.key === '\\') {
        e.preventDefault()
        handleSplitGroup(activeGroupId)
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [sidebar, session])

  const handleOpenDiff = (path: string, staged: boolean): void => {
    openInActiveGroup(createDiffTab(path, staged))
  }

  const handleToggleSettings = (): void => {
    onUpdateSession({ activeView: activeView === 'settings' ? 'workspace' : 'settings' })
  }

  const handleStartAgent = async (
    prompt: string,
    files?: string[],
    context?: AgentContext,
    options?: AgentStartOptions
  ): Promise<void> => {
    const permissionMode: AgentPermissionMode =
      options?.permissionMode ?? (settings.agentFullAccess ? 'bypassPermissions' : 'default')
    const model = options?.model ?? null

    const { sessionId } = await window.api.agent.start({
      cwd: folderPath,
      prompt,
      files,
      context,
      permissionMode,
      model
    })

    // A brand-new session's canonical log starts empty, so hydrating with an
    // empty snapshot just flushes the live events buffered since the start call.
    agentSessionsStore.hydrate(sessionId, [], 0)

    const now = Date.now()
    const newSession: AgentSessionMeta = {
      id: sessionId,
      prompt,
      status: 'running',
      startedAt: now,
      lastActivityAt: now,
      cliSessionId: null,
      files: files ?? [],
      context,
      permissionMode,
      model,
      cwd: folderPath
    }

    setSessionMetas((prev) => [...prev, newSession])

    // Inline sessions (e.g. PR inline) don't open an agent tab
    if (context?.inline) return

    setActiveAgentSessionId(sessionId)

    const tabTitle = context
      ? `${context.label}: ${prompt.length > 20 ? prompt.slice(0, 20) + '...' : prompt}`
      : prompt.length > 30
        ? prompt.slice(0, 30) + '...'
        : prompt
    const newTab = createAgentTab(sessionId, tabTitle)
    // Replace the "New Session" placeholder in whatever group holds it (else the
    // active group), swapping it for the real agent tab.
    const placeholderGroup = findGroupContainingTab(layout, getAgentTabId('new'))
    const targetGroupId = placeholderGroup?.id ?? resolveActiveGroupId()

    onUpdateSession({
      layout: replaceGroup(layout, targetGroupId, (group) => ({
        ...group,
        tabs: group.tabs.filter((tab) => !(tab.kind === 'agent' && tab.sessionId === 'new')).concat(newTab),
        activeTabId: newTab.id
      })),
      activeGroupId: targetGroupId
    })
  }

  // Send a follow-up. While a turn is running (or earlier follow-ups are
  // still waiting) the message is queued instead of sent, so it shows above
  // the prompt bar where it can be reviewed and cancelled. The UI always
  // shows the clean `prompt`; `cliPrompt` (when set) carries extra metadata
  // like injected PR context that shouldn't clutter the bubble.
  const handleContinueAgent = async (
    agentSessionId: string,
    prompt: string,
    files?: string[],
    cliPrompt?: string,
    mentionedPRs?: PullRequestDetail[]
  ): Promise<void> => {
    const item: QueuedAgentPrompt = { id: crypto.randomUUID(), prompt, files, cliPrompt, mentionedPRs }
    const isRunning = sessionMetas.find((s) => s.id === agentSessionId)?.status === 'running'
    const hasQueue = (queuedAgentPromptsRef.current[agentSessionId]?.length ?? 0) > 0

    if (isRunning || hasQueue) {
      updateQueuedPrompts((prev) => ({
        ...prev,
        [agentSessionId]: [...(prev[agentSessionId] ?? []), item]
      }))
      // An idle session with leftovers (the turn errored or was stopped):
      // this send restarts the queue from the front so order is preserved.
      if (!isRunning) flushNextQueuedPrompt(agentSessionId)
      return
    }

    sendPromptToSession(agentSessionId, item)
  }

  const handleDeleteAgentSession = async (sessionId: string): Promise<void> => {
    await window.api.agent.delete(sessionId)
    setSessionMetas((prev) => prev.filter((s) => s.id !== sessionId))
    agentSessionsStore.remove(sessionId)
    updateQueuedPrompts((prev) => {
      if (!(sessionId in prev)) return prev
      const next = { ...prev }
      delete next[sessionId]
      return next
    })
    if (activeAgentSessionId === sessionId) setActiveAgentSessionId(null)

    const tabId = getAgentTabId(sessionId)
    let nextLayout = layout
    for (const group of collectGroups(layout)) {
      if (group.tabs.some((tab) => tab.id === tabId)) {
        nextLayout = removeTabAndCollapse(nextLayout, group.id, tabId)
      }
    }
    if (nextLayout !== layout) {
      pruneNavHistory(nextLayout)
      onUpdateSession({ layout: nextLayout, activeGroupId: firstGroupId(nextLayout) })
    }
  }

  const handleSelectAgentSession = (sessionId: string): void => {
    setActiveAgentSessionId(sessionId)
    const agentSession = sessionMetas.find((s) => s.id === sessionId)
    if (agentSession) {
      const truncatedPrompt =
        agentSession.prompt.length > 30 ? agentSession.prompt.slice(0, 30) + '...' : agentSession.prompt
      focusOrOpenTab(createAgentTab(sessionId, truncatedPrompt))
    }
  }

  const handleNewAgentSession = (): void => {
    setActiveAgentSessionId(null)
    focusOrOpenTab(createAgentTab('new', 'New Session'))
  }

  const handleAgentActivityClick = (): void => {
    setActiveAgentSessionId(null)

    const newTabId = getAgentTabId('new')
    const placeholderGroup = findGroupContainingTab(layout, newTabId)
    const sidebarPatch = { sidebar: { visible: true, activePanel: 'agent' as const } }

    if (placeholderGroup) {
      onUpdateSession({
        activeView: 'workspace',
        layout: replaceGroup(layout, placeholderGroup.id, (g) => ({ ...g, activeTabId: newTabId })),
        activeGroupId: placeholderGroup.id,
        ...sidebarPatch
      })
      return
    }

    const newTab = createAgentTab('new', 'New Session')
    const targetGroupId = resolveActiveGroupId()
    onUpdateSession({
      activeView: 'workspace',
      layout: replaceGroup(layout, targetGroupId, (g) => addTabToGroup(g, newTab)),
      activeGroupId: targetGroupId,
      ...sidebarPatch
    })
  }

  const handleStopAgent = async (sessionId: string): Promise<void> => {
    await window.api.agent.stop(sessionId)

    setSessionMetas((prev) => prev.map((s) => (s.id === sessionId ? { ...s, status: 'cancelled' as const } : s)))
  }

  // PR/commit tabs may be open in more than one group; update every copy.
  const handlePullRequestSubviewChange = (tabId: WorkspaceTab['id'], subview: PullRequestSubview): void => {
    onUpdateSession({
      layout: mapAllGroups(layout, (group) => ({
        ...group,
        tabs: group.tabs.map((tab) => (tab.id === tabId && tab.kind === 'pull-request' ? { ...tab, subview } : tab))
      }))
    })
  }

  const handlePullRequestTitleChange = (tabId: WorkspaceTab['id'], title: string): void => {
    const currentTab = findTabAnywhere(tabId)
    if (!currentTab || currentTab.kind !== 'pull-request' || currentTab.title === title) return

    onUpdateSession({
      layout: mapAllGroups(layout, (group) => ({
        ...group,
        tabs: group.tabs.map((tab) => (tab.id === tabId && tab.kind === 'pull-request' ? { ...tab, title } : tab))
      }))
    })
  }

  const handlePullRequestStateChange = (
    tabId: WorkspaceTab['id'],
    prState: 'open' | 'closed' | 'merged' | 'draft'
  ): void => {
    const currentTab = findTabAnywhere(tabId)
    if (!currentTab || currentTab.kind !== 'pull-request' || currentTab.prState === prState) return

    onUpdateSession({
      layout: mapAllGroups(layout, (group) => ({
        ...group,
        tabs: group.tabs.map((tab) => (tab.id === tabId && tab.kind === 'pull-request' ? { ...tab, prState } : tab))
      }))
    })
  }

  const handleCommitTitleChange = (tabId: WorkspaceTab['id'], title: string): void => {
    const currentTab = findTabAnywhere(tabId)
    if (!currentTab || currentTab.kind !== 'commit' || currentTab.title === title) return

    onUpdateSession({
      layout: mapAllGroups(layout, (group) => ({
        ...group,
        tabs: group.tabs.map((tab) => (tab.id === tabId && tab.kind === 'commit' ? { ...tab, title } : tab))
      }))
    })
  }

  const handlePromoteAgentSession = (sessionId: string): void => {
    const target = sessionMetas.find((s) => s.id === sessionId)
    if (!target) return

    // Remove inline flag so it appears in the agent panel
    setSessionMetas((prev) =>
      prev.map((s) => (s.id === sessionId && s.context ? { ...s, context: { ...s.context, inline: false } } : s))
    )
    setActiveAgentSessionId(sessionId)

    const tabTitle = target.context
      ? `${target.context.label}: ${target.prompt.length > 20 ? target.prompt.slice(0, 20) + '...' : target.prompt}`
      : target.prompt.length > 30
        ? target.prompt.slice(0, 30) + '...'
        : target.prompt
    focusOrOpenTab(createAgentTab(sessionId, tabTitle))
  }

  // Keep the latest close handler in a ref so the IPC listener subscribes once
  // instead of re-subscribing on every render (handleCloseTab is unmemoized and
  // the workspace re-renders on agent activity / git polling).
  const closeActiveTabRef = useRef<() => void>(() => {})
  closeActiveTabRef.current = () => {
    if (activeTabId) handleCloseTab(activeGroupId, activeTabId)
  }
  useEffect(() => {
    return window.api.fs.onCloseTab(() => closeActiveTabRef.current())
  }, [])

  const editorHandlers: EditorGroupHandlers = {
    onSelectTab: handleSelectTab,
    onCloseTab: handleCloseTab,
    onFocusGroup: handleFocusGroup,
    onSplitGroup: handleSplitGroup,
    onTabDragStart: handleTabDragStart,
    onTabDragEnd: handleDragEnd,
    onDrop: handleEditorDrop,
    onResizeSplit: handleResizeSplit
  }

  const changedFileCount = gitStatus?.length ?? 0

  const runningAgentCount = sessionMetas.filter((s) => s.status === 'running').length

  const activityItems = [
    {
      id: 'agent',
      label: 'Agent',
      icon: Terminal,
      active: sidebar.visible && sidebar.activePanel === 'agent',
      badge: runningAgentCount > 0 ? runningAgentCount : undefined,
      onClick: handleAgentActivityClick,
      shortcut: ['⌘', '1']
    },
    {
      id: 'pull-requests',
      label: 'Pull Requests',
      icon: GitGraph,
      active: sidebar.visible && sidebar.activePanel === 'pull-requests',
      onClick: () => handleToggleSidebar('pull-requests'),
      shortcut: ['⌘', '2']
    },
    {
      id: 'source-control',
      label: 'Source Control',
      icon: GitBranch,
      active: sidebar.visible && sidebar.activePanel === 'source-control',
      badge: changedFileCount > 0 ? changedFileCount : undefined,
      onClick: () => handleToggleSidebar('source-control'),
      shortcut: ['⌘', '3']
    },
    {
      id: 'explorer',
      label: 'Files',
      icon: Files,
      active: sidebar.visible && sidebar.activePanel === 'explorer',
      onClick: () => handleToggleSidebar('explorer'),
      shortcut: ['⌘', '4']
    },
    {
      id: 'search',
      label: 'Search',
      icon: Search,
      active: sidebar.visible && sidebar.activePanel === 'search',
      onClick: () => handleToggleSidebar('search'),
      shortcut: ['⌘', '⇧', 'F']
    },
    {
      id: 'dashboard',
      label: 'Dashboard',
      icon: LayoutDashboard,
      active: activeView === 'workspace' && activeTab?.kind === 'dashboard',
      onClick: handleOpenDashboard,
      shortcut: ['⌘', '5']
    }
  ]

  const projectName = getPathBasename(folderPath)

  // Permission decisions flow straight to the main process; plan approval also
  // flips the session out of plan mode into the configured execution mode.
  const executionPermissionMode: AgentPermissionMode = settings.agentFullAccess ? 'bypassPermissions' : 'default'
  const agentActions: WorkspaceAgentActions = {
    respondPermission: (sessionId, requestId, behavior, options) => {
      void window.api.agent.respondPermission(sessionId, requestId, { behavior, ...options })
    },
    approvePlan: (sessionId, requestId) => {
      void window.api.agent.respondPermission(sessionId, requestId, { behavior: 'allow' })
      void window.api.agent.setPermissionMode(sessionId, executionPermissionMode)
      setSessionMetas((prev) =>
        prev.map((s) => (s.id === sessionId ? { ...s, permissionMode: executionPermissionMode } : s))
      )
    },
    rejectPlan: (sessionId, requestId) => {
      void window.api.agent.respondPermission(sessionId, requestId, {
        behavior: 'deny',
        message: 'The user wants to keep planning — revise the plan based on their next message.'
      })
    },
    setPermissionMode: (sessionId, mode) => {
      void window.api.agent.setPermissionMode(sessionId, mode)
      setSessionMetas((prev) => prev.map((s) => (s.id === sessionId ? { ...s, permissionMode: mode } : s)))
    },
    setModel: (sessionId, model) => {
      const previousModel = sessionMetas.find((s) => s.id === sessionId)?.model ?? null
      setSessionMetas((prev) => prev.map((s) => (s.id === sessionId ? { ...s, model } : s)))
      window.api.agent.setModel(sessionId, model).catch((error: unknown) => {
        console.error('Failed to switch model', error)
        setSessionMetas((prev) => prev.map((s) => (s.id === sessionId ? { ...s, model: previousModel } : s)))
      })
    },
    cancelQueuedPrompt: (sessionId, promptId) => {
      updateQueuedPrompts((prev) => {
        const queue = prev[sessionId]
        if (!queue) return prev
        const remaining = queue.filter((q) => q.id !== promptId)
        const next = { ...prev }
        if (remaining.length > 0) next[sessionId] = remaining
        else delete next[sessionId]
        return next
      })
    }
  }

  return (
    <WorkspaceContextProvider
      value={{
        gitInfo: gitInfo ?? null,
        folderPath,
        onOpenPullRequest: handleOpenPullRequest,
        agentActions,
        queuedAgentPrompts
      }}
    >
      <AgentSessionsProvider store={agentSessionsStore}>
        <WorkerPoolProvider>
          <div className="bg-background flex w-screen flex-1 flex-col">
            <WorkspaceTopBar
              projectName={projectName}
              onToggleSidebar={handleToggleSidebarVisibility}
              canGoBack={canGoBack}
              canGoForward={canGoForward}
              onGoBack={handleGoBack}
              onGoForward={handleGoForward}
            />

            <div className="flex min-h-0 flex-1 overflow-hidden">
              <ActivityBar
                items={activityItems}
                onSettingsClick={handleToggleSettings}
                settingsActive={activeView === 'settings'}
              />

              {activeView === 'settings' ? (
                <SettingsView />
              ) : (
                <>
                  {sidebar.visible && sidebar.activePanel === 'explorer' ? (
                    <ExplorerPanel
                      folderPath={folderPath}
                      selectedFilePath={activeFilePath}
                      onSelectFile={handleOpenFile}
                      onFileDragStart={(path) => handleExternalDragStart(createFileTab(path))}
                      onDragEnd={handleDragEnd}
                    />
                  ) : null}

                  {sidebar.visible && sidebar.activePanel === 'search' ? (
                    <SearchPanel folderPath={folderPath} onOpenFile={handleOpenFile} focusNonce={searchFocusNonce} />
                  ) : null}

                  {sidebar.visible && sidebar.activePanel === 'source-control' ? (
                    <SourceControlPanel
                      folderPath={folderPath}
                      gitInfo={gitInfo}
                      activeFile={activeSourceControlFile}
                      onOpenDiff={handleOpenDiff}
                      onOpenPullRequest={handleOpenPullRequest}
                    />
                  ) : null}

                  {sidebar.visible && sidebar.activePanel === 'pull-requests' ? (
                    <PullRequestsPanel
                      gitInfo={gitInfo}
                      isLoadingGitInfo={isLoadingGitInfo}
                      onOpenPullRequest={handleOpenPullRequest}
                      activePRNumber={activeTab?.kind === 'pull-request' ? activeTab.number : null}
                      onPullRequestDragStart={(number) => handleExternalDragStart(createPullRequestTab(number))}
                      onDragEnd={handleDragEnd}
                    />
                  ) : null}

                  {sidebar.visible && sidebar.activePanel === 'agent' ? (
                    <AgentPanel
                      sessions={sessionMetas.filter((s) => !s.context?.inline)}
                      activeSessionId={activeAgentSessionId}
                      onSelectSession={handleSelectAgentSession}
                      onNewSession={handleNewAgentSession}
                      onDeleteSession={(id) => void handleDeleteAgentSession(id)}
                      onSessionDragStart={(session) =>
                        handleExternalDragStart(
                          createAgentTab(
                            session.id,
                            session.prompt.length > 30 ? session.prompt.slice(0, 30) + '...' : session.prompt
                          )
                        )
                      }
                      onDragEnd={handleDragEnd}
                    />
                  ) : null}

                  <div className="flex min-h-0 min-w-0 flex-1 flex-col">
                    <EditorLayout
                      node={layout}
                      activeGroupId={activeGroupId}
                      dragActive={pendingDrag !== null}
                      handlers={editorHandlers}
                      renderContent={(tab) =>
                        renderWorkspaceTabContent({
                          activeTab: tab,
                          folderPath,
                          gitInfo,
                          gitInfoError,
                          isLoadingGitInfo,
                          agentSessions: sessionMetas,
                          fileReveal:
                            pendingReveal && pendingReveal.tabId === tab?.id ? pendingReveal.reveal : undefined,
                          onOpenFile: handleOpenFile,
                          onOpenPullRequest: handleOpenPullRequest,
                          onOpenPullRequestFile: handleOpenPullRequestFile,
                          onOpenCommit: handleOpenCommit,
                          onStartAgent: handleStartAgent,
                          onContinueAgent: handleContinueAgent,
                          onStopAgent: handleStopAgent,
                          onPromoteAgent: handlePromoteAgentSession,
                          onPullRequestSubviewChange: handlePullRequestSubviewChange,
                          onPullRequestTitleChange: handlePullRequestTitleChange,
                          onPullRequestStateChange: handlePullRequestStateChange,
                          onCommitTitleChange: handleCommitTitleChange
                        })
                      }
                    />
                  </div>
                </>
              )}
            </div>

            <CommandPalette
              open={activePalette === 'command'}
              onOpenChange={(next) => setActivePalette(next ? 'command' : null)}
              gitInfo={gitInfo}
              agentSessions={sessionMetas.filter((s) => !s.context?.inline)}
              onOpenPullRequest={handleOpenPullRequest}
              onSelectAgentSession={handleSelectAgentSession}
              onNewAgent={handleAgentActivityClick}
            />
            <FilePalette
              open={activePalette === 'file'}
              onOpenChange={(next) => setActivePalette(next ? 'file' : null)}
              folderPath={folderPath}
              onOpenFile={handleOpenFile}
            />
          </div>
        </WorkerPoolProvider>
      </AgentSessionsProvider>
    </WorkspaceContextProvider>
  )
}

function getWorkspaceRelativePath(filePath: string, folderPath: string): string {
  const folderPrefix = folderPath.endsWith('/') ? folderPath : `${folderPath}/`
  if (!filePath.startsWith(folderPrefix)) return filePath
  return filePath.slice(folderPrefix.length)
}

function renderWorkspaceTabContent({
  activeTab,
  folderPath,
  gitInfo,
  gitInfoError,
  isLoadingGitInfo,
  agentSessions,
  fileReveal,
  onOpenFile,
  onOpenPullRequest,
  onOpenPullRequestFile,
  onOpenCommit,
  onStartAgent,
  onContinueAgent,
  onStopAgent,
  onPromoteAgent,
  onPullRequestSubviewChange,
  onPullRequestTitleChange,
  onPullRequestStateChange,
  onCommitTitleChange
}: {
  activeTab: WorkspaceTab | null
  folderPath: string
  gitInfo: GitRepoInfo | null | undefined
  gitInfoError: Error | null
  isLoadingGitInfo: boolean
  agentSessions: AgentSessionMeta[]
  fileReveal: FileReveal | undefined
  onOpenFile: (path: string, line?: number) => void
  onOpenPullRequest: (number: number) => void
  onOpenPullRequestFile: (input: PullRequestFileTabInput) => void
  onOpenCommit: (sha: string, title?: string) => void
  onStartAgent: (prompt: string, files?: string[], context?: AgentContext, options?: AgentStartOptions) => Promise<void>
  onContinueAgent: (
    sessionId: string,
    prompt: string,
    files?: string[],
    cliPrompt?: string,
    mentionedPRs?: PullRequestDetail[]
  ) => Promise<void>
  onStopAgent: (sessionId: string) => Promise<void>
  onPromoteAgent: (sessionId: string) => void
  onPullRequestSubviewChange: (tabId: WorkspaceTab['id'], subview: PullRequestSubview) => void
  onPullRequestTitleChange: (tabId: WorkspaceTab['id'], title: string) => void
  onPullRequestStateChange: (tabId: WorkspaceTab['id'], prState: 'open' | 'closed' | 'merged' | 'draft') => void
  onCommitTitleChange: (tabId: WorkspaceTab['id'], title: string) => void
}): ReactNode {
  if (!activeTab) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-6">
        <p className="text-foreground-subtle text-xs font-medium">/Drafthouse</p>
        <AsciiArt alt="ASCII Art" />
        <EmptyStateShortcuts />
      </div>
    )
  }

  switch (activeTab.kind) {
    case 'welcome':
      return <WelcomeView />
    case 'dashboard':
      if (isLoadingGitInfo) {
        return <LoadingView label="Checking repository metadata..." />
      }

      if (gitInfo) {
        return <DashboardView gitInfo={gitInfo} onOpenPullRequest={onOpenPullRequest} onOpenCommit={onOpenCommit} />
      }

      // A failed lookup is not the same as "this folder has no GitHub remote" —
      // showing the no-repo state for an error would be a false negative.
      return gitInfoError ? (
        <PlaceholderView title="Repository metadata unavailable" description={gitInfoError.message} />
      ) : (
        <PlaceholderView
          title="No GitHub repository"
          description="This folder is not mapped to a GitHub repository, so there is no activity to show. Open a folder with a GitHub remote to see its dashboard."
        />
      )
    case 'file':
      return <FilesView filePath={activeTab.path} folderPath={folderPath} reveal={fileReveal} />
    case 'pull-request-file':
      return (
        <PullRequestFileView
          owner={activeTab.owner}
          repo={activeTab.repo}
          number={activeTab.number}
          filePath={activeTab.path}
          gitRef={activeTab.ref}
        />
      )
    case 'diff':
      return (
        <DiffView filePath={activeTab.path} folderPath={folderPath} staged={activeTab.staged} onOpenFile={onOpenFile} />
      )
    case 'pull-request':
      if (isLoadingGitInfo) {
        return <LoadingView label="Checking repository metadata..." />
      }

      return gitInfo ? (
        <PullRequestDetailView
          owner={gitInfo.owner}
          repo={gitInfo.repo}
          folderPath={folderPath}
          number={activeTab.number}
          subview={activeTab.subview}
          agentSessions={agentSessions}
          onSubviewChange={(subview) => onPullRequestSubviewChange(activeTab.id, subview)}
          onTitleChange={(title) => onPullRequestTitleChange(activeTab.id, title)}
          onStateChange={(prState) => onPullRequestStateChange(activeTab.id, prState)}
          onOpenPullRequestFile={onOpenPullRequestFile}
          onOpenCommit={onOpenCommit}
          onStartAgent={onStartAgent}
          onContinueAgent={onContinueAgent}
          onStopAgent={onStopAgent}
          onPromoteAgent={onPromoteAgent}
        />
      ) : (
        <PlaceholderView title="Pull Request" description="Repository metadata is not available." />
      )
    case 'commit':
      if (isLoadingGitInfo) {
        return <LoadingView label="Checking repository metadata..." />
      }

      return gitInfo ? (
        <CommitDetailView
          owner={gitInfo.owner}
          repo={gitInfo.repo}
          commitSha={activeTab.sha}
          onTitleChange={(title) => onCommitTitleChange(activeTab.id, title)}
        />
      ) : (
        <PlaceholderView title="Commit" description="Repository metadata is not available." />
      )
    case 'agent': {
      const agentSession = agentSessions.find((s) => s.id === activeTab.sessionId) ?? null
      return (
        // Keyed by session so drafts and view state never leak between tabs.
        <AgentSessionTab
          key={activeTab.sessionId}
          session={agentSession}
          isPlaceholderTab={activeTab.sessionId === 'new'}
          onStartSession={onStartAgent}
          onContinueSession={onContinueAgent}
          onStopSession={onStopAgent}
          gitInfo={gitInfo}
        />
      )
    }
  }
}

const EMPTY_STATE_SHORTCUTS: Array<{ label: string; keys: string[] }> = [
  { label: 'Command Palette', keys: ['⌘', 'K'] },
  { label: 'Search', keys: ['⌘', '⇧', 'F'] },
  { label: 'Toggle Sidebar', keys: ['⌘', 'B'] },
  { label: 'Agent', keys: ['⌘', '1'] },
  { label: 'Pull Requests', keys: ['⌘', '2'] },
  { label: 'Source Control', keys: ['⌘', '3'] },
  { label: 'Files', keys: ['⌘', '4'] }
]

function EmptyStateShortcuts() {
  return (
    <div className="flex flex-col gap-2">
      {EMPTY_STATE_SHORTCUTS.map((shortcut) => (
        <div key={shortcut.label} className="flex items-center justify-between gap-8">
          <span className="text-foreground-subtle text-xs">{shortcut.label}</span>
          <div className="flex gap-1">
            {shortcut.keys.map((key, i) => (
              <kbd
                key={i}
                className="border-border bg-surface text-foreground-muted flex size-5 items-center justify-center rounded border text-[10px] font-medium"
              >
                {key}
              </kbd>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}
