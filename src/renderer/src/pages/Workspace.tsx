import type { ReactNode } from 'react'
import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Files, GitBranch, GitGraph, Terminal } from 'lucide-react'
import { Navigate } from 'react-router-dom'
import type { AgentContext, AgentSession, GitChangedFile, GitRepoInfo } from '../../../shared/types'
import { cn } from '../lib/cn'
import ActivityBar from '../components/ActivityBar'
import AgentPanel from '../components/AgentPanel'
import ExplorerPanel from '../components/ExplorerPanel'
import PullRequestsPanel from '../components/PullRequestsPanel'
import SourceControlPanel from '../components/SourceControlPanel'
import WorkspaceTabBar from '../components/WorkspaceTabBar'
import type { WorkspaceSession } from '../lib/workspaceSession'
import {
  createAgentTab,
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
import WelcomeView from './workspace/WelcomeView'

interface WorkspaceProps {
  session: WorkspaceSession | null
  onCloseWorkspace: () => void
  onUpdateSession: (patch: Partial<WorkspaceSession>) => void
}

export default function Workspace({ session, onCloseWorkspace, onUpdateSession }: WorkspaceProps) {
  if (!session) {
    return <Navigate to="/" replace />
  }

  const { folderPath, sidebar, tabs, activeTabId, activeView } = session
  const activeTab = tabs.find((tab) => tab.id === activeTabId) ?? null
  const activeFilePath = activeTab?.kind === 'file' ? activeTab.path : null

  // Agent state
  const [agentSessions, setAgentSessions] = useState<AgentSession[]>([])
  const [activeAgentSessionId, setActiveAgentSessionId] = useState<string | null>(null)

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

  const handleOpenFile = (filePath: string): void => {
    openOrFocusTab(createFileTab(filePath))
  }

  const handleOpenPullRequest = (number: number): void => {
    openOrFocusTab(createPullRequestTab(number))
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
    const { sessionId } = await window.api.agent.start(
      folderPath, prompt, files, context?.systemPromptSuffix
    )

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
      : (prompt.length > 30 ? prompt.slice(0, 30) + '...' : prompt)
    const newTab = createAgentTab(sessionId, tabTitle)
    const nextTabs = tabs.filter((tab) => !(tab.kind === 'agent' && tab.sessionId === 'new')).concat(newTab)

    onUpdateSession({
      ...session,
      tabs: nextTabs,
      activeTabId: newTab.id
    })
  }

  const handleContinueAgent = async (agentSessionId: string, prompt: string, files?: string[]): Promise<void> => {
    const existingSession = agentSessions.find((s) => s.id === agentSessionId)
    if (!existingSession?.cliSessionId) return

    await window.api.agent.continue(existingSession.id, existingSession.cliSessionId, folderPath, prompt, files)

    // Mark session as running again and add a synthetic user message
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

  const handlePromoteAgentSession = (sessionId: string): void => {
    const target = agentSessions.find((s) => s.id === sessionId)
    if (!target) return

    // Remove inline flag so it appears in the agent panel
    setAgentSessions((prev) =>
      prev.map((s) =>
        s.id === sessionId && s.context
          ? { ...s, context: { ...s.context, inline: false } }
          : s
      )
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
      onClick: () => handleToggleSidebar('explorer')
    },
    {
      id: 'source-control',
      label: 'Source Control',
      icon: GitBranch,
      active: sidebar.visible && sidebar.activePanel === 'source-control',
      badge: changedFileCount > 0 ? changedFileCount : undefined,
      onClick: () => handleToggleSidebar('source-control')
    },
    {
      id: 'pull-requests',
      label: 'Pull Requests',
      icon: GitGraph,
      active: sidebar.visible && sidebar.activePanel === 'pull-requests',
      onClick: () => handleToggleSidebar('pull-requests')
    },
    {
      id: 'agent',
      label: 'Agent',
      icon: Terminal,
      active: sidebar.visible && sidebar.activePanel === 'agent',
      badge: runningAgentCount > 0 ? runningAgentCount : undefined,
      onClick: () => handleToggleSidebar('agent')
    }
  ]

  return (
    <div className="flex flex-1 bg-background w-screen">
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
            <ExplorerPanel folderPath={folderPath} selectedFilePath={activeFilePath} onSelectFile={handleOpenFile} />
          ) : null}

          {sidebar.visible && sidebar.activePanel === 'source-control' ? (
            <SourceControlPanel folderPath={folderPath} onOpenDiff={handleOpenDiff} />
          ) : null}

          {sidebar.visible && sidebar.activePanel === 'pull-requests' ? (
            <PullRequestsPanel
              gitInfo={gitInfo}
              isLoadingGitInfo={isLoadingGitInfo}
              onOpenPullRequest={handleOpenPullRequest}
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
                onStartAgent: handleStartAgent,
                onContinueAgent: handleContinueAgent,
                onStopAgent: handleStopAgent,
                onPromoteAgent: handlePromoteAgentSession,
                onPullRequestSubviewChange: handlePullRequestSubviewChange,
                onPullRequestTitleChange: handlePullRequestTitleChange,
                onPullRequestStateChange: handlePullRequestStateChange
              })}
            </main>
          </div>
        </>
      )}
    </div>
  )
}

function renderWorkspaceTabContent({
  activeTab,
  folderPath,
  gitInfo,
  isLoadingGitInfo,
  agentSessions,
  onOpenFile,
  onStartAgent,
  onContinueAgent,
  onStopAgent,
  onPromoteAgent,
  onPullRequestSubviewChange,
  onPullRequestTitleChange,
  onPullRequestStateChange
}: {
  activeTab: WorkspaceTab | null
  folderPath: string
  gitInfo: GitRepoInfo | null | undefined
  isLoadingGitInfo: boolean
  agentSessions: AgentSession[]
  onOpenFile: (path: string) => void
  onStartAgent: (prompt: string, files?: string[], context?: AgentContext) => Promise<void>
  onContinueAgent: (sessionId: string, prompt: string, files?: string[]) => Promise<void>
  onStopAgent: (sessionId: string) => Promise<void>
  onPromoteAgent: (sessionId: string) => void
  onPullRequestSubviewChange: (tabId: WorkspaceTab['id'], subview: PullRequestSubview) => void
  onPullRequestTitleChange: (tabId: WorkspaceTab['id'], title: string) => void
  onPullRequestStateChange: (tabId: WorkspaceTab['id'], prState: 'open' | 'closed' | 'merged' | 'draft') => void
}): ReactNode {
  if (!activeTab) {
    return (
      <PlaceholderView
        title="Nothing open"
        description="Open a file from the explorer or a pull request from the left action bar."
      />
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
        return <p className="text-sm text-foreground-muted">Checking repository metadata...</p>
      }

      return gitInfo ? (
        <PullRequestDetailView
          owner={gitInfo.owner}
          repo={gitInfo.repo}
          number={activeTab.number}
          subview={activeTab.subview}
          agentSessions={agentSessions}
          onSubviewChange={(subview) => onPullRequestSubviewChange(activeTab.id, subview)}
          onTitleChange={(title) => onPullRequestTitleChange(activeTab.id, title)}
          onStateChange={(prState) => onPullRequestStateChange(activeTab.id, prState)}
          onStartAgent={onStartAgent}
          onContinueAgent={onContinueAgent}
          onStopAgent={onStopAgent}
          onPromoteAgent={onPromoteAgent}
        />
      ) : (
        <PlaceholderView title="Pull Request" description="Repository metadata is not available." />
      )
    case 'agent': {
      const agentSession = agentSessions.find((s) => s.id === activeTab.sessionId) ?? null
      return (
        <AgentSessionTab
          session={agentSession}
          onStartSession={onStartAgent}
          onContinueSession={onContinueAgent}
          onStopSession={onStopAgent}
        />
      )
    }
  }
}
