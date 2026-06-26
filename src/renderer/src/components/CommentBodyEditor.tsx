import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import CommentComposer from './CommentComposer'

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
    <CommentComposer
      value={body}
      onChange={setBody}
      onSubmit={() => void handleSave()}
      onCancel={onCancel}
      submitLabel="Save"
      submittingLabel="Saving..."
      isSubmitting={isSaving}
      error={error}
      className={className}
      padding="cozy"
    />
  )
}
