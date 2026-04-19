import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Check, CircleDot } from 'lucide-react'
import { cn } from '../lib/cn'

interface ResolveThreadButtonProps {
  threadId: string | null
  isResolved: boolean
  owner: string
  repo: string
  number: number
  variant?: 'pill' | 'solid'
}

export default function ResolveThreadButton({
  threadId,
  isResolved,
  owner,
  repo,
  number,
  variant = 'pill'
}: ResolveThreadButtonProps) {
  const [isPending, setIsPending] = useState(false)
  const queryClient = useQueryClient()

  const handleToggle = async (): Promise<void> => {
    if (!threadId || isPending) return
    setIsPending(true)
    try {
      if (isResolved) {
        await window.api.github.pullComments.unresolveThread(threadId)
      } else {
        await window.api.github.pullComments.resolveThread(threadId)
      }
      await queryClient.invalidateQueries({
        queryKey: ['pull-request-review-threads', owner, repo, number]
      })
    } catch (err) {
      console.error('Failed to toggle thread resolution:', err)
    } finally {
      setIsPending(false)
    }
  }

  if (!threadId) return null

  const label = isPending
    ? isResolved
      ? 'Unresolving...'
      : 'Resolving...'
    : isResolved
      ? 'Resolved'
      : 'Resolve'

  if (variant === 'solid') {
    return (
      <button
        type="button"
        onClick={handleToggle}
        disabled={isPending}
        className={cn(
          'inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors',
          isResolved
            ? 'border-border bg-surface text-foreground-muted hover:text-foreground border'
            : 'bg-success/90 hover:bg-success text-background',
          'disabled:cursor-not-allowed disabled:opacity-60'
        )}
      >
        {isResolved ? <CircleDot size={13} /> : <Check size={13} />}
        <span>{label}</span>
      </button>
    )
  }

  return (
    <button
      type="button"
      onClick={handleToggle}
      disabled={isPending}
      className={cn(
        'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs transition-colors',
        isResolved
          ? 'border-success/40 bg-success/10 text-foreground'
          : 'border-border bg-surface text-foreground-muted hover:border-success/40 hover:text-foreground',
        'disabled:cursor-not-allowed disabled:opacity-60'
      )}
    >
      {isResolved ? <CircleDot size={12} /> : <Check size={12} />}
      <span>{label}</span>
    </button>
  )
}
