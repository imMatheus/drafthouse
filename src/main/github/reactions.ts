import { ipcMain } from 'electron'
import {
  requireAuth,
  fetchGitHubJson,
  fetchGitHubVoid,
  fetchGitHubPaginatedCollection,
  API
} from './client'
import type { GitHubReaction, ReactionContent } from '../../shared/types'

export function registerReactionsHandlers(): void {
  // List reactions for an issue comment (conversation tab comments)
  ipcMain.handle(
    'github:reactions:list-for-issue-comment',
    async (
      _event,
      owner: string,
      repo: string,
      commentId: number
    ): Promise<GitHubReaction[]> => {
      const token = requireAuth()
      return fetchGitHubPaginatedCollection<GitHubReaction>(
        token,
        `${API}/repos/${owner}/${repo}/issues/comments/${commentId}/reactions`,
        'Unable to list reactions'
      )
    }
  )

  // Create reaction for an issue comment
  ipcMain.handle(
    'github:reactions:create-for-issue-comment',
    async (
      _event,
      owner: string,
      repo: string,
      commentId: number,
      content: ReactionContent
    ): Promise<GitHubReaction> => {
      const token = requireAuth()
      return fetchGitHubJson<GitHubReaction>(
        token,
        `${API}/repos/${owner}/${repo}/issues/comments/${commentId}/reactions`,
        'Unable to create reaction',
        {
          method: 'POST',
          body: JSON.stringify({ content })
        }
      )
    }
  )

  // List reactions for a pull request review comment (inline code comments)
  ipcMain.handle(
    'github:reactions:list-for-pull-comment',
    async (
      _event,
      owner: string,
      repo: string,
      commentId: number
    ): Promise<GitHubReaction[]> => {
      const token = requireAuth()
      return fetchGitHubPaginatedCollection<GitHubReaction>(
        token,
        `${API}/repos/${owner}/${repo}/pulls/comments/${commentId}/reactions`,
        'Unable to list reactions'
      )
    }
  )

  // Create reaction for a pull request review comment
  ipcMain.handle(
    'github:reactions:create-for-pull-comment',
    async (
      _event,
      owner: string,
      repo: string,
      commentId: number,
      content: ReactionContent
    ): Promise<GitHubReaction> => {
      const token = requireAuth()
      return fetchGitHubJson<GitHubReaction>(
        token,
        `${API}/repos/${owner}/${repo}/pulls/comments/${commentId}/reactions`,
        'Unable to create reaction',
        {
          method: 'POST',
          body: JSON.stringify({ content })
        }
      )
    }
  )

  // Delete a reaction (works for both issue comments and review comments)
  ipcMain.handle(
    'github:reactions:delete',
    async (
      _event,
      owner: string,
      repo: string,
      reactionId: number
    ): Promise<void> => {
      const token = requireAuth()
      return fetchGitHubVoid(
        token,
        `${API}/repos/${owner}/${repo}/reactions/${reactionId}`,
        'Unable to delete reaction',
        { method: 'DELETE' }
      )
    }
  )
}
