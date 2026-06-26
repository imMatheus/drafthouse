import type { ReactNode } from 'react'
import { useEffect, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Files, GitBranch, GitGraph, Search, Terminal } from 'lucide-react'
import type {
  AgentContext,
  AgentSessionMeta,
  GitChangedFile,
  GitRepoInfo,
  PullRequestDetail
} from '../../../shared/types'
import { prStateLabel } from '../lib/prMentions'
import { cn } from '../lib/cn'
import { getPathBasename } from '../lib/path'
import ActivityBar from '../components/ActivityBar'
import CommandPalette from '../components/CommandPalette'
import FilePalette from '../components/FilePalette'
import AgentPanel from '../components/AgentPanel'
import ExplorerPanel from '../components/ExplorerPanel'
import SearchPanel from '../components/SearchPanel'
import PullRequestsPanel from '../components/PullRequestsPanel'
import SourceControlPanel from '../components/SourceControlPanel'
import WorkspaceTabBar from '../components/WorkspaceTabBar'
import WorkspaceTopBar from '../components/WorkspaceTopBar'
import type { WorkspaceSession } from '../lib/workspaceSession'
import {
  createAgentTab,
  createCommitTab,
  createDiffTab,
  createFileTab,
  createPullRequestTab,
  type PullRequestSubview,
  type WorkspaceSidebarPanel,
  type WorkspaceTab
} from '../lib/workspaceTabs'
import AgentSessionTab from './workspace/AgentSessionTab'
import SettingsView from './workspace/SettingsView'
import DiffView from './workspace/DiffView'
import FilesView from './workspace/FilesView'
import PlaceholderView from './workspace/PlaceholderView'
import PullRequestDetailView from './workspace/PullRequestDetailView'
import CommitDetailView from './workspace/CommitDetailView'
import WelcomeView from './workspace/WelcomeView'
import AsciiArt from '../components/AsciiArt'
import { WorkspaceContextProvider } from '../contexts/WorkspaceContext'
import WorkerPoolProvider from '../components/WorkerPoolProvider'
import { AgentSessionsProvider, AgentSessionsStore } from '../contexts/AgentSessionsContext'
import { LoadingView } from '../components/Loading'
import { appendOrReplaceAssistant, mergePartialMessage } from '../lib/agentStream'

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
  const { folderPath, sidebar, tabs, activeTabId, activeView } = session
  const activeTab = tabs.find((tab) => tab.id === activeTabId) ?? null
  const activeFilePath = activeTab?.kind === 'file' ? activeTab.path : null

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
  const [activePalette, setActivePalette] = useState<'command' | 'file' | null>(null)
  const [searchFocusNonce, setSearchFocusNonce] = useState(0)

  // Tab navigation history (back/forward buttons in the top bar). Tracks visited
  // tab ids so the user can move through them like a browser. Local-only state —
  // history doesn't persist across reloads.
  const [navState, setNavState] = useState<{ history: Array<WorkspaceTab['id']>; index: number }>({
    history: activeTabId ? [activeTabId] : [],
    index: activeTabId ? 0 : -1
  })
  const skipNextHistoryPushRef = useRef(false)

  useEffect(() => {
    if (!activeTabId) return
    if (skipNextHistoryPushRef.current) {
      skipNextHistoryPushRef.current = false
      return
    }
    setNavState((prev) => {
      if (prev.history[prev.index] === activeTabId) return prev
      const truncated = prev.history.slice(0, prev.index + 1)
      return { history: [...truncated, activeTabId], index: truncated.length }
    })
  }, [activeTabId])

  const canGoBack = navState.index > 0
  const canGoForward = navState.index < navState.history.length - 1

  const handleGoBack = (): void => {
    if (!canGoBack) return
    const targetIndex = navState.index - 1
    const targetTabId = navState.history[targetIndex]
    skipNextHistoryPushRef.current = true
    setNavState({ ...navState, index: targetIndex })
    onUpdateSession({ activeTabId: targetTabId })
  }

  const handleGoForward = (): void => {
    if (!canGoForward) return
    const targetIndex = navState.index + 1
    const targetTabId = navState.history[targetIndex]
    skipNextHistoryPushRef.current = true
    setNavState({ ...navState, index: targetIndex })
    onUpdateSession({ activeTabId: targetTabId })
  }

  const { data: gitInfo, isLoading: isLoadingGitInfo } = useQuery<GitRepoInfo | null, Error>({
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
  // (status / cliSessionId) happen on init / result only and go through
  // React state so the session list / status chrome reflects the change.
  useEffect(() => {
    return window.api.agent.onEvent(({ sessionId, event }) => {
      agentSessionsStore.setEvents(sessionId, (prev) => {
        if (event.type === 'stream_event') return mergePartialMessage(prev, event)
        if (event.type === 'assistant') return appendOrReplaceAssistant(prev, event)
        return [...prev, event]
      })

      if (event.type === 'result' || (event.type === 'system' && event.subtype === 'init')) {
        setSessionMetas((prev) =>
          prev.map((s) => {
            if (s.id !== sessionId) return s
            let nextStatus = s.status
            if (event.type === 'result') {
              nextStatus = event.is_error ? 'error' : 'completed'
            }
            let cliSessionId = s.cliSessionId
            if (event.type === 'system' && event.subtype === 'init' && 'session_id' in event) {
              cliSessionId = event.session_id as string
            }
            if (nextStatus === s.status && cliSessionId === s.cliSessionId) return s
            return { ...s, status: nextStatus, cliSessionId }
          })
        )
      }
    })
  }, [agentSessionsStore])

  const openOrFocusTab = (nextTab: WorkspaceTab): void => {
    const existingTab = tabs.find((tab) => tab.id === nextTab.id)

    onUpdateSession({
      tabs: existingTab ? tabs : [...tabs, nextTab],
      activeTabId: nextTab.id
    })
  }

  const handleSelectTab = (tabId: WorkspaceTab['id']): void => {
    if (tabId === activeTabId) return

    // Sync active agent session when selecting an agent tab
    const selectedTab = tabs.find((tab) => tab.id === tabId)
    if (selectedTab?.kind === 'agent') {
      setActiveAgentSessionId(selectedTab.sessionId)
    }

    onUpdateSession({
      activeTabId: tabId
    })
  }

  const handleCloseTab = (tabId: WorkspaceTab['id']): void => {
    const tabIndex = tabs.findIndex((tab) => tab.id === tabId)

    if (tabIndex === -1) {
      return
    }

    // Drop the closed tab from the nav history (and adjust index).
    setNavState((prev) => {
      const filtered: Array<WorkspaceTab['id']> = []
      let newIndex = prev.index
      for (let i = 0; i < prev.history.length; i++) {
        if (prev.history[i] === tabId) {
          if (i <= prev.index) newIndex--
        } else {
          filtered.push(prev.history[i])
        }
      }
      return { history: filtered, index: Math.max(newIndex, filtered.length === 0 ? -1 : 0) }
    })

    const nextTabs = tabs.filter((tab) => tab.id !== tabId)

    if (activeTabId !== tabId) {
      onUpdateSession({
        tabs: nextTabs
      })
      return
    }

    const nextActiveTabId = nextTabs[tabIndex - 1]?.id ?? nextTabs[tabIndex]?.id ?? null

    onUpdateSession({
      tabs: nextTabs,
      activeTabId: nextActiveTabId
    })
  }

  const handleReorderTabs = (reorderedTabs: WorkspaceTab[]): void => {
    onUpdateSession({ tabs: reorderedTabs })
  }

  const handleOpenFile = (filePath: string): void => {
    openOrFocusTab(createFileTab(filePath))
  }

  const handleOpenPullRequest = (number: number): void => {
    openOrFocusTab(createPullRequestTab(number))
  }

  const handleOpenCommit = (sha: string, title?: string): void => {
    openOrFocusTab(createCommitTab(sha, title))
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
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [sidebar, session])

  const handleOpenDiff = (path: string, staged: boolean): void => {
    openOrFocusTab(createDiffTab(path, staged))
  }

  const handleToggleSettings = (): void => {
    onUpdateSession({ activeView: activeView === 'settings' ? 'workspace' : 'settings' })
  }

  const handleStartAgent = async (prompt: string, files?: string[], context?: AgentContext): Promise<void> => {
    const { sessionId } = await window.api.agent.start(folderPath, prompt, files, context?.systemPromptSuffix)

    const newSession: AgentSessionMeta = {
      id: sessionId,
      prompt,
      status: 'running',
      startedAt: Date.now(),
      cliSessionId: null,
      files: files ?? [],
      context
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
    const nextTabs = tabs.filter((tab) => !(tab.kind === 'agent' && tab.sessionId === 'new')).concat(newTab)

    onUpdateSession({
      tabs: nextTabs,
      activeTabId: newTab.id
    })
  }

  const handleContinueAgent = async (
    agentSessionId: string,
    prompt: string,
    files?: string[],
    cliPrompt?: string,
    mentionedPRs?: PullRequestDetail[]
  ): Promise<void> => {
    const existingSession = sessionMetas.find((s) => s.id === agentSessionId)
    if (!existingSession?.cliSessionId) return

    await window.api.agent.continue(
      existingSession.id,
      existingSession.cliSessionId,
      folderPath,
      cliPrompt ?? prompt,
      files
    )

    // Mark session as running again and add a synthetic user message.
    // The UI always shows the clean `prompt`; `cliPrompt` (when set) carries
    // extra metadata like injected PR context that shouldn't clutter the bubble.
    setSessionMetas((prev) =>
      prev.map((s) => {
        if (s.id !== agentSessionId) return s
        return {
          ...s,
          status: 'running' as const,
          context: mergePRsIntoContext(s.context, mentionedPRs)
        }
      })
    )
    agentSessionsStore.setEvents(agentSessionId, (prev) => [
      ...prev,
      {
        type: 'user' as const,
        message: {
          role: 'user' as const,
          content: [{ type: 'text' as const, text: prompt }]
        },
        session_id: existingSession.cliSessionId!
      }
    ])
  }

  const handleSelectAgentSession = (sessionId: string): void => {
    setActiveAgentSessionId(sessionId)
    const agentSession = sessionMetas.find((s) => s.id === sessionId)
    if (agentSession) {
      const truncatedPrompt =
        agentSession.prompt.length > 30 ? agentSession.prompt.slice(0, 30) + '...' : agentSession.prompt
      openOrFocusTab(createAgentTab(sessionId, truncatedPrompt))
    }
  }

  const handleNewAgentSession = (): void => {
    setActiveAgentSessionId(null)
    openOrFocusTab(createAgentTab('new', 'New Session'))
  }

  const handleAgentActivityClick = (): void => {
    const emptyAgentTab = tabs.find((tab) => tab.kind === 'agent' && tab.sessionId === 'new')

    setActiveAgentSessionId(null)

    if (activeView === 'settings') {
      const tabToFocus = emptyAgentTab ?? createAgentTab('new', 'New Session')
      onUpdateSession({
        activeView: 'workspace',
        tabs: emptyAgentTab ? tabs : [...tabs, tabToFocus],
        activeTabId: tabToFocus.id,
        sidebar: { visible: true, activePanel: 'agent' }
      })
      return
    }

    if (emptyAgentTab) {
      onUpdateSession({
        activeTabId: emptyAgentTab.id,
        sidebar: { visible: true, activePanel: 'agent' }
      })
      return
    }

    const newTab = createAgentTab('new', 'New Session')
    onUpdateSession({
      tabs: [...tabs, newTab],
      activeTabId: newTab.id,
      sidebar: { visible: true, activePanel: 'agent' }
    })
  }

  const handleStopAgent = async (sessionId: string): Promise<void> => {
    await window.api.agent.stop(sessionId)

    setSessionMetas((prev) => prev.map((s) => (s.id === sessionId ? { ...s, status: 'cancelled' as const } : s)))
  }

  const handlePullRequestSubviewChange = (tabId: WorkspaceTab['id'], subview: PullRequestSubview): void => {
    onUpdateSession({
      tabs: tabs.map((tab) => (tab.id === tabId && tab.kind === 'pull-request' ? { ...tab, subview } : tab))
    })
  }

  const handlePullRequestTitleChange = (tabId: WorkspaceTab['id'], title: string): void => {
    const currentTab = tabs.find((tab) => tab.id === tabId)

    if (!currentTab || currentTab.kind !== 'pull-request' || currentTab.title === title) {
      return
    }

    onUpdateSession({
      tabs: tabs.map((tab) => (tab.id === tabId && tab.kind === 'pull-request' ? { ...tab, title } : tab))
    })
  }

  const handlePullRequestStateChange = (
    tabId: WorkspaceTab['id'],
    prState: 'open' | 'closed' | 'merged' | 'draft'
  ): void => {
    const currentTab = tabs.find((tab) => tab.id === tabId)

    if (!currentTab || currentTab.kind !== 'pull-request' || currentTab.prState === prState) {
      return
    }

    onUpdateSession({
      tabs: tabs.map((tab) => (tab.id === tabId && tab.kind === 'pull-request' ? { ...tab, prState } : tab))
    })
  }

  const handleCommitTitleChange = (tabId: WorkspaceTab['id'], title: string): void => {
    const currentTab = tabs.find((tab) => tab.id === tabId)

    if (!currentTab || currentTab.kind !== 'commit' || currentTab.title === title) {
      return
    }

    onUpdateSession({
      tabs: tabs.map((tab) => (tab.id === tabId && tab.kind === 'commit' ? { ...tab, title } : tab))
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
    openOrFocusTab(createAgentTab(sessionId, tabTitle))
  }

  // Keep the latest close handler in a ref so the IPC listener subscribes once
  // instead of re-subscribing on every render (handleCloseTab is unmemoized and
  // the workspace re-renders on agent activity / git polling).
  const closeActiveTabRef = useRef<() => void>(() => {})
  closeActiveTabRef.current = () => {
    if (activeTabId) handleCloseTab(activeTabId)
  }
  useEffect(() => {
    return window.api.fs.onCloseTab(() => closeActiveTabRef.current())
  }, [])

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
    }
  ]

  const projectName = getPathBasename(folderPath)

  return (
    <WorkspaceContextProvider
      value={{ gitInfo: gitInfo ?? null, folderPath, onOpenPullRequest: handleOpenPullRequest }}
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
                    />
                  ) : null}

                  {sidebar.visible && sidebar.activePanel === 'search' ? (
                    <SearchPanel folderPath={folderPath} onOpenFile={handleOpenFile} focusNonce={searchFocusNonce} />
                  ) : null}

                  {sidebar.visible && sidebar.activePanel === 'source-control' ? (
                    <SourceControlPanel
                      folderPath={folderPath}
                      gitInfo={gitInfo}
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
                    />
                  ) : null}

                  {sidebar.visible && sidebar.activePanel === 'agent' ? (
                    <AgentPanel
                      sessions={sessionMetas}
                      activeSessionId={activeAgentSessionId}
                      onSelectSession={handleSelectAgentSession}
                      onNewSession={handleNewAgentSession}
                    />
                  ) : null}

                  <div className="flex min-w-0 flex-1 flex-col">
                    <WorkspaceTabBar
                      tabs={tabs}
                      activeTabId={activeTabId}
                      onSelectTab={handleSelectTab}
                      onCloseTab={handleCloseTab}
                      onReorderTabs={handleReorderTabs}
                    />

                    <main
                      className={cn(
                        'min-h-0 flex-1',
                        activeTab?.kind === 'file' || activeTab?.kind === 'diff' || activeTab?.kind === 'agent'
                          ? 'overflow-hidden'
                          : 'overflow-y-auto p-5'
                      )}
                    >
                      {renderWorkspaceTabContent({
                        activeTab,
                        folderPath,
                        gitInfo,
                        isLoadingGitInfo,
                        agentSessions: sessionMetas,
                        onOpenFile: handleOpenFile,
                        onOpenCommit: handleOpenCommit,
                        onStartAgent: handleStartAgent,
                        onContinueAgent: handleContinueAgent,
                        onStopAgent: handleStopAgent,
                        onPromoteAgent: handlePromoteAgentSession,
                        onPullRequestSubviewChange: handlePullRequestSubviewChange,
                        onPullRequestTitleChange: handlePullRequestTitleChange,
                        onPullRequestStateChange: handlePullRequestStateChange,
                        onCommitTitleChange: handleCommitTitleChange
                      })}
                    </main>
                  </div>
                </>
              )}
            </div>

            <CommandPalette
              open={activePalette === 'command'}
              onOpenChange={(next) => setActivePalette(next ? 'command' : null)}
              gitInfo={gitInfo}
              agentSessions={sessionMetas}
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

function renderWorkspaceTabContent({
  activeTab,
  folderPath,
  gitInfo,
  isLoadingGitInfo,
  agentSessions,
  onOpenFile,
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
  isLoadingGitInfo: boolean
  agentSessions: AgentSessionMeta[]
  onOpenFile: (path: string) => void
  onOpenCommit: (sha: string, title?: string) => void
  onStartAgent: (prompt: string, files?: string[], context?: AgentContext) => Promise<void>
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
    case 'file':
      return <FilesView filePath={activeTab.path} folderPath={folderPath} />
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
        <AgentSessionTab
          session={agentSession}
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
