import { useRef, type KeyboardEvent } from 'react'
import { cn } from '../lib/cn'
import claudeLogoUrl from '../assets/claude.png'

interface ClaudeMentionTextareaProps {
  value: string
  onChange: (value: string) => void
  placeholder?: string
  className?: string
  rows?: number
  /** Label shown in the autocomplete dropdown, e.g. "Ask about this PR" */
  menuLabel?: string
  /** Whether @claude mention detection is enabled */
  enabled?: boolean
}

export default function ClaudeMentionTextarea({
  value,
  onChange,
  placeholder = 'Leave a comment',
  className,
  rows,
  menuLabel = 'Ask Claude',
  enabled = true
}: ClaudeMentionTextareaProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const hasClaudePrefix = enabled && /^@claude/i.test(value.trimStart())

  const mentionMatch = enabled ? value.trimStart().match(/^@(\w*)$/) : null
  const showMentionMenu =
    mentionMatch !== null && 'claude'.startsWith(mentionMatch[1].toLowerCase())

  const acceptMention = (): void => {
    onChange('@claude ')
    requestAnimationFrame(() => textareaRef.current?.focus())
  }

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>): void => {
    if (showMentionMenu && (e.key === 'Tab' || e.key === 'Enter')) {
      e.preventDefault()
      acceptMention()
    }
    if (showMentionMenu && e.key === 'Escape') {
      e.preventDefault()
      onChange('')
    }
  }

  return (
    <div className="relative">
      {/* Overlay — highlights @claude with accent background. Uses only
          color / background-color / border-radius which are paint-only
          and don't shift text layout, so cursor alignment stays perfect. */}
      {hasClaudePrefix && (
        <div
          className="pointer-events-none absolute inset-0 overflow-hidden whitespace-pre-wrap break-words px-4 py-3 text-sm"
          aria-hidden
        >
          <span className="rounded-sm bg-accent/15 font-medium text-accent">
            {value.match(/^@claude/i)?.[0]}
          </span>
          <span className="text-foreground">
            {value.slice(value.match(/^@claude/i)?.[0]?.length ?? 0)}
          </span>
        </div>
      )}
      <textarea
        ref={textareaRef}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        rows={rows}
        className={cn(
          'w-full resize-y bg-transparent px-4 py-3 text-sm placeholder:text-foreground-subtle focus:outline-none',
          hasClaudePrefix ? 'text-transparent caret-foreground' : 'text-foreground',
          className
        )}
      />
      {/* Autocomplete dropdown */}
      {showMentionMenu && (
        <div className="absolute left-4 top-10 z-10 overflow-hidden rounded-lg border border-border bg-surface shadow-lg">
          <button
            type="button"
            onMouseDown={(e) => {
              e.preventDefault()
              acceptMention()
            }}
            className="flex w-full items-center gap-2.5 px-3 py-2 text-left transition-colors hover:bg-surface-hover"
          >
            <img src={claudeLogoUrl} alt="Claude" className="size-6 rounded-full" />
            <div>
              <p className="text-sm font-medium text-foreground">claude</p>
              <p className="text-xs text-foreground-muted">{menuLabel}</p>
            </div>
          </button>
        </div>
      )}
    </div>
  )
}

/** Returns true when body starts with "@claude " followed by content */
export function isClaudeMention(text: string): boolean {
  return /^@claude\s+/i.test(text.trim())
}

/** Strips the "@claude " prefix and returns the prompt */
export function extractClaudePrompt(text: string): string {
  return text.trim().replace(/^@claude\s+/i, '')
}
