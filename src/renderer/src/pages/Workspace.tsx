import type { ReactNode } from 'react'
import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Files, GitGraph, Terminal } from 'lucide-react'
import { Navigate } from 'react-router-dom'
import type { AgentSession, GitRepoInfo } from '../../../shared/types'
import { cn } from '../lib/cn'
import ActivityBar from '../components/ActivityBar'
import ExplorerPanel from '../components/ExplorerPanel'
import WorkspaceTabBar from '../components/WorkspaceTabBar'
import type { WorkspaceSession } from '../lib/workspaceSession'
import {
  createFileTab,
  createPullRequestListTab,
  createPullRequestTab,
  isPullRequestWorkspaceTab,
  type PullRequestSubview,
  type WorkspaceTab
} from '../lib/workspaceTabs'
import AgentView from './workspace/AgentView'
import FilesView from './workspace/FilesView'
import PlaceholderView from './workspace/PlaceholderView'
import PullRequestDetailView from './workspace/PullRequestDetailView'
import PullRequestsView from './workspace/PullRequestsView'
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

  const {
    data: gitInfo,
    isLoading: isLoadingGitInfo,
    error: gitInfoError
  } = useQuery<GitRepoInfo | null, Error>({
    queryKey: ['git-info', folderPath],
    queryFn: () => window.api.fs.getGitInfo(folderPath),
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

  const handleOpenPullRequestList = (): void => {
    openOrFocusTab(createPullRequestListTab())
  }

  const handleOpenPullRequest = (number: number): void => {
    openOrFocusTab(createPullRequestTab(number))
  }

  const handleToggleExplorer = (): void => {
    if (activeView === 'agent') {
      // Switch back to workspace view and show explorer
      onUpdateSession({
        ...session,
        activeView: 'workspace',
        sidebar: { visible: true, activePanel: 'explorer' }
      })
      return
    }

    const isExplorerActive = sidebar.visible && sidebar.activePanel === 'explorer'

    onUpdateSession({
      ...session,
      sidebar: isExplorerActive
        ? {
            visible: false,
            activePanel: null
          }
        : {
            visible: true,
            activePanel: 'explorer'
          }
    })
  }

  const handleToggleAgent = (): void => {
    if (activeView === 'agent') {
      onUpdateSession({
        ...session,
        activeView: 'workspace'
      })
    } else {
      onUpdateSession({
        ...session,
        activeView: 'agent'
      })
    }
  }

  const handleStartAgent = async (prompt: string, files?: string[]): Promise<void> => {
    const { sessionId } = await window.api.agent.start(folderPath, prompt, files)

    const newSession: AgentSession = {
      id: sessionId,
      prompt,
      status: 'running',
      startedAt: Date.now(),
      events: [],
      cliSessionId: null,
      alwaysAllow: false
    }

    setAgentSessions((prev) => [...prev, newSession])
    setActiveAgentSessionId(sessionId)

    if (activeView !== 'agent') {
      onUpdateSession({ ...session, activeView: 'agent' })
    }
  }

  const handleContinueAgent = async (
    agentSessionId: string,
    prompt: string,
    files?: string[]
  ): Promise<void> => {
    const existingSession = agentSessions.find((s) => s.id === agentSessionId)
    if (!existingSession?.cliSessionId) return

    await window.api.agent.continue(
      existingSession.id,
      existingSession.cliSessionId,
      folderPath,
      prompt,
      files,
      existingSession.alwaysAllow || undefined
    )

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

  const handleAllowAndRetry = async (agentSessionId: string): Promise<void> => {
    const existingSession = agentSessions.find((s) => s.id === agentSessionId)
    if (!existingSession?.cliSessionId) return

    await window.api.agent.continue(
      existingSession.id,
      existingSession.cliSessionId,
      folderPath,
      'Continue. The permission has been granted — proceed with the previous task.',
      undefined,
      true
    )

    setAgentSessions((prev) =>
      prev.map((s) =>
        s.id === agentSessionId ? { ...s, status: 'running' as const } : s
      )
    )
  }

  const handleAlwaysAllowAndRetry = async (agentSessionId: string): Promise<void> => {
    const existingSession = agentSessions.find((s) => s.id === agentSessionId)
    if (!existingSession?.cliSessionId) return

    await window.api.agent.continue(
      existingSession.id,
      existingSession.cliSessionId,
      folderPath,
      'Continue. All permissions have been permanently granted — proceed with the previous task.',
      undefined,
      true
    )

    // Mark as always-allowed so future continues in this session also skip permissions
    setAgentSessions((prev) =>
      prev.map((s) =>
        s.id === agentSessionId
          ? { ...s, status: 'running' as const, alwaysAllow: true }
          : s
      )
    )
  }

  const handleStopAgent = async (sessionId: string): Promise<void> => {
    await window.api.agent.stop(sessionId)

    setAgentSessions((prev) =>
      prev.map((s) => (s.id === sessionId ? { ...s, status: 'cancelled' as const } : s))
    )
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

  useEffect(() => {
    if (!activeTabId) return
    return window.api.fs.onCloseTab(() => handleCloseTab(activeTabId))
  }, [activeTabId, handleCloseTab])

  const activityItems = [
    {
      id: 'explorer',
      label: 'Explorer',
      icon: Files,
      active: activeView === 'workspace' && sidebar.visible && sidebar.activePanel === 'explorer',
      onClick: handleToggleExplorer
    },
    {
      id: 'pull-requests',
      label: 'Pull Requests',
      icon: GitGraph,
      active: activeView === 'workspace' && isPullRequestWorkspaceTab(activeTab),
      onClick: () => {
        if (activeView === 'agent') {
          onUpdateSession({ ...session, activeView: 'workspace' })
        }
        handleOpenPullRequestList()
      }
    },
    {
      id: 'agent',
      label: 'Agent',
      icon: Terminal,
      active: activeView === 'agent',
      onClick: handleToggleAgent
    }
  ]

  return (
    <div className="flex flex-1 bg-background w-screen">
      <ActivityBar items={activityItems} />

      {activeView === 'agent' ? (
        <AgentView
          sessions={agentSessions}
          activeSessionId={activeAgentSessionId}
          onSelectSession={setActiveAgentSessionId}
          onStartSession={handleStartAgent}
          onContinueSession={handleContinueAgent}
          onAllowAndRetry={handleAllowAndRetry}
          onAlwaysAllowAndRetry={handleAlwaysAllowAndRetry}
          onStopSession={handleStopAgent}
        />
      ) : (
        <>
          {sidebar.visible && sidebar.activePanel === 'explorer' ? (
            <ExplorerPanel folderPath={folderPath} selectedFilePath={activeFilePath} onSelectFile={handleOpenFile} />
          ) : null}

          <div className="flex min-w-0 flex-1 flex-col">
            <WorkspaceTabBar
              tabs={tabs}
              activeTabId={activeTabId}
              onSelectTab={handleSelectTab}
              onCloseTab={handleCloseTab}
            />

            <main className={cn('min-h-0 flex-1', activeTab?.kind === 'file' ? 'overflow-hidden' : 'overflow-y-auto p-6')}>
              {renderWorkspaceTabContent({
                activeTab,
                folderPath,
                gitInfo,
                gitInfoError,
                isLoadingGitInfo,
                onOpenPullRequest: handleOpenPullRequest,
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
  gitInfoError,
  isLoadingGitInfo,
  onOpenPullRequest,
  onPullRequestSubviewChange,
  onPullRequestTitleChange,
  onPullRequestStateChange
}: {
  activeTab: WorkspaceTab | null
  folderPath: string
  gitInfo: GitRepoInfo | null | undefined
  gitInfoError: Error | null
  isLoadingGitInfo: boolean
  onOpenPullRequest: (number: number) => void
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
    case 'pull-request-list':
      return (
        <PullRequestsView
          gitInfo={gitInfo}
          gitInfoError={gitInfoError}
          isLoadingGitInfo={isLoadingGitInfo}
          onOpenPullRequest={onOpenPullRequest}
        />
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
          onSubviewChange={(subview) => onPullRequestSubviewChange(activeTab.id, subview)}
          onTitleChange={(title) => onPullRequestTitleChange(activeTab.id, title)}
          onStateChange={(prState) => onPullRequestStateChange(activeTab.id, prState)}
        />
      ) : (
        <PlaceholderView title="Pull Request" description="Repository metadata is not available." />
      )
  }
}
