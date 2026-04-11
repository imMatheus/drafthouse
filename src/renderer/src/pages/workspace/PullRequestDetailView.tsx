import { useEffect, useRef, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Bold,
  Check,
  Code,
  ExternalLink,
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
import type {
  AuthData,
  PullRequestComment,
  PullRequestDetail,
  PullRequestReview,
  PullRequestReviewComment,
  PullRequestReviewDraftComment
} from '../../../../shared/types'
import type { PullRequestSubview } from '../../lib/workspaceTabs'
import MarkdownBody from './MarkdownBody'
import PlaceholderView from './PlaceholderView'
import PRCommitsTab from './PRCommitsTab'
import PRFilesTab from './PRFilesTab'
import ReviewThreadCard from './ReviewThreadCard'
import {
  buildPullRequestReviewThreads,
  DiffStat,
  formatRelativeTime,
  type PullRequestReviewThread
} from './pullRequestShared'

interface PullRequestDetailViewProps {
  owner: string
  repo: string
  number: number
  subview: PullRequestSubview
  onSubviewChange: (subview: PullRequestSubview) => void
  onTitleChange?: (title: string) => void
}

export default function PullRequestDetailView({
  owner,
  repo,
  number,
  subview,
  onSubviewChange,
  onTitleChange
}: PullRequestDetailViewProps) {
  const [draftReviewComments, setDraftReviewComments] = useState<PullRequestReviewDraftComment[]>(
    []
  )
  const [threadJumpTarget, setThreadJumpTarget] = useState<{
    path: string
    commentId: number
    nonce: number
  } | null>(null)
  const {
    data: pr,
    isLoading,
    error
  } = useQuery<PullRequestDetail, Error>({
    queryKey: ['pull-request', owner, repo, number],
    queryFn: () => window.api.auth.getPullRequest(owner, repo, number),
    retry: false
  })

  useEffect(() => {
    if (pr?.title) {
      onTitleChange?.(pr.title)
    }
  }, [onTitleChange, pr?.title])

  useEffect(() => {
    setDraftReviewComments([])
    setThreadJumpTarget(null)
  }, [number, owner, repo])

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

  const statusLabel = pr.draft
    ? 'Draft'
    : pr.merged
      ? 'Merged'
      : pr.state === 'closed'
        ? 'Closed'
        : 'Open'

  return (
    <div>
      <div className="flex items-start justify-between gap-4">
        <h1 className="text-xl font-semibold text-foreground">
          {pr.title} <span className="font-normal text-foreground-subtle">#{pr.number}</span>
        </h1>
        <a
          href={pr.html_url}
          target="_blank"
          rel="noreferrer"
          className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-border bg-interactive px-3 py-2 text-xs font-medium text-foreground transition-colors hover:bg-interactive-hover"
        >
          View on GitHub
          <ExternalLink size={13} />
        </a>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <span
          className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${statusColor}`}
        >
          <GitPullRequest size={14} />
          {statusLabel}
        </span>
        <p className="text-xs text-foreground-muted">
          <span className="font-medium text-foreground">{pr.user.login}</span> wants to merge{' '}
          {pr.commits} commit
          {pr.commits !== 1 ? 's' : ''} into{' '}
          <code className="rounded bg-surface px-1.5 py-0.5 text-xs text-accent">
            {pr.base.ref}
          </code>{' '}
          from{' '}
          <code className="rounded bg-surface px-1.5 py-0.5 text-xs text-accent">
            {pr.head.ref}
          </code>
        </p>
        <DiffStat additions={pr.additions} deletions={pr.deletions} />
      </div>

      <nav className="mt-4 flex gap-1 border-b border-border">
        <PRDetailTabButton
          active={subview === 'conversation'}
          onClick={() => onSubviewChange('conversation')}
          icon={<MessageSquare size={14} />}
        >
          Conversation
        </PRDetailTabButton>
        <PRDetailTabButton
          active={subview === 'commits'}
          onClick={() => onSubviewChange('commits')}
          icon={<GitCommit size={14} />}
          count={pr.commits}
        >
          Commits
        </PRDetailTabButton>
        <PRDetailTabButton
          active={subview === 'checks'}
          onClick={() => onSubviewChange('checks')}
          icon={<Check size={14} />}
        >
          Checks
        </PRDetailTabButton>
        <PRDetailTabButton
          active={subview === 'files'}
          onClick={() => onSubviewChange('files')}
          icon={<FileCode size={14} />}
          count={pr.changed_files}
        >
          Files changed
        </PRDetailTabButton>
      </nav>

      <div className="mt-6">
        {subview === 'conversation' ? (
          <div className="flex gap-6">
            <div className="min-w-0 flex-1">
              <PRConversationTab
                pr={pr}
                owner={owner}
                repo={repo}
                onViewReviewThread={(thread) => {
                  onSubviewChange('files')
                  setThreadJumpTarget({
                    path: thread.path,
                    commentId: thread.topLevelComment.id,
                    nonce: Date.now()
                  })
                }}
              />
            </div>
            <div className="hidden w-48 shrink-0 lg:block">
              <PRDetailSidebar pr={pr} />
            </div>
          </div>
        ) : null}

        {subview === 'commits' ? (
          <PRCommitsTab owner={owner} repo={repo} number={pr.number} totalCommits={pr.commits} />
        ) : null}

        {subview === 'checks' ? (
          <PlaceholderView
            title="Checks"
            description="Status checks for this pull request will appear here."
          />
        ) : null}

        {subview === 'files' ? (
          <PRFilesTab
            pr={pr}
            owner={owner}
            repo={repo}
            draftReviewComments={draftReviewComments}
            onDraftReviewCommentsChange={setDraftReviewComments}
            threadJumpTarget={threadJumpTarget}
          />
        ) : null}
      </div>
    </div>
  )
}

function PRDetailTabButton({
  active,
  onClick,
  children,
  icon,
  count
}: {
  active: boolean
  onClick: () => void
  children: React.ReactNode
  icon: React.ReactNode
  count?: number
}) {
  return (
    <button
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 border-b-2 px-3 py-2 text-xs font-medium transition-colors ${
        active
          ? 'border-foreground-muted text-foreground'
          : 'border-transparent text-foreground-muted hover:text-foreground'
      }`}
    >
      {icon}
      {children}
      {typeof count === 'number' ? <span className="text-foreground-subtle">{count}</span> : null}
    </button>
  )
}

function PRConversationTab({
  pr,
  owner,
  repo,
  onViewReviewThread
}: {
  pr: PullRequestDetail
  owner: string
  repo: string
  onViewReviewThread: (thread: PullRequestReviewThread) => void
}) {
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

  const timelineItems = buildPullRequestTimelineItems(
    comments ?? [],
    reviewComments ?? [],
    reviews ?? []
  )
  const conversationError = commentsError ?? reviewCommentsError ?? reviewsError
  const isLoadingConversation = isLoadingComments || isLoadingReviewComments || isLoadingReviews

  return (
    <div className="flex flex-col gap-4">
      {pr.body ? (
        <div className="rounded-lg border border-border bg-surface">
          <div className="flex items-center gap-2 border-b border-border px-4 py-3">
            <img src={pr.user.avatar_url} alt={pr.user.login} className="size-6 rounded-full" />
            <span className="text-sm font-medium text-foreground">{pr.user.login}</span>
            <span className="text-xs text-foreground-subtle">
              commented {formatRelativeTime(pr.created_at)}
            </span>
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

      {isLoadingConversation ? (
        <p className="text-sm text-foreground-muted">Loading conversation...</p>
      ) : null}

      {timelineItems.map((item) => (
        <PullRequestTimelineCard
          key={item.id}
          item={item}
          onViewReviewThread={onViewReviewThread}
        />
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
      user: { login: string; avatar_url: string }
    }
  | {
      id: string
      type: 'review-block'
      createdAt: string
      review: PullRequestReview | null
      threads: PullRequestReviewThread[]
      user: { login: string; avatar_url: string }
    }

function buildPullRequestTimelineItems(
  comments: PullRequestComment[],
  reviewComments: PullRequestReviewComment[],
  reviews: PullRequestReview[]
): PullRequestTimelineItem[] {
  const threadsByReviewId = new Map<number, PullRequestReviewThread[]>()
  const threads = buildPullRequestReviewThreads(reviewComments)

  for (const thread of threads) {
    const reviewThreads = threadsByReviewId.get(thread.topLevelComment.pull_request_review_id) ?? []
    reviewThreads.push(thread)
    threadsByReviewId.set(thread.topLevelComment.pull_request_review_id, reviewThreads)
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
    .filter(
      ([reviewId]) =>
        !reviews.some((review) => review.id === reviewId && review.submitted_at && review.user)
    )
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

function PullRequestTimelineCard({
  item,
  onViewReviewThread
}: {
  item: PullRequestTimelineItem
  onViewReviewThread: (thread: PullRequestReviewThread) => void
}) {
  if (item.type === 'issue-comment') {
    return (
      <div className="rounded-lg border border-border bg-surface">
        <div className="flex items-center gap-2 border-b border-border px-4 py-3">
          <img src={item.user.avatar_url} alt={item.user.login} className="size-6 rounded-full" />
          <span className="text-sm font-medium text-foreground">{item.user.login}</span>
          <span className="text-xs text-foreground-subtle">
            commented {formatRelativeTime(item.createdAt)}
          </span>
        </div>
        <MarkdownBody>{item.body}</MarkdownBody>
      </div>
    )
  }

  return (
    <div className="grid grid-cols-[2.5rem_minmax(0,1fr)] gap-3">
      <div className="flex flex-col items-center">
        <img
          src={item.user.avatar_url}
          alt={item.user.login}
          className="size-8 rounded-full border border-border"
        />
        <div className="mt-2 flex min-h-8 size-8 items-center justify-center rounded-full border border-border bg-surface text-foreground-muted">
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
              <ReviewThreadCard
                key={thread.id}
                thread={thread}
                onViewReviewThread={onViewReviewThread}
              />
            ))}
          </div>
        ) : null}
      </div>
    </div>
  )
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
        textarea.setSelectionRange(
          start + before.length,
          start + before.length + placeholder.length
        )
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
          <img src={auth.user.avatar_url} alt={auth.user.login} className="size-8 rounded-full" />
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
              <button
                type="button"
                title="Quote"
                className={toolbarBtnClass}
                onClick={() => insertAtLineStart('> ')}
              >
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
          <div className="min-h-[140px]">
            {body ? (
              <MarkdownBody>{body}</MarkdownBody>
            ) : (
              <p className="p-4 text-foreground-subtle">Nothing to preview</p>
            )}
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
                <img
                  src={reviewer.avatar_url}
                  alt={reviewer.login}
                  className="size-5 rounded-full"
                />
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
                <img
                  src={assignee.avatar_url}
                  alt={assignee.login}
                  className="size-5 rounded-full"
                />
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
