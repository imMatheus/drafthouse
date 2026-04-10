import { useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { ClipboardCheck, CircleDot, GitPullRequest, Home } from 'lucide-react'
import { NavLink, Navigate, Route, Routes, useNavigate } from 'react-router-dom'
import type { GitRepoInfo, PullRequest } from '../../../shared/types'
import ActivityBar from '../components/ActivityBar'
import ExplorerPanel from '../components/ExplorerPanel'
import type { WorkspaceSession } from '../lib/workspaceSession'
import FilesView from './workspace/FilesView'
import PlaceholderView from './workspace/PlaceholderView'
import PullRequestDetailView from './workspace/PullRequestDetailView'
import PullRequestsView from './workspace/PullRequestsView'

interface WorkspaceProps {
  session: WorkspaceSession | null
  onCloseWorkspace: () => void
  onOpenWorkspace: (folderPath: string) => void
  onUpdateSession: (patch: Partial<WorkspaceSession>) => void
}

export default function Workspace({ session, onCloseWorkspace, onUpdateSession }: WorkspaceProps) {
  const navigate = useNavigate()

  if (!session) {
    return <Navigate to="/" replace />
  }

  const { folderPath, explorerVisible, selectedFilePath } = session
  const {
    data: gitInfo,
    isLoading: isLoadingGitInfo,
    error: gitInfoError
  } = useQuery<GitRepoInfo | null, Error>({
    queryKey: ['git-info', folderPath],
    queryFn: () => window.api.fs.getGitInfo(folderPath),
    retry: false
  })
  const { data: pullRequests } = useQuery<PullRequest[], Error>({
    queryKey: ['pull-requests', gitInfo?.owner, gitInfo?.repo],
    queryFn: () => window.api.auth.getPullRequests(gitInfo!.owner, gitInfo!.repo),
    enabled: gitInfo !== null && gitInfo !== undefined,
    retry: false
  })

  useEffect(() => {
    let cancelled = false

    void window.api.fs
      .openRecent(folderPath)
      .then((resolvedFolderPath) => {
        if (cancelled || resolvedFolderPath === folderPath) return

        onUpdateSession({
          folderPath: resolvedFolderPath,
          selectedFilePath: null
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

  const handleSelectFile = (filePath: string): void => {
    onUpdateSession({ selectedFilePath: filePath })
    navigate('/workspace/overview')
  }

  return (
    <div className="flex flex-1">
      <ActivityBar
        explorerVisible={explorerVisible}
        onToggleExplorer={() => onUpdateSession({ explorerVisible: !explorerVisible })}
      />

      {explorerVisible ? (
        <ExplorerPanel folderPath={folderPath} selectedFilePath={selectedFilePath} onSelectFile={handleSelectFile} />
      ) : null}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="border-b border-border bg-background">
          <nav className="flex min-h-12 items-center gap-1 overflow-x-auto px-5">
            <WorkspaceNavLink to="/workspace/overview" icon={<Home size={16} strokeWidth={1.8} />}>
              Overview
            </WorkspaceNavLink>
            <WorkspaceNavLink
              to="/workspace/pulls"
              icon={<GitPullRequest size={16} strokeWidth={1.8} />}
              count={pullRequests?.length}
            >
              Pull Requests
            </WorkspaceNavLink>
            <WorkspaceNavLink to="/workspace/issues" icon={<CircleDot size={16} strokeWidth={1.8} />}>
              Issues
            </WorkspaceNavLink>
            <WorkspaceNavLink to="/workspace/reviews" icon={<ClipboardCheck size={16} strokeWidth={1.8} />}>
              Reviews
            </WorkspaceNavLink>
          </nav>
        </header>

        <main className="min-h-0 flex-1 overflow-y-auto p-6">
          <Routes>
            <Route index element={<Navigate to="overview" replace />} />
            <Route
              path="overview"
              element={<FilesView folderPath={folderPath} selectedFilePath={selectedFilePath} />}
            />
            <Route path="files" element={<Navigate to="/workspace/overview" replace />} />
            <Route
              path="pulls"
              element={
                <PullRequestsView gitInfo={gitInfo} gitInfoError={gitInfoError} isLoadingGitInfo={isLoadingGitInfo} />
              }
            />
            <Route
              path="pulls/:number/*"
              element={
                gitInfo ? (
                  <PullRequestDetailView owner={gitInfo.owner} repo={gitInfo.repo} />
                ) : (
                  <PlaceholderView title="Pull Request" description="Repository metadata is not available." />
                )
              }
            />
            <Route
              path="issues"
              element={
                <PlaceholderView
                  title="Issues"
                  description="Repository issues can live in this workspace area next to files and pull requests."
                />
              }
            />
            <Route
              path="reviews"
              element={
                <PlaceholderView
                  title="Reviews"
                  description="Review activity can live in this workspace area next to pull requests and issues."
                />
              }
            />
            <Route path="users" element={<Navigate to="/workspace/reviews" replace />} />
            <Route path="*" element={<Navigate to="overview" replace />} />
          </Routes>
        </main>
      </div>
    </div>
  )
}

function WorkspaceNavLink({
  to,
  children,
  icon,
  count
}: {
  to: string
  children: React.ReactNode
  icon: React.ReactNode
  count?: number
}) {
  return (
    <NavLink
      to={to}
      className={({ isActive }) =>
        `inline-flex h-12 items-center gap-2 border-b-2 px-3 text-[13px] font-medium whitespace-nowrap transition-colors ${
          isActive
            ? 'border-foreground-muted text-foreground'
            : 'border-transparent text-foreground-muted hover:text-foreground'
        }`
      }
    >
      <span className="shrink-0">{icon}</span>
      {children}
      {typeof count === 'number' ? <span className="text-foreground-muted">{count}</span> : null}
    </NavLink>
  )
}
