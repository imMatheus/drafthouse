import { useEffect, useRef, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Bold,
  Check,
  ChevronDown,
  Code,
  ExternalLink,
  Eye,
  FileCode,
  GitCommit,
  GitMerge,
  GitPullRequest,
  Heading,
  Italic,
  Link,
  List,
  ListOrdered,
  MessageSquare,
  Pencil,
  Quote
} from 'lucide-react'
import type {
  AgentContext,
  AgentSession,
  AuthData,
  PullRequestComment,
  PullRequestDetail,
  PullRequestFile,
  PullRequestMergeMethod,
  PullRequestReview,
  PullRequestReviewComment,
  PullRequestReviewDraftComment
} from '../../../../shared/types'
import { buildDiffLineAgentContext, buildPullRequestAgentContext } from '../../lib/agentContext'
import { cn } from '../../lib/cn'
import type { PullRequestSubview } from '../../lib/workspaceTabs'
import ClaudeMentionTextarea, { extractClaudePrompt, isClaudeMention } from '../../components/ClaudeMentionTextarea'
import InlineAgentResponseCard from '../../components/InlineAgentResponseCard'
import ReactionBar from '../../components/ReactionBar'
import MarkdownBody from './MarkdownBody'
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
  agentSessions: AgentSession[]
  onSubviewChange: (subview: PullRequestSubview) => void
  onTitleChange?: (title: string) => void
  onStateChange?: (prState: 'open' | 'closed' | 'merged' | 'draft') => void
  onStartAgent: (prompt: string, files?: string[], context?: AgentContext) => Promise<void>
  onContinueAgent: (sessionId: string, prompt: string, files?: string[]) => Promise<void>
  onStopAgent: (sessionId: string) => Promise<void>
  onPromoteAgent: (sessionId: string) => void
}

export default function PullRequestDetailView({
  owner,
  repo,
  number,
  subview,
  agentSessions,
  onSubviewChange,
  onTitleChange,
  onStateChange,
  onStartAgent,
  onContinueAgent,
  onStopAgent,
  onPromoteAgent
}: PullRequestDetailViewProps) {
  const [draftReviewComments, setDraftReviewComments] = useState<PullRequestReviewDraftComment[]>([])
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
    queryFn: () => window.api.github.pulls.get(owner, repo, number),
    retry: false
  })

  useEffect(() => {
    if (pr?.title) {
      onTitleChange?.(pr.title)
    }
  }, [onTitleChange, pr?.title])

  useEffect(() => {
    if (!pr) return
    const state = pr.merged ? 'merged' : pr.state === 'closed' ? 'closed' : pr.draft ? 'draft' : 'open'
    onStateChange?.(state)
  }, [onStateChange, pr?.draft, pr?.merged, pr?.state])

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

  const statusColor = pr.merged
    ? 'text-purple bg-purple/10'
    : pr.state === 'closed'
      ? 'text-danger bg-danger/10'
      : pr.draft
        ? 'text-foreground-muted bg-surface'
        : 'text-success bg-success/10'

  const statusLabel = pr.merged ? 'Merged' : pr.state === 'closed' ? 'Closed' : pr.draft ? 'Draft' : 'Open'

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
          className={cn('inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium', statusColor)}
        >
          <GitPullRequest size={14} />
          {statusLabel}
        </span>
        <p className="text-xs text-foreground-muted">
          <span className="font-medium text-foreground">{pr.user.login}</span> wants to merge {pr.commits} commit
          {pr.commits !== 1 ? 's' : ''} into{' '}
          <code className="rounded bg-accent-bg px-1.5 py-0.5 text-xs text-accent">{pr.base.ref}</code> from{' '}
          <code className="rounded bg-accent-bg px-1.5 py-0.5 text-xs text-accent">{pr.head.ref}</code>
        </p>
        <DiffStat additions={pr.additions} deletions={pr.deletions} />
      </div>

      <nav className="mt-4 flex gap-1 border-b border-border">
        <PRDetailTabButton
          active={subview === 'conversation'}
          onClick={() => onSubviewChange('conversation')}
          icon={<MessageSquare size={14} />}
          count={pr.comments}
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
                agentSessions={agentSessions}
                onViewReviewThread={(thread) => {
                  onSubviewChange('files')
                  setThreadJumpTarget({
                    path: thread.path,
                    commentId: thread.topLevelComment.id,
                    nonce: Date.now()
                  })
                }}
                onStartAgent={onStartAgent}
                onContinueAgent={onContinueAgent}
                onStopAgent={onStopAgent}
                onPromoteAgent={onPromoteAgent}
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

        {subview === 'files' ? (
          <PRFilesTab
            pr={pr}
            owner={owner}
            repo={repo}
            draftReviewComments={draftReviewComments}
            onDraftReviewCommentsChange={setDraftReviewComments}
            threadJumpTarget={threadJumpTarget}
            agentSessions={agentSessions}
            onAskClaude={async (prompt, filePath, lineNumber, lineContent, side) => {
              const context = buildDiffLineAgentContext({ owner, repo, pr, filePath, lineNumber, lineContent, side })
              await onStartAgent(prompt, undefined, context)
            }}
            onContinueAgent={onContinueAgent}
            onStopAgent={onStopAgent}
            onPromoteAgent={onPromoteAgent}
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
      className={cn(
        'inline-flex items-center gap-1.5 border-b-2 px-3 py-2 text-xs font-medium transition-colors',
        active
          ? 'border-foreground-muted text-foreground'
          : 'border-transparent text-foreground-muted hover:text-foreground'
      )}
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
  agentSessions,
  onViewReviewThread,
  onStartAgent,
  onContinueAgent,
  onStopAgent,
  onPromoteAgent
}: {
  pr: PullRequestDetail
  owner: string
  repo: string
  agentSessions: AgentSession[]
  onViewReviewThread: (thread: PullRequestReviewThread) => void
  onStartAgent: (prompt: string, files?: string[], context?: AgentContext) => Promise<void>
  onContinueAgent: (sessionId: string, prompt: string, files?: string[]) => Promise<void>
  onStopAgent: (sessionId: string) => Promise<void>
  onPromoteAgent: (sessionId: string) => void
}) {
  const { data: prFiles } = useQuery<PullRequestFile[], Error>({
    queryKey: ['pull-request-files', owner, repo, pr.number],
    queryFn: () => window.api.github.pulls.listFiles(owner, repo, pr.number),
    retry: false
  })

  // Filter workspace sessions to find this PR's inline agents (exclude diff-line sessions)
  const prLabel = `PR #${pr.number}`
  const inlineSessions = agentSessions.filter(
    (s) =>
      s.context?.source === 'pull-request' && s.context.label === prLabel && s.context.inline && !s.context.filePath
  )

  const handleAskClaude = async (prompt: string): Promise<void> => {
    const context = buildPullRequestAgentContext({ owner, repo, pr, files: prFiles })
    await onStartAgent(prompt, undefined, context)
  }

  const {
    data: comments,
    isLoading: isLoadingComments,
    error: commentsError
  } = useQuery<PullRequestComment[], Error>({
    queryKey: ['pull-request-comments', owner, repo, pr.number],
    queryFn: () => window.api.github.pullComments.listIssueComments(owner, repo, pr.number),
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
  const {
    data: reviews,
    isLoading: isLoadingReviews,
    error: reviewsError
  } = useQuery<PullRequestReview[], Error>({
    queryKey: ['pull-request-reviews', owner, repo, pr.number],
    queryFn: () => window.api.github.reviews.list(owner, repo, pr.number),
    retry: false
  })

  const timelineItems = buildPullRequestTimelineItems(comments ?? [], reviewComments ?? [], reviews ?? [])
  const conversationError = commentsError ?? reviewCommentsError ?? reviewsError
  const isLoadingConversation = isLoadingComments || isLoadingReviewComments || isLoadingReviews

  return (
    <div className="flex flex-col gap-4">
      <PRDescriptionCard pr={pr} owner={owner} repo={repo} />

      {conversationError ? (
        <div className="rounded-lg border border-border bg-surface px-4 py-3">
          <p className="text-sm text-foreground-muted">{conversationError.message}</p>
        </div>
      ) : null}

      {isLoadingConversation ? <p className="text-sm text-foreground-muted">Loading conversation...</p> : null}

      {timelineItems.map((item) => (
        <PullRequestTimelineCard
          key={item.id}
          item={item}
          owner={owner}
          repo={repo}
          onViewReviewThread={onViewReviewThread}
        />
      ))}

      {inlineSessions.map((session) => (
        <InlineAgentResponseCard
          key={session.id}
          session={session}
          onStop={() => onStopAgent(session.id)}
          onContinue={(prompt) => onContinueAgent(session.id, prompt)}
          onOpenInChat={() => onPromoteAgent(session.id)}
        />
      ))}

      <CommentBox owner={owner} repo={repo} number={pr.number} onAskClaude={handleAskClaude} />
      <PRActionBar pr={pr} owner={owner} repo={repo} />
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

function PullRequestTimelineCard({
  item,
  owner,
  repo,
  onViewReviewThread
}: {
  item: PullRequestTimelineItem
  owner: string
  repo: string
  onViewReviewThread: (thread: PullRequestReviewThread) => void
}) {
  if (item.type === 'issue-comment') {
    // Extract the numeric comment ID from the timeline item ID
    const commentId = Number(item.id.replace('issue-comment-', ''))

    return (
      <div className="rounded-lg border border-border bg-surface">
        <div className="flex items-center gap-2 border-b border-border px-4 py-3">
          <img src={item.user.avatar_url} alt={item.user.login} className="size-6 rounded-full" />
          <span className="text-sm font-medium text-foreground">{item.user.login}</span>
          <span className="text-xs text-foreground-subtle">commented {formatRelativeTime(item.createdAt)}</span>
        </div>
        <MarkdownBody>{item.body}</MarkdownBody>
        <div className="border-t border-border px-4 py-2">
          <ReactionBar owner={owner} repo={repo} commentId={commentId} commentType="issue-comment" />
        </div>
      </div>
    )
  }

  return (
    <div className="grid grid-cols-[2.5rem_minmax(0,1fr)] gap-3">
      <div className="flex flex-col items-center">
        <img src={item.user.avatar_url} alt={item.user.login} className="size-8 rounded-full border border-border" />
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
                owner={owner}
                repo={repo}
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
    <span className={cn('ml-auto rounded-full px-2 py-0.5 text-[11px] font-medium', className)}>
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

function PRDescriptionCard({ pr, owner, repo }: { pr: PullRequestDetail; owner: string; repo: string }) {
  const [isEditing, setIsEditing] = useState(false)
  const [editBody, setEditBody] = useState(pr.body ?? '')
  const [editTab, setEditTab] = useState<'write' | 'preview'>('write')
  const [isSaving, setIsSaving] = useState(false)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const queryClient = useQueryClient()

  const handleEdit = (): void => {
    setEditBody(pr.body ?? '')
    setEditTab('write')
    setIsEditing(true)
  }

  const handleCancel = (): void => {
    setIsEditing(false)
  }

  const handleSave = async (): Promise<void> => {
    if (isSaving) return
    setIsSaving(true)
    try {
      await window.api.github.pulls.update(owner, repo, pr.number, { body: editBody })
      setIsEditing(false)
      queryClient.invalidateQueries({ queryKey: ['pull-request', owner, repo, pr.number] })
    } catch (err) {
      console.error('Failed to update PR description:', err)
    } finally {
      setIsSaving(false)
    }
  }

  const wrapSelection = (before: string, after: string, placeholder: string): void => {
    const textarea = textareaRef.current
    if (!textarea) return
    const start = textarea.selectionStart
    const end = textarea.selectionEnd
    const selected = editBody.substring(start, end)
    const content = selected || placeholder
    const newText = editBody.substring(0, start) + before + content + after + editBody.substring(end)
    setEditBody(newText)
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
    const lineStart = editBody.lastIndexOf('\n', start - 1) + 1
    const newText = editBody.substring(0, lineStart) + prefix + editBody.substring(lineStart)
    setEditBody(newText)
    requestAnimationFrame(() => {
      textarea.focus()
      const pos = start + prefix.length
      textarea.setSelectionRange(pos, pos)
    })
  }

  const toolbarBtnClass =
    'rounded p-1.5 text-foreground-muted hover:bg-surface-hover hover:text-foreground transition-colors'

  if (isEditing) {
    return (
      <div className="rounded-lg border border-border bg-surface">
        <div className="flex items-center justify-between border-b border-border px-3 py-2">
          <div className="flex">
            <button
              onClick={() => setEditTab('write')}
              className={cn(
                'rounded-md px-3 py-1.5 text-xs font-medium transition-colors',
                editTab === 'write' ? 'bg-surface-hover text-foreground' : 'text-foreground-muted hover:text-foreground'
              )}
            >
              Write
            </button>
            <button
              onClick={() => setEditTab('preview')}
              className={cn(
                'rounded-md px-3 py-1.5 text-xs font-medium transition-colors',
                editTab === 'preview'
                  ? 'bg-surface-hover text-foreground'
                  : 'text-foreground-muted hover:text-foreground'
              )}
            >
              Preview
            </button>
          </div>

          {editTab === 'write' ? (
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

        {editTab === 'write' ? (
          <textarea
            ref={textareaRef}
            value={editBody}
            onChange={(e) => setEditBody(e.target.value)}
            placeholder="Add a description..."
            className="min-h-[180px] w-full resize-y bg-transparent p-4 text-sm text-foreground placeholder:text-foreground-subtle focus:outline-none"
          />
        ) : (
          <div className="min-h-[180px]">
            {editBody ? (
              <MarkdownBody>{editBody}</MarkdownBody>
            ) : (
              <p className="p-4 text-foreground-subtle">Nothing to preview</p>
            )}
          </div>
        )}

        <div className="flex items-center justify-end gap-2 border-t border-border px-4 py-3">
          <button
            onClick={handleCancel}
            disabled={isSaving}
            className="rounded-md bg-interactive px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-surface-hover disabled:opacity-40"
          >
            Cancel
          </button>
          <button
            onClick={() => void handleSave()}
            disabled={isSaving}
            className="rounded-md bg-accent px-4 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-accent-hover disabled:opacity-40"
          >
            {isSaving ? 'Saving...' : 'Save'}
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="rounded-lg border border-border bg-surface">
      <div className="flex items-center gap-2 border-b border-border px-4 py-3">
        <img src={pr.user.avatar_url} alt={pr.user.login} className="size-6 rounded-full" />
        <span className="text-sm font-medium text-foreground">{pr.user.login}</span>
        <span className="text-xs text-foreground-subtle">commented {formatRelativeTime(pr.created_at)}</span>
        <button
          onClick={handleEdit}
          className="ml-auto rounded p-1 text-foreground-subtle transition-colors hover:bg-surface-hover hover:text-foreground"
          title="Edit description"
        >
          <Pencil size={14} />
        </button>
      </div>
      {pr.body ? (
        <MarkdownBody>{pr.body}</MarkdownBody>
      ) : (
        <p className="p-4 text-sm text-foreground-subtle">No description provided.</p>
      )}
    </div>
  )
}

function CommentBox({
  owner,
  repo,
  number,
  onAskClaude
}: {
  owner: string
  repo: string
  number: number
  onAskClaude?: (prompt: string) => Promise<void>
}) {
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

  const claudeMention = isClaudeMention(body)

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

    if (claudeMention && onAskClaude) {
      const agentPrompt = extractClaudePrompt(body)
      if (!agentPrompt) return

      setBody('')
      setActiveTab('write')
      await onAskClaude(agentPrompt)
      return
    }

    setIsSubmitting(true)
    try {
      await window.api.github.pullComments.createIssueComment(owner, repo, number, body)
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
              className={cn(
                'rounded-md px-3 py-1.5 text-xs font-medium transition-colors',
                activeTab === 'write'
                  ? 'bg-surface-hover text-foreground'
                  : 'text-foreground-muted hover:text-foreground'
              )}
            >
              Write
            </button>
            <button
              onClick={() => setActiveTab('preview')}
              className={cn(
                'rounded-md px-3 py-1.5 text-xs font-medium transition-colors',
                activeTab === 'preview'
                  ? 'bg-surface-hover text-foreground'
                  : 'text-foreground-muted hover:text-foreground'
              )}
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
          <ClaudeMentionTextarea
            value={body}
            onChange={setBody}
            placeholder="Add your comment here..."
            className="min-h-[140px]"
            menuLabel="Ask about this PR"
            enabled={!!onAskClaude}
            onSubmit={() => void handleSubmit()}
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
          <p className="text-xs text-foreground-subtle">
            {claudeMention ? 'Claude will respond inline with PR context' : 'Markdown is supported'}
          </p>
          <button
            onClick={handleSubmit}
            disabled={!body.trim() || isSubmitting}
            className="rounded-md bg-accent px-4 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-40"
          >
            {isSubmitting ? 'Commenting...' : claudeMention ? 'Ask Claude' : 'Comment'}
          </button>
        </div>
      </div>
    </div>
  )
}

const MERGE_METHOD_OPTIONS: { key: PullRequestMergeMethod; label: string }[] = [
  { key: 'merge', label: 'Create a merge commit' },
  { key: 'squash', label: 'Squash and merge' },
  { key: 'rebase', label: 'Rebase and merge' }
]

function getMergeButtonLabel(method: PullRequestMergeMethod): string {
  switch (method) {
    case 'merge':
      return 'Merge pull request'
    case 'squash':
      return 'Squash and merge'
    case 'rebase':
      return 'Rebase and merge'
  }
}

function PRActionBar({ pr, owner, repo }: { pr: PullRequestDetail; owner: string; repo: string }) {
  const queryClient = useQueryClient()
  const [mergeMethod, setMergeMethod] = useState<PullRequestMergeMethod>('merge')
  const [isMergeMethodOpen, setIsMergeMethodOpen] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  const state = pr.merged ? 'merged' : pr.state === 'closed' ? 'closed' : pr.draft ? 'draft' : 'open'

  if (state === 'merged') return null

  const invalidateAfterAction = async (): Promise<void> => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['pull-request', owner, repo, pr.number] }),
      queryClient.invalidateQueries({ queryKey: ['pull-requests', owner, repo] })
    ])
  }

  const handleMerge = async (): Promise<void> => {
    if (isSubmitting) return
    setIsSubmitting(true)
    setErrorMessage(null)
    try {
      await window.api.github.pulls.merge(owner, repo, pr.number, mergeMethod)
      await invalidateAfterAction()
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Failed to merge pull request')
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleClose = async (): Promise<void> => {
    if (isSubmitting) return
    setIsSubmitting(true)
    setErrorMessage(null)
    try {
      await window.api.github.pulls.close(owner, repo, pr.number)
      await invalidateAfterAction()
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Failed to close pull request')
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleReopen = async (): Promise<void> => {
    if (isSubmitting) return
    setIsSubmitting(true)
    setErrorMessage(null)
    try {
      await window.api.github.pulls.reopen(owner, repo, pr.number)
      await invalidateAfterAction()
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Failed to reopen pull request')
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleConvertToDraft = async (): Promise<void> => {
    if (isSubmitting) return
    setIsSubmitting(true)
    setErrorMessage(null)
    try {
      await window.api.github.pulls.convertToDraft(pr.node_id)
      await invalidateAfterAction()
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Failed to convert to draft')
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleMarkReady = async (): Promise<void> => {
    if (isSubmitting) return
    setIsSubmitting(true)
    setErrorMessage(null)
    try {
      await window.api.github.pulls.markReady(pr.node_id)
      await invalidateAfterAction()
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Failed to mark as ready for review')
    } finally {
      setIsSubmitting(false)
    }
  }

  const mergeDisabledReason =
    pr.mergeable === false
      ? 'This branch has conflicts that must be resolved'
      : pr.mergeable_state === 'blocked'
        ? 'Merging is blocked'
        : null

  return (
    <div className="mt-4 rounded-lg border border-border bg-surface p-4">
      <div className="flex flex-wrap items-center gap-3">
        {state === 'open' ? (
          <>
            <div className="relative flex">
              <button
                onClick={handleMerge}
                disabled={isSubmitting || pr.mergeable === null || mergeDisabledReason !== null}
                className="rounded-l-md bg-success px-4 py-2 text-xs font-medium text-foreground transition-colors hover:bg-success/80 disabled:cursor-not-allowed disabled:opacity-40"
              >
                <span className="inline-flex items-center gap-1.5">
                  <GitMerge size={14} />
                  {isSubmitting
                    ? 'Merging...'
                    : pr.mergeable === null
                      ? 'Checking...'
                      : getMergeButtonLabel(mergeMethod)}
                </span>
              </button>
              <button
                onClick={() => setIsMergeMethodOpen(!isMergeMethodOpen)}
                disabled={isSubmitting}
                className="rounded-r-md border-l border-success/30 bg-success px-2 py-2 text-foreground transition-colors hover:bg-success/80 disabled:cursor-not-allowed disabled:opacity-40"
              >
                <ChevronDown size={14} />
              </button>
              {isMergeMethodOpen ? (
                <>
                  <div className="fixed inset-0 z-10" onClick={() => setIsMergeMethodOpen(false)} />
                  <div className="absolute left-0 top-full z-20 mt-2 w-56 overflow-hidden rounded-lg border border-border bg-surface shadow-xl">
                    <div className="border-b border-border px-3 py-2 text-xs font-medium text-foreground-muted">
                      Merge method
                    </div>
                    {MERGE_METHOD_OPTIONS.map((option) => (
                      <button
                        key={option.key}
                        type="button"
                        onClick={() => {
                          setMergeMethod(option.key)
                          setIsMergeMethodOpen(false)
                        }}
                        className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-foreground hover:bg-surface-hover"
                      >
                        <span className="inline-flex size-4 items-center justify-center">
                          {mergeMethod === option.key ? <Check size={13} /> : null}
                        </span>
                        {option.label}
                      </button>
                    ))}
                  </div>
                </>
              ) : null}
            </div>

            <button
              onClick={handleClose}
              disabled={isSubmitting}
              className="rounded-md border border-border bg-interactive px-4 py-2 text-xs font-medium text-danger transition-colors hover:bg-interactive-hover disabled:cursor-not-allowed disabled:opacity-40"
            >
              {isSubmitting ? 'Closing...' : 'Close pull request'}
            </button>

            <button
              onClick={handleConvertToDraft}
              disabled={isSubmitting}
              className="rounded-md px-4 py-2 text-xs font-medium text-foreground-muted transition-colors hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40"
            >
              Convert to draft
            </button>
          </>
        ) : null}

        {state === 'draft' ? (
          <>
            <button
              onClick={handleMarkReady}
              disabled={isSubmitting}
              className="rounded-md bg-success px-4 py-2 text-xs font-medium text-foreground transition-colors hover:bg-success/80 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {isSubmitting ? 'Marking ready...' : 'Ready for review'}
            </button>

            <button
              onClick={handleClose}
              disabled={isSubmitting}
              className="rounded-md border border-border bg-interactive px-4 py-2 text-xs font-medium text-danger transition-colors hover:bg-interactive-hover disabled:cursor-not-allowed disabled:opacity-40"
            >
              {isSubmitting ? 'Closing...' : 'Close pull request'}
            </button>
          </>
        ) : null}

        {state === 'closed' ? (
          <button
            onClick={handleReopen}
            disabled={isSubmitting}
            className="rounded-md bg-success px-4 py-2 text-xs font-medium text-foreground transition-colors hover:bg-success/80 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {isSubmitting ? 'Reopening...' : 'Reopen pull request'}
          </button>
        ) : null}
      </div>

      {mergeDisabledReason ? <p className="mt-2 text-sm text-danger">{mergeDisabledReason}</p> : null}

      {errorMessage ? <p className="mt-2 text-sm text-danger">{errorMessage}</p> : null}
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
                <img src={reviewer.avatar_url} alt={reviewer.login} className="size-5 rounded-full" />
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
                <img src={assignee.avatar_url} alt={assignee.login} className="size-5 rounded-full" />
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
