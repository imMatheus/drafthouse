import { useRef, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Bold,
  Check,
  Code,
  Eye,
  FileCode,
  GitCommit,
  GitPullRequest,
  Heading,
  Italic,
  Link,
  List,
  ListOrdered,
  MessageSquare,
  Quote
} from 'lucide-react'
import { NavLink, Navigate, Route, Routes, useParams } from 'react-router-dom'
import type {
  AuthData,
  PullRequestComment,
  PullRequestDetail,
  PullRequestReview,
  PullRequestReviewComment
} from '../../../../shared/types'
import Markdown from 'react-markdown'
import MarkdownBody from './MarkdownBody'
import PlaceholderView from './PlaceholderView'

interface PullRequestDetailViewProps {
  owner: string
  repo: string
}

export default function PullRequestDetailView({ owner, repo }: PullRequestDetailViewProps) {
  const { number } = useParams<{ number: string }>()

  const {
    data: pr,
    isLoading,
    error
  } = useQuery<PullRequestDetail, Error>({
    queryKey: ['pull-request', owner, repo, number],
    queryFn: () => window.api.auth.getPullRequest(owner, repo, Number(number)),
    retry: false
  })

  console.log({ pr })

  if (isLoading) return <p className="text-sm text-foreground-muted">Loading pull request...</p>

  if (error) {
    return (
      <div className="max-w-xl rounded-lg border border-border bg-surface p-4">
        <h2 className="text-sm font-semibold text-foreground">Pull request unavailable</h2>
        <p className="mt-2 text-sm text-foreground-muted">{error.message}</p>
      </div>
    )
  }

  if (!pr) return null

  const statusColor = pr.draft
    ? 'text-foreground-muted bg-surface'
    : pr.merged
      ? 'text-purple bg-purple/10'
      : pr.state === 'closed'
        ? 'text-danger bg-danger/10'
        : 'text-success bg-success/10'

  const statusLabel = pr.draft ? 'Draft' : pr.merged ? 'Merged' : pr.state === 'closed' ? 'Closed' : 'Open'
  const basePath = `/workspace/pulls/${pr.number}`

  return (
    <div>
      <h1 className="text-xl font-semibold text-foreground">
        {pr.title} <span className="font-normal text-foreground-subtle">#{pr.number}</span>
      </h1>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <span
          className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${statusColor}`}
        >
          <GitPullRequest size={14} />
          {statusLabel}
        </span>
        <p className="text-xs text-foreground-muted">
          <span className="font-medium text-foreground">{pr.user.login}</span> wants to merge {pr.commits} commit
          {pr.commits !== 1 ? 's' : ''} into{' '}
          <code className="rounded bg-surface px-1.5 py-0.5 text-xs text-accent">{pr.base.ref}</code> from{' '}
          <code className="rounded bg-surface px-1.5 py-0.5 text-xs text-accent">{pr.head.ref}</code>
        </p>
        <DiffStat additions={pr.additions} deletions={pr.deletions} />
      </div>

      <nav className="mt-4 flex gap-1 border-b border-border">
        <PRDetailTabLink to={basePath} end icon={<MessageSquare size={14} />}>
          Conversation
        </PRDetailTabLink>
        <PRDetailTabLink to={`${basePath}/commits`} icon={<GitCommit size={14} />} count={pr.commits}>
          Commits
        </PRDetailTabLink>
        <PRDetailTabLink to={`${basePath}/checks`} icon={<Check size={14} />}>
          Checks
        </PRDetailTabLink>
        <PRDetailTabLink to={`${basePath}/files`} icon={<FileCode size={14} />} count={pr.changed_files}>
          Files changed
        </PRDetailTabLink>
      </nav>

      <div className="mt-6">
        <Routes>
          <Route
            index
            element={
              <div className="flex gap-6">
                <div className="min-w-0 flex-1">
                  <PRConversationTab pr={pr} owner={owner} repo={repo} />
                </div>
                <div className="hidden w-48 shrink-0 lg:block">
                  <PRDetailSidebar pr={pr} />
                </div>
              </div>
            }
          />
          <Route
            path="commits"
            element={
              <PlaceholderView
                title="Commits"
                description={`${pr.commits} commit${pr.commits !== 1 ? 's' : ''} in this pull request.`}
              />
            }
          />
          <Route
            path="checks"
            element={
              <PlaceholderView title="Checks" description="Status checks for this pull request will appear here." />
            }
          />
          <Route
            path="files"
            element={
              <PlaceholderView
                title="Files changed"
                description={`${pr.changed_files} file${pr.changed_files !== 1 ? 's' : ''} changed with ${pr.additions} additions and ${pr.deletions} deletions.`}
              />
            }
          />
          <Route path="*" element={<Navigate to={basePath} replace />} />
        </Routes>
      </div>
    </div>
  )
}

function PRDetailTabLink({
  to,
  end,
  children,
  icon,
  count
}: {
  to: string
  end?: boolean
  children: React.ReactNode
  icon: React.ReactNode
  count?: number
}) {
  return (
    <NavLink
      to={to}
      end={end}
      className={({ isActive }) =>
        `inline-flex items-center gap-1.5 border-b-2 px-3 py-2 text-xs font-medium transition-colors ${
          isActive
            ? 'border-foreground-muted text-foreground'
            : 'border-transparent text-foreground-muted hover:text-foreground'
        }`
      }
    >
      {icon}
      {children}
      {typeof count === 'number' ? <span className="text-foreground-subtle">{count}</span> : null}
    </NavLink>
  )
}

function PRConversationTab({ pr, owner, repo }: { pr: PullRequestDetail; owner: string; repo: string }) {
  const {
    data: comments,
    isLoading: isLoadingComments,
    error: commentsError
  } = useQuery<PullRequestComment[], Error>({
    queryKey: ['pull-request-comments', owner, repo, pr.number],
    queryFn: () => window.api.auth.getPullRequestComments(owner, repo, pr.number),
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
  const {
    data: reviews,
    isLoading: isLoadingReviews,
    error: reviewsError
  } = useQuery<PullRequestReview[], Error>({
    queryKey: ['pull-request-reviews', owner, repo, pr.number],
    queryFn: () => window.api.auth.getPullRequestReviews(owner, repo, pr.number),
    retry: false
  })

  console.log({ reviews, reviewComments, comments })

  const timelineItems = buildPullRequestTimelineItems(comments ?? [], reviewComments ?? [], reviews ?? [])
  const conversationError = commentsError ?? reviewCommentsError ?? reviewsError
  const isLoadingConversation = isLoadingComments || isLoadingReviewComments || isLoadingReviews

  return (
    <div className="flex flex-col gap-4">
      {pr.body ? (
        <div className="rounded-lg border border-border bg-surface">
          <div className="flex items-center gap-2 border-b border-border px-4 py-3">
            <img src={pr.user.avatar_url} alt={pr.user.login} className="h-6 w-6 rounded-full" />
            <span className="text-sm font-medium text-foreground">{pr.user.login}</span>
            <span className="text-xs text-foreground-subtle">commented {formatRelativeTime(pr.created_at)}</span>
          </div>
          <MarkdownBody>{pr.body}</MarkdownBody>
        </div>
      ) : (
        <p className="text-sm text-foreground-subtle">No description provided.</p>
      )}

      {conversationError ? (
        <div className="rounded-lg border border-border bg-surface px-4 py-3">
          <p className="text-sm text-foreground-muted">{conversationError.message}</p>
        </div>
      ) : null}

      {isLoadingConversation ? <p className="text-sm text-foreground-muted">Loading conversation...</p> : null}

      {timelineItems.map((item) => (
        <PullRequestTimelineCard key={item.id} item={item} />
      ))}

      <CommentBox owner={owner} repo={repo} number={pr.number} />
    </div>
  )
}

type PullRequestTimelineItem =
  | {
      id: string
      type: 'issue-comment'
      createdAt: string
      body: string
      user: {
        login: string
        avatar_url: string
      }
    }
  | {
      id: string
      type: 'review-block'
      createdAt: string
      review: PullRequestReview | null
      threads: PullRequestReviewThread[]
      user: {
        login: string
        avatar_url: string
      }
    }

interface PullRequestReviewThread {
  id: number
  path: string
  line: number | null
  topLevelComment: PullRequestReviewComment
  replies: PullRequestReviewComment[]
}

function buildPullRequestTimelineItems(
  comments: PullRequestComment[],
  reviewComments: PullRequestReviewComment[],
  reviews: PullRequestReview[]
): PullRequestTimelineItem[] {
  const repliesByParent = new Map<number, PullRequestReviewComment[]>()
  const threadsByReviewId = new Map<number, PullRequestReviewThread[]>()

  for (const comment of reviewComments) {
    if (comment.in_reply_to_id != null) {
      const replies = repliesByParent.get(comment.in_reply_to_id) ?? []
      replies.push(comment)
      repliesByParent.set(comment.in_reply_to_id, replies)
    }
  }

  for (const comment of reviewComments) {
    if (comment.in_reply_to_id != null) continue

    const threads = threadsByReviewId.get(comment.pull_request_review_id) ?? []
    threads.push({
      id: comment.id,
      path: comment.path,
      line: comment.line ?? null,
      topLevelComment: comment,
      replies: (repliesByParent.get(comment.id) ?? []).sort(
        (left, right) => new Date(left.created_at).getTime() - new Date(right.created_at).getTime()
      )
    })
    threadsByReviewId.set(comment.pull_request_review_id, threads)
  }

  const reviewItems: PullRequestTimelineItem[] = reviews
    .filter((review) => review.submitted_at && review.user)
    .map((review) => ({
      id: `review-${review.id}`,
      type: 'review-block' as const,
      createdAt: review.submitted_at!,
      review,
      threads: threadsByReviewId.get(review.id) ?? [],
      user: review.user!
    }))

  const orphanReviewItems: PullRequestTimelineItem[] = Array.from(threadsByReviewId.entries())
    .filter(([reviewId]) => !reviews.some((review) => review.id === reviewId && review.submitted_at && review.user))
    .map(([reviewId, threads]) => ({
      id: `review-${reviewId}`,
      type: 'review-block' as const,
      createdAt: threads[0]?.topLevelComment.created_at ?? new Date(0).toISOString(),
      review: null,
      threads,
      user: threads[0]!.topLevelComment.user
    }))

  return [
    ...comments.map((comment) => ({
      id: `issue-comment-${comment.id}`,
      type: 'issue-comment' as const,
      createdAt: comment.created_at,
      body: comment.body,
      user: comment.user
    })),
    ...reviewItems,
    ...orphanReviewItems
  ].sort((left, right) => new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime())
}

function PullRequestTimelineCard({ item }: { item: PullRequestTimelineItem }) {
  if (item.type === 'issue-comment') {
    return (
      <div className="rounded-lg border border-border bg-surface">
        <div className="flex items-center gap-2 border-b border-border px-4 py-3">
          <img src={item.user.avatar_url} alt={item.user.login} className="h-6 w-6 rounded-full" />
          <span className="text-sm font-medium text-foreground">{item.user.login}</span>
          <span className="text-xs text-foreground-subtle">
            {getTimelineItemHeading(item)} {formatRelativeTime(item.createdAt)}
          </span>
        </div>
        <MarkdownBody>{item.body}</MarkdownBody>
      </div>
    )
  }

  return (
    <div className="grid grid-cols-[2.5rem_minmax(0,1fr)] gap-3">
      <div className="flex flex-col items-center">
        <img src={item.user.avatar_url} alt={item.user.login} className="h-8 w-8 rounded-full border border-border" />
        <div className="mt-2 flex min-h-8 w-8 items-center justify-center rounded-full border border-border bg-surface text-foreground-muted">
          <Eye size={14} />
        </div>
        <div className="mt-2 min-h-8 w-px flex-1 bg-border" />
      </div>

      <div className="min-w-0">
        <div className="flex items-center gap-3 rounded-xl border border-border bg-surface px-4 py-3">
          <div className="min-w-0 flex-1 text-sm text-foreground-muted">
            <span className="font-semibold text-foreground">{item.user.login}</span>{' '}
            <span>
              {item.review ? getReviewStateText(item.review.state) : 'left a review'}{' '}
              {formatRelativeTime(item.createdAt)}
            </span>
          </div>
          {item.review ? <ReviewStateBadge state={item.review.state} /> : null}
        </div>

        {item.review?.body ? (
          <div className="mt-3 overflow-hidden rounded-xl border border-border bg-surface">
            <MarkdownBody>{item.review.body}</MarkdownBody>
          </div>
        ) : null}

        {item.threads.length > 0 ? (
          <div className="mt-3 flex flex-col gap-4">
            {item.threads.map((thread) => (
              <ReviewThreadCard key={thread.id} thread={thread} />
            ))}
          </div>
        ) : null}
      </div>
    </div>
  )
}

function getTimelineItemHeading(item: Extract<PullRequestTimelineItem, { type: 'issue-comment' }>): string {
  return 'commented'
}

function formatReviewCommentLocation(path: string, line: number | null): string {
  if (line === null) return path
  return `${path}:${line}`
}

function ReviewThreadCard({ thread }: { thread: PullRequestReviewThread }) {
  const { topLevelComment, replies } = thread

  return (
    <div className="overflow-hidden rounded-xl border border-border bg-surface">
      <div className="flex items-center justify-between gap-3 border-b border-border bg-interactive px-4 py-2">
        <div className="min-w-0 text-sm font-medium text-foreground">
          {thread.path}
          {thread.line !== null ? <span className="text-foreground-muted">:{thread.line}</span> : null}
        </div>
        <button className="shrink-0 text-sm font-medium text-foreground-muted hover:text-foreground">
          View reviewed changes
        </button>
      </div>

      <ReviewDiffHunkPreview comment={topLevelComment} />

      <div className="border-t border-border">
        <div className="flex items-start gap-3 px-4 py-4">
          <img
            src={topLevelComment.user.avatar_url}
            alt={topLevelComment.user.login}
            className="h-8 w-8 rounded-full"
          />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <span className="text-sm font-semibold text-foreground">{topLevelComment.user.login}</span>
              <span className="text-sm text-foreground-muted">{formatRelativeTime(topLevelComment.created_at)}</span>
            </div>
            <div className="mt-3">
              <MarkdownBody>{topLevelComment.body}</MarkdownBody>
            </div>
          </div>
        </div>

        {replies.length > 0 ? (
          <div className="border-t border-border">
            {replies.map((reply) => (
              <div key={reply.id} className="flex items-start gap-3 border-t border-border px-4 py-4 first:border-t-0">
                <img src={reply.user.avatar_url} alt={reply.user.login} className="h-7 w-7 rounded-full" />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <span className="text-sm font-semibold text-foreground">{reply.user.login}</span>
                    <span className="text-sm text-foreground-muted">
                      replied {formatRelativeTime(reply.created_at)}
                    </span>
                  </div>
                  <div className="mt-3">
                    <MarkdownBody>{reply.body}</MarkdownBody>
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  )
}

function ReviewDiffHunkPreview({ comment }: { comment: PullRequestReviewComment }) {
  const lines = getReviewDiffPreviewLines(comment)

  if (lines.length === 0) {
    return null
  }

  return (
    <div className="border-b border-border bg-background">
      <div className="overflow-x-auto">
        <table className="min-w-full border-collapse text-sm">
          <tbody>
            {lines.map((line, index) => (
              <tr key={`${line.kind}-${index}`} className={getReviewDiffRowClassName(line.kind)}>
                <td className="w-12 border-r border-border px-3 py-1.5 text-right font-mono text-xs text-foreground-subtle">
                  {line.oldLine ?? ''}
                </td>
                <td className="w-12 border-r border-border px-3 py-1.5 text-right font-mono text-xs text-foreground-subtle">
                  {line.newLine ?? ''}
                </td>
                <td className="px-3 py-1.5 font-mono text-[13px] text-foreground">
                  <span className="mr-3 inline-block w-3 text-center text-foreground-muted">{line.prefix}</span>
                  {line.content}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

type ReviewDiffPreviewLine = {
  kind: 'header' | 'addition' | 'deletion' | 'context'
  prefix: string
  content: string
  oldLine: number | null
  newLine: number | null
}

function getReviewDiffPreviewLines(comment: PullRequestReviewComment): ReviewDiffPreviewLine[] {
  if (!comment.diff_hunk) {
    return []
  }

  const rawLines = comment.diff_hunk.split('\n').slice(0, 8)
  let oldLineNumber = 0
  let newLineNumber = 0

  return rawLines.map((rawLine) => {
    if (rawLine.startsWith('@@')) {
      const match = rawLine.match(/@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/)
      oldLineNumber = match ? Number(match[1]) : 0
      newLineNumber = match ? Number(match[2]) : 0

      return {
        kind: 'header' as const,
        prefix: '@@',
        content: rawLine,
        oldLine: null,
        newLine: null
      }
    }

    if (rawLine.startsWith('-')) {
      const line = {
        kind: 'deletion' as const,
        prefix: '-',
        content: rawLine.slice(1),
        oldLine: oldLineNumber,
        newLine: null
      }
      oldLineNumber += 1
      return line
    }

    if (rawLine.startsWith('+')) {
      const line = {
        kind: 'addition' as const,
        prefix: '+',
        content: rawLine.slice(1),
        oldLine: null,
        newLine: newLineNumber
      }
      newLineNumber += 1
      return line
    }

    const line = {
      kind: 'context' as const,
      prefix: ' ',
      content: rawLine.startsWith(' ') ? rawLine.slice(1) : rawLine,
      oldLine: oldLineNumber || null,
      newLine: newLineNumber || null
    }
    oldLineNumber += 1
    newLineNumber += 1
    return line
  })
}

function getReviewDiffRowClassName(kind: ReviewDiffPreviewLine['kind']): string {
  if (kind === 'header') return 'bg-interactive'
  if (kind === 'addition') return 'bg-success/10'
  if (kind === 'deletion') return 'bg-danger/10'
  return 'bg-background'
}

function getReviewStateText(state: string): string {
  switch (state.toUpperCase()) {
    case 'APPROVED':
      return 'approved this pull request'
    case 'CHANGES_REQUESTED':
      return 'requested changes'
    case 'COMMENTED':
      return 'reviewed this pull request'
    case 'DISMISSED':
      return 'had a review dismissed'
    default:
      return 'reviewed this pull request'
  }
}

function ReviewStateBadge({ state }: { state: string }) {
  const normalizedState = state.toUpperCase()
  const className =
    normalizedState === 'APPROVED'
      ? 'bg-success/10 text-success'
      : normalizedState === 'CHANGES_REQUESTED'
        ? 'bg-danger/10 text-danger'
        : 'bg-interactive text-foreground-muted'

  return (
    <span className={`ml-auto rounded-full px-2 py-0.5 text-[11px] font-medium ${className}`}>
      {formatReviewStateLabel(state)}
    </span>
  )
}

function formatReviewStateLabel(state: string): string {
  switch (state.toUpperCase()) {
    case 'APPROVED':
      return 'Approved'
    case 'CHANGES_REQUESTED':
      return 'Changes requested'
    case 'COMMENTED':
      return 'Commented'
    case 'DISMISSED':
      return 'Dismissed'
    case 'PENDING':
      return 'Pending'
    default:
      return state
  }
}

function CommentBox({ owner, repo, number }: { owner: string; repo: string; number: number }) {
  const [body, setBody] = useState('')
  const [activeTab, setActiveTab] = useState<'write' | 'preview'>('write')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const queryClient = useQueryClient()

  const { data: auth } = useQuery<AuthData | null, Error>({
    queryKey: ['auth-user'],
    queryFn: () => window.api.auth.getUser(),
    retry: false
  })

  const wrapSelection = (before: string, after: string, placeholder: string): void => {
    const textarea = textareaRef.current
    if (!textarea) return
    const start = textarea.selectionStart
    const end = textarea.selectionEnd
    const selected = body.substring(start, end)
    const content = selected || placeholder
    const newText = body.substring(0, start) + before + content + after + body.substring(end)
    setBody(newText)
    requestAnimationFrame(() => {
      textarea.focus()
      if (selected) {
        textarea.setSelectionRange(start + before.length, start + before.length + content.length)
      } else {
        textarea.setSelectionRange(start + before.length, start + before.length + placeholder.length)
      }
    })
  }

  const insertAtLineStart = (prefix: string): void => {
    const textarea = textareaRef.current
    if (!textarea) return
    const start = textarea.selectionStart
    const lineStart = body.lastIndexOf('\n', start - 1) + 1
    const newText = body.substring(0, lineStart) + prefix + body.substring(lineStart)
    setBody(newText)
    requestAnimationFrame(() => {
      textarea.focus()
      const pos = start + prefix.length
      textarea.setSelectionRange(pos, pos)
    })
  }

  const handleSubmit = async (): Promise<void> => {
    if (!body.trim() || isSubmitting) return
    setIsSubmitting(true)
    try {
      await window.api.auth.createPullRequestComment(owner, repo, number, body)
      setBody('')
      setActiveTab('write')
      queryClient.invalidateQueries({ queryKey: ['pull-request-comments', owner, repo, number] })
    } catch (err) {
      console.error('Failed to post comment:', err)
    } finally {
      setIsSubmitting(false)
    }
  }

  const toolbarBtnClass =
    'rounded p-1.5 text-foreground-muted hover:bg-surface-hover hover:text-foreground transition-colors'

  return (
    <div className="mt-2">
      <div className="mb-3 flex items-center gap-3">
        {auth?.user.avatar_url && (
          <img src={auth.user.avatar_url} alt={auth.user.login} className="h-8 w-8 rounded-full" />
        )}
        <h3 className="text-sm font-semibold text-foreground">Add a comment</h3>
      </div>

      <div className="rounded-lg border border-border bg-surface">
        <div className="flex items-center justify-between border-b border-border px-3 py-2">
          <div className="flex">
            <button
              onClick={() => setActiveTab('write')}
              className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                activeTab === 'write'
                  ? 'bg-surface-hover text-foreground'
                  : 'text-foreground-muted hover:text-foreground'
              }`}
            >
              Write
            </button>
            <button
              onClick={() => setActiveTab('preview')}
              className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                activeTab === 'preview'
                  ? 'bg-surface-hover text-foreground'
                  : 'text-foreground-muted hover:text-foreground'
              }`}
            >
              Preview
            </button>
          </div>

          {activeTab === 'write' ? (
            <div className="flex items-center gap-0.5">
              <button
                type="button"
                title="Heading"
                className={toolbarBtnClass}
                onClick={() => insertAtLineStart('### ')}
              >
                <Heading size={14} />
              </button>
              <button
                type="button"
                title="Bold"
                className={toolbarBtnClass}
                onClick={() => wrapSelection('**', '**', 'bold text')}
              >
                <Bold size={14} />
              </button>
              <button
                type="button"
                title="Italic"
                className={toolbarBtnClass}
                onClick={() => wrapSelection('_', '_', 'italic text')}
              >
                <Italic size={14} />
              </button>
              <div className="mx-1 h-4 w-px bg-border" />
              <button
                type="button"
                title="Unordered list"
                className={toolbarBtnClass}
                onClick={() => insertAtLineStart('- ')}
              >
                <List size={14} />
              </button>
              <button
                type="button"
                title="Ordered list"
                className={toolbarBtnClass}
                onClick={() => insertAtLineStart('1. ')}
              >
                <ListOrdered size={14} />
              </button>
              <div className="mx-1 h-4 w-px bg-border" />
              <button
                type="button"
                title="Code"
                className={toolbarBtnClass}
                onClick={() => wrapSelection('`', '`', 'code')}
              >
                <Code size={14} />
              </button>
              <button
                type="button"
                title="Link"
                className={toolbarBtnClass}
                onClick={() => wrapSelection('[', '](url)', 'link text')}
              >
                <Link size={14} />
              </button>
              <button type="button" title="Quote" className={toolbarBtnClass} onClick={() => insertAtLineStart('> ')}>
                <Quote size={14} />
              </button>
            </div>
          ) : null}
        </div>

        {activeTab === 'write' ? (
          <textarea
            ref={textareaRef}
            value={body}
            onChange={(event) => setBody(event.target.value)}
            placeholder="Add your comment here..."
            className="min-h-[140px] w-full resize-y bg-transparent p-4 text-sm text-foreground placeholder:text-foreground-subtle focus:outline-none"
          />
        ) : (
          <div className="prose-sm min-h-[140px] p-4 text-sm leading-relaxed text-foreground-muted [&_a]:text-accent [&_blockquote]:border-l-2 [&_blockquote]:border-border [&_blockquote]:pl-3 [&_blockquote]:text-foreground-subtle [&_code]:rounded [&_code]:bg-interactive [&_code]:px-1.5 [&_code]:py-0.5 [&_code]:text-xs [&_h1]:text-lg [&_h1]:font-semibold [&_h1]:text-foreground [&_h2]:text-base [&_h2]:font-semibold [&_h2]:text-foreground [&_h3]:text-sm [&_h3]:font-semibold [&_h3]:text-foreground [&_li]:ml-4 [&_ol]:list-decimal [&_p+p]:mt-3 [&_pre>code]:block [&_pre>code]:p-3 [&_pre]:rounded-md [&_pre]:bg-interactive [&_ul]:list-disc">
            {body ? <Markdown>{body}</Markdown> : <p className="text-foreground-subtle">Nothing to preview</p>}
          </div>
        )}

        <div className="flex items-center justify-between border-t border-border px-4 py-3">
          <p className="text-xs text-foreground-subtle">Markdown is supported</p>
          <button
            onClick={handleSubmit}
            disabled={!body.trim() || isSubmitting}
            className="rounded-md bg-accent px-4 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-40"
          >
            {isSubmitting ? 'Commenting...' : 'Comment'}
          </button>
        </div>
      </div>
    </div>
  )
}

function PRDetailSidebar({ pr }: { pr: PullRequestDetail }) {
  return (
    <div className="flex flex-col gap-5">
      <div>
        <p className="mb-2 text-xs font-medium text-foreground-muted">Reviewers</p>
        {pr.requested_reviewers.length > 0 ? (
          <div className="flex flex-col gap-1.5">
            {pr.requested_reviewers.map((reviewer) => (
              <div key={reviewer.login} className="flex items-center gap-2">
                <img src={reviewer.avatar_url} alt={reviewer.login} className="h-5 w-5 rounded-full" />
                <span className="text-xs text-foreground">{reviewer.login}</span>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-xs text-foreground-subtle">None yet</p>
        )}
      </div>

      <div>
        <p className="mb-2 text-xs font-medium text-foreground-muted">Assignees</p>
        {pr.assignees.length > 0 ? (
          <div className="flex flex-col gap-1.5">
            {pr.assignees.map((assignee) => (
              <div key={assignee.login} className="flex items-center gap-2">
                <img src={assignee.avatar_url} alt={assignee.login} className="h-5 w-5 rounded-full" />
                <span className="text-xs text-foreground">{assignee.login}</span>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-xs text-foreground-subtle">No one assigned</p>
        )}
      </div>

      <div>
        <p className="mb-2 text-xs font-medium text-foreground-muted">Labels</p>
        {pr.labels.length > 0 ? (
          <div className="flex flex-wrap gap-1">
            {pr.labels.map((label) => (
              <span
                key={label.name}
                className="rounded-full border border-border px-2 py-0.5 text-xs text-foreground"
                style={{ borderColor: `#${label.color}40`, backgroundColor: `#${label.color}15` }}
              >
                {label.name}
              </span>
            ))}
          </div>
        ) : (
          <p className="text-xs text-foreground-subtle">None yet</p>
        )}
      </div>
    </div>
  )
}

function DiffStat({ additions, deletions }: { additions: number; deletions: number }) {
  const segments = getDiffStatSegments(additions, deletions)

  return (
    <span
      className="inline-flex items-center gap-2 text-xs"
      aria-label={`${additions} additions and ${deletions} deletions`}
    >
      <span className="font-semibold text-success">+{additions}</span>
      <span className="font-semibold text-danger">-{deletions}</span>
      <span className="inline-flex items-center gap-1" aria-hidden="true">
        {segments.map((segment, index) => (
          <span
            key={`${segment}-${index}`}
            className="h-3 w-3 rounded-[3px]"
            style={getDiffStatSegmentStyle(segment)}
          />
        ))}
      </span>
    </span>
  )
}

function getDiffStatSegments(additions: number, deletions: number): Array<'added' | 'deleted' | 'empty'> {
  const totalSegments = 6
  const totalChanges = additions + deletions

  if (totalChanges === 0) {
    return Array.from({ length: totalSegments }, () => 'empty')
  }

  if (totalChanges <= totalSegments) {
    return [
      ...Array.from({ length: additions }, () => 'added' as const),
      ...Array.from({ length: deletions }, () => 'deleted' as const),
      ...Array.from({ length: totalSegments - totalChanges }, () => 'empty' as const)
    ]
  }

  if (deletions === 0) {
    return Array.from({ length: totalSegments }, () => 'added')
  }

  if (additions === 0) {
    return Array.from({ length: totalSegments }, () => 'deleted')
  }

  const addedSegments = Math.min(totalSegments - 1, Math.max(1, Math.round((additions / totalChanges) * totalSegments)))
  const deletedSegments = totalSegments - addedSegments

  return [
    ...Array.from({ length: addedSegments }, () => 'added' as const),
    ...Array.from({ length: deletedSegments }, () => 'deleted' as const)
  ]
}

function getDiffStatSegmentStyle(segment: 'added' | 'deleted' | 'empty') {
  if (segment === 'added') {
    return {
      backgroundColor: 'var(--color-success)',
      boxShadow: 'inset 0 0 0 1px var(--color-success)'
    }
  }

  if (segment === 'deleted') {
    return {
      backgroundColor: 'var(--color-surface)',
      backgroundImage:
        'repeating-linear-gradient(-45deg, var(--color-danger), var(--color-danger) 2px, transparent 2px, transparent 4px)',
      boxShadow: 'inset 0 0 0 1px var(--color-danger)'
    }
  }

  return {
    backgroundColor: 'var(--color-interactive)',
    boxShadow: 'inset 0 0 0 1px var(--color-border)'
  }
}

function formatRelativeTime(dateStr: string): string {
  const date = new Date(dateStr)
  const now = new Date()
  const seconds = Math.floor((now.getTime() - date.getTime()) / 1000)

  if (seconds < 60) return 'just now'
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes} minute${minutes !== 1 ? 's' : ''} ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours} hour${hours !== 1 ? 's' : ''} ago`
  const days = Math.floor(hours / 24)
  if (days < 30) return `${days} day${days !== 1 ? 's' : ''} ago`
  const months = Math.floor(days / 30)
  if (months < 12) return `${months} month${months !== 1 ? 's' : ''} ago`
  const years = Math.floor(months / 12)
  return `${years} year${years !== 1 ? 's' : ''} ago`
}
