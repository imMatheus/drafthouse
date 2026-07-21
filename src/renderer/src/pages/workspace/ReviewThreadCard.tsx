import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Reply } from 'lucide-react'
import { PatchCodeBlock } from '../../components/CodeViewBlock'
import type { PullRequestReviewComment } from '../../../../shared/types'
import { useSettings } from '../../hooks/useSettings'
import { useTheme } from '../../hooks/useTheme'
import { BASE_DIFF_OPTIONS, codeViewItemMetrics, wrapGitPatch } from '../../lib/diffs'
import ReactionBar from '../../components/ReactionBar'
import CommentActionsMenu from '../../components/CommentActionsMenu'
import CommentBodyEditor from '../../components/CommentBodyEditor'
import CommentComposer from '../../components/CommentComposer'
import FixWithClaudeButton from '../../components/FixWithClaudeButton'
import InlineAgentResponseCard from '../../components/InlineAgentResponseCard'
import ResolveThreadButton from '../../components/ResolveThreadButton'
import type { AgentSessionMeta } from '../../../../shared/types'
import type { FixWithClaudeInput } from '../../lib/agentContext'
import { cn } from '../../lib/cn'
import MarkdownBody from './MarkdownBody'
import { formatRelativeTime, type PullRequestReviewThread } from './pullRequestShared'

export default function ReviewThreadCard({
  thread,
  owner,
  repo,
  prNumber,
  onViewReviewThread,
  replyTarget,
  onQuoteReply: externalQuoteReply,
  onFixWithClaude,
  agentSessions,
  onStopAgent,
  onContinueAgent,
  onPromoteAgent
}: {
  thread: PullRequestReviewThread
  owner?: string
  repo?: string
  prNumber?: number
  onViewReviewThread?: (thread: PullRequestReviewThread) => void
  replyTarget?: { owner: string; repo: string; number: number }
  onQuoteReply?: (quoted: string) => void
  onFixWithClaude?: (input: FixWithClaudeInput) => Promise<void>
  agentSessions?: AgentSessionMeta[]
  onStopAgent?: (sessionId: string) => Promise<void>
  onContinueAgent?: (sessionId: string, prompt: string, files?: string[]) => Promise<void>
  onPromoteAgent?: (sessionId: string) => void
}) {
  const { topLevelComment, replies } = thread
  const resolvedOwner = owner ?? replyTarget?.owner
  const resolvedRepo = repo ?? replyTarget?.repo
  const resolvedNumber = prNumber ?? replyTarget?.number

  const [replyBody, setReplyBody] = useState('')
  const [isReplyOpen, setIsReplyOpen] = useState(false)
  const [editingId, setEditingId] = useState<number | null>(null)

  const handleQuoteReply = (quoted: string): void => {
    if (replyTarget) {
      setReplyBody((prev) => (prev ? `${prev}\n${quoted}` : quoted))
      setIsReplyOpen(true)
    } else if (externalQuoteReply) {
      externalQuoteReply(quoted)
    }
  }

  const renderComment = (comment: PullRequestReviewComment, isReply: boolean): React.ReactNode => {
    const canShowMenu = resolvedOwner && resolvedRepo && resolvedNumber !== undefined
    const isEditing = editingId === comment.id
    const commentSessions = (agentSessions ?? []).filter((s) => s.context?.commentId === comment.id)

    return (
      <>
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="text-foreground text-sm font-semibold">{comment.user.login}</span>
          <span className="text-foreground-muted text-sm">
            {isReply ? 'replied ' : ''}
            {formatRelativeTime(comment.created_at)}
          </span>
          {canShowMenu ? (
            <div className="ml-auto">
              <CommentActionsMenu
                owner={resolvedOwner!}
                repo={resolvedRepo!}
                number={resolvedNumber!}
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
          ) : null}
        </div>
        <div className="mt-3">
          {isEditing && canShowMenu ? (
            <CommentBodyEditor
              owner={resolvedOwner!}
              repo={resolvedRepo!}
              number={resolvedNumber!}
              commentType="pull-comment"
              commentId={comment.id}
              initialBody={comment.body}
              onCancel={() => setEditingId(null)}
              onSaved={() => setEditingId(null)}
            />
          ) : (
            <MarkdownBody>{comment.body}</MarkdownBody>
          )}
        </div>
        {resolvedOwner && resolvedRepo ? (
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <ReactionBar owner={resolvedOwner} repo={resolvedRepo} commentId={comment.id} commentType="pull-comment" />
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
            {!isReply && resolvedOwner && resolvedRepo && resolvedNumber !== undefined ? (
              <ResolveThreadButton
                threadId={thread.graphqlId}
                isResolved={thread.isResolved}
                owner={resolvedOwner}
                repo={resolvedRepo}
                number={resolvedNumber}
              />
            ) : null}
          </div>
        ) : null}
        {commentSessions.length > 0 ? (
          <div className="border-border -mx-4 mt-4 -mb-4 border-t">
            {commentSessions.map((session) => (
              <div key={session.id}>
                <InlineAgentResponseCard
                  session={session}
                  variant="nested"
                  onStop={() => onStopAgent?.(session.id)}
                  onContinue={(prompt) => onContinueAgent?.(session.id, prompt)}
                  onOpenInChat={() => onPromoteAgent?.(session.id)}
                />
                {session.status === 'completed' &&
                !isReply &&
                resolvedOwner &&
                resolvedRepo &&
                resolvedNumber !== undefined &&
                thread.graphqlId &&
                !thread.isResolved ? (
                  <div className="border-border bg-background flex items-center justify-between gap-3 border-t px-4 py-3">
                    <span className="text-foreground-muted text-xs">Claude is done. Mark this thread as resolved?</span>
                    <ResolveThreadButton
                      threadId={thread.graphqlId}
                      isResolved={thread.isResolved}
                      owner={resolvedOwner}
                      repo={resolvedRepo}
                      number={resolvedNumber}
                      variant="solid"
                    />
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        ) : null}
      </>
    )
  }

  return (
    <div
      className={cn('border-border bg-surface overflow-hidden rounded-xl border', thread.isResolved && 'opacity-70')}
    >
      <div className="border-border bg-interactive flex items-center justify-between gap-3 border-b px-4 py-2">
        <div className="text-foreground flex min-w-0 items-center gap-2 text-sm font-medium">
          <span className="truncate">
            {thread.path}
            {thread.line !== null ? <span className="text-foreground-muted">:{thread.line}</span> : null}
          </span>
          {thread.isResolved ? (
            <span className="border-success/40 bg-success/10 text-success shrink-0 rounded-md border px-1.5 py-0.5 text-[10px] font-semibold tracking-wide uppercase">
              Resolved
            </span>
          ) : null}
          {thread.isOutdated ? (
            <span
              title="The line this comment was anchored to no longer exists in the latest diff"
              className="border-border bg-surface text-foreground-muted shrink-0 rounded-md border px-1.5 py-0.5 text-[10px] font-semibold tracking-wide uppercase"
            >
              Outdated
            </span>
          ) : null}
        </div>
        {onViewReviewThread && !thread.isOutdated ? (
          <button
            type="button"
            onClick={() => onViewReviewThread(thread)}
            className="text-foreground-muted hover:text-foreground shrink-0 text-sm font-medium"
          >
            View reviewed changes
          </button>
        ) : null}
      </div>

      <ReviewDiffHunkPreview comment={topLevelComment} />

      <div className="border-border border-t">
        <div className="flex items-start gap-3 px-4 py-4">
          <img src={topLevelComment.user.avatar_url} alt={topLevelComment.user.login} className="size-8 rounded-full" />
          <div className="min-w-0 flex-1">{renderComment(topLevelComment, false)}</div>
        </div>

        {replies.length > 0 ? (
          <div className="border-border border-t">
            {replies.map((reply) => (
              <div key={reply.id} className="border-border flex items-start gap-3 border-t px-4 py-4 first:border-t-0">
                <img src={reply.user.avatar_url} alt={reply.user.login} className="size-7 rounded-full" />
                <div className="min-w-0 flex-1">{renderComment(reply, true)}</div>
              </div>
            ))}
          </div>
        ) : null}

        {replyTarget ? (
          <div className="border-border border-t px-4 py-4">
            <InlineReviewReplyForm
              owner={replyTarget.owner}
              repo={replyTarget.repo}
              number={replyTarget.number}
              thread={thread}
              body={replyBody}
              onBodyChange={setReplyBody}
              isOpen={isReplyOpen}
              onOpenChange={setIsReplyOpen}
            />
          </div>
        ) : null}
      </div>
    </div>
  )
}

function ReviewDiffHunkPreview({ comment }: { comment: PullRequestReviewComment }) {
  const { settings } = useSettings()
  const { theme } = useTheme()

  if (!comment.diff_hunk) return null

  return (
    <div className="border-border border-b">
      <PatchCodeBlock
        patch={wrapGitPatch(comment.path, comment.diff_hunk)}
        options={{
          ...BASE_DIFF_OPTIONS,
          themeType: theme,
          diffStyle: settings.diffViewMode === 'split' ? 'split' : 'unified',
          disableFileHeader: true,
          itemMetrics: codeViewItemMetrics(settings.codeFontSize)
        }}
      />
    </div>
  )
}

function InlineReviewReplyForm({
  owner,
  repo,
  number,
  thread,
  body,
  onBodyChange,
  isOpen,
  onOpenChange
}: {
  owner: string
  repo: string
  number: number
  thread: PullRequestReviewThread
  body: string
  onBodyChange: (body: string) => void
  isOpen: boolean
  onOpenChange: (open: boolean) => void
}) {
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const queryClient = useQueryClient()

  if (!isOpen) {
    return (
      <button
        type="button"
        onClick={() => onOpenChange(true)}
        className="border-border bg-interactive text-foreground hover:bg-interactive-hover inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs font-medium transition-colors"
      >
        <Reply size={13} />
        Reply
      </button>
    )
  }

  const handleSubmit = async (): Promise<void> => {
    if (!body.trim() || isSubmitting) return

    setIsSubmitting(true)
    setErrorMessage(null)

    try {
      await window.api.github.pullComments.createReply(owner, repo, number, thread.topLevelComment.id, body)
      onBodyChange('')
      onOpenChange(false)
      await queryClient.invalidateQueries({
        queryKey: ['pull-request-review-comments', owner, repo, number]
      })
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Unable to reply to this comment.')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <CommentComposer
      value={body}
      onChange={onBodyChange}
      onSubmit={() => void handleSubmit()}
      onCancel={() => {
        onOpenChange(false)
        setErrorMessage(null)
      }}
      submitLabel="Reply"
      submittingLabel="Replying..."
      isSubmitting={isSubmitting}
      placeholder="Reply to this thread"
      error={errorMessage}
    />
  )
}
