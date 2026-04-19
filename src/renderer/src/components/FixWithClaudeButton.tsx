import { useState } from 'react'
import { cn } from '../lib/cn'
import claudeLogoUrl from '../assets/claude.png'
import Tooltip from './Tooltip'

interface FixWithClaudeButtonProps {
  onClick: () => Promise<void> | void
  disabled?: boolean
}

export default function FixWithClaudeButton({ onClick, disabled }: FixWithClaudeButtonProps) {
  const [isPending, setIsPending] = useState(false)

  const handleClick = async (): Promise<void> => {
    if (isPending || disabled) return
    setIsPending(true)
    try {
      await onClick()
    } finally {
      setIsPending(false)
    }
  }

  return (
    <Tooltip label="Ask Claude to implement a fix and commit it to this PR" side="top">
      <button
        type="button"
        onClick={handleClick}
        disabled={disabled || isPending}
        className={cn(
          'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs transition-colors',
          'border-border bg-surface text-foreground-muted hover:border-accent/40 hover:text-foreground',
          'disabled:cursor-not-allowed disabled:opacity-60'
        )}
      >
        <img src={claudeLogoUrl} alt="" className="size-3 shrink-0" />
        <span>{isPending ? 'Asking Claude...' : 'Fix with Claude'}</span>
      </button>
    </Tooltip>
  )
}
