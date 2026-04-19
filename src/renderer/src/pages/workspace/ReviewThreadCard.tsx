import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Reply } from 'lucide-react'
import type { PullRequestReviewComment } from '../../../../shared/types'
import { useSettings } from '../../hooks/useSettings'
import { useTheme } from '../../hooks/useTheme'
import { DiffEditor } from '@monaco-editor/react'
import { getMonacoTheme, getMonacoLanguage, BASE_DIFF_OPTIONS } from '../../lib/monaco'
import ReactionBar from '../../components/ReactionBar'
import CommentActionsMenu from '../../components/CommentActionsMenu'
import CommentBodyEditor from '../../components/CommentBodyEditor'
import MarkdownBody from './MarkdownBody'
import { splitDiffHunkToContents } from './pullRequestDiff'
import { formatRelativeTime, type PullRequestReviewThread } from './pullRequestShared'

export default function ReviewThreadCard({
  thread,
  owner,
  repo,
  prNumber,
  onViewReviewThread,
  replyTarget,
  onQuoteReply: externalQuoteReply
}: {
  thread: PullRequestReviewThread
  owner?: string
  repo?: string
  prNumber?: number
  onViewReviewThread?: (thread: PullRequestReviewThread) => void
  replyTarget?: { owner: string; repo: string; number: number }
  onQuoteReply?: (quoted: string) => void
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
          <div className="mt-3">
            <ReactionBar
              owner={resolvedOwner}
              repo={resolvedRepo}
              commentId={comment.id}
              commentType="pull-comment"
            />
          </div>
        ) : null}
      </>
    )
  }

  return (
    <div className="border-border bg-surface overflow-hidden rounded-xl border">
      <div className="border-border bg-interactive flex items-center justify-between gap-3 border-b px-4 py-2">
        <div className="text-foreground min-w-0 text-sm font-medium">
          {thread.path}
          {thread.line !== null ? <span className="text-foreground-muted">:{thread.line}</span> : null}
        </div>
        {onViewReviewThread ? (
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
  const { theme } = useTheme()
  const { settings } = useSettings()

  if (!comment.diff_hunk) return null

  const { original, modified } = splitDiffHunkToContents(comment.diff_hunk)
  const lineCount = Math.max(original.split('\n').length, modified.split('\n').length, 1)
  const height = Math.min(lineCount, 8) * 24 + 8

  return (
    <div className="border-border border-b" style={{ height }}>
      <DiffEditor
        key={settings.diffViewMode}
        original={original}
        modified={modified}
        language={getMonacoLanguage(comment.path)}
        theme={getMonacoTheme(theme)}
        options={{
          ...BASE_DIFF_OPTIONS,
          renderSideBySide: settings.diffViewMode === 'split',
          lineNumbers: 'off',
          folding: false,
          glyphMargin: false,
          lineDecorationsWidth: 0,
          lineNumbersMinChars: 0,
          scrollbar: { vertical: 'hidden', horizontal: 'hidden' }
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
    <div className="border-border bg-background rounded-lg border">
      <textarea
        value={body}
        onChange={(event) => onBodyChange(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
            event.preventDefault()
            void handleSubmit()
          }
        }}
        placeholder="Reply to this thread"
        className="text-foreground placeholder:text-foreground-subtle min-h-24 w-full resize-y bg-transparent px-4 py-3 text-sm focus:outline-none"
        autoFocus
      />
      {errorMessage ? <p className="text-danger px-4 text-sm">{errorMessage}</p> : null}
      <div className="border-border flex items-center justify-end gap-2 border-t px-4 py-3">
        <button
          type="button"
          onClick={() => {
            onOpenChange(false)
            setErrorMessage(null)
          }}
          className="border-border bg-interactive text-foreground hover:bg-interactive-hover rounded-md border px-3 py-1.5 text-xs font-medium transition-colors"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={handleSubmit}
          disabled={!body.trim() || isSubmitting}
          className="bg-accent text-foreground hover:bg-accent-hover rounded-md px-3 py-1.5 text-xs font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-40"
        >
          {isSubmitting ? 'Replying...' : 'Reply'}
        </button>
      </div>
    </div>
  )
}
