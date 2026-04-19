import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { cn } from '../lib/cn'

type CommentType = 'issue-comment' | 'pull-comment'

interface CommentBodyEditorProps {
  owner: string
  repo: string
  number: number
  commentType: CommentType
  commentId: number
  initialBody: string
  onCancel: () => void
  onSaved: () => void
  className?: string
}

export default function CommentBodyEditor({
  owner,
  repo,
  number,
  commentType,
  commentId,
  initialBody,
  onCancel,
  onSaved,
  className
}: CommentBodyEditorProps) {
  const [body, setBody] = useState(initialBody)
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const queryClient = useQueryClient()

  const handleSave = async (): Promise<void> => {
    if (!body.trim() || isSaving) return
    setIsSaving(true)
    setError(null)
    try {
      if (commentType === 'issue-comment') {
        await window.api.github.pullComments.updateIssueComment(owner, repo, commentId, body)
      } else {
        await window.api.github.pullComments.update(owner, repo, commentId, body)
      }
      const key =
        commentType === 'issue-comment'
          ? ['pull-request-comments', owner, repo, number]
          : ['pull-request-review-comments', owner, repo, number]
      await queryClient.invalidateQueries({ queryKey: key })
      onSaved()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update comment')
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <div className={cn('border-border bg-background rounded-lg border', className)}>
      <textarea
        value={body}
        onChange={(event) => setBody(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
            event.preventDefault()
            void handleSave()
          }
        }}
        className="text-foreground placeholder:text-foreground-subtle min-h-24 w-full resize-y bg-transparent px-3 py-2 text-sm focus:outline-none"
        autoFocus
      />
      {error ? <p className="text-danger px-3 text-xs">{error}</p> : null}
      <div className="border-border flex items-center justify-end gap-2 border-t px-3 py-2">
        <button
          type="button"
          onClick={onCancel}
          className="border-border bg-interactive text-foreground hover:bg-interactive-hover rounded-md border px-3 py-1.5 text-xs font-medium transition-colors"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={handleSave}
          disabled={!body.trim() || isSaving}
          className="bg-accent text-foreground hover:bg-accent-hover rounded-md px-3 py-1.5 text-xs font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-40"
        >
          {isSaving ? 'Saving...' : 'Save'}
        </button>
      </div>
    </div>
  )
}
