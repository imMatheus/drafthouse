import type {
  PullRequestReviewComment,
  PullRequestReviewLineSide,
  PullRequestReviewThreadSummary
} from '../../../../shared/types'

interface ReviewThreadAnchor {
  side: PullRequestReviewLineSide
  line: number
}

function getReviewCommentAnchor(comment: PullRequestReviewComment): ReviewThreadAnchor | null {
  const rawSide = comment.side ?? comment.start_side
  const side = rawSide === 'LEFT' || rawSide === 'RIGHT' ? rawSide : null
  const line = comment.line ?? comment.original_line ?? comment.start_line ?? comment.original_start_line ?? null

  if (!side || typeof line !== 'number' || Number.isNaN(line)) {
    return null
  }

  return { side, line }
}

export interface PullRequestReviewThread {
  id: number
  path: string
  line: number | null
  side: PullRequestReviewLineSide | null
  /**
   * True when the commented line no longer exists in the latest diff — GitHub
   * clears `line`/`position` in that case and only keeps `original_*`. The
   * thread still renders in the conversation tab with an "Outdated" badge but
   * isn't anchored to a line in the inline diff viewer.
   */
  isOutdated: boolean
  /** GraphQL thread node ID — needed to resolve/unresolve. Null when not yet loaded. */
  graphqlId: string | null
  isResolved: boolean
  topLevelComment: PullRequestReviewComment
  replies: PullRequestReviewComment[]
}

export function isOutdatedReviewComment(comment: PullRequestReviewComment): boolean {
  return comment.line == null
}

export function buildPullRequestReviewThreads(
  reviewComments: PullRequestReviewComment[],
  threadSummaries?: PullRequestReviewThreadSummary[]
): PullRequestReviewThread[] {
  const repliesByParent = new Map<number, PullRequestReviewComment[]>()

  for (const comment of reviewComments) {
    if (comment.in_reply_to_id != null) {
      const replies = repliesByParent.get(comment.in_reply_to_id) ?? []
      replies.push(comment)
      repliesByParent.set(comment.in_reply_to_id, replies)
    }
  }

  const summaryByRestCommentId = new Map<number, PullRequestReviewThreadSummary>()
  for (const summary of threadSummaries ?? []) {
    for (const id of summary.commentDatabaseIds) {
      summaryByRestCommentId.set(id, summary)
    }
  }

  return reviewComments.flatMap((comment) => {
    if (comment.in_reply_to_id != null) {
      return []
    }

    const outdated = isOutdatedReviewComment(comment)
    const anchor = outdated ? null : getReviewCommentAnchor(comment)
    const summary = summaryByRestCommentId.get(comment.id)

    return [
      {
        id: comment.id,
        path: comment.path,
        line: outdated ? null : (anchor?.line ?? comment.line ?? null),
        side: outdated ? null : (anchor?.side ?? null),
        isOutdated: outdated,
        graphqlId: summary?.id ?? null,
        isResolved: summary?.isResolved ?? false,
        topLevelComment: comment,
        replies: (repliesByParent.get(comment.id) ?? []).sort(
          (left, right) => new Date(left.created_at).getTime() - new Date(right.created_at).getTime()
        )
      }
    ]
  })
}

export function formatRelativeTime(dateStr: string): string {
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

export function formatAbsoluteDate(dateStr: string): string {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short'
  }).format(new Date(dateStr))
}

export function getCommitSubject(message: string | null | undefined): string {
  return message?.split('\n')[0]?.trim() || 'Untitled commit'
}

export function getCommitBody(message: string | null | undefined): string {
  return message?.split('\n').slice(1).join('\n').trim() ?? ''
}

export function DiffStat({ additions, deletions }: { additions: number; deletions: number }) {
  return (
    <span
      className="inline-flex items-center gap-2 text-xs tabular-nums"
      aria-label={`${additions} additions and ${deletions} deletions`}
    >
      <span className="text-success font-semibold">+{additions}</span>
      <span className="text-danger font-semibold">-{deletions}</span>
    </span>
  )
}
