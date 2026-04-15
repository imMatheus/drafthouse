import { useEffect, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Reply } from 'lucide-react'
import type { PullRequestReviewComment } from '../../../../shared/types'
import { cn } from '../../lib/cn'
import { useSettings } from '../../hooks/useSettings'
import { useTheme } from '../../hooks/useTheme'
import { getLanguageFromPath, tokenizeReviewPreviewLines, type HighlightedToken } from '../../lib/shiki'
import ReactionBar from '../../components/ReactionBar'
import MarkdownBody from './MarkdownBody'
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
  const lines = getReviewDiffPreviewLines(comment)
  const [tokenMap, setTokenMap] = useState<Map<number, HighlightedToken[]>>(new Map())

  useEffect(() => {
    if (lines.length === 0) return
    const lang = getLanguageFromPath(comment.path)
    tokenizeReviewPreviewLines(lines, lang, theme).then(setTokenMap)
  }, [comment.diff_hunk, comment.path, theme])

  if (lines.length === 0) {
    return null
  }

  if (settings.diffViewMode === 'split') {
    return <ReviewDiffHunkSplit lines={lines} tokenMap={tokenMap} />
  }

  return <ReviewDiffHunkUnified lines={lines} tokenMap={tokenMap} />
}

function TokenizedContent({ tokens, fallback }: { tokens: HighlightedToken[] | undefined; fallback: string }) {
  if (tokens) {
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
  return <>{fallback}</>
}

function ReviewDiffHunkUnified({
  lines,
  tokenMap
}: {
  lines: ReviewDiffPreviewLine[]
  tokenMap: Map<number, HighlightedToken[]>
}) {
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
                  <TokenizedContent tokens={tokenMap.get(index)} fallback={line.content} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function ReviewDiffHunkSplit({
  lines,
  tokenMap
}: {
  lines: ReviewDiffPreviewLine[]
  tokenMap: Map<number, HighlightedToken[]>
}) {
  // Align deletions with additions into side-by-side pairs
  type AlignedPair = {
    left: { line: ReviewDiffPreviewLine; index: number } | null
    right: { line: ReviewDiffPreviewLine; index: number } | null
  }
  const pairs: AlignedPair[] = []
  let i = 0

  while (i < lines.length) {
    const line = lines[i]

    if (line.kind === 'header' || line.kind === 'context') {
      pairs.push({ left: { line, index: i }, right: { line, index: i } })
      i++
      continue
    }

    const deletions: { line: ReviewDiffPreviewLine; index: number }[] = []
    const additions: { line: ReviewDiffPreviewLine; index: number }[] = []

    while (i < lines.length && lines[i].kind === 'deletion') {
      deletions.push({ line: lines[i], index: i })
      i++
    }
    while (i < lines.length && lines[i].kind === 'addition') {
      additions.push({ line: lines[i], index: i })
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
    <div className="border-b border-border bg-background">
      <div className="overflow-x-auto">
        <table className="min-w-full table-fixed border-collapse text-sm">
          <colgroup>
            <col className="w-10" />
            <col className="w-1/2" />
            <col className="w-10" />
            <col className="w-1/2" />
          </colgroup>
          <tbody>
            {pairs.map((pair, idx) => {
              if (pair.left?.line.kind === 'header') {
                return (
                  <tr key={idx} className="bg-interactive">
                    <td colSpan={4} className="px-3 py-1.5 font-mono text-[13px] text-foreground-muted">
                      {pair.left.line.content}
                    </td>
                  </tr>
                )
              }

              return (
                <tr key={idx}>
                  <td
                    className={cn(
                      'border-r border-border px-2 py-0 text-right font-mono text-xs text-foreground-subtle',
                      pair.left?.line.kind === 'deletion' ? 'bg-danger/10' : 'bg-background'
                    )}
                  >
                    {pair.left?.line.oldLine ?? ''}
                  </td>
                  <td
                    className={cn(
                      'overflow-hidden border-r border-border px-3 py-0 font-mono text-[13px] whitespace-pre-wrap break-all',
                      pair.left?.line.kind === 'deletion'
                        ? 'bg-danger/10 text-foreground'
                        : pair.left
                          ? 'bg-background text-foreground'
                          : 'bg-surface'
                    )}
                  >
                    {pair.left ? (
                      <TokenizedContent tokens={tokenMap.get(pair.left.index)} fallback={pair.left.line.content} />
                    ) : (
                      '\u00A0'
                    )}
                  </td>
                  <td
                    className={cn(
                      'border-r border-border px-2 py-0 text-right font-mono text-xs text-foreground-subtle',
                      pair.right?.line.kind === 'addition' ? 'bg-success/10' : 'bg-background'
                    )}
                  >
                    {pair.right?.line.newLine ?? ''}
                  </td>
                  <td
                    className={cn(
                      'overflow-hidden px-3 py-0 font-mono text-[13px] whitespace-pre-wrap break-all',
                      pair.right?.line.kind === 'addition'
                        ? 'bg-success/10 text-foreground'
                        : pair.right
                          ? 'bg-background text-foreground'
                          : 'bg-surface'
                    )}
                  >
                    {pair.right ? (
                      <TokenizedContent tokens={tokenMap.get(pair.right.index)} fallback={pair.right.line.content} />
                    ) : (
                      '\u00A0'
                    )}
                  </td>
                </tr>
              )
            })}
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
