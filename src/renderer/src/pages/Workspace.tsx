import type { ReactNode } from 'react'
import { useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Files, GitPullRequest } from 'lucide-react'
import { Navigate } from 'react-router-dom'
import type { GitRepoInfo } from '../../../shared/types'
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

  const { folderPath, sidebar, tabs, activeTabId } = session
  const activeTab = tabs.find((tab) => tab.id === activeTabId) ?? null
  const activeFilePath = activeTab?.kind === 'file' ? activeTab.path : null
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

  useEffect(() => {
    if (!activeTabId) return
    return window.api.fs.onCloseTab(() => handleCloseTab(activeTabId))
  }, [activeTabId, handleCloseTab])

  const activityItems = [
    {
      id: 'explorer',
      label: 'Explorer',
      icon: Files,
      active: sidebar.visible && sidebar.activePanel === 'explorer',
      onClick: handleToggleExplorer
    },
    {
      id: 'pull-requests',
      label: 'Pull Requests',
      icon: GitPullRequest,
      active: isPullRequestWorkspaceTab(activeTab),
      onClick: handleOpenPullRequestList
    }
  ]

  return (
    <div className="flex flex-1 bg-background w-screen">
      <ActivityBar items={activityItems} />

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

        <main className={`min-h-0 flex-1 ${activeTab?.kind === 'file' ? 'overflow-hidden' : 'overflow-y-auto p-6'}`}>
          {renderWorkspaceTabContent({
            activeTab,
            folderPath,
            gitInfo,
            gitInfoError,
            isLoadingGitInfo,
            onOpenPullRequest: handleOpenPullRequest,
            onPullRequestSubviewChange: handlePullRequestSubviewChange,
            onPullRequestTitleChange: handlePullRequestTitleChange
          })}
        </main>
      </div>
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
  onPullRequestTitleChange
}: {
  activeTab: WorkspaceTab | null
  folderPath: string
  gitInfo: GitRepoInfo | null | undefined
  gitInfoError: Error | null
  isLoadingGitInfo: boolean
  onOpenPullRequest: (number: number) => void
  onPullRequestSubviewChange: (tabId: WorkspaceTab['id'], subview: PullRequestSubview) => void
  onPullRequestTitleChange: (tabId: WorkspaceTab['id'], title: string) => void
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
        />
      ) : (
        <PlaceholderView title="Pull Request" description="Repository metadata is not available." />
      )
  }
}
