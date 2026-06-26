import { useEffect, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { SmilePlus } from 'lucide-react'
import { cn } from '../lib/cn'
import Tooltip from './Tooltip'
import type { AuthData, GitHubReaction, ReactionContent } from '../../../shared/types'

const REACTION_EMOJIS: { content: ReactionContent; emoji: string }[] = [
  { content: '+1', emoji: '👍' },
  { content: '-1', emoji: '👎' },
  { content: 'laugh', emoji: '😄' },
  { content: 'hooray', emoji: '🎉' },
  { content: 'confused', emoji: '😕' },
  { content: 'heart', emoji: '❤️' },
  { content: 'rocket', emoji: '🚀' },
  { content: 'eyes', emoji: '👀' }
]

type CommentType = 'issue-comment' | 'pull-comment'

interface ReactionBarProps {
  owner: string
  repo: string
  commentId: number
  commentType: CommentType
}

export default function ReactionBar({ owner, repo, commentId, commentType }: ReactionBarProps) {
  const [showPicker, setShowPicker] = useState(false)
  const [pending, setPending] = useState(false)
  const queryClient = useQueryClient()

  const queryKey = ['reactions', owner, repo, commentType, commentId]

  const { data: reactions } = useQuery<GitHubReaction[]>({
    queryKey,
    queryFn: () =>
      commentType === 'issue-comment'
        ? window.api.github.reactions.listForIssueComment(owner, repo, commentId)
        : window.api.github.reactions.listForPullComment(owner, repo, commentId),
    retry: false
  })

  const { data: auth } = useQuery<AuthData | null, Error>({
    queryKey: ['auth-user'],
    queryFn: () => window.api.auth.getUser(),
    retry: false
  })

  const currentUser = auth?.user.login ?? null
  const allReactions = reactions ?? []

  // Group reactions by content
  const grouped = new Map<ReactionContent, { count: number; reacted: boolean; reactionId: number | null }>()
  for (const reaction of allReactions) {
    const existing = grouped.get(reaction.content)
    const isOwn = reaction.user.login === currentUser
    if (existing) {
      existing.count++
      if (isOwn) {
        existing.reacted = true
        existing.reactionId = reaction.id
      }
    } else {
      grouped.set(reaction.content, {
        count: 1,
        reacted: isOwn,
        reactionId: isOwn ? reaction.id : null
      })
    }
  }

  const handleToggleReaction = async (content: ReactionContent): Promise<void> => {
    if (pending) return
    setPending(true)
    try {
      const existing = grouped.get(content)

      if (existing?.reacted && existing.reactionId) {
        await window.api.github.reactions.delete(owner, repo, existing.reactionId)
      } else {
        if (commentType === 'issue-comment') {
          await window.api.github.reactions.createForIssueComment(owner, repo, commentId, content)
        } else {
          await window.api.github.reactions.createForPullComment(owner, repo, commentId, content)
        }
      }

      await queryClient.invalidateQueries({ queryKey })
    } finally {
      setPending(false)
      setShowPicker(false)
    }
  }

  // Close picker on outside click
  useEffect(() => {
    if (!showPicker) return
    const handleClick = (): void => setShowPicker(false)
    document.addEventListener('click', handleClick)
    return () => document.removeEventListener('click', handleClick)
  }, [showPicker])

  return (
    <div className="flex flex-wrap items-center gap-1">
      {/* Existing reactions */}
      {REACTION_EMOJIS.filter((r) => grouped.has(r.content)).map((r) => {
        const group = grouped.get(r.content)!
        return (
          <button
            key={r.content}
            type="button"
            onClick={() => handleToggleReaction(r.content)}
            disabled={pending}
            className={cn(
              'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs transition-colors disabled:opacity-50',
              group.reacted
                ? 'border-accent/40 bg-accent/10 text-foreground'
                : 'border-border bg-surface text-foreground-muted hover:border-accent/40'
            )}
          >
            <span>{r.emoji}</span>
            <span>{group.count}</span>
          </button>
        )
      })}

      {/* Add reaction button */}
      <div className="relative">
        <Tooltip label="Add reaction" side="top">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              setShowPicker(!showPicker)
            }}
            className="border-border text-foreground-subtle hover:border-accent/40 hover:bg-surface-hover hover:text-foreground inline-flex size-6 items-center justify-center rounded-full border transition-colors"
            aria-label="Add reaction"
          >
            <SmilePlus size={12} />
          </button>
        </Tooltip>

        {showPicker ? (
          <div
            className="border-border bg-surface absolute bottom-full left-0 z-20 mb-1 flex gap-0.5 rounded-lg border p-1.5 shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            {REACTION_EMOJIS.map((r) => {
              const group = grouped.get(r.content)
              return (
                <button
                  key={r.content}
                  type="button"
                  onClick={() => handleToggleReaction(r.content)}
                  disabled={pending}
                  className={cn(
                    'hover:bg-surface-hover flex size-7 items-center justify-center rounded text-sm transition-colors disabled:opacity-50',
                    group?.reacted && 'bg-accent/10'
                  )}
                  title={r.content}
                >
                  {r.emoji}
                </button>
              )
            })}
          </div>
        ) : null}
      </div>
    </div>
  )
}
