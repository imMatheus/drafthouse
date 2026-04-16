import { Fragment, useEffect, useRef, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  FileDiff,
  FileMinus,
  FilePlus,
  Folder,
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
  PullRequestReviewLineSide
} from '../../../../shared/types'
import ClaudeMentionTextarea, { extractClaudePrompt, isClaudeMention } from '../../components/ClaudeMentionTextarea'
import InlineAgentResponseCard from '../../components/InlineAgentResponseCard'
import { cn } from '../../lib/cn'
import { useSettings } from '../../hooks/useSettings'
import { useTheme } from '../../hooks/useTheme'
import { getLanguageFromPath, tokenizeDiffHunks, type HighlightedToken } from '../../lib/shiki'
import MarkdownBody from './MarkdownBody'
import ReviewThreadCard from './ReviewThreadCard'
import { getDiffThreadKey, parsePullRequestFileDiff, type ParsedDiffHunk } from './pullRequestDiff'
import {
  buildPullRequestReviewThreads,
  DiffStat,
  formatRelativeTime,
  type PullRequestReviewThread
} from './pullRequestShared'

export default function PRFilesTab({
  pr,
  owner,
  repo,
  draftReviewComments,
  onDraftReviewCommentsChange,
  threadJumpTarget,
  agentSessions,
  onAskClaude,
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

  const allFiles = files ?? []
  const filteredFiles = allFiles.filter((file) =>
    file.filename.toLowerCase().includes(filterValue.trim().toLowerCase())
  )
  const reviewThreads = buildPullRequestReviewThreads(reviewComments ?? [])

  const threadsByFile = new Map<string, PullRequestReviewThread[]>()
  for (const thread of reviewThreads) {
    const fileThreads = threadsByFile.get(thread.path) ?? []
    fileThreads.push(thread)
    threadsByFile.set(thread.path, fileThreads)
  }

  const commentCountsByFile = new Map<string, number>()
  for (const comment of reviewComments ?? []) {
    commentCountsByFile.set(comment.path, (commentCountsByFile.get(comment.path) ?? 0) + 1)
  }

  const threadsByKey = new Map<string, PullRequestReviewThread[]>()
  for (const thread of reviewThreads) {
    if (thread.side == null || thread.line == null) continue
    const key = getDiffThreadKey(thread.path, thread.side, thread.line)
    const rowThreads = threadsByKey.get(key) ?? []
    rowThreads.push(thread)
    threadsByKey.set(key, rowThreads)
  }

  const threadsByCommentId = new Map(reviewThreads.map((thread) => [thread.topLevelComment.id, thread]))

  const draftCommentsByKey = new Map<string, Array<{ comment: PullRequestReviewDraftComment; index: number }>>()
  draftReviewComments.forEach((comment, index) => {
    const key = getDiffThreadKey(comment.path, comment.side, comment.line)
    const rowComments = draftCommentsByKey.get(key) ?? []
    rowComments.push({ comment, index })
    draftCommentsByKey.set(key, rowComments)
  })

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
          if (nextPath) {
            setActiveFilePath(nextPath)
          }
        }
      },
      {
        threshold: [0.1, 0.35, 0.6],
        rootMargin: '-15% 0px -55% 0px'
      }
    )

    for (const file of filteredFiles) {
      const element = fileSectionRefs.current.get(file.filename)
      if (element) {
        observer.observe(element)
      }
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

      const fileElement = fileSectionRefs.current.get(nextPath)
      fileElement?.scrollIntoView({ behavior: 'smooth', block: 'start' })
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
      queryClient.invalidateQueries({
        queryKey: ['pull-request-review-comments', owner, repo, pr.number]
      }),
      queryClient.invalidateQueries({ queryKey: ['pull-request-reviews', owner, repo, pr.number] })
    ])
  }

  return (
    <>
      <div className="flex gap-2">
        <div className="sticky top-1 hidden h-[calc(100vh-11rem)] shrink-0 lg:flex">
          {fileListCollapsed ? (
            <button
              onClick={() => setFileListCollapsed(false)}
              className="flex size-6 -translate-x-1.5 items-center justify-center self-start rounded text-foreground-subtle transition-colors hover:bg-surface-hover hover:text-foreground"
              title="Show file list"
            >
              <ChevronRight size={14} />
            </button>
          ) : null}

          <aside
            className={cn(
              'flex flex-col overflow-hidden transition-all duration-200',
              fileListCollapsed ? 'w-0 opacity-0' : 'w-72 opacity-100'
            )}
          >
            <div className="flex items-center gap-2 px-2 py-2">
              <Search size={14} className="shrink-0 text-foreground-subtle" />
              <input
                value={filterValue}
                onChange={(event) => setFilterValue(event.target.value)}
                placeholder="Filter files..."
                className="w-full bg-transparent text-sm text-foreground placeholder:text-foreground-subtle focus:outline-none"
              />
              {filterValue ? (
                <button
                  type="button"
                  onClick={() => setFilterValue('')}
                  className="shrink-0 text-foreground-subtle hover:text-foreground"
                >
                  <X size={14} />
                </button>
              ) : null}
              <button
                onClick={() => setFileListCollapsed(true)}
                className="flex size-6 shrink-0 items-center justify-center rounded text-foreground-subtle transition-colors hover:bg-surface-hover hover:text-foreground"
                title="Hide file list"
              >
                <ChevronLeft size={14} />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto">
              {filteredFiles.length === 0 && !isLoading ? (
                <div className="px-3 py-4 text-xs text-foreground-muted">No files match this filter.</div>
              ) : (
                <FileTree
                  files={filteredFiles}
                  activeFilePath={activeFilePath}
                  commentCountsByFile={commentCountsByFile}
                  onSelectFile={handleScrollToFile}
                />
              )}
            </div>

            {draftReviewComments.length > 0 ? (
              <div className="border-t border-border px-2 py-2">
                <button
                  type="button"
                  onClick={() => setIsSubmitReviewOpen(true)}
                  className="w-full rounded-md bg-accent px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-accent-hover"
                >
                  Submit review ({draftReviewComments.length})
                </button>
              </div>
            ) : null}
          </aside>
        </div>

        <div className="min-w-0 flex-1">
          {filesErrorMessage ? (
            <div className="rounded-xl border border-border bg-surface px-4 py-3">
              <p className="text-sm text-foreground-muted">{filesErrorMessage.message}</p>
            </div>
          ) : null}

          {isLoading ? <p className="text-sm text-foreground-muted">Loading changed files...</p> : null}

          <div className="flex flex-col gap-5">
            {filteredFiles.map((file) => (
              <PullRequestFileDiffCard
                key={file.filename}
                owner={owner}
                repo={repo}
                number={pr.number}
                commitId={pr.head.sha}
                file={file}
                auth={auth}
                fileThreads={threadsByFile.get(file.filename) ?? []}
                threadsByKey={threadsByKey}
                draftCommentsByKey={draftCommentsByKey}
                openCommentKey={openCommentKey}
                onOpenComment={setOpenCommentKey}
                onAskClaude={onAskClaude}
                fileAgentSessions={(agentSessions ?? []).filter(
                  (s) => s.context?.filePath === file.filename && s.context?.inline
                )}
                onContinueAgent={onContinueAgent}
                onStopAgent={onStopAgent}
                onPromoteAgent={onPromoteAgent}
                onAddDraftComment={handleAddDraftComment}
                onRemoveDraftComment={handleRemoveDraftComment}
                onInlineCommentPosted={handleInlineCommentPosted}
                sectionRef={(element) => {
                  if (element) {
                    fileSectionRefs.current.set(file.filename, element)
                  } else {
                    fileSectionRefs.current.delete(file.filename)
                  }
                }}
                threadRef={(commentId, element) => {
                  if (element) {
                    threadRefs.current.set(commentId, element)
                  } else {
                    threadRefs.current.delete(commentId)
                  }
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
            queryClient.invalidateQueries({
              queryKey: ['pull-request-review-comments', owner, repo, pr.number]
            }),
            queryClient.invalidateQueries({
              queryKey: ['pull-request-reviews', owner, repo, pr.number]
            })
          ])
        }}
      />
    </>
  )
}

function PullRequestFileDiffCard({
  owner,
  repo,
  number,
  commitId,
  file,
  auth,
  fileThreads,
  threadsByKey,
  draftCommentsByKey,
  openCommentKey,
  onOpenComment,
  onAskClaude,
  fileAgentSessions,
  onContinueAgent,
  onStopAgent,
  onPromoteAgent,
  onAddDraftComment,
  onRemoveDraftComment,
  onInlineCommentPosted,
  sectionRef,
  threadRef
}: {
  owner: string
  repo: string
  number: number
  commitId: string
  file: PullRequestFile
  auth: AuthData | null | undefined
  fileThreads: PullRequestReviewThread[]
  threadsByKey: Map<string, PullRequestReviewThread[]>
  draftCommentsByKey: Map<string, Array<{ comment: PullRequestReviewDraftComment; index: number }>>
  openCommentKey: string | null
  onOpenComment: (value: string | null) => void
  onAskClaude?: (
    prompt: string,
    filePath: string,
    lineNumber: number,
    lineContent: string,
    side: PullRequestReviewLineSide
  ) => Promise<void>
  fileAgentSessions: AgentSession[]
  onContinueAgent?: (sessionId: string, prompt: string, files?: string[]) => Promise<void>
  onStopAgent?: (sessionId: string) => Promise<void>
  onPromoteAgent?: (sessionId: string) => void
  onAddDraftComment: (comment: PullRequestReviewDraftComment) => void
  onRemoveDraftComment: (index: number) => void
  onInlineCommentPosted: () => Promise<void>
  sectionRef: (element: HTMLElement | null) => void
  threadRef: (commentId: number, element: HTMLElement | null) => void
}) {
  const { theme } = useTheme()
  const { settings } = useSettings()
  const parsedDiff = parsePullRequestFileDiff(file)
  const [tokenMap, setTokenMap] = useState<Map<string, HighlightedToken[]>>(new Map())

  useEffect(() => {
    const lang = getLanguageFromPath(file.filename)
    tokenizeDiffHunks(parsedDiff.hunks, lang, theme).then(setTokenMap)
  }, [file.patch, file.filename, theme])

  const anchoredThreadIds = new Set<number>()

  for (const hunk of parsedDiff.hunks) {
    for (const line of hunk.lines) {
      if (!line.commentSide || !line.commentLine) continue
      const rowThreads = threadsByKey.get(getDiffThreadKey(file.filename, line.commentSide, line.commentLine)) ?? []
      rowThreads.forEach((thread) => anchoredThreadIds.add(thread.id))
    }
  }

  const unanchoredThreads = fileThreads.filter((thread) => !anchoredThreadIds.has(thread.id))
  const replyTarget = { owner, repo, number }

  return (
    <section
      ref={sectionRef}
      data-file-path={file.filename}
      className="overflow-hidden rounded-xl border border-border bg-surface"
    >
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span
              className={cn('rounded-full px-2 py-0.5 text-[11px] font-medium', getFileStatusClassName(file.status))}
            >
              {formatFileStatus(file.status)}
            </span>
            <span className="truncate text-sm font-semibold text-foreground">{file.filename}</span>
          </div>
          {file.previous_filename ? (
            <p className="mt-1 text-xs text-foreground-muted">Renamed from {file.previous_filename}</p>
          ) : null}
        </div>

        <div className="flex items-center gap-3">
          <DiffStat additions={file.additions} deletions={file.deletions} />
          <a
            href={file.blob_url}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-interactive px-3 py-2 text-xs font-medium text-foreground transition-colors hover:bg-interactive-hover"
          >
            View
            <ExternalLink size={13} />
          </a>
        </div>
      </header>

      {parsedDiff.hasRenderablePatch ? (
        settings.diffViewMode === 'split' ? (
          <SplitPRDiff
            hunks={parsedDiff.hunks}
            tokenMap={tokenMap}
            filename={file.filename}
            owner={owner}
            repo={repo}
            number={number}
            commitId={commitId}
            auth={auth}
            threadsByKey={threadsByKey}
            draftCommentsByKey={draftCommentsByKey}
            openCommentKey={openCommentKey}
            onOpenComment={onOpenComment}
            onAskClaude={onAskClaude}
            fileAgentSessions={fileAgentSessions}
            onContinueAgent={onContinueAgent}
            onStopAgent={onStopAgent}
            onPromoteAgent={onPromoteAgent}
            onAddDraftComment={onAddDraftComment}
            onRemoveDraftComment={onRemoveDraftComment}
            onInlineCommentPosted={onInlineCommentPosted}
            replyTarget={replyTarget}
            threadRef={threadRef}
          />
        ) : (
          <UnifiedPRDiff
            hunks={parsedDiff.hunks}
            tokenMap={tokenMap}
            filename={file.filename}
            owner={owner}
            repo={repo}
            number={number}
            commitId={commitId}
            auth={auth}
            threadsByKey={threadsByKey}
            draftCommentsByKey={draftCommentsByKey}
            openCommentKey={openCommentKey}
            onOpenComment={onOpenComment}
            onAskClaude={onAskClaude}
            fileAgentSessions={fileAgentSessions}
            onContinueAgent={onContinueAgent}
            onStopAgent={onStopAgent}
            onPromoteAgent={onPromoteAgent}
            onAddDraftComment={onAddDraftComment}
            onRemoveDraftComment={onRemoveDraftComment}
            onInlineCommentPosted={onInlineCommentPosted}
            replyTarget={replyTarget}
            threadRef={threadRef}
          />
        )
      ) : (
        <div className="px-4 py-6 text-sm text-foreground-muted">
          GitHub did not return a renderable patch for this file.
        </div>
      )}

      {unanchoredThreads.length > 0 ? (
        <div className="border-t border-border px-4 py-4">
          <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-foreground-muted">Other comments</p>
          <div className="flex flex-col gap-3">
            {unanchoredThreads.map((thread) => (
              <div key={`unanchored-${thread.id}`} ref={(element) => threadRef(thread.id, element)}>
                <ReviewThreadCard thread={thread} replyTarget={replyTarget} />
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </section>
  )
}

function InlineDiffThread({
  thread,
  replyTarget
}: {
  thread: PullRequestReviewThread
  replyTarget: { owner: string; repo: string; number: number }
}) {
  const [replyBody, setReplyBody] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
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

  const allComments = [thread.topLevelComment, ...thread.replies]

  return (
    <div>
      {allComments.map((comment) => (
        <div key={comment.id} className="py-2">
          <div className="flex items-center gap-2">
            <img src={comment.user.avatar_url} alt={comment.user.login} className="size-5 rounded-full" />
            <span className="text-xs font-semibold text-foreground">{comment.user.login}</span>
            <span className="text-xs text-foreground-subtle">{formatRelativeTime(comment.created_at)}</span>
          </div>
          <div className="mt-1 pl-7">
            <MarkdownBody>{comment.body}</MarkdownBody>
          </div>
        </div>
      ))}

      <div className="pt-1 pb-1">
        <textarea
          value={replyBody}
          onChange={(e) => setReplyBody(e.target.value)}
          placeholder="Write a reply"
          className="w-full resize-none rounded border border-border bg-surface px-2.5 py-1.5 text-xs text-foreground placeholder:text-foreground-subtle focus:border-accent focus:outline-none"
          rows={1}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
              e.preventDefault()
              handleReply()
            }
          }}
        />
        {errorMessage ? <p className="mt-1 text-xs text-danger">{errorMessage}</p> : null}
        {replyBody.trim() ? (
          <div className="mt-1.5 flex items-center justify-end">
            <button
              type="button"
              onClick={handleReply}
              disabled={isSubmitting}
              className="rounded-md bg-accent px-3 py-1 text-xs font-medium text-foreground transition-colors hover:bg-accent-hover disabled:opacity-40"
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
      await window.api.github.pullComments.create(owner, repo, number, {
        body,
        commitId,
        path,
        line,
        side
      })
      setBody('')
      await onInlineCommentPosted()
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Unable to add review comment.')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="rounded-xl border border-border bg-surface">
      <div className="border-b border-border px-4 py-3 text-sm font-medium text-foreground">
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
      {errorMessage ? <p className="px-4 text-sm text-danger">{errorMessage}</p> : null}
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border px-4 py-3">
        <p className="text-xs text-foreground-subtle">
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
            className="rounded-md border border-border bg-interactive px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-interactive-hover"
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
              className="rounded-md border border-border bg-interactive px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-interactive-hover disabled:cursor-not-allowed disabled:opacity-40"
            >
              Add to review
            </button>
          )}
          <button
            type="button"
            onClick={handleAddSingleComment}
            disabled={!body.trim() || isSubmitting}
            className="rounded-md bg-accent px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-40"
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

  if (!open) {
    return null
  }

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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 px-4">
      <div className="w-full max-w-2xl rounded-2xl border border-border bg-surface shadow-2xl">
        <div className="flex items-center justify-between gap-3 border-b border-border px-5 py-4">
          <div>
            <h2 className="text-lg font-semibold text-foreground">Submit review</h2>
            <p className="mt-1 text-sm text-foreground-muted">
              {draftReviewComments.length} pending comment
              {draftReviewComments.length !== 1 ? 's' : ''}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex size-8 items-center justify-center rounded-md text-foreground-muted transition-colors hover:bg-interactive hover:text-foreground"
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
            className="min-h-36 w-full resize-y rounded-xl border border-border bg-background px-4 py-3 text-sm text-foreground placeholder:text-foreground-subtle focus:outline-none"
          />
          {errorMessage ? <p className="mt-3 text-sm text-danger">{errorMessage}</p> : null}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border px-5 py-4">
          <p className="text-sm text-foreground-muted">Inline comments will be submitted with this review.</p>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-md border border-border bg-interactive px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-interactive-hover"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => void handleSubmit('COMMENT')}
              disabled={isSubmitting}
              className="rounded-md border border-border bg-interactive px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-interactive-hover disabled:cursor-not-allowed disabled:opacity-40"
            >
              Comment
            </button>
            <button
              type="button"
              onClick={() => void handleSubmit('APPROVE')}
              disabled={isSubmitting}
              className="rounded-md bg-success px-4 py-2 text-sm font-medium text-foreground transition-opacity disabled:cursor-not-allowed disabled:opacity-40"
            >
              Approve
            </button>
            <button
              type="button"
              onClick={() => void handleSubmit('REQUEST_CHANGES')}
              disabled={isSubmitting}
              className="rounded-md bg-danger px-4 py-2 text-sm font-medium text-foreground transition-opacity disabled:cursor-not-allowed disabled:opacity-40"
            >
              Request changes
            </button>
          </div>
        </div>
      </div>
    </div>
  )
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

    return {
      ...current,
      name: segments.join('/'),
      children: collapseSingleChildFolders(current.children)
    }
  })
}

function FileTree({
  files,
  activeFilePath,
  commentCountsByFile,
  onSelectFile
}: {
  files: PullRequestFile[]
  activeFilePath: string | null
  commentCountsByFile: Map<string, number>
  onSelectFile: (path: string) => void
}) {
  const tree = buildFileTree(files)

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
        className="flex w-full items-center gap-1.5 py-1 text-left text-xs text-foreground hover:bg-surface-hover"
        style={{ paddingLeft: 8 + depth * 16 }}
      >
        <ChevronDown
          size={14}
          className={cn('shrink-0 text-foreground-subtle transition-transform', !isOpen && '-rotate-90')}
        />
        <Folder size={14} className="shrink-0 text-foreground-subtle" />
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
        <span className="flex shrink-0 items-center gap-1 text-foreground-subtle">
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
      return <FilePlus size={14} className="shrink-0 text-success" />
    case 'removed':
      return <FileMinus size={14} className="shrink-0 text-danger" />
    default:
      return <FileDiff size={14} className="shrink-0 text-foreground-subtle" />
  }
}

function getFileStatusClassName(status: string): string {
  switch (status) {
    case 'added':
      return 'bg-success/10 text-success'
    case 'removed':
      return 'bg-danger/10 text-danger'
    case 'renamed':
      return 'bg-purple/10 text-purple'
    default:
      return 'bg-interactive text-foreground-muted'
  }
}

function formatFileStatus(status: string): string {
  switch (status) {
    case 'added':
      return 'Added'
    case 'removed':
      return 'Removed'
    case 'renamed':
      return 'Renamed'
    case 'modified':
      return 'Modified'
    default:
      return status
  }
}

function UnifiedPRDiff({
  hunks,
  tokenMap,
  filename,
  owner,
  repo,
  number,
  commitId,
  auth,
  threadsByKey,
  draftCommentsByKey,
  openCommentKey,
  onOpenComment,
  onAskClaude,
  fileAgentSessions,
  onContinueAgent,
  onStopAgent,
  onPromoteAgent,
  onAddDraftComment,
  onRemoveDraftComment,
  onInlineCommentPosted,
  replyTarget,
  threadRef
}: {
  hunks: ParsedDiffHunk[]
  tokenMap: Map<string, HighlightedToken[]>
  filename: string
  owner: string
  repo: string
  number: number
  commitId: string
  auth: AuthData | null | undefined
  threadsByKey: Map<string, PullRequestReviewThread[]>
  draftCommentsByKey: Map<string, Array<{ comment: PullRequestReviewDraftComment; index: number }>>
  openCommentKey: string | null
  onOpenComment: (value: string | null) => void
  onAskClaude?: (
    prompt: string,
    filePath: string,
    lineNumber: number,
    lineContent: string,
    side: PullRequestReviewLineSide
  ) => Promise<void>
  fileAgentSessions: AgentSession[]
  onContinueAgent?: (sessionId: string, prompt: string, files?: string[]) => Promise<void>
  onStopAgent?: (sessionId: string) => Promise<void>
  onPromoteAgent?: (sessionId: string) => void
  onAddDraftComment: (comment: PullRequestReviewDraftComment) => void
  onRemoveDraftComment: (index: number) => void
  onInlineCommentPosted: () => Promise<void>
  replyTarget: { owner: string; repo: string; number: number }
  threadRef: (commentId: number, element: HTMLElement | null) => void
}) {
  return (
    <div className="overflow-x-auto">
      <table className="min-w-full border-collapse text-sm">
        <tbody>
          {hunks.map((hunk) => (
            <Fragment key={hunk.id}>
              {hunk.header ? (
                <tr className="bg-interactive">
                  <td className="w-12 border-r border-border px-3 py-1.5 text-right font-mono text-xs text-foreground-subtle">
                    ...
                  </td>
                  <td className="w-12 border-r border-border px-3 py-1.5 text-right font-mono text-xs text-foreground-subtle">
                    ...
                  </td>
                  <td className="px-3 py-1.5 font-mono text-[13px] text-foreground-muted">{hunk.header}</td>
                </tr>
              ) : null}

              {hunk.lines.map((line) => {
                const rowKey =
                  line.commentSide && line.commentLine
                    ? getDiffThreadKey(filename, line.commentSide, line.commentLine)
                    : null
                const rowThreads = rowKey ? (threadsByKey.get(rowKey) ?? []) : []
                const draftComments = rowKey ? (draftCommentsByKey.get(rowKey) ?? []) : []
                const isComposerOpen = rowKey != null && openCommentKey === rowKey

                return (
                  <Fragment key={line.id}>
                    <tr className={cn('group', getFileDiffRowClassName(line.kind))}>
                      <td className="relative w-12 border-r border-border px-3 py-1.5 text-right font-mono text-xs text-foreground-subtle">
                        {rowKey ? (
                          <button
                            type="button"
                            onClick={() => onOpenComment(isComposerOpen ? null : rowKey)}
                            className="absolute left-0 top-1/2 -translate-y-1/2 ml-0.5 hidden size-5 items-center justify-center rounded bg-accent text-white group-hover:inline-flex"
                            aria-label="Add line comment"
                          >
                            <Plus size={12} />
                          </button>
                        ) : null}
                        {line.oldLineNumber ?? ''}
                      </td>
                      <td className="w-12 border-r border-border px-3 py-1.5 text-right font-mono text-xs text-foreground-subtle">
                        {line.newLineNumber ?? ''}
                      </td>
                      <td className="px-3 py-1.5 font-mono text-[13px] text-foreground">
                        <span className="mr-3 inline-block w-3 text-center text-foreground-muted">
                          {getFileDiffPrefix(line.kind)}
                        </span>
                        <DiffLineContent tokens={tokenMap.get(line.id)} fallback={line.content} />
                      </td>
                    </tr>

                    {rowThreads.map((thread) => (
                      <tr key={`thread-${thread.id}`} ref={(element) => threadRef(thread.id, element)}>
                        <td colSpan={3} className="border-b border-border bg-background px-4 py-1">
                          <InlineDiffThread thread={thread} replyTarget={replyTarget} />
                        </td>
                      </tr>
                    ))}

                    {draftComments.map(({ comment, index }) => (
                      <tr key={`draft-${rowKey}-${index}`}>
                        <td colSpan={3} className="bg-background px-3 py-3">
                          <div className="rounded-xl border border-border bg-surface">
                            <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
                              <div className="flex items-center gap-2">
                                {auth?.user.avatar_url ? (
                                  <img
                                    src={auth.user.avatar_url}
                                    alt={auth.user.login}
                                    className="size-7 rounded-full"
                                  />
                                ) : null}
                                <div className="text-sm text-foreground">
                                  <span className="font-semibold">{auth?.user.login ?? 'You'}</span>{' '}
                                  <span className="text-foreground-muted">pending review comment</span>
                                </div>
                              </div>
                              <button
                                type="button"
                                onClick={() => onRemoveDraftComment(index)}
                                className="inline-flex size-7 items-center justify-center rounded-md text-foreground-muted transition-colors hover:bg-interactive hover:text-foreground"
                                aria-label="Remove draft comment"
                              >
                                <X size={14} />
                              </button>
                            </div>
                            <div className="px-4 py-4">
                              <MarkdownBody>{comment.body}</MarkdownBody>
                            </div>
                          </div>
                        </td>
                      </tr>
                    ))}

                    {isComposerOpen && rowKey && line.commentSide && line.commentLine ? (
                      <tr>
                        <td colSpan={3} className="bg-background px-3 py-3">
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

                    {line.commentLine &&
                      fileAgentSessions
                        .filter((s) => s.context?.lineNumber === line.commentLine)
                        .map((session) => (
                          <tr key={`agent-${session.id}`}>
                            <td colSpan={3} className="bg-background px-3 py-3">
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
            </Fragment>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function SplitPRDiff({
  hunks,
  tokenMap,
  filename,
  owner,
  repo,
  number,
  commitId,
  auth,
  threadsByKey,
  draftCommentsByKey,
  openCommentKey,
  onOpenComment,
  onAskClaude,
  fileAgentSessions,
  onContinueAgent,
  onStopAgent,
  onPromoteAgent,
  onAddDraftComment,
  onRemoveDraftComment,
  onInlineCommentPosted,
  replyTarget,
  threadRef
}: {
  hunks: ParsedDiffHunk[]
  tokenMap: Map<string, HighlightedToken[]>
  filename: string
  owner: string
  repo: string
  number: number
  commitId: string
  auth: AuthData | null | undefined
  threadsByKey: Map<string, PullRequestReviewThread[]>
  draftCommentsByKey: Map<string, Array<{ comment: PullRequestReviewDraftComment; index: number }>>
  openCommentKey: string | null
  onOpenComment: (value: string | null) => void
  onAskClaude?: (
    prompt: string,
    filePath: string,
    lineNumber: number,
    lineContent: string,
    side: PullRequestReviewLineSide
  ) => Promise<void>
  fileAgentSessions: AgentSession[]
  onContinueAgent?: (sessionId: string, prompt: string, files?: string[]) => Promise<void>
  onStopAgent?: (sessionId: string) => Promise<void>
  onPromoteAgent?: (sessionId: string) => void
  onAddDraftComment: (comment: PullRequestReviewDraftComment) => void
  onRemoveDraftComment: (index: number) => void
  onInlineCommentPosted: () => Promise<void>
  replyTarget: { owner: string; repo: string; number: number }
  threadRef: (commentId: number, element: HTMLElement | null) => void
}) {
  // Flatten all lines from all hunks and align deletions with additions
  const allLines = hunks.flatMap((h) => h.lines)

  type AlignedPair = { left: (typeof allLines)[0] | null; right: (typeof allLines)[0] | null }
  const pairs: AlignedPair[] = []
  let i = 0

  while (i < allLines.length) {
    const line = allLines[i]

    if (line.kind === 'context' || line.kind === 'meta' || line.kind === 'hunk') {
      pairs.push({ left: line, right: line })
      i++
      continue
    }

    const deletions: typeof allLines = []
    const additions: typeof allLines = []

    while (i < allLines.length && allLines[i].kind === 'deletion') {
      deletions.push(allLines[i])
      i++
    }
    while (i < allLines.length && allLines[i].kind === 'addition') {
      additions.push(allLines[i])
      i++
    }

    const maxLen = Math.max(deletions.length, additions.length)
    for (let j = 0; j < maxLen; j++) {
      pairs.push({
        left: j < deletions.length ? deletions[j] : null,
        right: j < additions.length ? additions[j] : null
      })
    }
  }

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
          {pairs.map((pair, idx) => {
            const leftKey =
              pair.left?.commentSide && pair.left.commentLine
                ? getDiffThreadKey(filename, pair.left.commentSide, pair.left.commentLine)
                : null
            const rightKey =
              pair.right?.commentSide && pair.right.commentLine
                ? getDiffThreadKey(filename, pair.right.commentSide, pair.right.commentLine)
                : null

            // Collect threads and drafts from both sides
            const leftThreads = leftKey ? (threadsByKey.get(leftKey) ?? []) : []
            const rightThreads = rightKey && rightKey !== leftKey ? (threadsByKey.get(rightKey) ?? []) : []
            const rowThreads = [...leftThreads, ...rightThreads]

            const leftDrafts = leftKey ? (draftCommentsByKey.get(leftKey) ?? []) : []
            const rightDrafts = rightKey && rightKey !== leftKey ? (draftCommentsByKey.get(rightKey) ?? []) : []
            const draftComments = [...leftDrafts, ...rightDrafts]

            const isLeftComposerOpen = leftKey != null && openCommentKey === leftKey
            const isRightComposerOpen = rightKey != null && openCommentKey === rightKey

            return (
              <Fragment key={idx}>
                <tr>
                  {/* Left side (original) */}
                  <td
                    className={cn(
                      'group/left relative border-r border-border px-2 py-0 text-right font-mono text-xs text-foreground-subtle',
                      pair.left?.kind === 'deletion' ? 'bg-danger/10' : 'bg-background'
                    )}
                  >
                    {leftKey && pair.left ? (
                      <button
                        type="button"
                        onClick={() => onOpenComment(isLeftComposerOpen ? null : leftKey)}
                        className="absolute left-0 top-1/2 -translate-y-1/2 ml-0.5 hidden size-5 items-center justify-center rounded bg-accent text-white group-hover/left:inline-flex"
                        aria-label="Add line comment"
                      >
                        <Plus size={12} />
                      </button>
                    ) : null}
                    {pair.left?.oldLineNumber ?? ''}
                  </td>
                  <td
                    className={cn(
                      'overflow-hidden border-r border-border px-3 py-0 font-mono text-[13px] whitespace-pre-wrap break-all',
                      pair.left?.kind === 'deletion'
                        ? 'bg-danger/10 text-foreground'
                        : pair.left
                          ? 'bg-background text-foreground'
                          : 'bg-surface'
                    )}
                  >
                    {pair.left ? (
                      <DiffLineContent tokens={tokenMap.get(pair.left.id)} fallback={pair.left.content} />
                    ) : (
                      '\u00A0'
                    )}
                  </td>

                  {/* Right side (modified) */}
                  <td
                    className={cn(
                      'group/right relative border-r border-border px-2 py-0 text-right font-mono text-xs text-foreground-subtle',
                      pair.right?.kind === 'addition' ? 'bg-success/10' : 'bg-background'
                    )}
                  >
                    {rightKey && pair.right ? (
                      <button
                        type="button"
                        onClick={() => onOpenComment(isRightComposerOpen ? null : rightKey)}
                        className="absolute left-0 top-1/2 -translate-y-1/2 ml-0.5 hidden size-5 items-center justify-center rounded bg-accent text-white group-hover/right:inline-flex"
                        aria-label="Add line comment"
                      >
                        <Plus size={12} />
                      </button>
                    ) : null}
                    {pair.right?.newLineNumber ?? ''}
                  </td>
                  <td
                    className={cn(
                      'overflow-hidden px-3 py-0 font-mono text-[13px] whitespace-pre-wrap break-all',
                      pair.right?.kind === 'addition'
                        ? 'bg-success/10 text-foreground'
                        : pair.right
                          ? 'bg-background text-foreground'
                          : 'bg-surface'
                    )}
                  >
                    {pair.right ? (
                      <DiffLineContent tokens={tokenMap.get(pair.right.id)} fallback={pair.right.content} />
                    ) : (
                      '\u00A0'
                    )}
                  </td>
                </tr>

                {rowThreads.map((thread) => {
                  const isLeft = thread.side === 'LEFT'
                  return (
                    <tr key={`thread-${thread.id}`} ref={(element) => threadRef(thread.id, element)}>
                      {isLeft ? (
                        <>
                          <td className="border-r border-border" />
                          <td className="border-r border-border px-3 py-2 align-top">
                            <InlineDiffThread thread={thread} replyTarget={replyTarget} />
                          </td>
                          <td className="border-r border-border" />
                          <td />
                        </>
                      ) : (
                        <>
                          <td className="border-r border-border" />
                          <td className="border-r border-border" />
                          <td className="border-r border-border" />
                          <td className="px-3 py-2 align-top">
                            <InlineDiffThread thread={thread} replyTarget={replyTarget} />
                          </td>
                        </>
                      )}
                    </tr>
                  )
                })}

                {draftComments.map(({ comment, index }) => (
                  <tr key={`draft-${index}`}>
                    <td colSpan={4} className="bg-background px-3 py-3">
                      <div className="rounded-xl border border-border bg-surface">
                        <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
                          <div className="flex items-center gap-2">
                            {auth?.user.avatar_url ? (
                              <img src={auth.user.avatar_url} alt={auth.user.login} className="size-7 rounded-full" />
                            ) : null}
                            <div className="text-sm text-foreground">
                              <span className="font-semibold">{auth?.user.login ?? 'You'}</span>{' '}
                              <span className="text-foreground-muted">pending review comment</span>
                            </div>
                          </div>
                          <button
                            type="button"
                            onClick={() => onRemoveDraftComment(index)}
                            className="inline-flex size-7 items-center justify-center rounded-md text-foreground-muted transition-colors hover:bg-interactive hover:text-foreground"
                            aria-label="Remove draft comment"
                          >
                            <X size={14} />
                          </button>
                        </div>
                        <div className="px-4 py-4">
                          <MarkdownBody>{comment.body}</MarkdownBody>
                        </div>
                      </div>
                    </td>
                  </tr>
                ))}

                {isLeftComposerOpen && leftKey && pair.left?.commentSide && pair.left.commentLine ? (
                  <tr>
                    <td colSpan={2} className="bg-background px-3 py-3">
                      <InlineDiffCommentComposer
                        owner={owner}
                        repo={repo}
                        number={number}
                        commitId={commitId}
                        path={filename}
                        line={pair.left.commentLine}
                        lineContent={pair.left.content}
                        side={pair.left.commentSide}
                        onCancel={() => onOpenComment(null)}
                        onAddDraftComment={onAddDraftComment}
                        onInlineCommentPosted={onInlineCommentPosted}
                        onAskClaude={onAskClaude}
                      />
                    </td>
                    <td colSpan={2} className="bg-background" />
                  </tr>
                ) : null}

                {isRightComposerOpen && rightKey && pair.right?.commentSide && pair.right.commentLine ? (
                  <tr>
                    <td colSpan={2} className="bg-background" />
                    <td colSpan={2} className="bg-background px-3 py-3">
                      <InlineDiffCommentComposer
                        owner={owner}
                        repo={repo}
                        number={number}
                        commitId={commitId}
                        path={filename}
                        line={pair.right.commentLine}
                        lineContent={pair.right.content}
                        side={pair.right.commentSide}
                        onCancel={() => onOpenComment(null)}
                        onAddDraftComment={onAddDraftComment}
                        onInlineCommentPosted={onInlineCommentPosted}
                        onAskClaude={onAskClaude}
                      />
                    </td>
                  </tr>
                ) : null}

                {fileAgentSessions
                  .filter(
                    (s) =>
                      s.context?.lineNumber === pair.left?.commentLine ||
                      s.context?.lineNumber === pair.right?.commentLine
                  )
                  .map((session) => (
                    <tr key={`agent-${session.id}`}>
                      {session.context?.side === 'RIGHT' ? (
                        <>
                          <td colSpan={2} className="bg-background" />
                          <td colSpan={2} className="bg-background px-3 py-3">
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
                          <td colSpan={2} className="bg-background px-3 py-3">
                            <InlineAgentResponseCard
                              session={session}
                              onStop={() => onStopAgent?.(session.id)}
                              onContinue={(prompt) => onContinueAgent?.(session.id, prompt)}
                              onOpenInChat={() => onPromoteAgent?.(session.id)}
                            />
                          </td>
                          <td colSpan={2} className="bg-background" />
                        </>
                      )}
                    </tr>
                  ))}
              </Fragment>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

function getFileDiffRowClassName(kind: 'hunk' | 'addition' | 'deletion' | 'context' | 'meta'): string {
  if (kind === 'addition') return 'bg-success/10'
  if (kind === 'deletion') return 'bg-danger/10'
  if (kind === 'meta') return 'bg-surface'
  return 'bg-background'
}

function getFileDiffPrefix(kind: 'hunk' | 'addition' | 'deletion' | 'context' | 'meta'): string {
  if (kind === 'addition') return '+'
  if (kind === 'deletion') return '-'
  if (kind === 'meta') return '\\'
  return ' '
}
