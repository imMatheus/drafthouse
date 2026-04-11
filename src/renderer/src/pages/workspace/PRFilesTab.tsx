import { Fragment, useEffect, useRef, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { ExternalLink, FileCode, MessageSquarePlus, Search, X } from 'lucide-react'
import type {
  AuthData,
  PullRequestDetail,
  PullRequestFile,
  PullRequestReviewComment,
  PullRequestReviewDraftComment,
  PullRequestReviewEvent,
  PullRequestReviewLineSide
} from '../../../../shared/types'
import { useTheme } from '../../hooks/useTheme'
import {
  getLanguageFromPath,
  tokenizeDiffHunks,
  type HighlightedToken
} from '../../lib/shiki'
import MarkdownBody from './MarkdownBody'
import ReviewThreadCard from './ReviewThreadCard'
import { getDiffThreadKey, parsePullRequestFileDiff } from './pullRequestDiff'
import { buildPullRequestReviewThreads, DiffStat, type PullRequestReviewThread } from './pullRequestShared'

export default function PRFilesTab({
  pr,
  owner,
  repo,
  draftReviewComments,
  onDraftReviewCommentsChange,
  threadJumpTarget
}: {
  pr: PullRequestDetail
  owner: string
  repo: string
  draftReviewComments: PullRequestReviewDraftComment[]
  onDraftReviewCommentsChange: (comments: PullRequestReviewDraftComment[]) => void
  threadJumpTarget: { path: string; commentId: number; nonce: number } | null
}) {
  const [filterValue, setFilterValue] = useState('')
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
    queryFn: () => window.api.auth.getPullRequestFiles(owner, repo, pr.number),
    retry: false
  })
  const {
    data: reviewComments,
    isLoading: isLoadingReviewComments,
    error: reviewCommentsError
  } = useQuery<PullRequestReviewComment[], Error>({
    queryKey: ['pull-request-review-comments', owner, repo, pr.number],
    queryFn: () => window.api.auth.getPullRequestReviewComments(owner, repo, pr.number),
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
    fileSectionRefs.current.get(path)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
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
      <div className="flex gap-5">
        <aside className="sticky top-1 hidden h-[calc(100vh-11rem)] w-72 shrink-0 overflow-hidden rounded-xl border border-border bg-surface lg:block">
          <div className="border-b border-border px-4 py-3">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-foreground">Files changed</p>
                <p className="mt-1 text-xs text-foreground-muted">
                  {allFiles.length} file{allFiles.length !== 1 ? 's' : ''}
                </p>
              </div>
              {draftReviewComments.length > 0 ? (
                <button
                  type="button"
                  onClick={() => setIsSubmitReviewOpen(true)}
                  className="rounded-md bg-accent px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-accent-hover"
                >
                  Submit review
                </button>
              ) : null}
            </div>

            <label className="mt-3 flex items-center gap-2 rounded-lg border border-border bg-background px-3 py-2">
              <Search size={14} className="text-foreground-subtle" />
              <input
                value={filterValue}
                onChange={(event) => setFilterValue(event.target.value)}
                placeholder="Filter files..."
                className="w-full bg-transparent text-sm text-foreground placeholder:text-foreground-subtle focus:outline-none"
              />
            </label>
          </div>

          <div className="h-[calc(100%-5.75rem)] overflow-y-auto py-2">
            {filteredFiles.map((file) => {
              const depth = Math.max(0, file.filename.split('/').length - 1)
              const fileName = getFileName(file.filename)
              const parentPath = getParentPath(file.filename)

              return (
                <button
                  key={file.filename}
                  type="button"
                  onClick={() => handleScrollToFile(file.filename)}
                  className={`flex w-full items-start gap-2 px-3 py-2 text-left transition-colors ${
                    activeFilePath === file.filename ? 'bg-surface-hover' : 'hover:bg-surface-hover'
                  }`}
                  style={{ paddingLeft: 12 + depth * 12 }}
                >
                  <FileCode size={14} className="mt-0.5 shrink-0 text-foreground-subtle" />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-xs font-medium text-foreground">{fileName}</div>
                    {parentPath ? (
                      <div className="truncate text-[11px] text-foreground-subtle">{parentPath}</div>
                    ) : null}
                  </div>
                  <DiffStat additions={file.additions} deletions={file.deletions} />
                </button>
              )
            })}

            {!isLoading && filteredFiles.length === 0 ? (
              <div className="px-4 py-6 text-sm text-foreground-muted">No files match this filter.</div>
            ) : null}
          </div>
        </aside>

        <div className="min-w-0 flex-1">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-surface px-4 py-3">
            <div>
              <p className="text-sm font-semibold text-foreground">
                {pr.changed_files} file{pr.changed_files !== 1 ? 's' : ''} changed
              </p>
              <p className="mt-1 text-sm text-foreground-muted">
                {pr.additions} additions and {pr.deletions} deletions
              </p>
            </div>
            {draftReviewComments.length > 0 ? (
              <button
                type="button"
                onClick={() => setIsSubmitReviewOpen(true)}
                className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent-hover"
              >
                Submit review ({draftReviewComments.length})
              </button>
            ) : null}
          </div>

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
  onAddDraftComment: (comment: PullRequestReviewDraftComment) => void
  onRemoveDraftComment: (index: number) => void
  onInlineCommentPosted: () => Promise<void>
  sectionRef: (element: HTMLElement | null) => void
  threadRef: (commentId: number, element: HTMLElement | null) => void
}) {
  const { theme } = useTheme()
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
            <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${getFileStatusClassName(file.status)}`}>
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
        <div className="overflow-x-auto">
          <table className="min-w-full border-collapse text-sm">
            <tbody>
              {parsedDiff.hunks.map((hunk) => (
                <Fragment key={hunk.id}>
                  {hunk.header ? (
                    <tr className="bg-interactive">
                      <td className="w-12 border-r border-border px-3 py-1.5 text-right font-mono text-xs text-foreground-subtle">
                        ...
                      </td>
                      <td className="w-12 border-r border-border px-3 py-1.5 text-right font-mono text-xs text-foreground-subtle">
                        ...
                      </td>
                      <td className="border-r border-border px-3 py-1.5 font-mono text-[13px] text-foreground-muted">
                        {hunk.header}
                      </td>
                      <td className="w-10 bg-interactive" />
                    </tr>
                  ) : null}

                  {hunk.lines.map((line) => {
                    const rowKey =
                      line.commentSide && line.commentLine
                        ? getDiffThreadKey(file.filename, line.commentSide, line.commentLine)
                        : null
                    const rowThreads = rowKey ? (threadsByKey.get(rowKey) ?? []) : []
                    const draftComments = rowKey ? (draftCommentsByKey.get(rowKey) ?? []) : []
                    const isComposerOpen = rowKey != null && openCommentKey === rowKey

                    return (
                      <Fragment key={line.id}>
                        <tr className={getFileDiffRowClassName(line.kind)}>
                          <td className="w-12 border-r border-border px-3 py-1.5 text-right font-mono text-xs text-foreground-subtle">
                            {line.oldLineNumber ?? ''}
                          </td>
                          <td className="w-12 border-r border-border px-3 py-1.5 text-right font-mono text-xs text-foreground-subtle">
                            {line.newLineNumber ?? ''}
                          </td>
                          <td className="border-r border-border px-3 py-1.5 font-mono text-[13px] text-foreground whitespace-pre">
                            <span className="mr-3 inline-block w-3 text-center text-foreground-muted">
                              {getFileDiffPrefix(line.kind)}
                            </span>
                            <DiffLineContent tokens={tokenMap.get(line.id)} fallback={line.content} />
                          </td>
                          <td className="w-10 px-1 py-1">
                            {rowKey ? (
                              <button
                                type="button"
                                onClick={() => onOpenComment(isComposerOpen ? null : rowKey)}
                                className="inline-flex size-7 items-center justify-center rounded-md text-foreground-muted transition-colors hover:bg-interactive hover:text-foreground"
                                aria-label="Add line comment"
                              >
                                <MessageSquarePlus size={14} />
                              </button>
                            ) : null}
                          </td>
                        </tr>

                        {rowThreads.map((thread) => (
                          <tr key={`thread-${thread.id}`} ref={(element) => threadRef(thread.id, element)}>
                            <td colSpan={4} className="bg-background px-3 py-3">
                              <ReviewThreadCard thread={thread} replyTarget={replyTarget} />
                            </td>
                          </tr>
                        ))}

                        {draftComments.map(({ comment, index }) => (
                          <tr key={`draft-${rowKey}-${index}`}>
                            <td colSpan={4} className="bg-background px-3 py-3">
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
                            <td colSpan={4} className="bg-background px-3 py-3">
                              <InlineDiffCommentComposer
                                owner={owner}
                                repo={repo}
                                number={number}
                                commitId={commitId}
                                path={file.filename}
                                line={line.commentLine}
                                side={line.commentSide}
                                onCancel={() => onOpenComment(null)}
                                onAddDraftComment={onAddDraftComment}
                                onInlineCommentPosted={onInlineCommentPosted}
                              />
                            </td>
                          </tr>
                        ) : null}
                      </Fragment>
                    )
                  })}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
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

function InlineDiffCommentComposer({
  owner,
  repo,
  number,
  commitId,
  path,
  line,
  side,
  onCancel,
  onAddDraftComment,
  onInlineCommentPosted
}: {
  owner: string
  repo: string
  number: number
  commitId: string
  path: string
  line: number
  side: PullRequestReviewLineSide
  onCancel: () => void
  onAddDraftComment: (comment: PullRequestReviewDraftComment) => void
  onInlineCommentPosted: () => Promise<void>
}) {
  const [body, setBody] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  const handleAddSingleComment = async (): Promise<void> => {
    if (!body.trim() || isSubmitting) return

    setIsSubmitting(true)
    setErrorMessage(null)

    try {
      await window.api.auth.createPullRequestReviewComment(owner, repo, number, {
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
      <textarea
        value={body}
        onChange={(event) => setBody(event.target.value)}
        placeholder="Leave a comment"
        className="min-h-28 w-full resize-y bg-transparent px-4 py-3 text-sm text-foreground placeholder:text-foreground-subtle focus:outline-none"
      />
      {errorMessage ? <p className="px-4 text-sm text-danger">{errorMessage}</p> : null}
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border px-4 py-3">
        <p className="text-xs text-foreground-subtle">
          {side === 'LEFT' ? 'Commenting on the deleted side' : 'Commenting on the updated side'}
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-md border border-border bg-interactive px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-interactive-hover"
          >
            Cancel
          </button>
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
          <button
            type="button"
            onClick={handleAddSingleComment}
            disabled={!body.trim() || isSubmitting}
            className="rounded-md bg-accent px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-40"
          >
            {isSubmitting ? 'Adding...' : 'Add comment'}
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
      await window.api.auth.submitPullRequestReview(owner, repo, number, {
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

function DiffLineContent({
  tokens,
  fallback
}: {
  tokens: HighlightedToken[] | undefined
  fallback: string
}) {
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

function getFileName(path: string): string {
  const parts = path.split('/')
  return parts[parts.length - 1] ?? path
}

function getParentPath(path: string): string {
  const parts = path.split('/')
  parts.pop()
  return parts.join('/')
}
