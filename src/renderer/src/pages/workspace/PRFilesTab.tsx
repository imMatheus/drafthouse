import { Fragment, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronsUpDown,
  Copy,
  ExternalLink,
  FileDiff,
  FileMinus,
  FilePlus,
  MessageSquare,
  Plus,
  Search,
  X
} from 'lucide-react'
import type {
  AgentSession,
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
import { getLanguageFromPath, tokenizeCode, tokenizeDiffHunks, type HighlightedToken } from '../../lib/shiki'
import MarkdownBody from './MarkdownBody'
import ReviewThreadCard from './ReviewThreadCard'
import { parsePullRequestFileDiff, type ParsedDiffLine } from './pullRequestDiff'
import {
  preparePullRequestFileDiff,
  type HunkGap,
  type PreparedDraftEntry,
  type PreparedFileDiff
} from './preparedPullRequestDiff'
import {
  buildPullRequestReviewThreads,
  DiffStat,
  formatRelativeTime,
  type PullRequestReviewThread
} from './pullRequestShared'

const EMPTY_FILES: PullRequestFile[] = []
const EMPTY_THREADS: PullRequestReviewThread[] = []
const EMPTY_DRAFTS: PreparedDraftEntry[] = []
const EMPTY_SESSIONS: AgentSession[] = []

// ────────────────────────────────────────────────────────────
// Main PRFilesTab (unchanged from before)
// ────────────────────────────────────────────────────────────

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
  agentSessions?: AgentSession[]
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
  const fileSectionRefs = useRef(new Map<string, HTMLElement>())
  const threadRefs = useRef(new Map<number, HTMLElement>())
  const queryClient = useQueryClient()

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
  const deferredFilterValue = useDeferredValue(filterValue)
  const trimmedFilter = deferredFilterValue.trim().toLowerCase()
  const filteredFiles = useMemo(
    () =>
      trimmedFilter === '' ? allFiles : allFiles.filter((file) => file.filename.toLowerCase().includes(trimmedFilter)),
    [allFiles, trimmedFilter]
  )
  const fileTree = useMemo(() => buildFileTree(filteredFiles), [filteredFiles])

  const reviewThreads = useMemo(
    () => buildPullRequestReviewThreads(reviewComments ?? [], reviewThreadSummaries),
    [reviewComments, reviewThreadSummaries]
  )

  // File-scoped groupings. Each card pulls only its own slice so a change in
  // one file's annotations doesn't invalidate the prepared diffs of other files.
  const threadsByFile = useMemo(() => {
    const map = new Map<string, PullRequestReviewThread[]>()
    for (const thread of reviewThreads) {
      const bucket = map.get(thread.path)
      if (bucket) bucket.push(thread)
      else map.set(thread.path, [thread])
    }
    return map
  }, [reviewThreads])

  const commentCountsByFile = useMemo(() => {
    const map = new Map<string, number>()
    for (const comment of reviewComments ?? []) {
      map.set(comment.path, (map.get(comment.path) ?? 0) + 1)
    }
    return map
  }, [reviewComments])

  const threadsByCommentId = useMemo(
    () => new Map(reviewThreads.map((thread) => [thread.topLevelComment.id, thread])),
    [reviewThreads]
  )

  const draftsByFile = useMemo(() => {
    const map = new Map<string, PreparedDraftEntry[]>()
    draftReviewComments.forEach((comment, index) => {
      const bucket = map.get(comment.path)
      const entry: PreparedDraftEntry = { comment, index }
      if (bucket) bucket.push(entry)
      else map.set(comment.path, [entry])
    })
    return map
  }, [draftReviewComments])

  const inlineSessionsByFile = useMemo(() => {
    const map = new Map<string, AgentSession[]>()
    for (const session of agentSessions ?? []) {
      const ctx = session.context
      if (!ctx || !ctx.inline || !ctx.filePath) continue
      const bucket = map.get(ctx.filePath)
      if (bucket) bucket.push(session)
      else map.set(ctx.filePath, [session])
    }
    return map
  }, [agentSessions])

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

  useEffect(() => {
    if (!threadJumpTarget) return
    const thread = threadsByCommentId.get(threadJumpTarget.commentId)
    const nextPath = thread?.path ?? threadJumpTarget.path
    if (!filteredFiles.some((file) => file.filename === nextPath)) {
      setFilterValue('')
      return
    }
    setActiveFilePath(nextPath)
    requestAnimationFrame(() => {
      const threadElement = threadRefs.current.get(threadJumpTarget.commentId)
      if (threadElement) {
        threadElement.scrollIntoView({ behavior: 'smooth', block: 'center' })
        return
      }
      fileSectionRefs.current.get(nextPath)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    })
  }, [filteredFiles, threadJumpTarget, threadsByCommentId])

  const handleScrollToFile = (path: string): void => {
    setActiveFilePath(path)
    fileSectionRefs.current.get(path)?.scrollIntoView({ behavior: 'instant', block: 'start' })
  }

  const handleAddDraftComment = (comment: PullRequestReviewDraftComment): void => {
    onDraftReviewCommentsChange([...draftReviewComments, comment])
    setOpenCommentKey(null)
  }

  const handleRemoveDraftComment = (index: number): void => {
    onDraftReviewCommentsChange(draftReviewComments.filter((_comment, commentIndex) => commentIndex !== index))
  }

  const handleInlineCommentPosted = async (): Promise<void> => {
    setOpenCommentKey(null)
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['pull-request-review-comments', owner, repo, pr.number] }),
      queryClient.invalidateQueries({ queryKey: ['pull-request-reviews', owner, repo, pr.number] })
    ])
  }

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
                  onSelectFile={handleScrollToFile}
                />
              )}
            </div>
            {draftReviewComments.length > 0 ? (
              <div className="border-border border-t px-2 py-2">
                <button
                  type="button"
                  onClick={() => setIsSubmitReviewOpen(true)}
                  className="bg-accent text-foreground hover:bg-accent-hover w-full rounded-md px-3 py-1.5 text-xs font-medium transition-colors"
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
          {isLoading ? <p className="text-foreground-muted text-sm">Loading changed files...</p> : null}
          <div className="flex flex-col gap-5">
            {filteredFiles.map((file, index) => (
              <ChangedFileDiffCard
                key={file.filename}
                owner={owner}
                repo={repo}
                number={pr.number}
                commitId={pr.head.sha}
                file={file}
                auth={auth}
                fileThreads={threadsByFile.get(file.filename) ?? EMPTY_THREADS}
                fileDrafts={draftsByFile.get(file.filename) ?? EMPTY_DRAFTS}
                openCommentKey={openCommentKey}
                onOpenComment={setOpenCommentKey}
                onAskClaude={onAskClaude}
                onFixWithClaude={onFixWithClaude}
                agentSessions={agentSessions ?? []}
                fileInlineSessions={inlineSessionsByFile.get(file.filename) ?? EMPTY_SESSIONS}
                onContinueAgent={onContinueAgent}
                onStopAgent={onStopAgent}
                onPromoteAgent={onPromoteAgent}
                onAddDraftComment={handleAddDraftComment}
                onRemoveDraftComment={handleRemoveDraftComment}
                onInlineCommentPosted={handleInlineCommentPosted}
                allowCommenting
                isActive={activeFilePath === file.filename}
                initiallyVisible={index < 3}
                sectionRef={(element) => {
                  if (element) fileSectionRefs.current.set(file.filename, element)
                  else fileSectionRefs.current.delete(file.filename)
                }}
                threadRef={(commentId, element) => {
                  if (element) threadRefs.current.set(commentId, element)
                  else threadRefs.current.delete(commentId)
                }}
              />
            ))}
          </div>
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

// ────────────────────────────────────────────────────────────
// PullRequestFileDiffCard — patch-based hunk rendering
// ────────────────────────────────────────────────────────────

export function ChangedFileDiffCard({
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
  isActive = false,
  initiallyVisible = false,
  sectionRef,
  threadRef
}: {
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
  agentSessions: AgentSession[]
  fileInlineSessions: readonly AgentSession[]
  onContinueAgent?: (sessionId: string, prompt: string, files?: string[]) => Promise<void>
  onStopAgent?: (sessionId: string) => Promise<void>
  onPromoteAgent?: (sessionId: string) => void
  onAddDraftComment: (comment: PullRequestReviewDraftComment) => void
  onRemoveDraftComment: (index: number) => void
  onInlineCommentPosted: () => Promise<void>
  allowCommenting?: boolean
  isActive?: boolean
  initiallyVisible?: boolean
  sectionRef: (element: HTMLElement | null) => void
  threadRef: (commentId: number, element: HTMLElement | null) => void
}) {
  const { theme } = useTheme()
  const { settings } = useSettings()

  // Stage 1 — parse the raw diff. Depends only on the patch, so it survives
  // annotation changes (new threads, drafts, agent sessions) and theme switches.
  const parsedDiff = useMemo(() => parsePullRequestFileDiff(file), [file.patch, file.filename])

  // Stage 2 — single-pass join of the parsed diff with all per-file annotations.
  // Produces pre-indexed rows/pairs/gaps ready for render, with zero Map lookups
  // or string concatenation in the hot rendering path.
  const prepared = useMemo(
    () => preparePullRequestFileDiff(parsedDiff, file.filename, fileThreads, fileDrafts, fileInlineSessions),
    [parsedDiff, file.filename, fileThreads, fileDrafts, fileInlineSessions]
  )

  const [tokenMap, setTokenMap] = useState<Map<string, HighlightedToken[]>>(new Map())
  const [expandedGaps, setExpandedGaps] = useState<Set<string>>(new Set())
  const [expandedLines, setExpandedLines] = useState<Map<string, ExpandedContextLines>>(new Map())
  const [isCollapsed, setIsCollapsed] = useState(false)
  const [pathCopied, setPathCopied] = useState(false)
  const [hasRenderedDiffBody, setHasRenderedDiffBody] = useState(initiallyVisible)
  const diffBodyObserverRef = useRef<IntersectionObserver | null>(null)

  useEffect(() => {
    if (isActive || initiallyVisible) {
      setHasRenderedDiffBody(true)
    }
  }, [initiallyVisible, isActive])

  useEffect(() => {
    return () => diffBodyObserverRef.current?.disconnect()
  }, [])

  const handleCopyPath = (): void => {
    navigator.clipboard.writeText(file.filename).catch(() => {})
    setPathCopied(true)
    setTimeout(() => setPathCopied(false), 1500)
  }

  const shouldRenderDiffBody = hasRenderedDiffBody && !isCollapsed

  useEffect(() => {
    if (!shouldRenderDiffBody || !prepared.hasRenderablePatch) return

    const lang = getLanguageFromPath(file.filename)
    tokenizeDiffHunks(parsedDiff.hunks, lang, theme).then(setTokenMap)
  }, [file.filename, parsedDiff.hunks, prepared.hasRenderablePatch, shouldRenderDiffBody, theme])

  // Lazily fetch full file content for expanding gaps
  const { data: fullFileContent } = useQuery<string, Error>({
    queryKey: ['pr-file-content', owner, repo, commitId, file.filename],
    queryFn: () => window.api.github.repos.getContent(owner, repo, file.filename, commitId),
    enabled: shouldRenderDiffBody && expandedGaps.size > 0,
    retry: false
  })

  // When fullFileContent arrives, compute expanded lines for each gap
  useEffect(() => {
    if (!fullFileContent || expandedGaps.size === 0) return

    const fullLines = fullFileContent.split('\n')
    const lang = getLanguageFromPath(file.filename)
    const newExpanded = new Map<string, ExpandedContextLines>()

    for (const gapKey of expandedGaps) {
      const [startStr, endStr] = gapKey.split('-').slice(1)
      const startLine = Number(startStr)
      const endLine = Number(endStr)
      if (Number.isNaN(startLine) || Number.isNaN(endLine)) continue

      // newLineNumber is 1-based, fullLines is 0-based
      const lines = fullLines.slice(startLine - 1, endLine - 1)
      newExpanded.set(gapKey, { startLine, lines, tokens: null })

      tokenizeCode(lines.join('\n'), lang, theme).then((tokens) => {
        setExpandedLines((prev) => {
          const next = new Map(prev)
          const entry = next.get(gapKey)
          if (entry) next.set(gapKey, { ...entry, tokens })
          return next
        })
      })
    }

    setExpandedLines((prev) => {
      const next = new Map(prev)
      for (const [key, value] of newExpanded) {
        if (!next.has(key)) next.set(key, value)
      }
      return next
    })
  }, [fullFileContent, expandedGaps, file.filename, theme])

  const handleExpandGap = (gapKey: string): void => {
    setExpandedGaps((prev) => new Set(prev).add(gapKey))
  }

  const replyTarget = { owner, repo, number }

  const diffProps: HunkDiffProps = {
    prepared,
    tokenMap,
    filename: file.filename,
    owner,
    repo,
    number,
    commitId,
    auth,
    openCommentKey,
    onOpenComment,
    onAskClaude,
    onFixWithClaude,
    agentSessions,
    onContinueAgent,
    onStopAgent,
    onPromoteAgent,
    onAddDraftComment,
    onRemoveDraftComment,
    onInlineCommentPosted,
    replyTarget,
    threadRef,
    expandedGaps,
    expandedLines,
    onExpandGap: handleExpandGap,
    allowCommenting
  }

  return (
    <section
      ref={(element) => {
        sectionRef(element)

        diffBodyObserverRef.current?.disconnect()

        if (!element || hasRenderedDiffBody) {
          return
        }

        const observer = new IntersectionObserver(
          (entries) => {
            if (entries.some((entry) => entry.isIntersecting)) {
              setHasRenderedDiffBody(true)
              observer.disconnect()
            }
          },
          { rootMargin: '900px 0px' }
        )

        observer.observe(element)
        diffBodyObserverRef.current = observer
      }}
      data-file-path={file.filename}
      className="border-border bg-surface overflow-hidden rounded-xl border"
    >
      <header className={cn('flex items-center gap-2 px-3 py-1.5', !isCollapsed && 'border-border border-b')}>
        <button
          type="button"
          onClick={() => {
            if (isCollapsed) {
              setHasRenderedDiffBody(true)
            }
            setIsCollapsed(!isCollapsed)
          }}
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
          {!hasRenderedDiffBody ? (
            <div className="text-foreground-muted px-4 py-6 text-sm">Rendering diff…</div>
          ) : prepared.hasRenderablePatch ? (
            settings.diffViewMode === 'split' ? (
              <SplitHunkDiff {...diffProps} />
            ) : (
              <UnifiedHunkDiff {...diffProps} />
            )
          ) : (
            <div className="text-foreground-muted px-4 py-6 text-sm">
              GitHub did not return a renderable patch for this file.
            </div>
          )}

          {prepared.unanchoredThreads.length > 0 ? (
            <div className="border-border border-t px-4 py-4">
              <p className="text-foreground-muted mb-3 text-xs font-semibold tracking-wider uppercase">
                Other comments
              </p>
              <div className="flex flex-col gap-3">
                {prepared.unanchoredThreads.map((thread) => (
                  <div key={`unanchored-${thread.id}`} ref={(element) => threadRef(thread.id, element)}>
                    <ReviewThreadCard
                      thread={thread}
                      replyTarget={replyTarget}
                      onFixWithClaude={onFixWithClaude}
                      agentSessions={agentSessions}
                      onStopAgent={onStopAgent}
                      onContinueAgent={onContinueAgent}
                      onPromoteAgent={onPromoteAgent}
                    />
                  </div>
                ))}
              </div>
            </div>
          ) : null}
        </>
      )}
    </section>
  )
}

// ────────────────────────────────────────────────────────────
// Shared diff types + helpers
// ────────────────────────────────────────────────────────────

interface ExpandedContextLines {
  startLine: number
  lines: string[]
  tokens: HighlightedToken[][] | null
}

interface HunkDiffProps {
  prepared: PreparedFileDiff
  tokenMap: Map<string, HighlightedToken[]>
  filename: string
  owner: string
  repo: string
  number: number
  commitId: string
  auth: AuthData | null | undefined
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
  agentSessions: AgentSession[]
  onContinueAgent?: (sessionId: string, prompt: string, files?: string[]) => Promise<void>
  onStopAgent?: (sessionId: string) => Promise<void>
  onPromoteAgent?: (sessionId: string) => void
  onAddDraftComment: (comment: PullRequestReviewDraftComment) => void
  onRemoveDraftComment: (index: number) => void
  onInlineCommentPosted: () => Promise<void>
  replyTarget: { owner: string; repo: string; number: number }
  threadRef: (commentId: number, element: HTMLElement | null) => void
  expandedGaps: Set<string>
  expandedLines: Map<string, ExpandedContextLines>
  onExpandGap: (gapKey: string) => void
  allowCommenting: boolean
}

function DiffLineContent({ tokens, fallback }: { tokens: HighlightedToken[] | undefined; fallback: string }) {
  if (!tokens) return <>{fallback}</>
  return (
    <>
      {tokens.map((token, i) =>
        token.color ? (
          <span key={i} style={{ color: token.color }}>
            {token.content}
          </span>
        ) : (
          <span key={i}>{token.content}</span>
        )
      )}
    </>
  )
}

function ExpandSeparator({
  gap,
  isExpanded,
  onExpand,
  colSpan
}: {
  gap: HunkGap
  isExpanded: boolean
  onExpand: () => void
  colSpan: number
}) {
  if (isExpanded) return null
  return (
    <tr className="bg-interactive">
      <td colSpan={colSpan} className="px-3 py-1.5">
        <button
          type="button"
          onClick={onExpand}
          className="text-foreground-muted hover:text-foreground flex items-center gap-1.5 text-xs"
        >
          <ChevronsUpDown size={12} />
          Show {gap.hiddenCount} hidden line{gap.hiddenCount !== 1 ? 's' : ''}
        </button>
      </td>
    </tr>
  )
}

function ExpandedContextRows({
  gapKey,
  expandedLines,
  colSpan
}: {
  gapKey: string
  expandedLines: Map<string, ExpandedContextLines>
  colSpan: number
}) {
  const data = expandedLines.get(gapKey)
  if (!data) return null

  return (
    <>
      {data.lines.map((line, i) => {
        const lineNum = data.startLine + i
        const lineTokens = data.tokens?.[i]
        return (
          <tr key={`expanded-${gapKey}-${i}`} className="bg-background">
            <td className="text-foreground-subtle w-12 px-3 py-0 text-center font-mono text-xs select-none">
              {lineNum}
            </td>
            {colSpan >= 3 ? (
              <td className="text-foreground-subtle w-12 px-3 py-0 text-center font-mono text-xs select-none">
                {lineNum}
              </td>
            ) : null}
            <td className={cn('text-foreground px-3 py-0 font-mono text-[13px]', colSpan >= 3 && 'whitespace-pre')}>
              {colSpan >= 3 ? <span className="text-foreground-muted mr-3 inline-block w-3 text-center"> </span> : null}
              <DiffLineContent tokens={lineTokens} fallback={line} />
            </td>
          </tr>
        )
      })}
    </>
  )
}

function getFileDiffRowClassName(kind: ParsedDiffLine['kind']): string {
  if (kind === 'addition') return 'bg-success/10'
  if (kind === 'deletion') return 'bg-danger/10'
  if (kind === 'meta') return 'bg-surface'
  return 'bg-background'
}

function getFileDiffLineNumClassName(kind: ParsedDiffLine['kind']): string {
  if (kind === 'addition') return 'bg-success/20'
  if (kind === 'deletion') return 'bg-danger/20'
  return ''
}

function getFileDiffPrefix(kind: ParsedDiffLine['kind']): string {
  if (kind === 'addition') return '+'
  if (kind === 'deletion') return '-'
  if (kind === 'meta') return '\\'
  return ' '
}

// ────────────────────────────────────────────────────────────
// Unified Hunk Diff
// ────────────────────────────────────────────────────────────

function UnifiedHunkDiff(props: HunkDiffProps) {
  const {
    prepared,
    tokenMap,
    filename,
    owner,
    repo,
    number,
    commitId,
    auth,
    openCommentKey,
    onOpenComment,
    onAskClaude,
    onFixWithClaude,
    agentSessions,
    onContinueAgent,
    onStopAgent,
    onPromoteAgent,
    onAddDraftComment,
    onRemoveDraftComment,
    onInlineCommentPosted,
    replyTarget,
    threadRef,
    expandedGaps,
    expandedLines,
    onExpandGap,
    allowCommenting
  } = props

  return (
    <div className="overflow-x-auto">
      <table className="min-w-full border-collapse text-sm">
        <tbody>
          {prepared.beforeFirstGap ? (
            <>
              <ExpandSeparator
                gap={prepared.beforeFirstGap}
                isExpanded={expandedGaps.has(prepared.beforeFirstGap.key)}
                onExpand={() => onExpandGap(prepared.beforeFirstGap!.key)}
                colSpan={3}
              />
              {expandedGaps.has(prepared.beforeFirstGap.key) ? (
                <ExpandedContextRows gapKey={prepared.beforeFirstGap.key} expandedLines={expandedLines} colSpan={3} />
              ) : null}
            </>
          ) : null}

          {prepared.hunks.map((hunk) => (
            <Fragment key={hunk.id}>
              {hunk.header ? (
                <tr className="bg-interactive">
                  <td className="text-foreground-subtle w-12 px-3 py-1.5 text-center font-mono text-xs">...</td>
                  <td className="text-foreground-subtle w-12 px-3 py-1.5 text-center font-mono text-xs">...</td>
                  <td className="text-foreground-muted px-3 py-1.5 font-mono text-[13px]">{hunk.header}</td>
                </tr>
              ) : null}

              {hunk.rows.map((row) => {
                const { line, rowKey, threads, drafts, sessions } = row
                const isComposerOpen = allowCommenting && rowKey !== null && openCommentKey === rowKey

                return (
                  <Fragment key={line.id}>
                    <tr className={cn('group', getFileDiffRowClassName(line.kind))}>
                      <td
                        className={cn(
                          'text-foreground-subtle w-12 px-3 py-0 text-center font-mono text-xs',
                          getFileDiffLineNumClassName(line.kind)
                        )}
                      >
                        {line.oldLineNumber ?? ''}
                      </td>
                      <td
                        className={cn(
                          'text-foreground-subtle relative w-12 px-3 py-0 text-center font-mono text-xs',
                          getFileDiffLineNumClassName(line.kind)
                        )}
                      >
                        {allowCommenting && rowKey ? (
                          <button
                            type="button"
                            onClick={() => onOpenComment(isComposerOpen ? null : rowKey)}
                            className="bg-accent text-accent-foreground absolute top-1/2 right-0 z-10 mr-[-10px] hidden size-5 -translate-y-1/2 items-center justify-center rounded group-hover:inline-flex"
                            aria-label="Add line comment"
                          >
                            <Plus size={12} />
                          </button>
                        ) : null}
                        {line.newLineNumber ?? ''}
                      </td>
                      <td className="text-foreground px-3 py-0 font-mono text-[13px] whitespace-pre">
                        <span className="text-foreground-muted mr-3 inline-block w-3 text-center">
                          {getFileDiffPrefix(line.kind)}
                        </span>
                        <DiffLineContent tokens={tokenMap.get(line.id)} fallback={line.content} />
                      </td>
                    </tr>

                    {threads.map((thread) => (
                      <tr key={`thread-${thread.id}`} ref={(element) => threadRef(thread.id, element)}>
                        <td className={cn('w-12', getFileDiffLineNumClassName(line.kind))} />
                        <td className={cn('w-12', getFileDiffLineNumClassName(line.kind))} />
                        <td className={cn('border-border border-b px-4 py-2', getFileDiffRowClassName(line.kind))}>
                          <InlineDiffThread
                            thread={thread}
                            replyTarget={replyTarget}
                            onFixWithClaude={onFixWithClaude}
                            agentSessions={agentSessions}
                            onStopAgent={onStopAgent}
                            onContinueAgent={onContinueAgent}
                            onPromoteAgent={onPromoteAgent}
                          />
                        </td>
                      </tr>
                    ))}

                    {drafts.map(({ comment, index }) => (
                      <tr key={`draft-${rowKey}-${index}`}>
                        <td className={cn('w-12', getFileDiffLineNumClassName(line.kind))} />
                        <td className={cn('w-12', getFileDiffLineNumClassName(line.kind))} />
                        <td className={cn('px-3 py-3', getFileDiffRowClassName(line.kind))}>
                          <DraftCommentCard
                            comment={comment}
                            auth={auth}
                            onRemove={() => onRemoveDraftComment(index)}
                          />
                        </td>
                      </tr>
                    ))}

                    {allowCommenting && isComposerOpen && rowKey && line.commentSide && line.commentLine ? (
                      <tr>
                        <td className={cn('w-12', getFileDiffLineNumClassName(line.kind))} />
                        <td className={cn('w-12', getFileDiffLineNumClassName(line.kind))} />
                        <td className={cn('px-3 py-3', getFileDiffRowClassName(line.kind))}>
                          <InlineDiffCommentComposer
                            owner={owner}
                            repo={repo}
                            number={number}
                            commitId={commitId}
                            path={filename}
                            line={line.commentLine}
                            lineContent={line.content}
                            side={line.commentSide}
                            onCancel={() => onOpenComment(null)}
                            onAddDraftComment={onAddDraftComment}
                            onInlineCommentPosted={onInlineCommentPosted}
                            onAskClaude={onAskClaude}
                          />
                        </td>
                      </tr>
                    ) : null}

                    {sessions.map((session) => (
                      <tr key={`agent-${session.id}`}>
                        <td className={cn('w-12', getFileDiffLineNumClassName(line.kind))} />
                        <td className={cn('w-12', getFileDiffLineNumClassName(line.kind))} />
                        <td className={cn('px-3 py-3', getFileDiffRowClassName(line.kind))}>
                          <InlineAgentResponseCard
                            session={session}
                            onStop={() => onStopAgent?.(session.id)}
                            onContinue={(prompt) => onContinueAgent?.(session.id, prompt)}
                            onOpenInChat={() => onPromoteAgent?.(session.id)}
                          />
                        </td>
                      </tr>
                    ))}
                  </Fragment>
                )
              })}

              {/* Expand separator between this hunk and the next */}
              {hunk.gapAfter ? (
                <>
                  <ExpandSeparator
                    gap={hunk.gapAfter}
                    isExpanded={expandedGaps.has(hunk.gapAfter.key)}
                    onExpand={() => onExpandGap(hunk.gapAfter!.key)}
                    colSpan={3}
                  />
                  {expandedGaps.has(hunk.gapAfter.key) ? (
                    <ExpandedContextRows gapKey={hunk.gapAfter.key} expandedLines={expandedLines} colSpan={3} />
                  ) : null}
                </>
              ) : null}
            </Fragment>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// ────────────────────────────────────────────────────────────
// Split Hunk Diff
// ────────────────────────────────────────────────────────────

function SplitHunkDiff(props: HunkDiffProps) {
  const {
    prepared,
    tokenMap,
    filename,
    owner,
    repo,
    number,
    commitId,
    auth,
    openCommentKey,
    onOpenComment,
    onAskClaude,
    onFixWithClaude,
    agentSessions,
    onContinueAgent,
    onStopAgent,
    onPromoteAgent,
    onAddDraftComment,
    onRemoveDraftComment,
    onInlineCommentPosted,
    replyTarget,
    threadRef,
    expandedGaps,
    expandedLines,
    onExpandGap,
    allowCommenting
  } = props

  return (
    <div className="overflow-hidden">
      <table className="w-full table-fixed border-collapse text-sm">
        <colgroup>
          <col className="w-10" />
          <col className="w-1/2" />
          <col className="w-10" />
          <col className="w-1/2" />
        </colgroup>
        <tbody>
          {prepared.beforeFirstGap ? (
            <>
              <ExpandSeparator
                gap={prepared.beforeFirstGap}
                isExpanded={expandedGaps.has(prepared.beforeFirstGap.key)}
                onExpand={() => onExpandGap(prepared.beforeFirstGap!.key)}
                colSpan={4}
              />
              {expandedGaps.has(prepared.beforeFirstGap.key) ? (
                <SplitExpandedContextRows gapKey={prepared.beforeFirstGap.key} expandedLines={expandedLines} />
              ) : null}
            </>
          ) : null}

          {prepared.hunks.map((hunk) => (
            <Fragment key={hunk.id}>
              {hunk.header ? (
                <tr className="bg-interactive">
                  <td colSpan={4} className="text-foreground-muted px-3 py-1.5 font-mono text-[13px]">
                    {hunk.header}
                  </td>
                </tr>
              ) : null}

              {hunk.pairs.map((pair, idx) => {
                // For context rows pair.left === pair.right; the ref-equality check
                // de-dupes threads/drafts/sessions so we don't render them twice.
                const leftRow = pair.left
                const rightRow = pair.right
                const isSameRow = leftRow !== null && leftRow === rightRow
                const leftKey = leftRow?.rowKey ?? null
                const rightKey = !isSameRow ? (rightRow?.rowKey ?? null) : null

                const leftThreads = leftRow?.threads ?? EMPTY_THREADS
                const rightThreads = rightRow && !isSameRow ? rightRow.threads : EMPTY_THREADS
                const combinedThreads =
                  leftThreads.length === 0
                    ? rightThreads
                    : rightThreads.length === 0
                      ? leftThreads
                      : [...leftThreads, ...rightThreads]

                const leftDrafts = leftRow?.drafts ?? EMPTY_DRAFTS
                const rightDrafts = rightRow && !isSameRow ? rightRow.drafts : EMPTY_DRAFTS

                const leftSessions = leftRow?.sessions ?? EMPTY_SESSIONS
                const rightSessions = rightRow && !isSameRow ? rightRow.sessions : EMPTY_SESSIONS
                const combinedSessions =
                  leftSessions.length === 0
                    ? rightSessions
                    : rightSessions.length === 0
                      ? leftSessions
                      : [...leftSessions, ...rightSessions]

                const isLeftComposerOpen = allowCommenting && leftKey !== null && openCommentKey === leftKey
                const isRightComposerOpen = allowCommenting && rightKey !== null && openCommentKey === rightKey

                return (
                  <Fragment key={`${hunk.id}-pair-${idx}`}>
                    <tr>
                      <td
                        className={cn(
                          'group/left text-foreground-subtle relative px-2 py-0 text-center font-mono text-xs',
                          leftRow?.line.kind === 'deletion' ? 'bg-danger/20' : 'bg-background'
                        )}
                      >
                        {allowCommenting && leftKey && leftRow ? (
                          <button
                            type="button"
                            onClick={() => onOpenComment(isLeftComposerOpen ? null : leftKey)}
                            className="bg-accent text-accent-foreground absolute top-1/2 right-0 z-10 mr-[-10px] hidden size-5 -translate-y-1/2 items-center justify-center rounded group-hover/left:inline-flex"
                            aria-label="Add line comment"
                          >
                            <Plus size={12} />
                          </button>
                        ) : null}
                        {leftRow?.line.oldLineNumber ?? ''}
                      </td>
                      <td
                        className={cn(
                          'border-border overflow-hidden border-r px-3 py-0 font-mono text-[13px] break-all whitespace-pre-wrap',
                          leftRow?.line.kind === 'deletion'
                            ? 'bg-danger/10 text-foreground'
                            : leftRow
                              ? 'bg-background text-foreground'
                              : 'bg-surface'
                        )}
                      >
                        {leftRow ? (
                          <DiffLineContent tokens={tokenMap.get(leftRow.line.id)} fallback={leftRow.line.content} />
                        ) : (
                          '\u00A0'
                        )}
                      </td>
                      <td
                        className={cn(
                          'group/right text-foreground-subtle relative px-1 py-0 text-center font-mono text-xs',
                          rightRow?.line.kind === 'addition' ? 'bg-success/20' : 'bg-background'
                        )}
                      >
                        {allowCommenting && rightKey && rightRow ? (
                          <button
                            type="button"
                            onClick={() => onOpenComment(isRightComposerOpen ? null : rightKey)}
                            className="bg-accent text-accent-foreground absolute top-1/2 right-0 z-10 mr-[-10px] hidden size-5 -translate-y-1/2 items-center justify-center rounded group-hover/right:inline-flex"
                            aria-label="Add line comment"
                          >
                            <Plus size={12} />
                          </button>
                        ) : null}
                        {rightRow?.line.newLineNumber ?? ''}
                      </td>
                      <td
                        className={cn(
                          'overflow-hidden px-3 py-0 font-mono text-[13px] break-all whitespace-pre-wrap',
                          rightRow?.line.kind === 'addition'
                            ? 'bg-success/10 text-foreground'
                            : rightRow
                              ? 'bg-background text-foreground'
                              : 'bg-surface'
                        )}
                      >
                        {rightRow ? (
                          <DiffLineContent tokens={tokenMap.get(rightRow.line.id)} fallback={rightRow.line.content} />
                        ) : (
                          '\u00A0'
                        )}
                      </td>
                    </tr>

                    {combinedThreads.map((thread) => {
                      const isLeft = thread.side === 'LEFT'
                      return (
                        <tr key={`thread-${thread.id}`} ref={(element) => threadRef(thread.id, element)}>
                          {isLeft ? (
                            <>
                              <td className="bg-danger/20" />
                              <td className="border-border bg-danger/10 border-r p-1.5 align-top">
                                <InlineDiffThread
                                  thread={thread}
                                  replyTarget={replyTarget}
                                  onFixWithClaude={onFixWithClaude}
                                  agentSessions={agentSessions}
                                  onStopAgent={onStopAgent}
                                  onContinueAgent={onContinueAgent}
                                  onPromoteAgent={onPromoteAgent}
                                />
                              </td>
                              <td className="bg-success/20" />
                              <td className="bg-success/10" />
                            </>
                          ) : (
                            <>
                              <td className="bg-danger/20" />
                              <td className="border-border bg-danger/10 border-r" />
                              <td className="bg-success/20" />
                              <td className="bg-success/10 px-3 py-2 align-top">
                                <InlineDiffThread
                                  thread={thread}
                                  replyTarget={replyTarget}
                                  onFixWithClaude={onFixWithClaude}
                                  agentSessions={agentSessions}
                                  onStopAgent={onStopAgent}
                                  onContinueAgent={onContinueAgent}
                                  onPromoteAgent={onPromoteAgent}
                                />
                              </td>
                            </>
                          )}
                        </tr>
                      )
                    })}

                    {leftDrafts.map(({ comment, index }) => (
                      <tr key={`draft-left-${index}`}>
                        <td className="bg-danger/20" />
                        <td className="border-border bg-danger/10 border-r px-3 py-3 align-top">
                          <DraftCommentCard
                            comment={comment}
                            auth={auth}
                            onRemove={() => onRemoveDraftComment(index)}
                          />
                        </td>
                        <td className="bg-success/20" />
                        <td className="bg-success/10" />
                      </tr>
                    ))}
                    {rightDrafts.map(({ comment, index }) => (
                      <tr key={`draft-right-${index}`}>
                        <td className="bg-danger/20" />
                        <td className="border-border bg-danger/10 border-r" />
                        <td className="bg-success/20" />
                        <td className="bg-success/10 px-3 py-3 align-top">
                          <DraftCommentCard
                            comment={comment}
                            auth={auth}
                            onRemove={() => onRemoveDraftComment(index)}
                          />
                        </td>
                      </tr>
                    ))}

                    {allowCommenting &&
                    isLeftComposerOpen &&
                    leftKey &&
                    leftRow?.line.commentSide &&
                    leftRow.line.commentLine ? (
                      <tr>
                        <td className="bg-danger/20" />
                        <td className="border-border bg-danger/10 border-r px-3 py-3 align-top">
                          <InlineDiffCommentComposer
                            owner={owner}
                            repo={repo}
                            number={number}
                            commitId={commitId}
                            path={filename}
                            line={leftRow.line.commentLine}
                            lineContent={leftRow.line.content}
                            side={leftRow.line.commentSide}
                            onCancel={() => onOpenComment(null)}
                            onAddDraftComment={onAddDraftComment}
                            onInlineCommentPosted={onInlineCommentPosted}
                            onAskClaude={onAskClaude}
                          />
                        </td>
                        <td className="bg-success/20" />
                        <td className="bg-success/10" />
                      </tr>
                    ) : null}

                    {allowCommenting &&
                    isRightComposerOpen &&
                    rightKey &&
                    rightRow?.line.commentSide &&
                    rightRow.line.commentLine ? (
                      <tr>
                        <td className="bg-danger/20" />
                        <td className="border-border bg-danger/10 border-r" />
                        <td className="bg-success/20" />
                        <td className="bg-success/10 px-3 py-3 align-top">
                          <InlineDiffCommentComposer
                            owner={owner}
                            repo={repo}
                            number={number}
                            commitId={commitId}
                            path={filename}
                            line={rightRow.line.commentLine}
                            lineContent={rightRow.line.content}
                            side={rightRow.line.commentSide}
                            onCancel={() => onOpenComment(null)}
                            onAddDraftComment={onAddDraftComment}
                            onInlineCommentPosted={onInlineCommentPosted}
                            onAskClaude={onAskClaude}
                          />
                        </td>
                      </tr>
                    ) : null}

                    {combinedSessions.map((session) => (
                      <tr key={`agent-${session.id}`}>
                        {session.context?.side === 'RIGHT' ? (
                          <>
                            <td className="bg-danger/20" />
                            <td className="border-border bg-danger/10 border-r" />
                            <td className="bg-success/20" />
                            <td className="bg-success/10 px-3 py-3 align-top">
                              <InlineAgentResponseCard
                                session={session}
                                onStop={() => onStopAgent?.(session.id)}
                                onContinue={(prompt) => onContinueAgent?.(session.id, prompt)}
                                onOpenInChat={() => onPromoteAgent?.(session.id)}
                              />
                            </td>
                          </>
                        ) : (
                          <>
                            <td className="bg-danger/20" />
                            <td className="border-border bg-danger/10 border-r px-3 py-3 align-top">
                              <InlineAgentResponseCard
                                session={session}
                                onStop={() => onStopAgent?.(session.id)}
                                onContinue={(prompt) => onContinueAgent?.(session.id, prompt)}
                                onOpenInChat={() => onPromoteAgent?.(session.id)}
                              />
                            </td>
                            <td className="bg-success/20" />
                            <td className="bg-success/10" />
                          </>
                        )}
                      </tr>
                    ))}
                  </Fragment>
                )
              })}

              {hunk.gapAfter ? (
                <>
                  <ExpandSeparator
                    gap={hunk.gapAfter}
                    isExpanded={expandedGaps.has(hunk.gapAfter.key)}
                    onExpand={() => onExpandGap(hunk.gapAfter!.key)}
                    colSpan={4}
                  />
                  {expandedGaps.has(hunk.gapAfter.key) ? (
                    <SplitExpandedContextRows gapKey={hunk.gapAfter.key} expandedLines={expandedLines} />
                  ) : null}
                </>
              ) : null}
            </Fragment>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function SplitExpandedContextRows({
  gapKey,
  expandedLines
}: {
  gapKey: string
  expandedLines: Map<string, ExpandedContextLines>
}) {
  const data = expandedLines.get(gapKey)
  if (!data) return null
  return (
    <>
      {data.lines.map((line, i) => {
        const lineNum = data.startLine + i
        const lineTokens = data.tokens?.[i]
        return (
          <tr key={`expanded-${gapKey}-${i}`} className="bg-background">
            <td className="text-foreground-subtle px-2 py-0 text-center font-mono text-xs">{lineNum}</td>
            <td className="border-border text-foreground overflow-hidden border-r px-3 py-0 font-mono text-[13px] break-all whitespace-pre-wrap">
              <DiffLineContent tokens={lineTokens} fallback={line} />
            </td>
            <td className="text-foreground-subtle px-2 py-0 text-center font-mono text-xs">{lineNum}</td>
            <td className="text-foreground overflow-hidden px-3 py-0 font-mono text-[13px] break-all whitespace-pre-wrap">
              <DiffLineContent tokens={lineTokens} fallback={line} />
            </td>
          </tr>
        )
      })}
    </>
  )
}

// ────────────────────────────────────────────────────────────
// DraftCommentCard
// ────────────────────────────────────────────────────────────

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

// ────────────────────────────────────────────────────────────
// InlineDiffThread
// ────────────────────────────────────────────────────────────

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
  agentSessions?: AgentSession[]
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

  const sessionsByCommentId = (agentSessions ?? []).reduce<Map<number, AgentSession[]>>((acc, s) => {
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
              className="bg-accent text-foreground hover:bg-accent-hover rounded-md px-3 py-1 text-xs font-medium transition-colors disabled:opacity-40"
            >
              {isSubmitting ? 'Replying...' : 'Reply'}
            </button>
          </div>
        ) : null}
      </div>
    </div>
  )
}

// ────────────────────────────────────────────────────────────
// InlineDiffCommentComposer
// ────────────────────────────────────────────────────────────

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
            className="bg-accent text-foreground hover:bg-accent-hover rounded-md px-3 py-1.5 text-xs font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-40"
          >
            {isSubmitting ? 'Adding...' : claudeMention ? 'Ask Claude' : 'Add comment'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ────────────────────────────────────────────────────────────
// SubmitReviewDialog
// ────────────────────────────────────────────────────────────

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

// ────────────────────────────────────────────────────────────
// File tree (unchanged)
// ────────────────────────────────────────────────────────────

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

function FileTree({
  tree,
  activeFilePath,
  commentCountsByFile,
  onSelectFile
}: {
  tree: FileTreeNode[]
  activeFilePath: string | null
  commentCountsByFile: Map<string, number>
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
            commentCount={commentCountsByFile.get(node.path) ?? 0}
            onClick={() => onSelectFile(node.path)}
          />
        ) : (
          <FileTreeFolder
            key={node.path}
            node={node}
            depth={0}
            activeFilePath={activeFilePath}
            commentCountsByFile={commentCountsByFile}
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
  commentCountsByFile,
  onSelectFile
}: {
  node: FileTreeNode
  depth: number
  activeFilePath: string | null
  commentCountsByFile: Map<string, number>
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
                commentCount={commentCountsByFile.get(child.path) ?? 0}
                onClick={() => onSelectFile(child.path)}
              />
            ) : (
              <FileTreeFolder
                key={child.path}
                node={child}
                depth={depth + 1}
                activeFilePath={activeFilePath}
                commentCountsByFile={commentCountsByFile}
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
  commentCount,
  onClick
}: {
  file: PullRequestFile
  depth: number
  isActive: boolean
  commentCount: number
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
      {commentCount > 0 ? (
        <span className="text-foreground-subtle flex shrink-0 items-center gap-1">
          <MessageSquare size={12} />
          <span className="text-[11px]">{commentCount}</span>
        </span>
      ) : null}
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
