import { useEffect, useRef, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Bold,
  Check,
  ChevronDown,
  Code,
  Copy,
  ExternalLink,
  Eye,
  FileCode,
  GitBranch,
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
  GitBranchInfo,
  PaginatedPullRequestCommits,
  PullRequestComment,
  PullRequestCommit,
  PullRequestCommitAuthors,
  PullRequestDetail,
  PullRequestFile,
  PullRequestMergeMethod,
  PullRequestReview,
  PullRequestReviewComment,
  PullRequestReviewDraftComment,
  PullRequestReviewThreadSummary
} from '../../../../shared/types'
import {
  buildDiffLineAgentContext,
  buildFixWithClaudePrompt,
  buildPullRequestAgentContext,
  type FixWithClaudeInput
} from '../../lib/agentContext'
import { cn } from '../../lib/cn'
import type { PullRequestSubview } from '../../lib/workspaceTabs'
import ClaudeMentionTextarea, { extractClaudePrompt, isClaudeMention } from '../../components/ClaudeMentionTextarea'
import InlineAgentResponseCard from '../../components/InlineAgentResponseCard'
import ReactionBar from '../../components/ReactionBar'
import CommentActionsMenu from '../../components/CommentActionsMenu'
import CommentBodyEditor from '../../components/CommentBodyEditor'
import CommitActorStack, { getCommitActors } from '../../components/CommitActorStack'
import FixWithClaudeButton from '../../components/FixWithClaudeButton'
import Tooltip from '../../components/Tooltip'
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
  folderPath: string
  number: number
  subview: PullRequestSubview
  agentSessions: AgentSession[]
  onSubviewChange: (subview: PullRequestSubview) => void
  onTitleChange?: (title: string) => void
  onStateChange?: (prState: 'open' | 'closed' | 'merged' | 'draft') => void
  onOpenCommit: (sha: string, title?: string) => void
  onStartAgent: (prompt: string, files?: string[], context?: AgentContext) => Promise<void>
  onContinueAgent: (sessionId: string, prompt: string, files?: string[]) => Promise<void>
  onStopAgent: (sessionId: string) => Promise<void>
  onPromoteAgent: (sessionId: string) => void
}

export default function PullRequestDetailView({
  owner,
  repo,
  folderPath,
  number,
  subview,
  agentSessions,
  onSubviewChange,
  onTitleChange,
  onStateChange,
  onOpenCommit,
  onStartAgent,
  onContinueAgent,
  onStopAgent,
  onPromoteAgent
}: PullRequestDetailViewProps) {
  const [headBranchCopied, setHeadBranchCopied] = useState(false)
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

  const { data: branchInfo } = useQuery<GitBranchInfo>({
    queryKey: ['git-branch-info', folderPath],
    queryFn: () => window.api.git.branchInfo(folderPath),
    refetchInterval: 5000,
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

  // When an agent session that was scoped to this PR completes, it likely
  // pushed a new commit to the PR branch. Refetch the PR data so the diff,
  // commit list, and review threads reflect the new HEAD.
  const queryClient = useQueryClient()
  const invalidatedSessionsRef = useRef<Set<string>>(new Set())
  useEffect(() => {
    const prLabel = `PR #${number}`
    const newlyCompleted = agentSessions.filter(
      (session) =>
        session.status === 'completed' &&
        session.context?.source === 'pull-request' &&
        session.context.label === prLabel &&
        !invalidatedSessionsRef.current.has(session.id)
    )
    if (newlyCompleted.length === 0) return

    for (const session of newlyCompleted) invalidatedSessionsRef.current.add(session.id)

    void queryClient.invalidateQueries({ queryKey: ['pull-request', owner, repo, number] })
    void queryClient.invalidateQueries({ queryKey: ['pull-request-files', owner, repo, number] })
    void queryClient.invalidateQueries({ queryKey: ['pull-request-commits', owner, repo, number] })
    void queryClient.invalidateQueries({ queryKey: ['pull-request-commit-authors', owner, repo, number] })
    void queryClient.invalidateQueries({ queryKey: ['pull-request-review-comments', owner, repo, number] })
    void queryClient.invalidateQueries({ queryKey: ['pull-request-comments', owner, repo, number] })
    void queryClient.invalidateQueries({ queryKey: ['pull-request-review-threads', owner, repo, number] })
  }, [agentSessions, owner, repo, number, queryClient])

  if (isLoading) return <p className="text-foreground-muted text-sm">Loading pull request...</p>

  if (error) {
    return (
      <div className="border-border bg-surface max-w-xl rounded-lg border p-4">
        <h2 className="text-foreground text-sm font-semibold">Pull request unavailable</h2>
        <p className="text-foreground-muted mt-2 text-sm">{error.message}</p>
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
        <h1 className="text-foreground text-xl font-semibold text-balance">
          {pr.title} <span className="text-foreground-subtle font-normal tabular-nums">#{pr.number}</span>
        </h1>
        <a
          href={pr.html_url}
          target="_blank"
          rel="noreferrer"
          className="border-border bg-interactive text-foreground hover:bg-interactive-hover inline-flex shrink-0 items-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-medium transition-[background-color,color,transform] active:scale-[0.96]"
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
        <p className="text-foreground-muted text-xs">
          <span className="text-foreground font-medium">{pr.user.login}</span> wants to merge{' '}
          <span className="tabular-nums">{pr.commits}</span> commit{pr.commits !== 1 ? 's' : ''} into{' '}
          <code className="bg-accent-bg text-accent rounded px-1.5 py-0.5 text-xs">{pr.base.ref}</code> from{' '}
          <code className="bg-accent-bg text-accent rounded px-1.5 py-0.5 text-xs">{pr.head.ref}</code>
          <Tooltip label={headBranchCopied ? 'Copied' : 'Copy branch name'} side="top">
            <button
              type="button"
              onClick={() => {
                void navigator.clipboard.writeText(pr.head.ref).then(() => {
                  setHeadBranchCopied(true)
                  setTimeout(() => setHeadBranchCopied(false), 1500)
                })
              }}
              className="text-foreground-subtle hover:bg-interactive hover:text-foreground ml-1 inline-flex size-5 items-center justify-center rounded align-middle transition-[background-color,color,transform] active:scale-[0.96]"
              aria-label="Copy branch name"
            >
              {headBranchCopied ? <Check size={12} className="text-success" /> : <Copy size={12} />}
            </button>
          </Tooltip>
        </p>
        <DiffStat additions={pr.additions} deletions={pr.deletions} />
      </div>

      <nav className="border-border mt-4 flex gap-1 border-b">
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
                onOpenCommit={onOpenCommit}
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
                onFixWithClaude={async (input) => {
                  const context = buildPullRequestAgentContext({ owner, repo, pr })
                  context.commentId = input.commentId
                  await onStartAgent(buildFixWithClaudePrompt(input), undefined, context)
                }}
              />
              {pr.merged && branchInfo?.name === pr.head.ref ? (
                <MergedBranchSwitchBanner folderPath={folderPath} headBranch={pr.head.ref} baseBranch={pr.base.ref} />
              ) : null}
            </div>
            <div className="hidden w-48 shrink-0 lg:block">
              <PRDetailSidebar pr={pr} owner={owner} repo={repo} />
            </div>
          </div>
        ) : null}

        {subview === 'commits' ? (
          <PRCommitsTab
            owner={owner}
            repo={repo}
            number={pr.number}
            totalCommits={pr.commits}
            onOpenCommit={onOpenCommit}
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
            agentSessions={agentSessions}
            onAskClaude={async (prompt, filePath, lineNumber, lineContent, side) => {
              const context = buildDiffLineAgentContext({ owner, repo, pr, filePath, lineNumber, lineContent, side })
              await onStartAgent(prompt, undefined, context)
            }}
            onFixWithClaude={async (input) => {
              const context = buildPullRequestAgentContext({ owner, repo, pr })
              context.commentId = input.commentId
              await onStartAgent(buildFixWithClaudePrompt(input), undefined, context)
            }}
            onContinueAgent={onContinueAgent}
            onStopAgent={onStopAgent}
            onPromoteAgent={onPromoteAgent}
          />
        ) : null}
      </div>

      {pr.merged && branchInfo?.name === pr.head.ref ? (
        <MergedBranchSwitchBanner folderPath={folderPath} headBranch={pr.head.ref} baseBranch={pr.base.ref} />
      ) : null}
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
          : 'text-foreground-muted hover:text-foreground border-transparent'
      )}
    >
      {icon}
      {children}
      {typeof count === 'number' ? <span className="text-foreground-subtle tabular-nums">{count}</span> : null}
    </button>
  )
}

function PRConversationTab({
  pr,
  owner,
  repo,
  agentSessions,
  onOpenCommit,
  onViewReviewThread,
  onStartAgent,
  onContinueAgent,
  onStopAgent,
  onPromoteAgent,
  onFixWithClaude
}: {
  pr: PullRequestDetail
  owner: string
  repo: string
  agentSessions: AgentSession[]
  onOpenCommit: (sha: string, title?: string) => void
  onViewReviewThread: (thread: PullRequestReviewThread) => void
  onStartAgent: (prompt: string, files?: string[], context?: AgentContext) => Promise<void>
  onContinueAgent: (sessionId: string, prompt: string, files?: string[]) => Promise<void>
  onStopAgent: (sessionId: string) => Promise<void>
  onPromoteAgent: (sessionId: string) => void
  onFixWithClaude: (input: FixWithClaudeInput) => Promise<void>
}) {
  const { data: prFiles } = useQuery<PullRequestFile[], Error>({
    queryKey: ['pull-request-files', owner, repo, pr.number],
    queryFn: () => window.api.github.pulls.listFiles(owner, repo, pr.number),
    retry: false
  })

  // Filter workspace sessions to find this PR's inline agents (exclude diff-line sessions
  // and comment-tied sessions — those are rendered inside their originating comment card).
  const prLabel = `PR #${pr.number}`
  const inlineSessions = agentSessions.filter(
    (s) =>
      s.context?.source === 'pull-request' &&
      s.context.label === prLabel &&
      s.context.inline &&
      !s.context.filePath &&
      s.context.commentId === undefined
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
  const { data: reviewThreadSummaries } = useQuery<PullRequestReviewThreadSummary[], Error>({
    queryKey: ['pull-request-review-threads', owner, repo, pr.number],
    queryFn: () => window.api.github.pullComments.listReviewThreads(owner, repo, pr.number),
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
  const {
    data: commitsData,
    isLoading: isLoadingCommits,
    error: commitsError
  } = useQuery<PaginatedPullRequestCommits, Error>({
    queryKey: ['pull-request-commits', owner, repo, pr.number, 1],
    queryFn: () => window.api.github.pulls.listCommits(owner, repo, pr.number, 1, 100),
    retry: false,
    enabled: pr.commits > 0
  })
  const { data: resolvedAuthors, error: resolvedAuthorsError } = useQuery<PullRequestCommitAuthors, Error>({
    queryKey: ['pull-request-commit-authors', owner, repo, pr.number],
    queryFn: () => window.api.github.pulls.listCommitAuthors(owner, repo, pr.number),
    retry: false,
    enabled: pr.commits > 0
  })
  if (resolvedAuthorsError) {
    console.error('Failed to resolve commit authors:', resolvedAuthorsError)
  }

  const timelineItems = buildPullRequestTimelineItems(
    comments ?? [],
    reviewComments ?? [],
    reviews ?? [],
    commitsData?.items ?? [],
    reviewThreadSummaries
  )
  const conversationError = commentsError ?? reviewCommentsError ?? reviewsError ?? commitsError
  const isLoadingConversation = isLoadingComments || isLoadingReviewComments || isLoadingReviews || isLoadingCommits

  const [commentBody, setCommentBody] = useState('')
  const commentBoxRef = useRef<HTMLDivElement>(null)

  const handleQuoteReply = (quoted: string): void => {
    setCommentBody((prev) => (prev ? `${prev}\n${quoted}` : quoted))
    commentBoxRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }

  return (
    <div className="flex flex-col gap-4">
      <PRDescriptionCard pr={pr} owner={owner} repo={repo} />

      {conversationError ? (
        <div className="border-border bg-surface rounded-lg border px-4 py-3">
          <p className="text-foreground-muted text-sm">{conversationError.message}</p>
        </div>
      ) : null}

      {isLoadingConversation ? <p className="text-foreground-muted text-sm">Loading conversation...</p> : null}

      {timelineItems.map((item) => (
        <PullRequestTimelineCard
          key={item.id}
          item={item}
          owner={owner}
          repo={repo}
          prNumber={pr.number}
          resolvedAuthors={resolvedAuthors}
          agentSessions={agentSessions}
          onOpenCommit={onOpenCommit}
          onViewReviewThread={onViewReviewThread}
          onQuoteReply={handleQuoteReply}
          onFixWithClaude={onFixWithClaude}
          onStopAgent={onStopAgent}
          onContinueAgent={onContinueAgent}
          onPromoteAgent={onPromoteAgent}
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

      <div ref={commentBoxRef}>
        <CommentBox
          owner={owner}
          repo={repo}
          number={pr.number}
          body={commentBody}
          onBodyChange={setCommentBody}
          onAskClaude={handleAskClaude}
        />
      </div>
      <PRActionBar pr={pr} owner={owner} repo={repo} />
    </div>
  )
}

type PullRequestTimelineItem =
  | {
      id: string
      type: 'issue-comment'
      createdAt: string
      comment: PullRequestComment
    }
  | {
      id: string
      type: 'commit'
      createdAt: string
      commit: PullRequestCommit
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
  reviews: PullRequestReview[],
  commits: PullRequestCommit[],
  threadSummaries: PullRequestReviewThreadSummary[] | undefined
): PullRequestTimelineItem[] {
  const threadsByReviewId = new Map<number, PullRequestReviewThread[]>()
  const threads = buildPullRequestReviewThreads(reviewComments, threadSummaries)

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

  const commitItems: PullRequestTimelineItem[] = commits
    .map((commit) => {
      const date = commit.commit.author?.date ?? commit.commit.committer?.date
      if (!date) return null
      return {
        id: `commit-${commit.sha}`,
        type: 'commit' as const,
        createdAt: date,
        commit
      }
    })
    .filter((item): item is Extract<PullRequestTimelineItem, { type: 'commit' }> => item !== null)

  return [
    ...comments.map((comment) => ({
      id: `issue-comment-${comment.id}`,
      type: 'issue-comment' as const,
      createdAt: comment.created_at,
      comment
    })),
    ...reviewItems,
    ...orphanReviewItems,
    ...commitItems
  ].sort((left, right) => new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime())
}

function PullRequestTimelineCard({
  item,
  owner,
  repo,
  prNumber,
  resolvedAuthors,
  agentSessions,
  onOpenCommit,
  onViewReviewThread,
  onQuoteReply,
  onFixWithClaude,
  onStopAgent,
  onContinueAgent,
  onPromoteAgent
}: {
  item: PullRequestTimelineItem
  owner: string
  repo: string
  prNumber: number
  resolvedAuthors: PullRequestCommitAuthors | undefined
  agentSessions: AgentSession[]
  onOpenCommit: (sha: string, title?: string) => void
  onViewReviewThread: (thread: PullRequestReviewThread) => void
  onQuoteReply: (quoted: string) => void
  onFixWithClaude: (input: FixWithClaudeInput) => Promise<void>
  onStopAgent: (sessionId: string) => Promise<void>
  onContinueAgent: (sessionId: string, prompt: string, files?: string[]) => Promise<void>
  onPromoteAgent: (sessionId: string) => void
}) {
  if (item.type === 'issue-comment') {
    return (
      <IssueCommentCard
        comment={item.comment}
        owner={owner}
        repo={repo}
        prNumber={prNumber}
        agentSessions={agentSessions}
        onQuoteReply={onQuoteReply}
        onFixWithClaude={onFixWithClaude}
        onStopAgent={onStopAgent}
        onContinueAgent={onContinueAgent}
        onPromoteAgent={onPromoteAgent}
      />
    )
  }

  if (item.type === 'commit') {
    return <CommitTimelineRow commit={item.commit} resolvedAuthors={resolvedAuthors} onOpenCommit={onOpenCommit} />
  }

  return (
    <div className="grid grid-cols-[2.5rem_minmax(0,1fr)] gap-3">
      <div className="flex flex-col items-center">
        <img src={item.user.avatar_url} alt={item.user.login} className="border-border size-8 rounded-full border" />
        <div className="border-border bg-surface text-foreground-muted mt-2 flex size-8 min-h-8 items-center justify-center rounded-full border">
          <Eye size={14} />
        </div>
        <div className="bg-border mt-2 min-h-8 w-px flex-1" />
      </div>

      <div className="min-w-0">
        <div className="border-border bg-surface flex items-center gap-3 rounded-xl border px-4 py-3">
          <div className="text-foreground-muted min-w-0 flex-1 text-sm">
            <span className="text-foreground font-semibold">{item.user.login}</span>{' '}
            <span>
              {item.review ? getReviewStateText(item.review.state) : 'left a review'}{' '}
              {formatRelativeTime(item.createdAt)}
            </span>
          </div>
          {item.review ? <ReviewStateBadge state={item.review.state} /> : null}
        </div>

        {item.review?.body ? (
          <div className="border-border bg-surface mt-3 overflow-hidden rounded-xl border">
            <MarkdownBody className="p-4">{item.review.body}</MarkdownBody>
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
                prNumber={prNumber}
                onViewReviewThread={onViewReviewThread}
                onQuoteReply={onQuoteReply}
                onFixWithClaude={onFixWithClaude}
                agentSessions={agentSessions}
                onStopAgent={onStopAgent}
                onContinueAgent={onContinueAgent}
                onPromoteAgent={onPromoteAgent}
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

function CommitTimelineRow({
  commit,
  resolvedAuthors,
  onOpenCommit
}: {
  commit: PullRequestCommit
  resolvedAuthors: PullRequestCommitAuthors | undefined
  onOpenCommit: (sha: string, title?: string) => void
}) {
  const subject = commit.commit.message.split('\n')[0]?.trim() || 'Untitled commit'
  const actors = getCommitActors(commit, resolvedAuthors)
  const [isCopied, setIsCopied] = useState(false)

  const handleCopySha = async (): Promise<void> => {
    try {
      await navigator.clipboard.writeText(commit.sha)
      setIsCopied(true)
      window.setTimeout(() => setIsCopied(false), 1500)
    } catch (error) {
      console.error('Failed to copy commit SHA:', error)
    }
  }

  return (
    <div className="grid grid-cols-[2.5rem_minmax(0,1fr)] items-center gap-3">
      <div className="flex justify-center">
        <div className="border-border bg-surface text-foreground-muted flex size-8 items-center justify-center rounded-full border">
          <GitCommit size={14} />
        </div>
      </div>

      <div className="flex min-h-8 min-w-0 items-center gap-2">
        <CommitActorStack actors={actors} size="sm" />
        <button
          type="button"
          onClick={() => onOpenCommit(commit.sha, subject)}
          className="text-foreground hover:text-accent min-w-0 flex-1 truncate text-left text-xs font-medium transition-colors"
          title={subject}
        >
          {subject}
        </button>
        <div className="ml-auto flex shrink-0 items-center gap-1">
          <span className="text-foreground-muted font-mono text-xs">{commit.sha.slice(0, 7)}</span>
          <Tooltip label={isCopied ? 'Copied' : 'Copy SHA'} side="top">
            <button
              type="button"
              onClick={handleCopySha}
              className="text-foreground-muted hover:bg-interactive hover:text-foreground inline-flex size-6 items-center justify-center rounded transition-colors"
              aria-label={isCopied ? 'Copied SHA' : 'Copy SHA'}
            >
              {isCopied ? <Check size={13} /> : <Copy size={13} />}
            </button>
          </Tooltip>
        </div>
      </div>
    </div>
  )
}

function IssueCommentCard({
  comment,
  owner,
  repo,
  prNumber,
  agentSessions,
  onQuoteReply,
  onFixWithClaude,
  onStopAgent,
  onContinueAgent,
  onPromoteAgent
}: {
  comment: PullRequestComment
  owner: string
  repo: string
  prNumber: number
  agentSessions: AgentSession[]
  onQuoteReply: (quoted: string) => void
  onFixWithClaude: (input: FixWithClaudeInput) => Promise<void>
  onStopAgent: (sessionId: string) => Promise<void>
  onContinueAgent: (sessionId: string, prompt: string, files?: string[]) => Promise<void>
  onPromoteAgent: (sessionId: string) => void
}) {
  const commentSessions = agentSessions.filter((s) => s.context?.commentId === comment.id)
  const [isEditing, setIsEditing] = useState(false)
  return (
    <div className="border-border bg-surface rounded-lg border">
      <div className="border-border flex items-center gap-2 border-b px-4 py-3">
        <img src={comment.user.avatar_url} alt={comment.user.login} className="size-6 rounded-full" />
        <span className="text-foreground text-sm font-medium">{comment.user.login}</span>
        <span className="text-foreground-subtle text-xs">commented {formatRelativeTime(comment.created_at)}</span>
        <div className="ml-auto">
          <CommentActionsMenu
            owner={owner}
            repo={repo}
            number={prNumber}
            commentType="issue-comment"
            commentId={comment.id}
            nodeId={comment.node_id}
            htmlUrl={comment.html_url}
            body={comment.body}
            authorLogin={comment.user.login}
            onStartEdit={() => setIsEditing(true)}
            onQuoteReply={onQuoteReply}
          />
        </div>
      </div>
      {isEditing ? (
        <div className="p-4">
          <CommentBodyEditor
            owner={owner}
            repo={repo}
            number={prNumber}
            commentType="issue-comment"
            commentId={comment.id}
            initialBody={comment.body}
            onCancel={() => setIsEditing(false)}
            onSaved={() => setIsEditing(false)}
          />
        </div>
      ) : (
        <MarkdownBody className="p-4">{comment.body}</MarkdownBody>
      )}
      <div className="flex flex-wrap items-center gap-2 px-4 pb-2">
        <ReactionBar owner={owner} repo={repo} commentId={comment.id} commentType="issue-comment" />
        <FixWithClaudeButton
          onClick={() =>
            onFixWithClaude({
              commentId: comment.id,
              body: comment.body,
              author: comment.user.login
            })
          }
        />
      </div>
      {commentSessions.map((session) => (
        <div key={session.id} className="border-border border-t">
          <InlineAgentResponseCard
            session={session}
            variant="nested"
            onStop={() => onStopAgent(session.id)}
            onContinue={(prompt) => onContinueAgent(session.id, prompt)}
            onOpenInChat={() => onPromoteAgent(session.id)}
          />
        </div>
      ))}
    </div>
  )
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
      <div className="border-border bg-surface rounded-lg border">
        <div className="border-border flex items-center justify-between border-b px-3 py-2">
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
              <Tooltip label="Heading" side="top">
                <button
                  type="button"
                  className={toolbarBtnClass}
                  onClick={() => insertAtLineStart('### ')}
                  aria-label="Heading"
                >
                  <Heading size={14} />
                </button>
              </Tooltip>
              <Tooltip label="Bold" side="top">
                <button
                  type="button"
                  className={toolbarBtnClass}
                  onClick={() => wrapSelection('**', '**', 'bold text')}
                  aria-label="Bold"
                >
                  <Bold size={14} />
                </button>
              </Tooltip>
              <Tooltip label="Italic" side="top">
                <button
                  type="button"
                  className={toolbarBtnClass}
                  onClick={() => wrapSelection('_', '_', 'italic text')}
                  aria-label="Italic"
                >
                  <Italic size={14} />
                </button>
              </Tooltip>
              <div className="bg-border mx-1 h-4 w-px" />
              <Tooltip label="Unordered list" side="top">
                <button
                  type="button"
                  className={toolbarBtnClass}
                  onClick={() => insertAtLineStart('- ')}
                  aria-label="Unordered list"
                >
                  <List size={14} />
                </button>
              </Tooltip>
              <Tooltip label="Ordered list" side="top">
                <button
                  type="button"
                  className={toolbarBtnClass}
                  onClick={() => insertAtLineStart('1. ')}
                  aria-label="Ordered list"
                >
                  <ListOrdered size={14} />
                </button>
              </Tooltip>
              <div className="bg-border mx-1 h-4 w-px" />
              <Tooltip label="Code" side="top">
                <button
                  type="button"
                  className={toolbarBtnClass}
                  onClick={() => wrapSelection('`', '`', 'code')}
                  aria-label="Code"
                >
                  <Code size={14} />
                </button>
              </Tooltip>
              <Tooltip label="Link" side="top">
                <button
                  type="button"
                  className={toolbarBtnClass}
                  onClick={() => wrapSelection('[', '](url)', 'link text')}
                  aria-label="Link"
                >
                  <Link size={14} />
                </button>
              </Tooltip>
              <Tooltip label="Quote" side="top">
                <button
                  type="button"
                  className={toolbarBtnClass}
                  onClick={() => insertAtLineStart('> ')}
                  aria-label="Quote"
                >
                  <Quote size={14} />
                </button>
              </Tooltip>
            </div>
          ) : null}
        </div>

        {editTab === 'write' ? (
          <textarea
            ref={textareaRef}
            value={editBody}
            onChange={(e) => setEditBody(e.target.value)}
            placeholder="Add a description..."
            className="text-foreground placeholder:text-foreground-subtle min-h-[180px] w-full resize-y bg-transparent p-4 text-sm focus:outline-none"
          />
        ) : (
          <div className="min-h-[180px]">
            {editBody ? (
              <MarkdownBody className="p-4">{editBody}</MarkdownBody>
            ) : (
              <p className="text-foreground-subtle p-4">Nothing to preview</p>
            )}
          </div>
        )}

        <div className="border-border flex items-center justify-end gap-2 border-t px-4 py-3">
          <button
            onClick={handleCancel}
            disabled={isSaving}
            className="bg-interactive text-foreground hover:bg-surface-hover rounded-md px-3 py-1.5 text-xs font-medium transition-[background-color,color,transform] active:scale-[0.96] disabled:opacity-40 disabled:active:scale-100"
          >
            Cancel
          </button>
          <button
            onClick={() => void handleSave()}
            disabled={isSaving}
            className="bg-accent text-foreground hover:bg-accent-hover rounded-md px-4 py-1.5 text-xs font-medium transition-[background-color,color,transform] active:scale-[0.96] disabled:opacity-40 disabled:active:scale-100"
          >
            {isSaving ? 'Saving...' : 'Save'}
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="border-border bg-surface rounded-lg border">
      <div className="border-border flex items-center gap-2 border-b px-4 py-3">
        <img src={pr.user.avatar_url} alt={pr.user.login} className="size-6 rounded-full" />
        <span className="text-foreground text-sm font-medium">{pr.user.login}</span>
        <span className="text-foreground-subtle text-xs">commented {formatRelativeTime(pr.created_at)}</span>
        <Tooltip label="Edit description" side="top">
          <button
            onClick={handleEdit}
            className="text-foreground-subtle hover:bg-surface-hover hover:text-foreground ml-auto rounded p-1 transition-colors"
            aria-label="Edit description"
          >
            <Pencil size={14} />
          </button>
        </Tooltip>
      </div>
      {pr.body ? (
        <MarkdownBody className="p-4">{pr.body}</MarkdownBody>
      ) : (
        <p className="text-foreground-subtle p-4 text-sm">No description provided.</p>
      )}
    </div>
  )
}

function CommentBox({
  owner,
  repo,
  number,
  body,
  onBodyChange,
  onAskClaude
}: {
  owner: string
  repo: string
  number: number
  body: string
  onBodyChange: (body: string) => void
  onAskClaude?: (prompt: string) => Promise<void>
}) {
  const [activeTab, setActiveTab] = useState<'write' | 'preview'>('write')
  const setBody = onBodyChange
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
        <h3 className="text-foreground text-sm font-semibold">Add a comment</h3>
      </div>

      <div className="border-border bg-surface rounded-lg border">
        <div className="border-border flex items-center justify-between border-b px-3 py-2">
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
              <Tooltip label="Heading" side="top">
                <button
                  type="button"
                  className={toolbarBtnClass}
                  onClick={() => insertAtLineStart('### ')}
                  aria-label="Heading"
                >
                  <Heading size={14} />
                </button>
              </Tooltip>
              <Tooltip label="Bold" side="top">
                <button
                  type="button"
                  className={toolbarBtnClass}
                  onClick={() => wrapSelection('**', '**', 'bold text')}
                  aria-label="Bold"
                >
                  <Bold size={14} />
                </button>
              </Tooltip>
              <Tooltip label="Italic" side="top">
                <button
                  type="button"
                  className={toolbarBtnClass}
                  onClick={() => wrapSelection('_', '_', 'italic text')}
                  aria-label="Italic"
                >
                  <Italic size={14} />
                </button>
              </Tooltip>
              <div className="bg-border mx-1 h-4 w-px" />
              <Tooltip label="Unordered list" side="top">
                <button
                  type="button"
                  className={toolbarBtnClass}
                  onClick={() => insertAtLineStart('- ')}
                  aria-label="Unordered list"
                >
                  <List size={14} />
                </button>
              </Tooltip>
              <Tooltip label="Ordered list" side="top">
                <button
                  type="button"
                  className={toolbarBtnClass}
                  onClick={() => insertAtLineStart('1. ')}
                  aria-label="Ordered list"
                >
                  <ListOrdered size={14} />
                </button>
              </Tooltip>
              <div className="bg-border mx-1 h-4 w-px" />
              <Tooltip label="Code" side="top">
                <button
                  type="button"
                  className={toolbarBtnClass}
                  onClick={() => wrapSelection('`', '`', 'code')}
                  aria-label="Code"
                >
                  <Code size={14} />
                </button>
              </Tooltip>
              <Tooltip label="Link" side="top">
                <button
                  type="button"
                  className={toolbarBtnClass}
                  onClick={() => wrapSelection('[', '](url)', 'link text')}
                  aria-label="Link"
                >
                  <Link size={14} />
                </button>
              </Tooltip>
              <Tooltip label="Quote" side="top">
                <button
                  type="button"
                  className={toolbarBtnClass}
                  onClick={() => insertAtLineStart('> ')}
                  aria-label="Quote"
                >
                  <Quote size={14} />
                </button>
              </Tooltip>
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
              <MarkdownBody className="p-4">{body}</MarkdownBody>
            ) : (
              <p className="text-foreground-subtle p-4">Nothing to preview</p>
            )}
          </div>
        )}

        <div className="border-border flex items-center justify-between border-t px-4 py-3">
          <p className="text-foreground-subtle text-xs">
            {claudeMention ? 'Claude will respond inline with PR context' : 'Markdown is supported'}
          </p>
          <button
            onClick={handleSubmit}
            disabled={!body.trim() || isSubmitting}
            className="bg-accent text-foreground hover:bg-accent-hover rounded-md px-4 py-1.5 text-xs font-medium transition-[background-color,color,transform] active:scale-[0.96] disabled:cursor-not-allowed disabled:opacity-40 disabled:active:scale-100"
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
    <div className="border-border bg-surface mt-4 rounded-lg border p-4">
      <div className="flex flex-wrap items-center gap-3">
        {state === 'open' ? (
          <>
            <div className="relative flex">
              <button
                onClick={handleMerge}
                disabled={isSubmitting || pr.mergeable === null || mergeDisabledReason !== null}
                className="bg-success text-success-foreground hover:bg-success/80 rounded-l-md px-4 py-2 text-xs font-medium transition-[background-color,color,transform] active:scale-[0.96] disabled:cursor-not-allowed disabled:opacity-40 disabled:active:scale-100"
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
                className="border-success/30 bg-success text-success-foreground hover:bg-success/80 rounded-r-md border-l px-2 py-2 transition-[background-color,color,transform] active:scale-[0.96] disabled:cursor-not-allowed disabled:opacity-40 disabled:active:scale-100"
              >
                <ChevronDown size={14} />
              </button>
              {isMergeMethodOpen ? (
                <>
                  <div className="fixed inset-0 z-10" onClick={() => setIsMergeMethodOpen(false)} />
                  <div className="border-border bg-surface absolute top-full left-0 z-20 mt-2 w-56 overflow-hidden rounded-lg border shadow-xl">
                    <div className="border-border text-foreground-muted border-b px-3 py-2 text-xs font-medium">
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
                        className="text-foreground hover:bg-surface-hover flex w-full items-center gap-2 px-3 py-2 text-left text-sm"
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
              className="border-border bg-interactive text-danger hover:bg-interactive-hover rounded-md border px-4 py-2 text-xs font-medium transition-[background-color,color,transform] active:scale-[0.96] disabled:cursor-not-allowed disabled:opacity-40 disabled:active:scale-100"
            >
              {isSubmitting ? 'Closing...' : 'Close pull request'}
            </button>

            <button
              onClick={handleConvertToDraft}
              disabled={isSubmitting}
              className="text-foreground-muted hover:text-foreground rounded-md px-4 py-2 text-xs font-medium transition-[color,transform] active:scale-[0.96] disabled:cursor-not-allowed disabled:opacity-40 disabled:active:scale-100"
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
              className="bg-success text-success-foreground hover:bg-success/80 rounded-md px-4 py-2 text-xs font-medium transition-[background-color,color,transform] active:scale-[0.96] disabled:cursor-not-allowed disabled:opacity-40 disabled:active:scale-100"
            >
              {isSubmitting ? 'Marking ready...' : 'Ready for review'}
            </button>

            <button
              onClick={handleClose}
              disabled={isSubmitting}
              className="border-border bg-interactive text-danger hover:bg-interactive-hover rounded-md border px-4 py-2 text-xs font-medium transition-[background-color,color,transform] active:scale-[0.96] disabled:cursor-not-allowed disabled:opacity-40 disabled:active:scale-100"
            >
              {isSubmitting ? 'Closing...' : 'Close pull request'}
            </button>
          </>
        ) : null}

        {state === 'closed' ? (
          <button
            onClick={handleReopen}
            disabled={isSubmitting}
            className="bg-success text-success-foreground hover:bg-success/80 rounded-md px-4 py-2 text-xs font-medium transition-[background-color,color,transform] active:scale-[0.96] disabled:cursor-not-allowed disabled:opacity-40 disabled:active:scale-100"
          >
            {isSubmitting ? 'Reopening...' : 'Reopen pull request'}
          </button>
        ) : null}
      </div>

      {mergeDisabledReason ? <p className="text-danger mt-2 text-sm">{mergeDisabledReason}</p> : null}

      {errorMessage ? <p className="text-danger mt-2 text-sm">{errorMessage}</p> : null}
    </div>
  )
}

function PRDetailSidebar({ pr, owner, repo }: { pr: PullRequestDetail; owner: string; repo: string }) {
  // Reuse the same queryKeys as `PRConversationTab` so react-query dedupes —
  // these are already loaded by the conversation view and don't refetch here.
  const { data: comments } = useQuery<PullRequestComment[]>({
    queryKey: ['pull-request-comments', owner, repo, pr.number],
    queryFn: () => window.api.github.pullComments.listIssueComments(owner, repo, pr.number),
    retry: false
  })
  const { data: reviewComments } = useQuery<PullRequestReviewComment[]>({
    queryKey: ['pull-request-review-comments', owner, repo, pr.number],
    queryFn: () => window.api.github.pullComments.listForPull(owner, repo, pr.number),
    retry: false
  })
  const { data: reviews } = useQuery<PullRequestReview[]>({
    queryKey: ['pull-request-reviews', owner, repo, pr.number],
    queryFn: () => window.api.github.reviews.list(owner, repo, pr.number),
    retry: false
  })

  const participantsMap = new Map<string, { login: string; avatar_url: string }>()
  participantsMap.set(pr.user.login, pr.user)
  for (const c of comments ?? []) if (c.user) participantsMap.set(c.user.login, c.user)
  for (const r of reviews ?? []) if (r.user) participantsMap.set(r.user.login, r.user)
  for (const rc of reviewComments ?? []) if (rc.user) participantsMap.set(rc.user.login, rc.user)
  const participants = Array.from(participantsMap.values())

  return (
    <div className="flex flex-col gap-5">
      <div>
        <p className="text-foreground-muted mb-2 text-xs font-medium">Reviewers</p>
        {pr.requested_reviewers.length > 0 ? (
          <div className="flex flex-col gap-1.5">
            {pr.requested_reviewers.map((reviewer) => (
              <div key={reviewer.login} className="flex items-center gap-2">
                <img src={reviewer.avatar_url} alt={reviewer.login} className="size-5 rounded-full" />
                <span className="text-foreground text-xs">{reviewer.login}</span>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-foreground-subtle text-xs">None yet</p>
        )}
      </div>

      <div>
        <p className="text-foreground-muted mb-2 text-xs font-medium">Assignees</p>
        {pr.assignees.length > 0 ? (
          <div className="flex flex-col gap-1.5">
            {pr.assignees.map((assignee) => (
              <div key={assignee.login} className="flex items-center gap-2">
                <img src={assignee.avatar_url} alt={assignee.login} className="size-5 rounded-full" />
                <span className="text-foreground text-xs">{assignee.login}</span>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-foreground-subtle text-xs">No one assigned</p>
        )}
      </div>

      <div>
        <p className="text-foreground-muted mb-2 text-xs font-medium">Labels</p>
        {pr.labels.length > 0 ? (
          <div className="flex flex-wrap gap-1">
            {pr.labels.map((label) => (
              <span
                key={label.name}
                className="border-border text-foreground rounded-full border px-2 py-0.5 text-xs"
                style={{ borderColor: `#${label.color}40`, backgroundColor: `#${label.color}15` }}
              >
                {label.name}
              </span>
            ))}
          </div>
        ) : (
          <p className="text-foreground-subtle text-xs">None yet</p>
        )}
      </div>

      <div>
        <p className="text-foreground-muted mb-2 text-xs font-medium">
          {participants.length} participant{participants.length !== 1 ? 's' : ''}
        </p>
        <div className="flex flex-wrap gap-1">
          {participants.map((p) => (
            <Tooltip key={p.login} label={p.login} side="top">
              <img src={p.avatar_url} alt={p.login} className="size-5 rounded-full" />
            </Tooltip>
          ))}
        </div>
      </div>
    </div>
  )
}

function MergedBranchSwitchBanner({
  folderPath,
  headBranch,
  baseBranch
}: {
  folderPath: string
  headBranch: string
  baseBranch: string
}) {
  const queryClient = useQueryClient()
  const [status, setStatus] = useState<'idle' | 'switching' | 'done' | 'error'>('idle')
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  const handleSwitch = async (): Promise<void> => {
    if (status === 'switching' || status === 'done') return
    setStatus('switching')
    setErrorMessage(null)
    try {
      await window.api.git.checkout(folderPath, baseBranch)
      setStatus('done')
      await queryClient.invalidateQueries({ queryKey: ['git-branch-info', folderPath] })
      await queryClient.invalidateQueries({ queryKey: ['git-status', folderPath] })
    } catch (err) {
      setStatus('error')
      setErrorMessage(err instanceof Error ? err.message : 'Failed to switch branch')
    }
  }

  return (
    <div className="border-border bg-surface mt-8 rounded-lg border p-4">
      <div className="flex items-start gap-3">
        <div className="bg-interactive flex size-8 shrink-0 items-center justify-center rounded-full">
          <GitMerge size={16} className="text-foreground-muted" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-foreground text-sm font-medium">Pull request merged</p>
          <p className="text-foreground-muted mt-0.5 text-xs">
            You're still on <code className="bg-accent-bg text-accent rounded px-1 py-0.5">{headBranch}</code>. Switch
            to <code className="bg-accent-bg text-accent rounded px-1 py-0.5">{baseBranch}</code> to continue working.
          </p>
          {errorMessage ? <p className="text-danger mt-2 text-xs">{errorMessage}</p> : null}
        </div>
        <button
          type="button"
          onClick={handleSwitch}
          disabled={status === 'switching' || status === 'done'}
          className={cn(
            'text-foreground inline-flex shrink-0 items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-[background-color,transform] active:scale-[0.96] disabled:active:scale-100',
            status === 'switching' ? 'bg-success/70' : 'bg-success hover:bg-success/80'
          )}
        >
          {status === 'done' ? (
            <>
              <Check size={14} className="animate-check-in" />
              <span>Switched</span>
            </>
          ) : status === 'switching' ? (
            <>
              <span className="border-foreground/30 border-t-foreground size-3 animate-spin rounded-full border-2" />
              <span>Switching...</span>
            </>
          ) : (
            <>
              <GitBranch size={14} />
              <span>Switch to {baseBranch}</span>
            </>
          )}
        </button>
      </div>
    </div>
  )
}
