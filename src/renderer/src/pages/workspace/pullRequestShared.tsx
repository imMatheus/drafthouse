import type {
  PullRequestReviewComment,
  PullRequestReviewLineSide
} from '../../../../shared/types'
import { getReviewCommentAnchor } from './pullRequestDiff'

export interface PullRequestReviewThread {
  id: number
  path: string
  line: number | null
  side: PullRequestReviewLineSide | null
  topLevelComment: PullRequestReviewComment
  replies: PullRequestReviewComment[]
}

export function buildPullRequestReviewThreads(
  reviewComments: PullRequestReviewComment[]
): PullRequestReviewThread[] {
  const repliesByParent = new Map<number, PullRequestReviewComment[]>()

  for (const comment of reviewComments) {
    if (comment.in_reply_to_id != null) {
      const replies = repliesByParent.get(comment.in_reply_to_id) ?? []
      replies.push(comment)
      repliesByParent.set(comment.in_reply_to_id, replies)
    }
  }

  return reviewComments.flatMap((comment) => {
    if (comment.in_reply_to_id != null) {
      return []
    }

    const anchor = getReviewCommentAnchor(comment)

    return [
      {
        id: comment.id,
        path: comment.path,
        line: anchor?.line ?? comment.line ?? null,
        side: anchor?.side ?? null,
        topLevelComment: comment,
        replies: (repliesByParent.get(comment.id) ?? []).sort(
          (left, right) =>
            new Date(left.created_at).getTime() - new Date(right.created_at).getTime()
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

export function DiffStat({ additions, deletions }: { additions: number; deletions: number }) {
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

function getDiffStatSegments(
  additions: number,
  deletions: number
): Array<'added' | 'deleted' | 'empty'> {
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

  const addedSegments = Math.min(
    totalSegments - 1,
    Math.max(1, Math.round((additions / totalChanges) * totalSegments))
  )
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
