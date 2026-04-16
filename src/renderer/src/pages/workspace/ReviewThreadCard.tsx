import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Reply } from 'lucide-react'
import type { PullRequestReviewComment } from '../../../../shared/types'
import { useSettings } from '../../hooks/useSettings'
import { useTheme } from '../../hooks/useTheme'
import { DiffEditor } from '@monaco-editor/react'
import { getMonacoTheme, getMonacoLanguage, BASE_DIFF_OPTIONS } from '../../lib/monaco'
import ReactionBar from '../../components/ReactionBar'
import MarkdownBody from './MarkdownBody'
import { splitDiffHunkToContents } from './pullRequestDiff'
import { formatRelativeTime, type PullRequestReviewThread } from './pullRequestShared'

export default function ReviewThreadCard({
  thread,
  owner,
  repo,
  onViewReviewThread,
  replyTarget
}: {
  thread: PullRequestReviewThread
  owner?: string
  repo?: string
  onViewReviewThread?: (thread: PullRequestReviewThread) => void
  replyTarget?: { owner: string; repo: string; number: number }
}) {
  const { topLevelComment, replies } = thread
  const resolvedOwner = owner ?? replyTarget?.owner
  const resolvedRepo = repo ?? replyTarget?.repo

  return (
    <div className="overflow-hidden rounded-xl border border-border bg-surface">
      <div className="flex items-center justify-between gap-3 border-b border-border bg-interactive px-4 py-2">
        <div className="min-w-0 text-sm font-medium text-foreground">
          {thread.path}
          {thread.line !== null ? <span className="text-foreground-muted">:{thread.line}</span> : null}
        </div>
        {onViewReviewThread ? (
          <button
            type="button"
            onClick={() => onViewReviewThread(thread)}
            className="shrink-0 text-sm font-medium text-foreground-muted hover:text-foreground"
          >
            View reviewed changes
          </button>
        ) : null}
      </div>

      <ReviewDiffHunkPreview comment={topLevelComment} />

      <div className="border-t border-border">
        <div className="flex items-start gap-3 px-4 py-4">
          <img src={topLevelComment.user.avatar_url} alt={topLevelComment.user.login} className="size-8 rounded-full" />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <span className="text-sm font-semibold text-foreground">{topLevelComment.user.login}</span>
              <span className="text-sm text-foreground-muted">{formatRelativeTime(topLevelComment.created_at)}</span>
            </div>
            <div className="mt-3">
              <MarkdownBody>{topLevelComment.body}</MarkdownBody>
            </div>
            {resolvedOwner && resolvedRepo ? (
              <div className="mt-3">
                <ReactionBar
                  owner={resolvedOwner}
                  repo={resolvedRepo}
                  commentId={topLevelComment.id}
                  commentType="pull-comment"
                />
              </div>
            ) : null}
          </div>
        </div>

        {replies.length > 0 ? (
          <div className="border-t border-border">
            {replies.map((reply) => (
              <div key={reply.id} className="flex items-start gap-3 border-t border-border px-4 py-4 first:border-t-0">
                <img src={reply.user.avatar_url} alt={reply.user.login} className="size-7 rounded-full" />
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
                  {resolvedOwner && resolvedRepo ? (
                    <div className="mt-3">
                      <ReactionBar
                        owner={resolvedOwner}
                        repo={resolvedRepo}
                        commentId={reply.id}
                        commentType="pull-comment"
                      />
                    </div>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        ) : null}

        {replyTarget ? (
          <div className="border-t border-border px-4 py-4">
            <InlineReviewReplyForm
              owner={replyTarget.owner}
              repo={replyTarget.repo}
              number={replyTarget.number}
              thread={thread}
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
    <div className="border-b border-border" style={{ height }}>
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
  thread
}: {
  owner: string
  repo: string
  number: number
  thread: PullRequestReviewThread
}) {
  const [isOpen, setIsOpen] = useState(false)
  const [body, setBody] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const queryClient = useQueryClient()

  if (!isOpen) {
    return (
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        className="inline-flex items-center gap-1.5 rounded-md border border-border bg-interactive px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-interactive-hover"
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
      setBody('')
      setIsOpen(false)
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
    <div className="rounded-lg border border-border bg-background">
      <textarea
        value={body}
        onChange={(event) => setBody(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
            event.preventDefault()
            void handleSubmit()
          }
        }}
        placeholder="Reply to this thread"
        className="min-h-24 w-full resize-y bg-transparent px-4 py-3 text-sm text-foreground placeholder:text-foreground-subtle focus:outline-none"
      />
      {errorMessage ? <p className="px-4 text-sm text-danger">{errorMessage}</p> : null}
      <div className="flex items-center justify-end gap-2 border-t border-border px-4 py-3">
        <button
          type="button"
          onClick={() => {
            setIsOpen(false)
            setErrorMessage(null)
          }}
          className="rounded-md border border-border bg-interactive px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-interactive-hover"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={handleSubmit}
          disabled={!body.trim() || isSubmitting}
          className="rounded-md bg-accent px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-40"
        >
          {isSubmitting ? 'Replying...' : 'Reply'}
        </button>
      </div>
    </div>
  )
}
