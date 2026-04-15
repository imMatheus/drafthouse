import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  ArrowDown,
  ArrowUp,
  Check,
  ChevronRight,
  FileDiff,
  FilePlus,
  FileQuestion,
  FileX,
  GitBranch,
  Minus,
  Plus,
  Undo2,
  X
} from 'lucide-react'
import type { GitBranchInfo, GitChangedFile, GitStatusCode } from '../../../shared/types'
import { cn } from '../lib/cn'
import { getPathBasename } from '../lib/path'

interface SourceControlPanelProps {
  folderPath: string
  onOpenDiff: (path: string, staged: boolean) => void
}

export default function SourceControlPanel({ folderPath, onOpenDiff }: SourceControlPanelProps) {
  const [commitMessage, setCommitMessage] = useState('')
  const [isCommitting, setIsCommitting] = useState(false)
  const [isPushing, setIsPushing] = useState(false)
  const [isPulling, setIsPulling] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [stagedOpen, setStagedOpen] = useState(true)
  const [changesOpen, setChangesOpen] = useState(true)
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
    </div>
  )
}

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
        <StatusIcon status={status} />
        <span className="truncate text-xs text-foreground">{displayName}</span>
        {dirPath ? <span className="truncate text-[10px] text-foreground-subtle">{dirPath}</span> : null}
      </button>
      <div className="flex shrink-0 items-center gap-0.5 opacity-0 group-hover:opacity-100">
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

function StatusIcon({ status }: { status: GitStatusCode | ' ' }) {
  switch (status) {
    case 'M':
      return <FileDiff size={14} className="shrink-0 text-accent" />
    case 'A':
      return <FilePlus size={14} className="shrink-0 text-success" />
    case 'D':
      return <FileX size={14} className="shrink-0 text-danger" />
    case 'R':
      return <FileDiff size={14} className="shrink-0 text-purple" />
    case '?':
      return <FileQuestion size={14} className="shrink-0 text-success" />
    case 'U':
      return <FileDiff size={14} className="shrink-0 text-danger" />
    default:
      return <FileDiff size={14} className="shrink-0 text-foreground-subtle" />
  }
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
