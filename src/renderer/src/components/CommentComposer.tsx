import { cn } from '../lib/cn'

// Controlled textarea + Cancel/Submit footer shared by the edit-in-place comment
// editor and the inline review reply form. Cmd/Ctrl+Enter submits.
export default function CommentComposer({
  value,
  onChange,
  onSubmit,
  onCancel,
  submitLabel,
  submittingLabel,
  isSubmitting,
  placeholder,
  error,
  className,
  padding = 'comfortable'
}: {
  value: string
  onChange: (value: string) => void
  onSubmit: () => void
  onCancel: () => void
  submitLabel: string
  submittingLabel: string
  isSubmitting: boolean
  placeholder?: string
  error?: string | null
  className?: string
  /** 'cozy' matches the edit-in-place editor; 'comfortable' the reply form. */
  padding?: 'cozy' | 'comfortable'
}) {
  const cozy = padding === 'cozy'
  return (
    <div className={cn('border-border bg-background rounded-lg border', className)}>
      <textarea
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
            event.preventDefault()
            onSubmit()
          }
        }}
        placeholder={placeholder}
        className={cn(
          'text-foreground placeholder:text-foreground-subtle min-h-24 w-full resize-y bg-transparent text-sm focus:outline-none',
          cozy ? 'px-3 py-2' : 'px-4 py-3'
        )}
        autoFocus
      />
      {error ? <p className={cn('text-danger', cozy ? 'px-3 text-xs' : 'px-4 text-sm')}>{error}</p> : null}
      <div
        className={cn('border-border flex items-center justify-end gap-2 border-t', cozy ? 'px-3 py-2' : 'px-4 py-3')}
      >
        <button
          type="button"
          onClick={onCancel}
          className="border-border bg-interactive text-foreground hover:bg-interactive-hover rounded-md border px-3 py-1.5 text-xs font-medium transition-colors"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={onSubmit}
          disabled={!value.trim() || isSubmitting}
          className="bg-accent text-accent-foreground hover:bg-accent-hover rounded-md px-3 py-1.5 text-xs font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-40"
        >
          {isSubmitting ? submittingLabel : submitLabel}
        </button>
      </div>
    </div>
  )
}
