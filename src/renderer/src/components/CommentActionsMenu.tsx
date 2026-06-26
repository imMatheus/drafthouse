import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { MoreHorizontal } from 'lucide-react'
import { useAuth } from '../hooks/useAuth'
import * as DropdownMenu from './DropdownMenu'

type CommentType = 'issue-comment' | 'pull-comment'

interface CommentActionsMenuProps {
  owner: string
  repo: string
  number: number
  commentType: CommentType
  commentId: number
  nodeId: string
  htmlUrl: string
  body: string
  authorLogin: string
  onStartEdit: () => void
  onQuoteReply: (quoted: string) => void
}

const quoteBody = (body: string): string => {
  const quoted = body
    .split('\n')
    .map((line) => `> ${line}`)
    .join('\n')
  return `${quoted}\n\n`
}

export default function CommentActionsMenu({
  owner,
  repo,
  number,
  commentType,
  commentId,
  nodeId,
  htmlUrl,
  body,
  authorLogin,
  onStartEdit,
  onQuoteReply
}: CommentActionsMenuProps) {
  const [isDeleting, setIsDeleting] = useState(false)
  const [confirmingDelete, setConfirmingDelete] = useState(false)
  const [isHiding, setIsHiding] = useState(false)
  const queryClient = useQueryClient()
  const { user } = useAuth()
  const isOwner = user?.login === authorLogin

  const invalidateComments = async (): Promise<void> => {
    const key =
      commentType === 'issue-comment'
        ? ['pull-request-comments', owner, repo, number]
        : ['pull-request-review-comments', owner, repo, number]
    await queryClient.invalidateQueries({ queryKey: key })
  }

  const handleCopyLink = async (): Promise<void> => {
    await navigator.clipboard.writeText(htmlUrl)
  }

  const handleCopyMarkdown = async (): Promise<void> => {
    await navigator.clipboard.writeText(body)
  }

  const handleQuoteReply = (): void => {
    onQuoteReply(quoteBody(body))
  }

  const handleHide = async (): Promise<void> => {
    if (isHiding) return
    setIsHiding(true)
    try {
      await window.api.github.pullComments.minimize(nodeId, 'OUTDATED')
      await invalidateComments()
    } catch (err) {
      console.error('Failed to hide comment:', err)
    } finally {
      setIsHiding(false)
    }
  }

  // Two-step inline confirm (first select arms it and keeps the menu open via
  // preventDefault; second select deletes) — avoids a jarring native confirm().
  const handleDeleteSelect = (event: Event): void => {
    if (!confirmingDelete) {
      event.preventDefault()
      setConfirmingDelete(true)
      return
    }
    void handleDelete()
  }

  const handleDelete = async (): Promise<void> => {
    if (isDeleting) return
    setIsDeleting(true)
    try {
      if (commentType === 'issue-comment') {
        await window.api.github.pullComments.deleteIssueComment(owner, repo, commentId)
      } else {
        await window.api.github.pullComments.delete(owner, repo, commentId)
      }
      await invalidateComments()
    } catch (err) {
      console.error('Failed to delete comment:', err)
    } finally {
      setIsDeleting(false)
    }
  }

  return (
    <DropdownMenu.Root
      onOpenChange={(open) => {
        if (!open) setConfirmingDelete(false)
      }}
    >
      <DropdownMenu.Trigger asChild>
        <button
          type="button"
          className="text-foreground-subtle hover:bg-surface-hover hover:text-foreground inline-flex size-6 items-center justify-center rounded transition-colors"
          aria-label="Comment actions"
        >
          <MoreHorizontal size={14} />
        </button>
      </DropdownMenu.Trigger>

      <DropdownMenu.Content>
        <DropdownMenu.Item onSelect={handleCopyLink}>Copy link</DropdownMenu.Item>
        <DropdownMenu.Item onSelect={handleCopyMarkdown}>Copy Markdown</DropdownMenu.Item>
        <DropdownMenu.Item onSelect={handleQuoteReply}>Quote reply</DropdownMenu.Item>

        {isOwner ? (
          <>
            <DropdownMenu.Separator />
            <DropdownMenu.Item onSelect={onStartEdit}>Edit</DropdownMenu.Item>
            <DropdownMenu.Item onSelect={handleHide} disabled={isHiding}>
              {isHiding ? 'Hiding...' : 'Hide'}
            </DropdownMenu.Item>
            <DropdownMenu.Item variant="danger" onSelect={handleDeleteSelect} disabled={isDeleting}>
              {isDeleting ? 'Deleting...' : confirmingDelete ? 'Click again to delete' : 'Delete'}
            </DropdownMenu.Item>
          </>
        ) : null}
      </DropdownMenu.Content>
    </DropdownMenu.Root>
  )
}
