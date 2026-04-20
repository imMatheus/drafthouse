import type { ReactNode } from 'react'
import { useEffect, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Files, GitBranch, GitGraph, Terminal } from 'lucide-react'
import type { AgentContext, AgentSession, GitChangedFile, GitRepoInfo } from '../../../shared/types'
import { cn } from '../lib/cn'
import { getPathBasename } from '../lib/path'
import ActivityBar from '../components/ActivityBar'
import CommandPalette from '../components/CommandPalette'
import AgentPanel from '../components/AgentPanel'
import ExplorerPanel from '../components/ExplorerPanel'
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

interface WorkspaceProps {
  session: WorkspaceSession
  onCloseWorkspace: () => void
  onUpdateSession: (patch: Partial<WorkspaceSession>) => void
}

export default function Workspace({ session, onCloseWorkspace, onUpdateSession }: WorkspaceProps) {
  const { folderPath, sidebar, tabs, activeTabId, activeView } = session
  const activeTab = tabs.find((tab) => tab.id === activeTabId) ?? null
  const activeFilePath = activeTab?.kind === 'file' ? activeTab.path : null

  // Agent state
  const [agentSessions, setAgentSessions] = useState<AgentSession[]>([])
  const [activeAgentSessionId, setActiveAgentSessionId] = useState<string | null>(null)
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false)

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
    onUpdateSession({ ...session, activeTabId: targetTabId })
  }

  const handleGoForward = (): void => {
    if (!canGoForward) return
    const targetIndex = navState.index + 1
    const targetTabId = navState.history[targetIndex]
    skipNextHistoryPushRef.current = true
    setNavState({ ...navState, index: targetIndex })
    onUpdateSession({ ...session, activeTabId: targetTabId })
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

  // Subscribe to agent events
  useEffect(() => {
    return window.api.agent.onEvent(({ sessionId, event }) => {
      setAgentSessions((prev) =>
        prev.map((s) => {
          if (s.id !== sessionId) return s

          let nextStatus = s.status
          if (event.type === 'result') {
            nextStatus = event.is_error ? 'error' : 'completed'
          }

          // Capture CLI session ID from init event
          let cliSessionId = s.cliSessionId
          if (event.type === 'system' && event.subtype === 'init' && 'session_id' in event) {
            cliSessionId = event.session_id as string
          }

          return {
            ...s,
            events: [...s.events, event],
            status: nextStatus,
            cliSessionId
          }
        })
      )
    })
  }, [])

  const openOrFocusTab = (nextTab: WorkspaceTab): void => {
    const existingTab = tabs.find((tab) => tab.id === nextTab.id)

    onUpdateSession({
      ...session,
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
      ...session,
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
        ...session,
        tabs: nextTabs
      })
      return
    }

    const nextActiveTabId = nextTabs[tabIndex - 1]?.id ?? nextTabs[tabIndex]?.id ?? null

    onUpdateSession({
      ...session,
      tabs: nextTabs,
      activeTabId: nextActiveTabId
    })
  }

  const handleReorderTabs = (reorderedTabs: WorkspaceTab[]): void => {
    onUpdateSession({ ...session, tabs: reorderedTabs })
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

  const handleToggleSidebar = (panel: 'explorer' | 'source-control' | 'pull-requests' | 'agent'): void => {
    if (activeView === 'settings') {
      onUpdateSession({
        ...session,
        activeView: 'workspace',
        sidebar: { visible: true, activePanel: panel }
      })
      return
    }

    const isActive = sidebar.visible && sidebar.activePanel === panel

    onUpdateSession({
      ...session,
      sidebar: isActive ? { visible: false, activePanel: panel } : { visible: true, activePanel: panel }
    })
  }

  const handleToggleSidebarVisibility = (): void => {
    const panelToRestore = sidebar.activePanel ?? 'explorer'

    onUpdateSession({
      ...session,
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
        setCommandPaletteOpen((prev) => !prev)
      }
      if ((e.metaKey || e.ctrlKey) && e.key === '1') {
        e.preventDefault()
        handleToggleSidebar('explorer')
      }
      if ((e.metaKey || e.ctrlKey) && e.key === '2') {
        e.preventDefault()
        handleToggleSidebar('source-control')
      }
      if ((e.metaKey || e.ctrlKey) && e.key === '3') {
        e.preventDefault()
        handleToggleSidebar('pull-requests')
      }
      if ((e.metaKey || e.ctrlKey) && e.key === '4') {
        e.preventDefault()
        handleToggleSidebar('agent')
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [sidebar, session])

  const handleOpenDiff = (path: string, staged: boolean): void => {
    openOrFocusTab(createDiffTab(path, staged))
  }

  const handleToggleSettings = (): void => {
    if (activeView === 'settings') {
      onUpdateSession({
        ...session,
        activeView: 'workspace'
      })
    } else {
      onUpdateSession({
        ...session,
        activeView: 'settings'
      })
    }
  }

  const handleStartAgent = async (prompt: string, files?: string[], context?: AgentContext): Promise<void> => {
    const { sessionId } = await window.api.agent.start(folderPath, prompt, files, context?.systemPromptSuffix)

    const newSession: AgentSession = {
      id: sessionId,
      prompt,
      status: 'running',
      startedAt: Date.now(),
      events: [],
      cliSessionId: null,
      files: files ?? [],
      context
    }

    setAgentSessions((prev) => [...prev, newSession])

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
      ...session,
      tabs: nextTabs,
      activeTabId: newTab.id
    })
  }

  const handleContinueAgent = async (
    agentSessionId: string,
    prompt: string,
    files?: string[],
    cliPrompt?: string
  ): Promise<void> => {
    const existingSession = agentSessions.find((s) => s.id === agentSessionId)
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
    setAgentSessions((prev) =>
      prev.map((s) =>
        s.id === agentSessionId
          ? {
              ...s,
              status: 'running' as const,
              events: [
                ...s.events,
                {
                  type: 'user' as const,
                  message: {
                    role: 'user' as const,
                    content: [{ type: 'text' as const, text: prompt }]
                  },
                  session_id: s.cliSessionId!
                }
              ]
            }
          : s
      )
    )
  }

  const handleSelectAgentSession = (sessionId: string): void => {
    setActiveAgentSessionId(sessionId)
    const agentSession = agentSessions.find((s) => s.id === sessionId)
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
        ...session,
        activeView: 'workspace',
        tabs: emptyAgentTab ? tabs : [...tabs, tabToFocus],
        activeTabId: tabToFocus.id,
        sidebar: { visible: true, activePanel: 'agent' }
      })
      return
    }

    if (emptyAgentTab) {
      onUpdateSession({
        ...session,
        activeTabId: emptyAgentTab.id,
        sidebar: { visible: true, activePanel: 'agent' }
      })
      return
    }

    const newTab = createAgentTab('new', 'New Session')
    onUpdateSession({
      ...session,
      tabs: [...tabs, newTab],
      activeTabId: newTab.id,
      sidebar: { visible: true, activePanel: 'agent' }
    })
  }

  const handleStopAgent = async (sessionId: string): Promise<void> => {
    await window.api.agent.stop(sessionId)

    setAgentSessions((prev) => prev.map((s) => (s.id === sessionId ? { ...s, status: 'cancelled' as const } : s)))
  }

  const handlePullRequestSubviewChange = (tabId: WorkspaceTab['id'], subview: PullRequestSubview): void => {
    onUpdateSession({
      ...session,
      tabs: tabs.map((tab) => (tab.id === tabId && tab.kind === 'pull-request' ? { ...tab, subview } : tab))
    })
  }

  const handlePullRequestTitleChange = (tabId: WorkspaceTab['id'], title: string): void => {
    const currentTab = tabs.find((tab) => tab.id === tabId)

    if (!currentTab || currentTab.kind !== 'pull-request' || currentTab.title === title) {
      return
    }

    onUpdateSession({
      ...session,
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
      ...session,
      tabs: tabs.map((tab) => (tab.id === tabId && tab.kind === 'pull-request' ? { ...tab, prState } : tab))
    })
  }

  const handleCommitTitleChange = (tabId: WorkspaceTab['id'], title: string): void => {
    const currentTab = tabs.find((tab) => tab.id === tabId)

    if (!currentTab || currentTab.kind !== 'commit' || currentTab.title === title) {
      return
    }

    onUpdateSession({
      ...session,
      tabs: tabs.map((tab) => (tab.id === tabId && tab.kind === 'commit' ? { ...tab, title } : tab))
    })
  }

  const handlePromoteAgentSession = (sessionId: string): void => {
    const target = agentSessions.find((s) => s.id === sessionId)
    if (!target) return

    // Remove inline flag so it appears in the agent panel
    setAgentSessions((prev) =>
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

  useEffect(() => {
    if (!activeTabId) return
    return window.api.fs.onCloseTab(() => handleCloseTab(activeTabId))
  }, [activeTabId, handleCloseTab])

  const changedFileCount = gitStatus?.length ?? 0

  const runningAgentCount = agentSessions.filter((s) => s.status === 'running' && !s.context?.inline).length

  const activityItems = [
    {
      id: 'explorer',
      label: 'Explorer',
      icon: Files,
      active: sidebar.visible && sidebar.activePanel === 'explorer',
      onClick: () => handleToggleSidebar('explorer'),
      shortcut: ['⌘', '1']
    },
    {
      id: 'source-control',
      label: 'Source Control',
      icon: GitBranch,
      active: sidebar.visible && sidebar.activePanel === 'source-control',
      badge: changedFileCount > 0 ? changedFileCount : undefined,
      onClick: () => handleToggleSidebar('source-control'),
      shortcut: ['⌘', '2']
    },
    {
      id: 'pull-requests',
      label: 'Pull Requests',
      icon: GitGraph,
      active: sidebar.visible && sidebar.activePanel === 'pull-requests',
      onClick: () => handleToggleSidebar('pull-requests'),
      shortcut: ['⌘', '3']
    },
    {
      id: 'agent',
      label: 'Agent',
      icon: Terminal,
      active: sidebar.visible && sidebar.activePanel === 'agent',
      badge: runningAgentCount > 0 ? runningAgentCount : undefined,
      onClick: handleAgentActivityClick,
      shortcut: ['⌘', '4']
    }
  ]

  const projectName = getPathBasename(folderPath)

  return (
    <WorkspaceContextProvider value={{ gitInfo: gitInfo ?? null, onOpenPullRequest: handleOpenPullRequest }}>
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
                  sessions={agentSessions}
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
                    agentSessions,
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
          open={commandPaletteOpen}
          onOpenChange={setCommandPaletteOpen}
          folderPath={folderPath}
          gitInfo={gitInfo}
          agentSessions={agentSessions}
          onOpenFile={handleOpenFile}
          onOpenPullRequest={handleOpenPullRequest}
          onSelectAgentSession={handleSelectAgentSession}
        />
      </div>
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
  agentSessions: AgentSession[]
  onOpenFile: (path: string) => void
  onOpenCommit: (sha: string, title?: string) => void
  onStartAgent: (prompt: string, files?: string[], context?: AgentContext) => Promise<void>
  onContinueAgent: (sessionId: string, prompt: string, files?: string[], cliPrompt?: string) => Promise<void>
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
        return <p className="text-foreground-muted text-sm">Checking repository metadata...</p>
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
        return <p className="text-foreground-muted text-sm">Checking repository metadata...</p>
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
  { label: 'Toggle Sidebar', keys: ['⌘', 'B'] },
  { label: 'Explorer', keys: ['⌘', '1'] },
  { label: 'Source Control', keys: ['⌘', '2'] },
  { label: 'Pull Requests', keys: ['⌘', '3'] },
  { label: 'Agent', keys: ['⌘', '4'] }
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
