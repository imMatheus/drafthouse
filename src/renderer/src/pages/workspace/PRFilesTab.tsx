import { memo, useEffect, useRef, useState, type ReactNode } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
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
  MessageSquare,
  Search,
  X
} from 'lucide-react'
import { PatchDiff, Virtualizer, type DiffLineAnnotation } from '@pierre/diffs/react'
import type {
  AgentSessionMeta,
  AuthData,
  PullRequestDetail,
  PullRequestFile,
  PullRequestReviewComment,
  PullRequestReviewDraftComment,
  PullRequestReviewEvent,
  PullRequestReviewLineSide,
  PullRequestReviewThreadSummary
} from '../../../../shared/types'
import ClaudeMentionTextarea, { extractClaudePrompt, isClaudeMention } from '../../components/ClaudeMentionTextarea'
import { FolderIcon } from '../../components/FileIcon'
import InlineAgentResponseCard from '../../components/InlineAgentResponseCard'
import Loading from '../../components/Loading'
import ReactionBar from '../../components/ReactionBar'
import CommentActionsMenu from '../../components/CommentActionsMenu'
import CommentBodyEditor from '../../components/CommentBodyEditor'
import FixWithClaudeButton from '../../components/FixWithClaudeButton'
import ResolveThreadButton from '../../components/ResolveThreadButton'
import type { FixWithClaudeInput } from '../../lib/agentContext'
import Tooltip from '../../components/Tooltip'
import { cn } from '../../lib/cn'
import { useSettings } from '../../hooks/useSettings'
import { useTheme } from '../../hooks/useTheme'
import { BASE_DIFF_OPTIONS, wrapGitPatch } from '../../lib/diffs'
import MarkdownBody from './MarkdownBody'
import {
  buildPullRequestReviewThreads,
  DiffStat,
  formatRelativeTime,
  type PullRequestReviewThread
} from './pullRequestShared'

interface PreparedDraftEntry {
  comment: PullRequestReviewDraftComment
  /** Index in the top-level `draftReviewComments` array — needed for removal. */
  index: number
}

// @pierre/diffs renders annotations inside its shadow DOM, where font-family
// and font-size inherit from Pierre's monospace <pre>. Reset both at the
// annotation wrapper so our comment cards pick up the app's sans-serif stack.
const ANNOTATION_WRAPPER_STYLE: React.CSSProperties = {
  fontFamily:
    "'Inter', ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
  fontSize: '14px',
  lineHeight: '1.5'
}

function AnnotationWrapper({
  side,
  elementRef,
  children
}: {
  side: 'deletions' | 'additions'
  elementRef?: (element: HTMLDivElement | null) => void
  children: ReactNode
}) {
  return (
    <div
      ref={elementRef}
      style={ANNOTATION_WRAPPER_STYLE}
      className={cn('border-border border-t p-3', side === 'deletions' ? 'bg-danger/5' : 'bg-success/5')}
    >
      {children}
    </div>
  )
}

type InlineAnnotationMeta =
  | { kind: 'thread'; thread: PullRequestReviewThread }
  | { kind: 'draft'; draft: PreparedDraftEntry }
  | { kind: 'agent'; session: AgentSessionMeta }
  | { kind: 'composer'; line: number; side: PullRequestReviewLineSide; lineContent: string }

const EMPTY_FILES: PullRequestFile[] = []
const EMPTY_THREADS: PullRequestReviewThread[] = []
const EMPTY_DRAFTS: PreparedDraftEntry[] = []
const EMPTY_SESSIONS: AgentSessionMeta[] = []

interface GroupingsCache {
  deps: {
    reviewComments: unknown
    reviewThreadSummaries: unknown
    draftReviewComments: unknown
    agentSessions: unknown
  }
  reviewThreads: PullRequestReviewThread[]
  threadsByFile: Map<string, PullRequestReviewThread[]>
  commentCountsByFile: Map<string, number>
  threadsByCommentId: Map<number, PullRequestReviewThread>
  draftsByFile: Map<string, PreparedDraftEntry[]>
  inlineSessionsByFile: Map<string, AgentSessionMeta[]>
}

const EMPTY_GROUPINGS_CACHE: GroupingsCache = {
  deps: {
    reviewComments: undefined,
    reviewThreadSummaries: undefined,
    draftReviewComments: undefined,
    agentSessions: undefined
  },
  reviewThreads: [],
  threadsByFile: new Map(),
  commentCountsByFile: new Map(),
  threadsByCommentId: new Map(),
  draftsByFile: new Map(),
  inlineSessionsByFile: new Map()
}

function getStableGroupings(
  ref: React.MutableRefObject<GroupingsCache>,
  inputs: {
    reviewComments: PullRequestReviewComment[] | undefined
    reviewThreadSummaries: PullRequestReviewThreadSummary[] | undefined
    draftReviewComments: PullRequestReviewDraftComment[]
    agentSessions: AgentSessionMeta[] | undefined
  }
): GroupingsCache {
  const { deps } = ref.current
  if (
    deps.reviewComments === inputs.reviewComments &&
    deps.reviewThreadSummaries === inputs.reviewThreadSummaries &&
    deps.draftReviewComments === inputs.draftReviewComments &&
    deps.agentSessions === inputs.agentSessions
  ) {
    return ref.current
  }

  const reviewThreads = buildPullRequestReviewThreads(inputs.reviewComments ?? [], inputs.reviewThreadSummaries)
  const threadsByFile = new Map<string, PullRequestReviewThread[]>()
  for (const thread of reviewThreads) {
    const bucket = threadsByFile.get(thread.path)
    if (bucket) bucket.push(thread)
    else threadsByFile.set(thread.path, [thread])
  }
  const commentCountsByFile = new Map<string, number>()
  for (const comment of inputs.reviewComments ?? []) {
    commentCountsByFile.set(comment.path, (commentCountsByFile.get(comment.path) ?? 0) + 1)
  }
  const threadsByCommentId = new Map(reviewThreads.map((thread) => [thread.topLevelComment.id, thread]))
  const draftsByFile = new Map<string, PreparedDraftEntry[]>()
  inputs.draftReviewComments.forEach((comment, index) => {
    const bucket = draftsByFile.get(comment.path)
    const entry: PreparedDraftEntry = { comment, index }
    if (bucket) bucket.push(entry)
    else draftsByFile.set(comment.path, [entry])
  })
  const inlineSessionsByFile = new Map<string, AgentSessionMeta[]>()
  for (const session of inputs.agentSessions ?? []) {
    const ctx = session.context
    if (!ctx || !ctx.inline || !ctx.filePath) continue
    const bucket = inlineSessionsByFile.get(ctx.filePath)
    if (bucket) bucket.push(session)
    else inlineSessionsByFile.set(ctx.filePath, [session])
  }

  ref.current = {
    deps: {
      reviewComments: inputs.reviewComments,
      reviewThreadSummaries: inputs.reviewThreadSummaries,
      draftReviewComments: inputs.draftReviewComments,
      agentSessions: inputs.agentSessions
    },
    reviewThreads,
    threadsByFile,
    commentCountsByFile,
    threadsByCommentId,
    draftsByFile,
    inlineSessionsByFile
  }
  return ref.current
}

interface FileTreeCache {
  input: unknown
  tree: FileTreeNode[]
}

const EMPTY_FILE_TREE_CACHE: FileTreeCache = { input: undefined, tree: [] }

function getStableFileTree(ref: React.MutableRefObject<FileTreeCache>, files: PullRequestFile[]): FileTreeNode[] {
  if (ref.current.input === files) return ref.current.tree
  ref.current = { input: files, tree: buildFileTree(files) }
  return ref.current.tree
}

export default function PRFilesTab({
  pr,
  owner,
  repo,
  draftReviewComments,
  onDraftReviewCommentsChange,
  threadJumpTarget,
  agentSessions,
  onAskClaude,
  onFixWithClaude,
  onContinueAgent,
  onStopAgent,
  onPromoteAgent
}: {
  pr: PullRequestDetail
  owner: string
  repo: string
  draftReviewComments: PullRequestReviewDraftComment[]
  onDraftReviewCommentsChange: (comments: PullRequestReviewDraftComment[]) => void
  threadJumpTarget: { path: string; commentId: number; nonce: number } | null
  agentSessions?: AgentSessionMeta[]
  onAskClaude?: (
    prompt: string,
    filePath: string,
    lineNumber: number,
    lineContent: string,
    side: PullRequestReviewLineSide
  ) => Promise<void>
  onFixWithClaude?: (input: FixWithClaudeInput) => Promise<void>
  onContinueAgent?: (sessionId: string, prompt: string, files?: string[]) => Promise<void>
  onStopAgent?: (sessionId: string) => Promise<void>
  onPromoteAgent?: (sessionId: string) => void
}) {
  const [filterValue, setFilterValue] = useState('')
  const [fileListCollapsed, setFileListCollapsed] = useState(false)
  const [activeFilePath, setActiveFilePath] = useState<string | null>(null)
  const [openCommentKey, setOpenCommentKey] = useState<string | null>(null)
  const [isSubmitReviewOpen, setIsSubmitReviewOpen] = useState(false)
  // Cards that have ever entered the mount window. Once a card mounts we never
  // unmount it — Pierre diffs lose their collapse/scroll state if remounted,
  // and the DOM cost of keeping ~600 hidden cards behind `content-visibility`
  // is small compared to the jank of re-mounting on every viewport flip.
  const [mountedFiles, setMountedFiles] = useState<Set<string>>(() => new Set())
  const [collapsedFolders, setCollapsedFolders] = useState<Set<string>>(() => new Set())
  const fileSectionRefs = useRef(new Map<string, HTMLElement>())
  const threadRefs = useRef(new Map<number, HTMLElement>())
  const handledJumpNonceRef = useRef<number | null>(null)
  const groupingsRef = useRef<GroupingsCache>(EMPTY_GROUPINGS_CACHE)
  const fileTreeRef = useRef<FileTreeCache>(EMPTY_FILE_TREE_CACHE)
  const queryClient = useQueryClient()

  // Stable callback wrappers. Parents recreate their arrow-function props on
  // every render, which would defeat React.memo on ChangedFileDiffCard. We
  // keep the latest closure values in a ref and expose identity-stable
  // wrappers — memo short-circuits, but invocations always run with the
  // latest values so we never hold stale state.
  const latestPropsRef = useRef({
    onAskClaude,
    onFixWithClaude,
    onContinueAgent,
    onStopAgent,
    onPromoteAgent,
    onDraftReviewCommentsChange,
    draftReviewComments,
    queryClient,
    owner,
    repo,
    prNumber: pr.number
  })
  latestPropsRef.current = {
    onAskClaude,
    onFixWithClaude,
    onContinueAgent,
    onStopAgent,
    onPromoteAgent,
    onDraftReviewCommentsChange,
    draftReviewComments,
    queryClient,
    owner,
    repo,
    prNumber: pr.number
  }
  const [stableHandlers] = useState<{
    onAskClaude: NonNullable<typeof onAskClaude>
    onFixWithClaude: NonNullable<typeof onFixWithClaude>
    onContinueAgent: NonNullable<typeof onContinueAgent>
    onStopAgent: NonNullable<typeof onStopAgent>
    onPromoteAgent: NonNullable<typeof onPromoteAgent>
    onAddDraftComment: (comment: PullRequestReviewDraftComment) => void
    onRemoveDraftComment: (index: number) => void
    onInlineCommentPosted: () => Promise<void>
  }>(() => ({
    onAskClaude: async (prompt, filePath, lineNumber, lineContent, side) => {
      await latestPropsRef.current.onAskClaude?.(prompt, filePath, lineNumber, lineContent, side)
    },
    onFixWithClaude: async (input) => {
      await latestPropsRef.current.onFixWithClaude?.(input)
    },
    onContinueAgent: async (sessionId, prompt, fileList) => {
      await latestPropsRef.current.onContinueAgent?.(sessionId, prompt, fileList)
    },
    onStopAgent: async (sessionId) => {
      await latestPropsRef.current.onStopAgent?.(sessionId)
    },
    onPromoteAgent: (sessionId) => {
      latestPropsRef.current.onPromoteAgent?.(sessionId)
    },
    onAddDraftComment: (comment) => {
      const p = latestPropsRef.current
      p.onDraftReviewCommentsChange([...p.draftReviewComments, comment])
      setOpenCommentKey(null)
    },
    onRemoveDraftComment: (index) => {
      const p = latestPropsRef.current
      p.onDraftReviewCommentsChange(p.draftReviewComments.filter((_c, i) => i !== index))
    },
    onInlineCommentPosted: async () => {
      const p = latestPropsRef.current
      setOpenCommentKey(null)
      await Promise.all([
        p.queryClient.invalidateQueries({
          queryKey: ['pull-request-review-comments', p.owner, p.repo, p.prNumber]
        }),
        p.queryClient.invalidateQueries({
          queryKey: ['pull-request-reviews', p.owner, p.repo, p.prNumber]
        })
      ])
    }
  }))

  // Stable threadRef factory — ChangedFileDiffCard calls this with (commentId, element).
  const [stableThreadRef] = useState(() => (commentId: number, element: HTMLElement | null): void => {
    if (element) threadRefs.current.set(commentId, element)
    else threadRefs.current.delete(commentId)
  })

  // Shared IntersectionObserver that mounts a card once it comes within
  // ~viewport-height of the viewport. We use a wide `rootMargin` so scrolling
  // feels seamless — by the time a card enters the visible area, React has
  // already mounted it and Pierre has hydrated the shadow DOM.
  const mountObserverRef = useRef<IntersectionObserver | null>(null)
  const [registerSectionForMount] = useState(() => (element: HTMLElement | null, filename: string): void => {
    if (element) {
      fileSectionRefs.current.set(filename, element)
      if (!mountObserverRef.current) {
        mountObserverRef.current = new IntersectionObserver(
          (entries) => {
            for (const entry of entries) {
              if (entry.isIntersecting && entry.target instanceof HTMLElement) {
                const name = entry.target.dataset.filePath
                if (!name) continue
                setMountedFiles((prev) => {
                  if (prev.has(name)) return prev
                  const next = new Set(prev)
                  next.add(name)
                  return next
                })
                mountObserverRef.current?.unobserve(entry.target)
              }
            }
          },
          { rootMargin: '2000px 0px' }
        )
      }
      mountObserverRef.current.observe(element)
    } else {
      fileSectionRefs.current.delete(filename)
    }
  })
  useEffect(() => () => mountObserverRef.current?.disconnect(), [])

  const {
    data: files,
    isLoading: isLoadingFiles,
    error: filesError
  } = useQuery<PullRequestFile[], Error>({
    queryKey: ['pull-request-files', owner, repo, pr.number],
    queryFn: () => window.api.github.pulls.listFiles(owner, repo, pr.number),
    retry: false
  })
  const {
    data: reviewComments,
    isLoading: isLoadingReviewComments,
    error: reviewCommentsError
  } = useQuery<PullRequestReviewComment[], Error>({
    queryKey: ['pull-request-review-comments', owner, repo, pr.number],
    queryFn: () => window.api.github.pullComments.listForPull(owner, repo, pr.number),
    retry: false
  })
  const { data: auth } = useQuery<AuthData | null, Error>({
    queryKey: ['auth-user'],
    queryFn: () => window.api.auth.getUser(),
    retry: false
  })
  const { data: reviewThreadSummaries } = useQuery<PullRequestReviewThreadSummary[], Error>({
    queryKey: ['pull-request-review-threads', owner, repo, pr.number],
    queryFn: () => window.api.github.pullComments.listReviewThreads(owner, repo, pr.number),
    retry: false
  })

  const allFiles = files ?? EMPTY_FILES
  const trimmedFilter = filterValue.trim().toLowerCase()
  const filteredFiles =
    trimmedFilter === '' ? allFiles : allFiles.filter((file) => file.filename.toLowerCase().includes(trimmedFilter))

  // All data-driven groupings share the same dependency identities — rebuild
  // them together when any of their inputs changes, and keep the Map
  // references stable across renders so `React.memo` on ChangedFileDiffCard
  // can short-circuit unrelated re-renders (e.g. filter keystrokes, active
  // file changes, scroll-driven state updates).
  const groupings = getStableGroupings(groupingsRef, {
    reviewComments,
    reviewThreadSummaries,
    draftReviewComments,
    agentSessions
  })
  const fileTree = getStableFileTree(fileTreeRef, filteredFiles)
  const { threadsByFile, commentCountsByFile, threadsByCommentId, draftsByFile, inlineSessionsByFile } = groupings

  const filesErrorMessage = filesError ?? reviewCommentsError
  const isLoading = isLoadingFiles || isLoadingReviewComments

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

  // Fires once per new jump. The `trimmedFilter` dep handles the self-heal path:
  // if the target file isn't in the current filter, we clear the filter, which
  // bumps trimmedFilter and re-fires this effect to complete the scroll. The
  // nonce ref guarantees we don't re-scroll on unrelated filter changes after.
  useEffect(() => {
    if (!threadJumpTarget) return
    if (handledJumpNonceRef.current === threadJumpTarget.nonce) return
    const thread = threadsByCommentId.get(threadJumpTarget.commentId)
    const nextPath = thread?.path ?? threadJumpTarget.path
    const matchesFilter = trimmedFilter === '' || nextPath.toLowerCase().includes(trimmedFilter)
    if (!matchesFilter) {
      setFilterValue('')
      return
    }
    handledJumpNonceRef.current = threadJumpTarget.nonce
    setActiveFilePath(nextPath)
    // Force-mount the target card so the scroll below has something to land on.
    setMountedFiles((prev) => {
      if (prev.has(nextPath)) return prev
      const next = new Set(prev)
      next.add(nextPath)
      return next
    })
    requestAnimationFrame(() => {
      const threadElement = threadRefs.current.get(threadJumpTarget.commentId)
      if (threadElement) {
        threadElement.scrollIntoView({ behavior: 'smooth', block: 'center' })
        return
      }
      fileSectionRefs.current.get(nextPath)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    })
  }, [threadJumpTarget, trimmedFilter])

  // Stable identities so memo'd file-tree rows don't re-render on every parent
  // render. Neither callback closes over state, so no latest-ref is needed.
  const [handleScrollToFile] = useState(() => (path: string): void => {
    setActiveFilePath(path)
    setMountedFiles((prev) => {
      if (prev.has(path)) return prev
      const next = new Set(prev)
      next.add(path)
      return next
    })
    fileSectionRefs.current.get(path)?.scrollIntoView({ behavior: 'instant', block: 'start' })
  })

  const [handleToggleFolder] = useState(() => (path: string): void => {
    setCollapsedFolders((prev) => {
      const next = new Set(prev)
      if (next.has(path)) next.delete(path)
      else next.add(path)
      return next
    })
  })

  return (
    <>
      <div className="flex gap-2">
        <div className="sticky top-1 hidden h-[calc(100vh-11rem)] shrink-0 lg:flex">
          {fileListCollapsed ? (
            <Tooltip label="Show file list" side="right">
              <button
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
              'flex flex-col overflow-hidden transition-[width,opacity] duration-200',
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
                >
                  <X size={14} />
                </button>
              ) : null}
              <Tooltip label="Hide file list" side="top">
                <button
                  onClick={() => setFileListCollapsed(true)}
                  className="text-foreground-subtle hover:bg-surface-hover hover:text-foreground flex size-6 shrink-0 items-center justify-center rounded transition-colors"
                  aria-label="Hide file list"
                >
                  <ChevronLeft size={14} />
                </button>
              </Tooltip>
            </div>
            <div className="flex-1 overflow-y-auto">
              {filteredFiles.length === 0 && !isLoading ? (
                <div className="text-foreground-muted px-3 py-4 text-xs">No files match this filter.</div>
              ) : (
                <FileTree
                  tree={fileTree}
                  activeFilePath={activeFilePath}
                  commentCountsByFile={commentCountsByFile}
                  collapsedFolders={collapsedFolders}
                  onToggleFolder={handleToggleFolder}
                  onSelectFile={handleScrollToFile}
                />
              )}
            </div>
            {draftReviewComments.length > 0 ? (
              <div className="border-border border-t px-2 py-2">
                <button
                  type="button"
                  onClick={() => setIsSubmitReviewOpen(true)}
                  className="bg-accent text-accent-foreground hover:bg-accent-hover w-full rounded-md px-3 py-1.5 text-xs font-medium tabular-nums transition-[background-color,color,transform] active:scale-[0.96]"
                >
                  Submit review ({draftReviewComments.length})
                </button>
              </div>
            ) : null}
          </aside>
        </div>

        <div className="min-w-0 flex-1">
          {filesErrorMessage ? (
            <div className="border-border bg-surface rounded-xl border px-4 py-3">
              <p className="text-foreground-muted text-sm">{filesErrorMessage.message}</p>
            </div>
          ) : null}
          {isLoading ? <Loading label="Loading changed files..." /> : null}
          <Virtualizer contentClassName="flex flex-col gap-5">
            {filteredFiles.map((file) => {
              const mounted = mountedFiles.has(file.filename)
              return (
                <DeferredCard key={file.filename} filename={file.filename} registerMount={registerSectionForMount}>
                  {mounted ? (
                    <ChangedFileDiffCard
                      owner={owner}
                      repo={repo}
                      number={pr.number}
                      commitId={pr.head.sha}
                      file={file}
                      auth={auth ?? null}
                      fileThreads={threadsByFile.get(file.filename) ?? EMPTY_THREADS}
                      fileDrafts={draftsByFile.get(file.filename) ?? EMPTY_DRAFTS}
                      openCommentKey={openCommentKey}
                      onOpenComment={setOpenCommentKey}
                      onAskClaude={stableHandlers.onAskClaude}
                      onFixWithClaude={stableHandlers.onFixWithClaude}
                      agentSessions={agentSessions ?? EMPTY_SESSIONS}
                      fileInlineSessions={inlineSessionsByFile.get(file.filename) ?? EMPTY_SESSIONS}
                      onContinueAgent={stableHandlers.onContinueAgent}
                      onStopAgent={stableHandlers.onStopAgent}
                      onPromoteAgent={stableHandlers.onPromoteAgent}
                      onAddDraftComment={stableHandlers.onAddDraftComment}
                      onRemoveDraftComment={stableHandlers.onRemoveDraftComment}
                      onInlineCommentPosted={stableHandlers.onInlineCommentPosted}
                      allowCommenting
                      threadRef={stableThreadRef}
                    />
                  ) : (
                    <CardPlaceholder file={file} />
                  )}
                </DeferredCard>
              )
            })}
          </Virtualizer>
        </div>
      </div>

      <SubmitReviewDialog
        open={isSubmitReviewOpen}
        draftReviewComments={draftReviewComments}
        owner={owner}
        repo={repo}
        number={pr.number}
        commitId={pr.head.sha}
        onClose={() => setIsSubmitReviewOpen(false)}
        onSubmitted={async () => {
          onDraftReviewCommentsChange([])
          setIsSubmitReviewOpen(false)
          await Promise.all([
            queryClient.invalidateQueries({ queryKey: ['pull-request-review-comments', owner, repo, pr.number] }),
            queryClient.invalidateQueries({ queryKey: ['pull-request-reviews', owner, repo, pr.number] })
          ])
        }}
      />
    </>
  )
}

interface ChangedFileDiffCardProps {
  owner: string
  repo: string
  number: number
  commitId: string
  file: PullRequestFile
  auth: AuthData | null | undefined
  fileThreads: readonly PullRequestReviewThread[]
  fileDrafts: readonly PreparedDraftEntry[]
  openCommentKey: string | null
  onOpenComment: (value: string | null) => void
  onAskClaude?: (
    prompt: string,
    filePath: string,
    lineNumber: number,
    lineContent: string,
    side: PullRequestReviewLineSide
  ) => Promise<void>
  onFixWithClaude?: (input: FixWithClaudeInput) => Promise<void>
  agentSessions: AgentSessionMeta[]
  fileInlineSessions: readonly AgentSessionMeta[]
  onContinueAgent?: (sessionId: string, prompt: string, files?: string[]) => Promise<void>
  onStopAgent?: (sessionId: string) => Promise<void>
  onPromoteAgent?: (sessionId: string) => void
  onAddDraftComment: (comment: PullRequestReviewDraftComment) => void
  onRemoveDraftComment: (index: number) => void
  onInlineCommentPosted: () => Promise<void>
  allowCommenting?: boolean
  threadRef: (commentId: number, element: HTMLElement | null) => void
}

export const ChangedFileDiffCard = memo(ChangedFileDiffCardInner)

const DEFERRED_CARD_STYLE: React.CSSProperties = {
  contentVisibility: 'auto',
  containIntrinsicSize: '0 800px'
}

/**
 * Wraps every changed-file row in a stable section element that always exists
 * (so scroll-into-view + active-file tracking work before a card is mounted).
 * The ref registers the element with a shared IntersectionObserver that flips
 * the mount flag once the card is within ~2000px of the viewport. Combined
 * with `content-visibility: auto`, cards scrolled far away cost neither React
 * reconciliation nor browser paint.
 */
function DeferredCard({
  filename,
  registerMount,
  children
}: {
  filename: string
  registerMount: (element: HTMLElement | null, filename: string) => void
  children: ReactNode
}) {
  return (
    <section
      ref={(element) => registerMount(element, filename)}
      data-file-path={filename}
      className="border-border bg-surface overflow-hidden rounded-xl border"
      style={DEFERRED_CARD_STYLE}
    >
      {children}
    </section>
  )
}

/**
 * Static header shown in place of a diff card before it's been mounted. Gives
 * the virtualized list a stable layout and keeps the sidebar→scroll flow
 * working (the wrapper section with `data-file-path` still exists).
 */
function CardPlaceholder({ file }: { file: PullRequestFile }) {
  return (
    <header className="flex items-center gap-2 px-3 py-1.5">
      <span className="text-foreground min-w-0 truncate text-sm font-semibold">{file.filename}</span>
      <div className="ml-auto flex shrink-0 items-center gap-2">
        <DiffStat additions={file.additions} deletions={file.deletions} />
      </div>
    </header>
  )
}

function ChangedFileDiffCardInner({
  owner,
  repo,
  number,
  commitId,
  file,
  auth,
  fileThreads,
  fileDrafts,
  openCommentKey,
  onOpenComment,
  onAskClaude,
  onFixWithClaude,
  agentSessions,
  fileInlineSessions,
  onContinueAgent,
  onStopAgent,
  onPromoteAgent,
  onAddDraftComment,
  onRemoveDraftComment,
  onInlineCommentPosted,
  allowCommenting = true,
  threadRef
}: ChangedFileDiffCardProps) {
  const { settings } = useSettings()
  const { theme } = useTheme()

  const [isCollapsed, setIsCollapsed] = useState(false)
  const [pathCopied, setPathCopied] = useState(false)

  const handleCopyPath = (): void => {
    navigator.clipboard.writeText(file.filename).catch(() => {})
    setPathCopied(true)
    setTimeout(() => setPathCopied(false), 1500)
  }

  const hasRenderablePatch = !!file.patch

  const replyTarget = { owner, repo, number }

  // Flatten threads, drafts, sessions, and the open composer into Pierre's
  // annotation format. Threads that can't be anchored (outdated or missing
  // side/line) are dropped — they have nowhere to render inline.
  const anchoredAnnotations: DiffLineAnnotation<InlineAnnotationMeta>[] = []

  for (const thread of fileThreads) {
    if (thread.side == null || thread.line == null || thread.isOutdated) continue
    anchoredAnnotations.push({
      side: thread.side === 'LEFT' ? 'deletions' : 'additions',
      lineNumber: thread.line,
      metadata: { kind: 'thread', thread }
    })
  }

  for (const draft of fileDrafts) {
    anchoredAnnotations.push({
      side: draft.comment.side === 'LEFT' ? 'deletions' : 'additions',
      lineNumber: draft.comment.line,
      metadata: { kind: 'draft', draft }
    })
  }

  for (const session of fileInlineSessions) {
    const ctx = session.context
    if (!ctx || !ctx.inline || typeof ctx.lineNumber !== 'number') continue
    anchoredAnnotations.push({
      side: ctx.side === 'LEFT' ? 'deletions' : 'additions',
      lineNumber: ctx.lineNumber,
      metadata: { kind: 'agent', session }
    })
  }

  if (openCommentKey && openCommentKey.startsWith(`${file.filename}::`)) {
    const [, sideStr, lineStr] = openCommentKey.split('::')
    const line = Number(lineStr)
    if (!Number.isNaN(line)) {
      const side: PullRequestReviewLineSide = sideStr === 'LEFT' ? 'LEFT' : 'RIGHT'
      anchoredAnnotations.push({
        side: side === 'LEFT' ? 'deletions' : 'additions',
        lineNumber: line,
        metadata: { kind: 'composer', line, side, lineContent: '' }
      })
    }
  }

  const renderAnnotation = (annotation: DiffLineAnnotation<InlineAnnotationMeta>) => {
    const meta = annotation.metadata
    if (!meta) return null
    if (meta.kind === 'thread') {
      return (
        <AnnotationWrapper side={annotation.side} elementRef={(el) => threadRef(meta.thread.id, el)}>
          <InlineDiffThread
            thread={meta.thread}
            replyTarget={replyTarget}
            onFixWithClaude={onFixWithClaude}
            agentSessions={agentSessions}
            onStopAgent={onStopAgent}
            onContinueAgent={onContinueAgent}
            onPromoteAgent={onPromoteAgent}
          />
        </AnnotationWrapper>
      )
    }
    if (meta.kind === 'draft') {
      return (
        <AnnotationWrapper side={annotation.side}>
          <DraftCommentCard
            comment={meta.draft.comment}
            auth={auth}
            onRemove={() => onRemoveDraftComment(meta.draft.index)}
          />
        </AnnotationWrapper>
      )
    }
    if (meta.kind === 'agent') {
      return (
        <AnnotationWrapper side={annotation.side}>
          <InlineAgentResponseCard
            session={meta.session}
            onStop={() => onStopAgent?.(meta.session.id)}
            onContinue={(prompt) => onContinueAgent?.(meta.session.id, prompt)}
            onOpenInChat={() => onPromoteAgent?.(meta.session.id)}
            compact
          />
        </AnnotationWrapper>
      )
    }
    if (meta.kind === 'composer' && allowCommenting) {
      return (
        <AnnotationWrapper side={annotation.side}>
          <InlineDiffCommentComposer
            owner={owner}
            repo={repo}
            number={number}
            commitId={commitId}
            path={file.filename}
            line={meta.line}
            lineContent={meta.lineContent}
            side={meta.side}
            onCancel={() => onOpenComment(null)}
            onAddDraftComment={onAddDraftComment}
            onInlineCommentPosted={onInlineCommentPosted}
            onAskClaude={onAskClaude}
          />
        </AnnotationWrapper>
      )
    }
    return null
  }

  // Latest-value ref so the stable gutter click handler below always runs with
  // the current openCommentKey/onOpenComment without invalidating the options
  // object passed to PatchDiff. Rebuilding `options` on every render triggers
  // Pierre's `areOptionsEqual` deep compare and, when theme/style flips,
  // forces a full re-diff — we want that only when the *values* change.
  const gutterRef = useRef({ filename: file.filename, openCommentKey, onOpenComment })
  gutterRef.current = { filename: file.filename, openCommentKey, onOpenComment }
  const [stableGutterClick] = useState(() => (range: { start: number; side?: 'deletions' | 'additions' }): void => {
    const side: PullRequestReviewLineSide = range.side === 'deletions' ? 'LEFT' : 'RIGHT'
    const g = gutterRef.current
    const rowKey = `${g.filename}::${side}::${range.start}`
    g.onOpenComment(g.openCommentKey === rowKey ? null : rowKey)
  })

  // Options identity only depends on values Pierre actually reads; keep it
  // referentially stable across renders when those haven't changed so Pierre's
  // shadow-DOM hydration is not invalidated on unrelated re-renders.
  const optionsRef = useRef<{
    key: string
    value: React.ComponentProps<typeof PatchDiff<InlineAnnotationMeta>>['options']
  } | null>(null)
  const diffStyle = settings.diffViewMode === 'split' ? 'split' : 'unified'
  const optionsKey = `${theme}|${diffStyle}|${allowCommenting ? '1' : '0'}`
  if (!optionsRef.current || optionsRef.current.key !== optionsKey) {
    optionsRef.current = {
      key: optionsKey,
      value: {
        ...BASE_DIFF_OPTIONS,
        themeType: theme,
        diffStyle,
        disableFileHeader: true,
        enableGutterUtility: allowCommenting,
        onGutterUtilityClick: allowCommenting ? stableGutterClick : undefined
      }
    }
  }

  return (
    <>
      <header className={cn('flex items-center gap-2 px-3 py-1.5', !isCollapsed && 'border-border border-b')}>
        <button
          type="button"
          onClick={() => setIsCollapsed(!isCollapsed)}
          className="text-foreground-subtle hover:bg-interactive hover:text-foreground flex size-5 shrink-0 items-center justify-center rounded transition-colors"
          aria-label={isCollapsed ? 'Expand file' : 'Collapse file'}
        >
          {isCollapsed ? <ChevronRight size={14} /> : <ChevronDown size={14} />}
        </button>
        <span className="text-foreground min-w-0 truncate text-sm font-semibold">{file.filename}</span>
        <Tooltip label={pathCopied ? 'Copied' : 'Copy file path'} side="top">
          <button
            type="button"
            onClick={handleCopyPath}
            className="text-foreground-subtle hover:bg-interactive hover:text-foreground flex size-5 shrink-0 items-center justify-center rounded transition-colors"
            aria-label="Copy file path"
          >
            {pathCopied ? <Check size={13} className="text-success" /> : <Copy size={13} />}
          </button>
        </Tooltip>
        {file.previous_filename ? (
          <span className="text-foreground-muted min-w-0 shrink truncate text-xs">from {file.previous_filename}</span>
        ) : null}
        <div className="ml-auto flex shrink-0 items-center gap-2">
          <DiffStat additions={file.additions} deletions={file.deletions} />
          <a
            href={file.blob_url}
            target="_blank"
            rel="noreferrer"
            className="border-border bg-interactive text-foreground hover:bg-interactive-hover inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs font-medium transition-colors"
          >
            View
            <ExternalLink size={12} />
          </a>
        </div>
      </header>

      {isCollapsed ? null : (
        <>
          {hasRenderablePatch ? (
            <PatchDiff<InlineAnnotationMeta>
              patch={wrapGitPatch(file.filename, file.patch!)}
              options={optionsRef.current!.value}
              lineAnnotations={anchoredAnnotations}
              renderAnnotation={renderAnnotation}
            />
          ) : (
            <div className="text-foreground-muted px-4 py-6 text-sm">
              GitHub did not return a renderable patch for this file.
            </div>
          )}
        </>
      )}
    </>
  )
}

function DraftCommentCard({
  comment,
  auth,
  onRemove
}: {
  comment: PullRequestReviewDraftComment
  auth: AuthData | null | undefined
  onRemove: () => void
}) {
  return (
    <div className="border-border bg-surface rounded-xl border">
      <div className="border-border flex items-center justify-between gap-3 border-b px-4 py-3">
        <div className="flex items-center gap-2">
          {auth?.user.avatar_url ? (
            <img src={auth.user.avatar_url} alt={auth.user.login} className="size-7 rounded-full" />
          ) : null}
          <div className="text-foreground text-sm">
            <span className="font-semibold">{auth?.user.login ?? 'You'}</span>{' '}
            <span className="text-foreground-muted">pending review comment</span>
          </div>
        </div>
        <button
          type="button"
          onClick={onRemove}
          className="text-foreground-muted hover:bg-interactive hover:text-foreground inline-flex size-7 items-center justify-center rounded-md transition-colors"
          aria-label="Remove draft comment"
        >
          <X size={14} />
        </button>
      </div>
      <div className="px-4 py-4">
        <MarkdownBody>{comment.body}</MarkdownBody>
      </div>
    </div>
  )
}

function InlineDiffThread({
  thread,
  replyTarget,
  onFixWithClaude,
  agentSessions,
  onStopAgent,
  onContinueAgent,
  onPromoteAgent
}: {
  thread: PullRequestReviewThread
  replyTarget: { owner: string; repo: string; number: number }
  onFixWithClaude?: (input: FixWithClaudeInput) => Promise<void>
  agentSessions?: AgentSessionMeta[]
  onStopAgent?: (sessionId: string) => Promise<void>
  onContinueAgent?: (sessionId: string, prompt: string, files?: string[]) => Promise<void>
  onPromoteAgent?: (sessionId: string) => void
}) {
  const [replyBody, setReplyBody] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [editingId, setEditingId] = useState<number | null>(null)
  const queryClient = useQueryClient()

  const handleReply = async (): Promise<void> => {
    if (!replyBody.trim() || isSubmitting) return
    setIsSubmitting(true)
    setErrorMessage(null)
    try {
      await window.api.github.pullComments.createReply(
        replyTarget.owner,
        replyTarget.repo,
        replyTarget.number,
        thread.topLevelComment.id,
        replyBody
      )
      setReplyBody('')
      await queryClient.invalidateQueries({
        queryKey: ['pull-request-review-comments', replyTarget.owner, replyTarget.repo, replyTarget.number]
      })
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Unable to reply.')
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleQuoteReply = (quoted: string): void => {
    setReplyBody((prev) => (prev ? `${prev}\n${quoted}` : quoted))
  }

  const sessionsByCommentId = (agentSessions ?? []).reduce<Map<number, AgentSessionMeta[]>>((acc, s) => {
    const id = s.context?.commentId
    if (id === undefined) return acc
    const existing = acc.get(id) ?? []
    existing.push(s)
    acc.set(id, existing)
    return acc
  }, new Map())

  const allComments = [thread.topLevelComment, ...thread.replies]

  return (
    <div className="bg-surface border-border space-y-2 rounded-md border p-3">
      {allComments.map((comment) => (
        <div key={comment.id}>
          <div className="flex items-center gap-2">
            <img src={comment.user.avatar_url} alt={comment.user.login} className="size-5 rounded-full" />
            <span className="text-foreground text-xs font-semibold">{comment.user.login}</span>
            <span className="text-foreground-subtle text-xs">{formatRelativeTime(comment.created_at)}</span>
            <div className="ml-auto">
              <CommentActionsMenu
                owner={replyTarget.owner}
                repo={replyTarget.repo}
                number={replyTarget.number}
                commentType="pull-comment"
                commentId={comment.id}
                nodeId={comment.node_id}
                htmlUrl={comment.html_url}
                body={comment.body}
                authorLogin={comment.user.login}
                onStartEdit={() => setEditingId(comment.id)}
                onQuoteReply={handleQuoteReply}
              />
            </div>
          </div>
          <div className="mt-2">
            {editingId === comment.id ? (
              <CommentBodyEditor
                owner={replyTarget.owner}
                repo={replyTarget.repo}
                number={replyTarget.number}
                commentType="pull-comment"
                commentId={comment.id}
                initialBody={comment.body}
                onCancel={() => setEditingId(null)}
                onSaved={() => setEditingId(null)}
              />
            ) : (
              <MarkdownBody className="">{comment.body}</MarkdownBody>
            )}
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <ReactionBar
              owner={replyTarget.owner}
              repo={replyTarget.repo}
              commentId={comment.id}
              commentType="pull-comment"
            />
            {onFixWithClaude ? (
              <FixWithClaudeButton
                onClick={() =>
                  onFixWithClaude({
                    commentId: comment.id,
                    body: comment.body,
                    author: comment.user.login,
                    filePath: thread.path,
                    line: thread.line,
                    diffHunk: comment.diff_hunk
                  })
                }
              />
            ) : null}
            {comment.id === thread.topLevelComment.id ? (
              <ResolveThreadButton
                threadId={thread.graphqlId}
                isResolved={thread.isResolved}
                owner={replyTarget.owner}
                repo={replyTarget.repo}
                number={replyTarget.number}
              />
            ) : null}
          </div>
          {(sessionsByCommentId.get(comment.id) ?? []).map((session) => (
            <div key={session.id} className="border-border mt-2 border-t pt-2">
              <InlineAgentResponseCard
                session={session}
                variant="nested"
                onStop={() => onStopAgent?.(session.id)}
                onContinue={(prompt) => onContinueAgent?.(session.id, prompt)}
                onOpenInChat={() => onPromoteAgent?.(session.id)}
                compact
              />
              {session.status === 'completed' &&
              comment.id === thread.topLevelComment.id &&
              thread.graphqlId &&
              !thread.isResolved ? (
                <div className="border-border bg-background mt-2 flex items-center justify-between gap-3 rounded-md border px-3 py-2">
                  <span className="text-foreground-muted text-xs">Claude is done. Mark resolved?</span>
                  <ResolveThreadButton
                    threadId={thread.graphqlId}
                    isResolved={thread.isResolved}
                    owner={replyTarget.owner}
                    repo={replyTarget.repo}
                    number={replyTarget.number}
                    variant="solid"
                  />
                </div>
              ) : null}
            </div>
          ))}
        </div>
      ))}
      <div className="">
        <textarea
          value={replyBody}
          onChange={(e) => setReplyBody(e.target.value)}
          placeholder="Write a reply"
          className="border-border bg-surface text-foreground placeholder:text-foreground-subtle focus:border-accent w-full resize-none rounded border px-2.5 py-1.5 text-xs focus:outline-none"
          rows={1}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
              e.preventDefault()
              handleReply()
            }
          }}
        />
        {errorMessage ? <p className="text-danger mt-1 text-xs">{errorMessage}</p> : null}
        {replyBody.trim() ? (
          <div className="mt-1.5 flex items-center justify-end">
            <button
              type="button"
              onClick={handleReply}
              disabled={isSubmitting}
              className="bg-accent text-accent-foreground hover:bg-accent-hover rounded-md px-3 py-1 text-xs font-medium transition-colors disabled:opacity-40"
            >
              {isSubmitting ? 'Replying...' : 'Reply'}
            </button>
          </div>
        ) : null}
      </div>
    </div>
  )
}

function InlineDiffCommentComposer({
  owner,
  repo,
  number,
  commitId,
  path,
  line,
  lineContent,
  side,
  onCancel,
  onAddDraftComment,
  onInlineCommentPosted,
  onAskClaude
}: {
  owner: string
  repo: string
  number: number
  commitId: string
  path: string
  line: number
  lineContent: string
  side: PullRequestReviewLineSide
  onCancel: () => void
  onAddDraftComment: (comment: PullRequestReviewDraftComment) => void
  onInlineCommentPosted: () => Promise<void>
  onAskClaude?: (
    prompt: string,
    filePath: string,
    lineNumber: number,
    lineContent: string,
    side: PullRequestReviewLineSide
  ) => Promise<void>
}) {
  const [body, setBody] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const claudeMention = isClaudeMention(body)

  const handleAddSingleComment = async (): Promise<void> => {
    if (!body.trim() || isSubmitting) return
    if (claudeMention && onAskClaude) {
      const prompt = extractClaudePrompt(body)
      if (!prompt) return
      await onAskClaude(prompt, path, line, lineContent, side)
      setBody('')
      onCancel()
      return
    }
    setIsSubmitting(true)
    setErrorMessage(null)
    try {
      await window.api.github.pullComments.create(owner, repo, number, { body, commitId, path, line, side })
      setBody('')
      await onInlineCommentPosted()
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Unable to add review comment.')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="border-border bg-surface rounded-xl border">
      <div className="border-border text-foreground border-b px-4 py-3 text-sm font-medium">
        Comment on {path}:{line}
      </div>
      <ClaudeMentionTextarea
        value={body}
        onChange={setBody}
        placeholder="Leave a comment"
        className="min-h-28"
        menuLabel="Ask about this line"
        enabled={!!onAskClaude}
        onSubmit={() => void handleAddSingleComment()}
      />
      {errorMessage ? <p className="text-danger px-4 text-sm">{errorMessage}</p> : null}
      <div className="border-border flex flex-wrap items-center justify-between gap-3 border-t px-4 py-3">
        <p className="text-foreground-subtle text-xs">
          {claudeMention
            ? 'Claude will respond in the conversation tab with line context'
            : side === 'LEFT'
              ? 'Commenting on the deleted side'
              : 'Commenting on the updated side'}
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="border-border bg-interactive text-foreground hover:bg-interactive-hover rounded-md border px-3 py-1.5 text-xs font-medium transition-colors"
          >
            Cancel
          </button>
          {!claudeMention && (
            <button
              type="button"
              onClick={() => {
                if (!body.trim()) return
                onAddDraftComment({ body, path, line, side })
                setBody('')
              }}
              disabled={!body.trim() || isSubmitting}
              className="border-border bg-interactive text-foreground hover:bg-interactive-hover rounded-md border px-3 py-1.5 text-xs font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-40"
            >
              Add to review
            </button>
          )}
          <button
            type="button"
            onClick={handleAddSingleComment}
            disabled={!body.trim() || isSubmitting}
            className="bg-accent text-accent-foreground hover:bg-accent-hover rounded-md px-3 py-1.5 text-xs font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-40"
          >
            {isSubmitting ? 'Adding...' : claudeMention ? 'Ask Claude' : 'Add comment'}
          </button>
        </div>
      </div>
    </div>
  )
}

function SubmitReviewDialog({
  open,
  draftReviewComments,
  owner,
  repo,
  number,
  commitId,
  onClose,
  onSubmitted
}: {
  open: boolean
  draftReviewComments: PullRequestReviewDraftComment[]
  owner: string
  repo: string
  number: number
  commitId: string
  onClose: () => void
  onSubmitted: () => Promise<void>
}) {
  const [body, setBody] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  useEffect(() => {
    if (!open) {
      setBody('')
      setErrorMessage(null)
      setIsSubmitting(false)
    }
  }, [open])

  if (!open) return null

  const handleSubmit = async (event: PullRequestReviewEvent): Promise<void> => {
    if (isSubmitting) return
    if ((event === 'COMMENT' || event === 'REQUEST_CHANGES') && !body.trim()) {
      setErrorMessage('Add a summary before submitting this review.')
      return
    }
    setIsSubmitting(true)
    setErrorMessage(null)
    try {
      await window.api.github.reviews.create(owner, repo, number, {
        commitId,
        body,
        event,
        comments: draftReviewComments
      })
      await onSubmitted()
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Unable to submit this review.')
      setIsSubmitting(false)
    }
  }

  return (
    <div className="bg-background/80 fixed inset-0 z-50 flex items-center justify-center px-4">
      <div className="border-border bg-surface w-full max-w-2xl rounded-2xl border shadow-2xl">
        <div className="border-border flex items-center justify-between gap-3 border-b px-5 py-4">
          <div>
            <h2 className="text-foreground text-lg font-semibold">Submit review</h2>
            <p className="text-foreground-muted mt-1 text-sm">
              {draftReviewComments.length} pending comment{draftReviewComments.length !== 1 ? 's' : ''}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-foreground-muted hover:bg-interactive hover:text-foreground inline-flex size-8 items-center justify-center rounded-md transition-colors"
            aria-label="Close review dialog"
          >
            <X size={16} />
          </button>
        </div>
        <div className="px-5 py-4">
          <textarea
            value={body}
            onChange={(event) => setBody(event.target.value)}
            placeholder="Write a summary of your review"
            className="border-border bg-background text-foreground placeholder:text-foreground-subtle min-h-36 w-full resize-y rounded-xl border px-4 py-3 text-sm focus:outline-none"
          />
          {errorMessage ? <p className="text-danger mt-3 text-sm">{errorMessage}</p> : null}
        </div>
        <div className="border-border flex flex-wrap items-center justify-between gap-3 border-t px-5 py-4">
          <p className="text-foreground-muted text-sm">Inline comments will be submitted with this review.</p>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="border-border bg-interactive text-foreground hover:bg-interactive-hover rounded-md border px-4 py-2 text-sm font-medium transition-colors"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => void handleSubmit('COMMENT')}
              disabled={isSubmitting}
              className="border-border bg-interactive text-foreground hover:bg-interactive-hover rounded-md border px-4 py-2 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-40"
            >
              Comment
            </button>
            <button
              type="button"
              onClick={() => void handleSubmit('APPROVE')}
              disabled={isSubmitting}
              className="bg-success text-foreground rounded-md px-4 py-2 text-sm font-medium transition-opacity disabled:cursor-not-allowed disabled:opacity-40"
            >
              Approve
            </button>
            <button
              type="button"
              onClick={() => void handleSubmit('REQUEST_CHANGES')}
              disabled={isSubmitting}
              className="bg-danger text-foreground rounded-md px-4 py-2 text-sm font-medium transition-opacity disabled:cursor-not-allowed disabled:opacity-40"
            >
              Request changes
            </button>
          </div>
        </div>
      </div>
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
    for (let i = 0; i < parts.length; i++) {
      const part = parts[i]!
      const isFile = i === parts.length - 1
      if (isFile) {
        current.children.push({ name: part, path: file.filename, children: [], file })
      } else {
        let folder = current.children.find((c) => c.file === null && c.name === part)
        if (!folder) {
          folder = { name: part, path: parts.slice(0, i + 1).join('/'), children: [], file: null }
          current.children.push(folder)
        }
        current = folder
      }
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

type FileTreeRow =
  | { kind: 'folder'; depth: number; path: string; name: string }
  | { kind: 'file'; depth: number; path: string; file: PullRequestFile }

function flattenFileTree(nodes: FileTreeNode[], collapsed: Set<string>, depth: number, out: FileTreeRow[]): void {
  for (const node of nodes) {
    if (node.file) {
      out.push({ kind: 'file', depth, path: node.path, file: node.file })
      continue
    }
    const isCollapsed = collapsed.has(node.path)
    out.push({ kind: 'folder', depth, path: node.path, name: node.name })
    if (!isCollapsed) flattenFileTree(node.children, collapsed, depth + 1, out)
  }
}

const FILE_TREE_ROW_STYLE: React.CSSProperties = {
  contentVisibility: 'auto',
  containIntrinsicSize: '0 22px'
}

function FileTree({
  tree,
  activeFilePath,
  commentCountsByFile,
  collapsedFolders,
  onToggleFolder,
  onSelectFile
}: {
  tree: FileTreeNode[]
  activeFilePath: string | null
  commentCountsByFile: Map<string, number>
  collapsedFolders: Set<string>
  onToggleFolder: (path: string) => void
  onSelectFile: (path: string) => void
}) {
  const rows: FileTreeRow[] = []
  flattenFileTree(tree, collapsedFolders, 0, rows)
  return (
    <div className="py-1">
      {rows.map((row) =>
        row.kind === 'folder' ? (
          <FileTreeFolderRow
            key={`folder:${row.path}`}
            depth={row.depth}
            name={row.name}
            path={row.path}
            isOpen={!collapsedFolders.has(row.path)}
            onToggle={onToggleFolder}
          />
        ) : (
          <FileTreeFileRow
            key={`file:${row.path}`}
            file={row.file}
            depth={row.depth}
            isActive={activeFilePath === row.path}
            commentCount={commentCountsByFile.get(row.path) ?? 0}
            onClick={onSelectFile}
          />
        )
      )}
    </div>
  )
}

const FileTreeFolderRow = memo(function FileTreeFolderRow({
  depth,
  name,
  path,
  isOpen,
  onToggle
}: {
  depth: number
  name: string
  path: string
  isOpen: boolean
  onToggle: (path: string) => void
}) {
  return (
    <div style={FILE_TREE_ROW_STYLE}>
      <button
        type="button"
        onClick={() => onToggle(path)}
        className="text-foreground hover:bg-surface-hover flex w-full items-center gap-1.5 py-1 text-left text-xs"
        style={{ paddingLeft: 8 + depth * 16 }}
      >
        <ChevronDown
          size={14}
          className={cn('text-foreground-subtle shrink-0 transition-transform', !isOpen && '-rotate-90')}
        />
        <FolderIcon name={name} open={isOpen} />
        <span className="truncate font-medium">{name}</span>
      </button>
    </div>
  )
})

const FileTreeFileRow = memo(function FileTreeFileRow({
  file,
  depth,
  isActive,
  commentCount,
  onClick
}: {
  file: PullRequestFile
  depth: number
  isActive: boolean
  commentCount: number
  onClick: (path: string) => void
}) {
  const name = file.filename.split('/').pop() ?? file.filename
  return (
    <button
      type="button"
      onClick={() => onClick(file.filename)}
      style={{ paddingLeft: 8 + depth * 16 + 20, ...FILE_TREE_ROW_STYLE }}
      className={cn(
        'flex w-full items-center gap-1.5 py-1 pr-3 text-left text-xs transition-colors',
        isActive ? 'bg-surface-hover text-foreground' : 'text-foreground hover:bg-surface-hover'
      )}
    >
      <FileStatusIcon status={file.status} />
      <span className="min-w-0 flex-1 truncate">{name}</span>
      {commentCount > 0 ? (
        <span className="text-foreground-subtle flex shrink-0 items-center gap-1">
          <MessageSquare size={12} />
          <span className="text-[11px]">{commentCount}</span>
        </span>
      ) : null}
    </button>
  )
})

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
