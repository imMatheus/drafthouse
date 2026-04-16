import { useEffect, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowDown, ArrowUp, Check, ChevronDown, ChevronRight, GitBranch, GitPullRequest, Minus, Plus, Undo2, X } from 'lucide-react'
import type { GitBranchInfo, GitChangedFile, GitRepoInfo, GitStatusCode, GitHubBranch } from '../../../shared/types'
import { cn } from '../lib/cn'
import { getPathBasename } from '../lib/path'
import { FileIcon } from './FileIcon'

interface SourceControlPanelProps {
  folderPath: string
  gitInfo?: GitRepoInfo | null
  onOpenDiff: (path: string, staged: boolean) => void
  onOpenPullRequest?: (number: number) => void
}

export default function SourceControlPanel({ folderPath, gitInfo, onOpenDiff, onOpenPullRequest }: SourceControlPanelProps) {
  const [commitMessage, setCommitMessage] = useState('')
  const [isCommitting, setIsCommitting] = useState(false)
  const [isPushing, setIsPushing] = useState(false)
  const [isPulling, setIsPulling] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [stagedOpen, setStagedOpen] = useState(true)
  const [changesOpen, setChangesOpen] = useState(true)
  const [isCreatePROpen, setIsCreatePROpen] = useState(false)
  const queryClient = useQueryClient()

  const { data: status } = useQuery<GitChangedFile[]>({
    queryKey: ['git-status', folderPath],
    queryFn: () => window.api.git.status(folderPath),
    refetchInterval: 3000,
    retry: false
  })

  const { data: branchInfo } = useQuery<GitBranchInfo>({
    queryKey: ['git-branch-info', folderPath],
    queryFn: () => window.api.git.branchInfo(folderPath),
    refetchInterval: 5000,
    retry: false
  })

  const files = status ?? []
  const stagedFiles = files.filter((f) => f.indexStatus !== ' ' && f.indexStatus !== '?')
  const changedFiles = files.filter((f) => f.workTreeStatus !== ' ' || f.indexStatus === '?')

  const isDefaultBranch = branchInfo?.name === 'main' || branchInfo?.name === 'master'
  const canCreatePR = gitInfo && branchInfo && !isDefaultBranch

  const invalidateGit = async (): Promise<void> => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['git-status', folderPath] }),
      queryClient.invalidateQueries({ queryKey: ['git-branch-info', folderPath] })
    ])
  }

  const handleStage = async (paths: string[]): Promise<void> => {
    setError(null)
    try {
      await window.api.git.stage(folderPath, paths)
      await invalidateGit()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to stage')
    }
  }

  const handleUnstage = async (paths: string[]): Promise<void> => {
    setError(null)
    try {
      await window.api.git.unstage(folderPath, paths)
      await invalidateGit()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to unstage')
    }
  }

  const handleStageAll = async (): Promise<void> => {
    setError(null)
    try {
      await window.api.git.stageAll(folderPath)
      await invalidateGit()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to stage all')
    }
  }

  const handleUnstageAll = async (): Promise<void> => {
    setError(null)
    try {
      await window.api.git.unstageAll(folderPath)
      await invalidateGit()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to unstage all')
    }
  }

  const handleDiscard = async (paths: string[]): Promise<void> => {
    setError(null)
    try {
      await window.api.git.discard(folderPath, paths)
      await invalidateGit()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to discard')
    }
  }

  const handleDiscardAll = async (): Promise<void> => {
    setError(null)
    try {
      await window.api.git.discardAll(folderPath)
      await invalidateGit()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to discard all')
    }
  }

  const handleCommit = async (): Promise<void> => {
    if (!commitMessage.trim()) return
    setIsCommitting(true)
    setError(null)
    try {
      // If nothing is staged, stage all changes first (VS Code behavior)
      if (stagedFiles.length === 0 && changedFiles.length > 0) {
        await window.api.git.stageAll(folderPath)
      }
      await window.api.git.commit(folderPath, commitMessage)
      setCommitMessage('')
      await invalidateGit()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to commit')
    } finally {
      setIsCommitting(false)
    }
  }

  const handlePush = async (): Promise<void> => {
    setIsPushing(true)
    setError(null)
    try {
      await window.api.git.push(folderPath)
      await invalidateGit()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to push')
    } finally {
      setIsPushing(false)
    }
  }

  const handlePull = async (): Promise<void> => {
    setIsPulling(true)
    setError(null)
    try {
      await window.api.git.pull(folderPath)
      await invalidateGit()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to pull')
    } finally {
      setIsPulling(false)
    }
  }

  return (
    <div className="flex h-screen w-60 shrink-0 flex-col border-r border-border bg-surface">
      {/* Header */}
      <div className="px-4 py-3">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-foreground-muted">Source Control</p>
      </div>

      {/* Branch info */}
      {branchInfo ? (
        <div className="flex items-center gap-1.5 px-4 pb-2">
          <GitBranch size={12} className="shrink-0 text-foreground-subtle" />
          <span className="truncate text-xs text-foreground-muted">{branchInfo.name}</span>
          {branchInfo.ahead > 0 ? (
            <span className="flex items-center gap-0.5 text-[10px] text-foreground-subtle">
              {branchInfo.ahead}
              <ArrowUp size={10} />
            </span>
          ) : null}
          {branchInfo.behind > 0 ? (
            <span className="flex items-center gap-0.5 text-[10px] text-foreground-subtle">
              {branchInfo.behind}
              <ArrowDown size={10} />
            </span>
          ) : null}
        </div>
      ) : null}

      {/* Commit area */}
      <div className="flex flex-col gap-2 px-3 pb-3">
        <textarea
          className="w-full resize-none rounded border border-border bg-background px-2 py-1.5 text-xs text-foreground placeholder:text-foreground-subtle focus:border-accent focus:outline-none"
          rows={3}
          placeholder="Message"
          value={commitMessage}
          onChange={(e) => setCommitMessage(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
              e.preventDefault()
              handleCommit()
            }
          }}
        />
        {(() => {
          const showPush = files.length === 0 && branchInfo != null && branchInfo.ahead > 0

          return (
            <div className="flex items-center gap-1">
              {showPush ? (
                <button
                  onClick={handlePush}
                  disabled={isPushing}
                  className="flex flex-1 items-center justify-center gap-1.5 rounded bg-accent px-2 py-1.5 text-xs font-medium text-white transition-colors hover:bg-accent-hover disabled:opacity-50"
                >
                  <ArrowUp size={12} />
                  Push
                  <span className="rounded-full bg-white/20 px-1.5 text-[10px]">{branchInfo.ahead}</span>
                </button>
              ) : (
                <button
                  onClick={handleCommit}
                  disabled={isCommitting || !commitMessage.trim()}
                  className="flex flex-1 items-center justify-center gap-1.5 rounded bg-accent px-2 py-1.5 text-xs font-medium text-white transition-colors hover:bg-accent-hover disabled:opacity-50"
                >
                  <Check size={12} />
                  Commit
                </button>
              )}
              <button
                onClick={handlePull}
                disabled={isPulling}
                className="rounded bg-interactive p-1.5 text-foreground transition-colors hover:bg-interactive-hover disabled:opacity-50"
                title="Pull"
              >
                <ArrowDown size={12} />
              </button>
            </div>
          )
        })()}

        {/* Create PR button — only show on non-default branches with gitInfo */}
        {canCreatePR ? (
          branchInfo.upstream === null ? (
            <p className="text-[10px] text-foreground-subtle text-center">
              Push this branch to create a pull request
            </p>
          ) : (
            <button
              onClick={() => setIsCreatePROpen(true)}
              className="flex items-center justify-center gap-1.5 rounded border border-border bg-interactive px-2 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-interactive-hover"
            >
              <GitPullRequest size={12} />
              Create Pull Request
            </button>
          )
        ) : null}
      </div>

      {/* Error display */}
      {error ? (
        <div className="mx-3 mb-2 flex items-start gap-1.5 rounded border border-danger/30 bg-danger/10 px-2 py-1.5">
          <X size={12} className="mt-0.5 shrink-0 cursor-pointer text-danger" onClick={() => setError(null)} />
          <p className="text-xs text-danger">{error}</p>
        </div>
      ) : null}

      {/* File sections */}
      <div className="flex-1 overflow-y-auto">
        {/* Staged Changes */}
        {stagedFiles.length > 0 ? (
          <FileSection
            title="Staged Changes"
            files={stagedFiles}
            staged
            isOpen={stagedOpen}
            onToggle={() => setStagedOpen(!stagedOpen)}
            onOpenDiff={onOpenDiff}
            onAction={handleUnstage}
            onBulkAction={handleUnstageAll}
            bulkActionIcon={<Minus size={12} />}
            bulkActionTitle="Unstage All"
            actionIcon={<Minus size={12} />}
            actionTitle="Unstage"
          />
        ) : null}

        {/* Changes */}
        {changedFiles.length > 0 ? (
          <FileSection
            title="Changes"
            files={changedFiles}
            staged={false}
            isOpen={changesOpen}
            onToggle={() => setChangesOpen(!changesOpen)}
            onOpenDiff={onOpenDiff}
            onAction={handleStage}
            onBulkAction={handleStageAll}
            bulkActionIcon={<Plus size={12} />}
            bulkActionTitle="Stage All"
            actionIcon={<Plus size={12} />}
            actionTitle="Stage"
            onDiscard={handleDiscard}
            onDiscardAll={handleDiscardAll}
          />
        ) : null}

        {files.length === 0 ? <p className="px-4 py-4 text-xs text-foreground-subtle">No changes detected</p> : null}
      </div>

      {/* Create PR Dialog */}
      {canCreatePR ? (
        <CreatePullRequestDialog
          open={isCreatePROpen}
          owner={gitInfo.owner}
          repo={gitInfo.repo}
          head={branchInfo.name}
          hasUnpushedCommits={branchInfo.ahead > 0}
          hasUncommittedChanges={files.length > 0}
          onClose={() => setIsCreatePROpen(false)}
          onCreated={(prNumber) => {
            setIsCreatePROpen(false)
            onOpenPullRequest?.(prNumber)
          }}
        />
      ) : null}
    </div>
  )
}

// ────────────────────────────────────────────────────────────
// Create Pull Request Dialog
// ────────────────────────────────────────────────────────────

function formatBranchAsTitle(branch: string): string {
  // Strip common prefixes like feature/, fix/, chore/, etc.
  const stripped = branch.replace(/^(feature|fix|bugfix|hotfix|chore|docs|refactor|ci|test|perf|build|style)\//i, '')
  // Replace hyphens/underscores with spaces, capitalize first letter
  const spaced = stripped.replace(/[-_]/g, ' ')
  return spaced.charAt(0).toUpperCase() + spaced.slice(1)
}

function humanizeGitHubError(message: string): string {
  // GitHub returns machine-readable messages — translate common ones to helpful text
  if (message.includes('A pull request already exists'))
    return 'A pull request already exists for this branch. Check the Pull Requests panel.'
  if (message.includes('No commits between'))
    return 'There are no differences between these branches. Push some commits first or choose a different base branch.'
  if (message.includes('head sha can\'t be blank') || message.includes('field.head.sha'))
    return 'This branch does not exist on GitHub yet. Push it first.'
  if (message.includes('Validation Failed'))
    return 'GitHub rejected the request. Make sure the branch has been pushed and has commits ahead of the base.'
  return message
}

function CreatePullRequestDialog({
  open,
  owner,
  repo,
  head,
  hasUnpushedCommits,
  hasUncommittedChanges,
  onClose,
  onCreated
}: {
  open: boolean
  owner: string
  repo: string
  head: string
  hasUnpushedCommits: boolean
  hasUncommittedChanges: boolean
  onClose: () => void
  onCreated: (prNumber: number) => void
}) {
  const [title, setTitle] = useState(() => formatBranchAsTitle(head))
  const [body, setBody] = useState('')
  const [base, setBase] = useState('')
  const [draft, setDraft] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [branchError, setBranchError] = useState<string | null>(null)
  const queryClient = useQueryClient()

  const { data: branches, isLoading: isLoadingBranches } = useQuery<GitHubBranch[]>({
    queryKey: ['github-branches', owner, repo],
    queryFn: () => window.api.github.branches.list(owner, repo, { perPage: 100 }),
    enabled: open,
    retry: false
  })

  // Check if the head branch even exists on the remote
  const headExistsOnRemote = branches ? branches.some((b) => b.name === head) : true // assume yes while loading

  // Set default base branch when branches load
  useEffect(() => {
    if (!branches) return
    if (branches.length === 0) {
      setBranchError('Could not load branches. Check your permissions for this repository.')
      return
    }
    if (base) return
    const defaultBranch = branches.find((b) => b.name === 'main') ?? branches.find((b) => b.name === 'master') ?? branches[0]
    if (defaultBranch) setBase(defaultBranch.name)
  }, [branches, base])

  // Reset form when dialog opens
  useEffect(() => {
    if (open) {
      setTitle(formatBranchAsTitle(head))
      setBody('')
      setBase('')
      setDraft(false)
      setErrorMessage(null)
      setBranchError(null)
      setIsSubmitting(false)
    }
  }, [open, head])

  if (!open) return null

  const handleSubmit = async (): Promise<void> => {
    if (!title.trim() || !base || isSubmitting) return
    setIsSubmitting(true)
    setErrorMessage(null)

    try {
      const pr = await window.api.github.pulls.create(owner, repo, { title, head, base, body: body || undefined, draft })
      await queryClient.invalidateQueries({ queryKey: ['pull-requests'] })
      onCreated(pr.number)
    } catch (e) {
      const raw = e instanceof Error ? e.message : 'Failed to create pull request.'
      setErrorMessage(humanizeGitHubError(raw))
      setIsSubmitting(false)
    }
  }

  const baseBranches = (branches ?? []).filter((b) => b.name !== head)
  const hasWarnings = hasUnpushedCommits || hasUncommittedChanges || !headExistsOnRemote

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 px-4">
      <div className="w-full max-w-2xl rounded-2xl border border-border bg-surface shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between gap-3 border-b border-border px-5 py-4">
          <div className="flex items-center gap-2">
            <GitPullRequest size={18} className="text-foreground-muted" />
            <h2 className="text-lg font-semibold text-foreground">Create Pull Request</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex size-8 items-center justify-center rounded-md text-foreground-muted transition-colors hover:bg-interactive hover:text-foreground"
            aria-label="Close"
          >
            <X size={16} />
          </button>
        </div>

        {/* Warnings */}
        {hasWarnings ? (
          <div className="border-b border-border px-5 py-3 space-y-1.5">
            {!headExistsOnRemote ? (
              <p className="text-xs text-danger">
                This branch has not been pushed to GitHub. Push it before creating a pull request.
              </p>
            ) : null}
            {hasUnpushedCommits && headExistsOnRemote ? (
              <p className="text-xs text-accent">
                You have unpushed commits. The pull request will be based on what is currently on GitHub, not your local changes. Push first to include them.
              </p>
            ) : null}
            {hasUncommittedChanges ? (
              <p className="text-xs text-foreground-muted">
                You have uncommitted changes that won't be included in this pull request.
              </p>
            ) : null}
          </div>
        ) : null}

        {/* Branch info */}
        <div className="flex items-center gap-2 border-b border-border px-5 py-3">
          <div className="flex items-center gap-1.5 rounded-md bg-interactive px-2.5 py-1 text-xs font-medium text-foreground">
            <GitBranch size={12} />
            {head}
          </div>
          <span className="text-xs text-foreground-subtle">into</span>
          {isLoadingBranches ? (
            <span className="text-xs text-foreground-muted">Loading branches...</span>
          ) : branchError ? (
            <span className="text-xs text-danger">{branchError}</span>
          ) : (
            <div className="relative">
              <select
                value={base}
                onChange={(e) => setBase(e.target.value)}
                className="appearance-none rounded-md border border-border bg-interactive py-1 pl-2.5 pr-7 text-xs font-medium text-foreground transition-colors hover:bg-interactive-hover focus:outline-none"
              >
                {baseBranches.map((b) => (
                  <option key={b.name} value={b.name}>{b.name}</option>
                ))}
              </select>
              <ChevronDown size={12} className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-foreground-subtle" />
            </div>
          )}
        </div>

        {/* Form */}
        <div className="px-5 py-4">
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Pull request title"
            className="w-full rounded-lg border border-border bg-background px-4 py-2.5 text-sm text-foreground placeholder:text-foreground-subtle focus:border-accent focus:outline-none"
            autoFocus
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                e.preventDefault()
                handleSubmit()
              }
            }}
          />
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="Description (optional)"
            className="mt-3 min-h-32 w-full resize-y rounded-lg border border-border bg-background px-4 py-3 text-sm text-foreground placeholder:text-foreground-subtle focus:border-accent focus:outline-none"
          />

          <label className="mt-3 flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={draft}
              onChange={(e) => setDraft(e.target.checked)}
              className="size-3.5 rounded border-border accent-accent"
            />
            <span className="text-xs text-foreground-muted">Create as draft</span>
          </label>

          {errorMessage ? <p className="mt-3 text-sm text-danger">{errorMessage}</p> : null}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 border-t border-border px-5 py-4">
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border border-border bg-interactive px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-interactive-hover"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={!title.trim() || !base || isSubmitting || !headExistsOnRemote}
            className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-40"
          >
            {isSubmitting ? 'Creating...' : draft ? 'Create Draft PR' : 'Create Pull Request'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ────────────────────────────────────────────────────────────
// File Section & File Row (unchanged)
// ────────────────────────────────────────────────────────────

function FileSection({
  title,
  files,
  staged,
  isOpen,
  onToggle,
  onOpenDiff,
  onAction,
  onBulkAction,
  bulkActionIcon,
  bulkActionTitle,
  actionIcon,
  actionTitle,
  onDiscard,
  onDiscardAll
}: {
  title: string
  files: GitChangedFile[]
  staged: boolean
  isOpen: boolean
  onToggle: () => void
  onOpenDiff: (path: string, staged: boolean) => void
  onAction: (paths: string[]) => void
  onBulkAction: () => void
  bulkActionIcon: React.ReactNode
  bulkActionTitle: string
  actionIcon: React.ReactNode
  actionTitle: string
  onDiscard?: (paths: string[]) => void
  onDiscardAll?: () => void
}) {
  return (
    <div>
      <div className="group flex items-center justify-between px-2 py-1 hover:bg-surface-hover">
        <button onClick={onToggle} className="flex flex-1 items-center gap-1 text-left">
          <ChevronRight
            size={12}
            className={cn('shrink-0 text-foreground-subtle transition-transform', isOpen && 'rotate-90')}
          />
          <span className="text-[10px] font-semibold uppercase tracking-wider text-foreground-muted">{title}</span>
          <span className="text-[10px] text-foreground-subtle">{files.length}</span>
        </button>
        <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100">
          {onDiscardAll ? (
            <button
              onClick={onDiscardAll}
              className="rounded p-0.5 text-foreground-subtle hover:text-foreground"
              title="Discard All"
            >
              <Undo2 size={12} />
            </button>
          ) : null}
          <button
            onClick={onBulkAction}
            className="rounded p-0.5 text-foreground-subtle hover:text-foreground"
            title={bulkActionTitle}
          >
            {bulkActionIcon}
          </button>
        </div>
      </div>
      {isOpen ? (
        <div>
          {files.map((file) => (
            <FileRow
              key={`${file.path}-${staged ? 'staged' : 'changed'}`}
              file={file}
              staged={staged}
              onOpenDiff={() => onOpenDiff(file.path, staged)}
              onAction={() => onAction([file.path])}
              actionIcon={actionIcon}
              actionTitle={actionTitle}
              onDiscard={onDiscard ? () => onDiscard([file.path]) : undefined}
            />
          ))}
        </div>
      ) : null}
    </div>
  )
}

function FileRow({
  file,
  staged,
  onOpenDiff,
  onAction,
  actionIcon,
  actionTitle,
  onDiscard
}: {
  file: GitChangedFile
  staged: boolean
  onOpenDiff: () => void
  onAction: () => void
  actionIcon: React.ReactNode
  actionTitle: string
  onDiscard?: () => void
}) {
  const status = staged ? file.indexStatus : file.workTreeStatus
  const displayName = getPathBasename(file.path)
  const dirPath = file.path.includes('/') ? file.path.slice(0, file.path.lastIndexOf('/')) : ''

  return (
    <div className="group flex items-center gap-1 py-[3px] pl-6 pr-2 hover:bg-surface-hover">
      <button onClick={onOpenDiff} className="flex flex-1 items-center gap-1.5 overflow-hidden text-left">
        <FileIcon name={displayName} />
        <span className="truncate text-xs text-foreground">{displayName}</span>
        {dirPath ? <span className="truncate text-[10px] text-foreground-subtle">{dirPath}</span> : null}
      </button>
      <div className="hidden shrink-0 items-center gap-0.5 group-hover:flex">
        {onDiscard ? (
          <button
            onClick={onDiscard}
            className="rounded p-0.5 text-foreground-subtle hover:text-foreground"
            title="Discard Changes"
          >
            <Undo2 size={12} />
          </button>
        ) : null}
        <button
          onClick={onAction}
          className="rounded p-0.5 text-foreground-subtle hover:text-foreground"
          title={actionTitle}
        >
          {actionIcon}
        </button>
      </div>
      <StatusBadge status={status} />
    </div>
  )
}

function StatusBadge({ status }: { status: GitStatusCode | ' ' }) {
  const label = status === '?' ? 'U' : status === ' ' ? '' : status

  if (!label) return null

  return (
    <span
      className={cn(
        'shrink-0 text-[10px] font-semibold',
        status === 'M' && 'text-accent',
        status === 'A' && 'text-success',
        status === 'D' && 'text-danger',
        status === 'R' && 'text-purple',
        status === '?' && 'text-success',
        status === 'U' && 'text-danger'
      )}
    >
      {label}
    </span>
  )
}
