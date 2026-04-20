import { useDeferredValue, useEffect, useMemo, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Copy,
  ExternalLink,
  FileDiff,
  FileMinus,
  FilePlus,
  Search,
  X
} from 'lucide-react'
import type {
  AgentSession,
  GitHubCommit,
  PullRequestFile,
  PullRequestReviewDraftComment
} from '../../../../shared/types'
import CommitActorStack, { formatCommitActorNames, getCommitActors } from '../../components/CommitActorStack'
import { FolderIcon } from '../../components/FileIcon'
import Tooltip from '../../components/Tooltip'
import { LoadingView } from '../../components/Loading'
import { cn } from '../../lib/cn'
import { ChangedFileDiffCard } from './PRFilesTab'
import PlaceholderView from './PlaceholderView'
import { DiffStat, formatAbsoluteDate, formatRelativeTime } from './pullRequestShared'

const EMPTY_FILES: PullRequestFile[] = []
const EMPTY_SESSIONS: AgentSession[] = []
const NOOP_COMMENT_TOGGLE = (_value: string | null): void => {}
const NOOP_THREAD_REF = (_commentId: number, _element: HTMLElement | null): void => {}
const NOOP_DRAFT_ADD = (_comment: PullRequestReviewDraftComment): void => {}
const NOOP_DRAFT_REMOVE = (_index: number): void => {}
const NOOP_ASYNC = async (): Promise<void> => {}

interface CommitDetailViewProps {
  owner: string
  repo: string
  commitSha: string
  onTitleChange?: (title: string) => void
}

export default function CommitDetailView({ owner, repo, commitSha, onTitleChange }: CommitDetailViewProps) {
  const [filterValue, setFilterValue] = useState('')
  const [fileListCollapsed, setFileListCollapsed] = useState(false)
  const [activeFilePath, setActiveFilePath] = useState<string | null>(null)
  const [shaCopied, setShaCopied] = useState(false)
  const fileSectionRefs = useRef(new Map<string, HTMLElement>())

  const {
    data: commit,
    isLoading,
    error
  } = useQuery<GitHubCommit, Error>({
    queryKey: ['commit', owner, repo, commitSha],
    queryFn: () => window.api.github.commits.get(owner, repo, commitSha, { perPage: 100 }),
    retry: false
  })

  const subject = commit ? getCommitSubject(commit.commit.message) : 'Untitled commit'
  const body = commit ? getCommitBody(commit.commit.message) : ''
  const deferredFilterValue = useDeferredValue(filterValue)
  const allFiles = commit?.files ?? EMPTY_FILES
  const trimmedFilter = deferredFilterValue.trim().toLowerCase()
  const filteredFiles = useMemo(
    () =>
      trimmedFilter === '' ? allFiles : allFiles.filter((file) => file.filename.toLowerCase().includes(trimmedFilter)),
    [allFiles, trimmedFilter]
  )
  const fileTree = useMemo(() => buildFileTree(filteredFiles), [filteredFiles])

  useEffect(() => {
    if (commit) {
      onTitleChange?.(subject)
    }
  }, [commit, onTitleChange, subject])

  useEffect(() => {
    setFilterValue('')
    setActiveFilePath(null)
  }, [commitSha, owner, repo])

  useEffect(() => {
    if (filteredFiles.length === 0) {
      setActiveFilePath(null)
      return
    }

    if (!activeFilePath || !filteredFiles.some((file) => file.filename === activeFilePath)) {
      setActiveFilePath(filteredFiles[0]?.filename ?? null)
    }
  }, [activeFilePath, filteredFiles])

  useEffect(() => {
    if (filteredFiles.length === 0) return

    const observer = new IntersectionObserver(
      (entries) => {
        const visibleEntries = entries
          .filter((entry) => entry.isIntersecting)
          .sort((left, right) => right.intersectionRatio - left.intersectionRatio)

        if (visibleEntries[0]?.target instanceof HTMLElement) {
          const nextPath = visibleEntries[0].target.dataset.filePath
          if (nextPath) setActiveFilePath(nextPath)
        }
      },
      { threshold: [0.1, 0.35, 0.6], rootMargin: '-15% 0px -55% 0px' }
    )

    for (const file of filteredFiles) {
      const element = fileSectionRefs.current.get(file.filename)
      if (element) observer.observe(element)
    }

    return () => observer.disconnect()
  }, [filteredFiles])

  const handleScrollToFile = (path: string): void => {
    setActiveFilePath(path)
    fileSectionRefs.current.get(path)?.scrollIntoView({ behavior: 'instant', block: 'start' })
  }

  const handleCopySha = async (): Promise<void> => {
    try {
      await navigator.clipboard.writeText(commitSha)
      setShaCopied(true)
      window.setTimeout(() => setShaCopied(false), 1500)
    } catch (copyError) {
      console.error('Failed to copy commit SHA:', copyError)
    }
  }

  if (isLoading) {
    return <LoadingView label="Loading commit..." />
  }

  if (error) {
    return (
      <div className="border-border bg-surface max-w-xl rounded-lg border p-4">
        <h2 className="text-foreground text-sm font-semibold">Commit unavailable</h2>
        <p className="text-foreground-muted mt-2 text-sm">{error.message}</p>
      </div>
    )
  }

  if (!commit) {
    return null
  }

  const commitDate = commit.commit.author?.date ?? commit.commit.committer?.date ?? null
  const actors = getCommitActors(commit)
  const stats = commit.stats
  const isMergeCommit = commit.parents.length > 1

  return (
    <div>
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-foreground min-w-0 truncate text-xl font-semibold">{subject}</h1>
            {isMergeCommit ? (
              <span className="bg-purple/10 text-purple rounded-full px-2 py-0.5 text-xs font-medium">Merge</span>
            ) : null}
          </div>

          <div className="text-foreground-muted mt-3 flex flex-wrap items-center gap-x-3 gap-y-2 text-sm">
            <CommitActorStack actors={actors} />
            <span>
              <span className="text-foreground font-medium">{formatCommitActorNames(actors)}</span>
              {commitDate ? ` committed ${formatRelativeTime(commitDate)}` : ' authored this commit'}
            </span>
            {commitDate ? <span className="text-foreground-subtle">{formatAbsoluteDate(commitDate)}</span> : null}
            <span className="text-foreground-muted rounded-md px-2 py-1 font-mono text-sm">
              {commit.sha.slice(0, 7)}
            </span>
            <Tooltip label={shaCopied ? 'Copied' : 'Copy SHA'} side="top">
              <button
                type="button"
                onClick={() => void handleCopySha()}
                className="text-foreground-subtle hover:bg-interactive hover:text-foreground inline-flex size-8 items-center justify-center rounded-md transition-colors"
                aria-label={shaCopied ? 'Copied SHA' : 'Copy SHA'}
              >
                {shaCopied ? <Check size={14} className="text-success" /> : <Copy size={14} />}
              </button>
            </Tooltip>
            {stats ? <DiffStat additions={stats.additions} deletions={stats.deletions} /> : null}
            <span className="text-foreground-subtle text-xs">
              {allFiles.length} file{allFiles.length !== 1 ? 's' : ''}
            </span>
          </div>
        </div>

        <a
          href={commit.html_url}
          target="_blank"
          rel="noreferrer"
          className="border-border bg-interactive text-foreground hover:bg-interactive-hover inline-flex shrink-0 items-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-medium transition-colors"
        >
          View on GitHub
          <ExternalLink size={13} />
        </a>
      </div>

      {body ? (
        <div className="border-border bg-surface mt-4 rounded-xl border px-4 py-3">
          <p className="text-foreground-muted text-sm leading-relaxed whitespace-pre-wrap">{body}</p>
        </div>
      ) : null}

      {allFiles.length === 0 ? (
        <div className="mt-6">
          <PlaceholderView
            title="Files changed"
            description="GitHub did not return any changed files for this commit."
          />
        </div>
      ) : (
        <div className="mt-6 flex gap-2">
          <div className="sticky top-1 hidden h-[calc(100vh-11rem)] shrink-0 lg:flex">
            {fileListCollapsed ? (
              <Tooltip label="Show file list" side="right">
                <button
                  type="button"
                  onClick={() => setFileListCollapsed(false)}
                  className="text-foreground-subtle hover:bg-surface-hover hover:text-foreground flex size-6 -translate-x-1.5 items-center justify-center self-start rounded transition-colors"
                  aria-label="Show file list"
                >
                  <ChevronRight size={14} />
                </button>
              </Tooltip>
            ) : null}

            <aside
              className={cn(
                'flex flex-col overflow-hidden transition-all duration-200',
                fileListCollapsed ? 'w-0 opacity-0' : 'w-72 opacity-100'
              )}
            >
              <div className="flex items-center gap-2 px-2 py-2">
                <Search size={14} className="text-foreground-subtle shrink-0" />
                <input
                  value={filterValue}
                  onChange={(event) => setFilterValue(event.target.value)}
                  placeholder="Filter files..."
                  className="text-foreground placeholder:text-foreground-subtle w-full bg-transparent text-sm focus:outline-none"
                />
                {filterValue ? (
                  <button
                    type="button"
                    onClick={() => setFilterValue('')}
                    className="text-foreground-subtle hover:text-foreground shrink-0"
                    aria-label="Clear file filter"
                  >
                    <X size={14} />
                  </button>
                ) : null}
                <Tooltip label="Hide file list" side="top">
                  <button
                    type="button"
                    onClick={() => setFileListCollapsed(true)}
                    className="text-foreground-subtle hover:bg-surface-hover hover:text-foreground flex size-6 shrink-0 items-center justify-center rounded transition-colors"
                    aria-label="Hide file list"
                  >
                    <ChevronLeft size={14} />
                  </button>
                </Tooltip>
              </div>

              <div className="flex-1 overflow-y-auto">
                {filteredFiles.length === 0 ? (
                  <div className="text-foreground-muted px-3 py-4 text-xs">No files match this filter.</div>
                ) : (
                  <FileTree tree={fileTree} activeFilePath={activeFilePath} onSelectFile={handleScrollToFile} />
                )}
              </div>
            </aside>
          </div>

          <div className="min-w-0 flex-1">
            <div className="flex flex-col gap-5">
              {filteredFiles.map((file, index) => (
                <ChangedFileDiffCard
                  key={file.filename}
                  owner={owner}
                  repo={repo}
                  number={0}
                  commitId={commit.sha}
                  file={file}
                  auth={null}
                  fileThreads={[]}
                  fileDrafts={[]}
                  openCommentKey={null}
                  onOpenComment={NOOP_COMMENT_TOGGLE}
                  agentSessions={EMPTY_SESSIONS}
                  fileInlineSessions={EMPTY_SESSIONS}
                  onAddDraftComment={NOOP_DRAFT_ADD}
                  onRemoveDraftComment={NOOP_DRAFT_REMOVE}
                  onInlineCommentPosted={NOOP_ASYNC}
                  allowCommenting={false}
                  isActive={activeFilePath === file.filename}
                  initiallyVisible={index < 3}
                  sectionRef={(element) => {
                    if (element) fileSectionRefs.current.set(file.filename, element)
                    else fileSectionRefs.current.delete(file.filename)
                  }}
                  threadRef={NOOP_THREAD_REF}
                />
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

interface FileTreeNode {
  name: string
  path: string
  children: FileTreeNode[]
  file: PullRequestFile | null
}

function buildFileTree(files: PullRequestFile[]): FileTreeNode[] {
  const root: FileTreeNode = { name: '', path: '', children: [], file: null }

  for (const file of files) {
    const parts = file.filename.split('/')
    let current = root

    for (let index = 0; index < parts.length; index++) {
      const part = parts[index]!
      const isFile = index === parts.length - 1

      if (isFile) {
        current.children.push({ name: part, path: file.filename, children: [], file })
        continue
      }

      let folder = current.children.find((child) => child.file === null && child.name === part)
      if (!folder) {
        folder = { name: part, path: parts.slice(0, index + 1).join('/'), children: [], file: null }
        current.children.push(folder)
      }
      current = folder
    }
  }

  return collapseSingleChildFolders(root.children)
}

function collapseSingleChildFolders(nodes: FileTreeNode[]): FileTreeNode[] {
  return nodes.map((node) => {
    if (node.file) return node

    let current = node
    const segments = [current.name]

    while (current.children.length === 1 && current.children[0]!.file === null) {
      current = current.children[0]!
      segments.push(current.name)
    }

    return { ...current, name: segments.join('/'), children: collapseSingleChildFolders(current.children) }
  })
}

function FileTree({
  tree,
  activeFilePath,
  onSelectFile
}: {
  tree: FileTreeNode[]
  activeFilePath: string | null
  onSelectFile: (path: string) => void
}) {
  return (
    <div className="py-1">
      {tree.map((node) =>
        node.file ? (
          <FileTreeFileButton
            key={node.path}
            file={node.file}
            depth={0}
            isActive={activeFilePath === node.path}
            onClick={() => onSelectFile(node.path)}
          />
        ) : (
          <FileTreeFolder
            key={node.path}
            node={node}
            depth={0}
            activeFilePath={activeFilePath}
            onSelectFile={onSelectFile}
          />
        )
      )}
    </div>
  )
}

function FileTreeFolder({
  node,
  depth,
  activeFilePath,
  onSelectFile
}: {
  node: FileTreeNode
  depth: number
  activeFilePath: string | null
  onSelectFile: (path: string) => void
}) {
  const [isOpen, setIsOpen] = useState(true)

  return (
    <div>
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="text-foreground hover:bg-surface-hover flex w-full items-center gap-1.5 py-1 text-left text-xs"
        style={{ paddingLeft: 8 + depth * 16 }}
      >
        <ChevronDown
          size={14}
          className={cn('text-foreground-subtle shrink-0 transition-transform', !isOpen && '-rotate-90')}
        />
        <FolderIcon name={node.name} open={isOpen} />
        <span className="truncate font-medium">{node.name}</span>
      </button>

      {isOpen ? (
        <div>
          {node.children.map((child) =>
            child.file ? (
              <FileTreeFileButton
                key={child.path}
                file={child.file}
                depth={depth + 1}
                isActive={activeFilePath === child.path}
                onClick={() => onSelectFile(child.path)}
              />
            ) : (
              <FileTreeFolder
                key={child.path}
                node={child}
                depth={depth + 1}
                activeFilePath={activeFilePath}
                onSelectFile={onSelectFile}
              />
            )
          )}
        </div>
      ) : null}
    </div>
  )
}

function FileTreeFileButton({
  file,
  depth,
  isActive,
  onClick
}: {
  file: PullRequestFile
  depth: number
  isActive: boolean
  onClick: () => void
}) {
  const name = file.filename.split('/').pop() ?? file.filename

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex w-full items-center gap-1.5 py-1 pr-3 text-left text-xs transition-colors',
        isActive ? 'bg-surface-hover text-foreground' : 'text-foreground hover:bg-surface-hover'
      )}
      style={{ paddingLeft: 8 + depth * 16 + 20 }}
    >
      <FileStatusIcon status={file.status} />
      <span className="min-w-0 flex-1 truncate">{name}</span>
    </button>
  )
}

function FileStatusIcon({ status }: { status: string }) {
  switch (status) {
    case 'added':
      return <FilePlus size={14} className="text-success shrink-0" />
    case 'removed':
      return <FileMinus size={14} className="text-danger shrink-0" />
    default:
      return <FileDiff size={14} className="text-foreground-subtle shrink-0" />
  }
}

function getCommitSubject(message: string | null | undefined): string {
  return message?.split('\n')[0]?.trim() || 'Untitled commit'
}

function getCommitBody(message: string | null | undefined): string {
  return message?.split('\n').slice(1).join('\n').trim() ?? ''
}
