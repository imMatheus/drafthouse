import { useEffect } from 'react'
import { NavLink, Navigate, Route, Routes, useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import type { GitRepoInfo, PullRequest } from '../../../shared/types'
import ActivityBar from '../components/ActivityBar'
import ExplorerPanel from '../components/ExplorerPanel'
import { getPathBasename } from '../lib/path'
import type { WorkspaceSession } from '../lib/workspaceSession'

interface WorkspaceProps {
  session: WorkspaceSession | null
  onCloseWorkspace: () => void
  onOpenWorkspace: (folderPath: string) => void
  onUpdateSession: (patch: Partial<WorkspaceSession>) => void
}

export default function Workspace({
  session,
  onCloseWorkspace,
  onOpenWorkspace,
  onUpdateSession
}: WorkspaceProps) {
  const navigate = useNavigate()

  if (!session) {
    return <Navigate to="/" replace />
  }

  const { folderPath, explorerVisible, selectedFilePath } = session
  const { data: gitInfo, isLoading: isLoadingGitInfo, error: gitInfoError } = useQuery<
    GitRepoInfo | null,
    Error
  >({
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
    navigate('/workspace/files')
  }

  const handleSwitchFolder = async (): Promise<void> => {
    const nextFolderPath = await window.api.fs.openFolder()
    if (nextFolderPath) {
      onOpenWorkspace(nextFolderPath)
    }
  }

  return (
    <div className="flex flex-1">
      <ActivityBar
        explorerVisible={explorerVisible}
        onToggleExplorer={() => onUpdateSession({ explorerVisible: !explorerVisible })}
      />

      {explorerVisible && (
        <ExplorerPanel
          folderPath={folderPath}
          selectedFilePath={selectedFilePath}
          onSelectFile={handleSelectFile}
        />
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="border-b border-border">
          <div className="flex items-center gap-2 px-4 py-3">
            <button
              onClick={onCloseWorkspace}
              className="rounded-md p-1 text-foreground-muted hover:bg-surface-hover hover:text-foreground"
              title="Back to home"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="m15 18-6-6 6-6" />
              </svg>
            </button>

            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-foreground">{getPathBasename(folderPath)}</p>
              <p className="truncate text-xs text-foreground-subtle">{folderPath}</p>
            </div>

            <button
              onClick={() => void handleSwitchFolder()}
              className="rounded-md border border-border px-3 py-1.5 text-xs font-medium text-foreground-muted hover:bg-surface-hover hover:text-foreground"
            >
              Open Folder
            </button>
          </div>

          <nav className="flex gap-1 px-4 pb-3">
            <WorkspaceNavLink to="/workspace/files">Files</WorkspaceNavLink>
            <WorkspaceNavLink to="/workspace/pulls">Pull Requests</WorkspaceNavLink>
            <WorkspaceNavLink to="/workspace/issues">Issues</WorkspaceNavLink>
            <WorkspaceNavLink to="/workspace/users">Users</WorkspaceNavLink>
          </nav>
        </header>

        <main className="min-h-0 flex-1 overflow-y-auto p-6">
          <Routes>
            <Route index element={<Navigate to="files" replace />} />
            <Route
              path="files"
              element={<FilesView folderPath={folderPath} selectedFilePath={selectedFilePath} />}
            />
            <Route
              path="pulls"
              element={
                <PullRequestsView
                  gitInfo={gitInfo}
                  gitInfoError={gitInfoError}
                  isLoadingGitInfo={isLoadingGitInfo}
                />
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
              path="users"
              element={
                <PlaceholderView
                  title="Users"
                  description="Repository users and collaborators can live in this workspace area."
                />
              }
            />
            <Route path="*" element={<Navigate to="files" replace />} />
          </Routes>
        </main>
      </div>
    </div>
  )
}

function WorkspaceNavLink({
  to,
  children
}: {
  to: string
  children: React.ReactNode
}) {
  return (
    <NavLink
      to={to}
      className={({ isActive }) =>
        `rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
          isActive
            ? 'bg-surface text-foreground'
            : 'text-foreground-muted hover:bg-surface-hover hover:text-foreground'
        }`
      }
    >
      {children}
    </NavLink>
  )
}

function FilesView({
  folderPath,
  selectedFilePath
}: {
  folderPath: string
  selectedFilePath: string | null
}) {
  const { data: fileContents, isLoading, error } = useQuery<string, Error>({
    queryKey: ['read-file', selectedFilePath],
    queryFn: () => window.api.fs.readFile(selectedFilePath!),
    enabled: selectedFilePath !== null,
    retry: false
  })

  if (!selectedFilePath) {
    return (
      <PlaceholderView
        title="Files"
        description={`Choose a file from ${getPathBasename(folderPath)} to open it in the workspace.`}
      />
    )
  }

  if (isLoading) {
    return <p className="text-sm text-foreground-muted">Loading file...</p>
  }

  if (error) {
    return (
      <div className="max-w-xl rounded-lg border border-border bg-surface p-4">
        <h2 className="text-sm font-semibold text-foreground">File unavailable</h2>
        <p className="mt-2 text-sm text-foreground-muted">{error.message}</p>
      </div>
    )
  }

  return (
    <div className="overflow-hidden rounded-xl border border-border bg-surface">
      <div className="border-b border-border px-4 py-3">
        <p className="text-sm font-medium text-foreground">{getPathBasename(selectedFilePath)}</p>
        <p className="truncate text-xs text-foreground-subtle">{selectedFilePath}</p>
      </div>
      <pre className="overflow-x-auto p-4 text-sm leading-6 text-foreground">
        <code>{fileContents}</code>
      </pre>
    </div>
  )
}

function PullRequestsView({
  gitInfo,
  gitInfoError,
  isLoadingGitInfo
}: {
  gitInfo: GitRepoInfo | null | undefined
  gitInfoError: Error | null
  isLoadingGitInfo: boolean
}) {
  const { data: prs, isLoading, error } = useQuery<PullRequest[], Error>({
    queryKey: ['pull-requests', gitInfo?.owner, gitInfo?.repo],
    queryFn: () => window.api.auth.getPullRequests(gitInfo!.owner, gitInfo!.repo),
    enabled: gitInfo !== null && gitInfo !== undefined,
    retry: false
  })

  if (isLoadingGitInfo) {
    return <p className="text-sm text-foreground-muted">Checking repository metadata...</p>
  }

  if (gitInfoError) {
    return (
      <div className="max-w-xl rounded-lg border border-border bg-surface p-4">
        <h2 className="text-sm font-semibold text-foreground">Repository metadata unavailable</h2>
        <p className="mt-2 text-sm text-foreground-muted">{gitInfoError.message}</p>
      </div>
    )
  }

  if (!gitInfo) {
    return (
      <PlaceholderView
        title="Pull Requests"
        description="This folder is not mapped to a GitHub repository yet, so pull requests are unavailable."
      />
    )
  }

  if (isLoading) {
    return <p className="text-sm text-foreground-muted">Loading pull requests...</p>
  }

  if (error) {
    return (
      <div className="max-w-xl rounded-lg border border-border bg-surface p-4">
        <h2 className="text-sm font-semibold text-foreground">Pull requests unavailable</h2>
        <p className="mt-2 text-sm text-foreground-muted">{error.message}</p>
      </div>
    )
  }

  if (!prs || prs.length === 0) {
    return <p className="text-sm text-foreground-muted">No open pull requests</p>
  }

  return (
    <div>
      <h2 className="mb-4 text-sm font-semibold text-foreground">Open Pull Requests</h2>
      <div className="flex flex-col gap-1">
        {prs.map((pr) => (
          <div
            key={pr.number}
            className="flex items-start gap-3 rounded-lg border border-border bg-surface p-4 hover:bg-surface-hover"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="mt-0.5 shrink-0 text-success"
            >
              <circle cx="18" cy="18" r="3" />
              <circle cx="6" cy="6" r="3" />
              <path d="M13 6h3a2 2 0 0 1 2 2v7" />
              <path d="M6 9v12" />
            </svg>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-foreground">{pr.title}</p>
              <p className="mt-1 text-xs text-foreground-subtle">
                #{pr.number} opened by {pr.user.login}
              </p>
            </div>
            <img
              src={pr.user.avatar_url}
              alt={pr.user.login}
              className="h-6 w-6 shrink-0 rounded-full"
            />
          </div>
        ))}
      </div>
    </div>
  )
}

function PlaceholderView({
  title,
  description
}: {
  title: string
  description: string
}) {
  return (
    <div className="flex h-full items-center justify-center">
      <div className="max-w-lg rounded-xl border border-dashed border-border bg-surface px-6 py-8 text-center">
        <h2 className="text-base font-semibold text-foreground">{title}</h2>
        <p className="mt-2 text-sm text-foreground-muted">{description}</p>
      </div>
    </div>
  )
}
