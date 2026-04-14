import { ipcMain } from 'electron'
import {
  requireAuth,
  fetchGitHubJson,
  fetchGitHubVoid,
  API
} from './client'
import type { GitHubCommitComment } from '../../shared/types'

export function registerCommitCommentsHandlers(): void {
  // List commit comments for a repository
  // GET /repos/{owner}/{repo}/comments
  ipcMain.handle(
    'github:commit-comments:list-for-repo',
    async (
      _event,
      owner: string,
      repo: string,
      options?: { perPage?: number; page?: number }
    ): Promise<GitHubCommitComment[]> => {
      const token = requireAuth()
      const params = new URLSearchParams()
      if (options?.perPage) params.set('per_page', String(Math.min(100, options.perPage)))
      if (options?.page) params.set('page', String(options.page))
      const qs = params.toString()
      return fetchGitHubJson(
        token,
        `${API}/repos/${owner}/${repo}/comments${qs ? `?${qs}` : ''}`,
        `Failed to list commit comments for ${owner}/${repo}`
      )
    }
  )

  // Get a commit comment
  // GET /repos/{owner}/{repo}/comments/{comment_id}
  ipcMain.handle(
    'github:commit-comments:get',
    async (
      _event,
      owner: string,
      repo: string,
      commentId: number
    ): Promise<GitHubCommitComment> => {
      const token = requireAuth()
      return fetchGitHubJson(
        token,
        `${API}/repos/${owner}/${repo}/comments/${commentId}`,
        `Failed to get commit comment ${commentId}`
      )
    }
  )

  // Update a commit comment
  // PATCH /repos/{owner}/{repo}/comments/{comment_id}
  ipcMain.handle(
    'github:commit-comments:update',
    async (
      _event,
      owner: string,
      repo: string,
      commentId: number,
      body: string
    ): Promise<GitHubCommitComment> => {
      const token = requireAuth()
      return fetchGitHubJson(
        token,
        `${API}/repos/${owner}/${repo}/comments/${commentId}`,
        `Failed to update commit comment ${commentId}`,
        { method: 'PATCH', body: JSON.stringify({ body }) }
      )
    }
  )

  // Delete a commit comment
  // DELETE /repos/{owner}/{repo}/comments/{comment_id}
  ipcMain.handle(
    'github:commit-comments:delete',
    async (_event, owner: string, repo: string, commentId: number): Promise<void> => {
      const token = requireAuth()
      return fetchGitHubVoid(
        token,
        `${API}/repos/${owner}/${repo}/comments/${commentId}`,
        `Failed to delete commit comment ${commentId}`,
        { method: 'DELETE' }
      )
    }
  )

  // List commit comments
  // GET /repos/{owner}/{repo}/commits/{commit_sha}/comments
  ipcMain.handle(
    'github:commit-comments:list-for-commit',
    async (
      _event,
      owner: string,
      repo: string,
      commitSha: string,
      options?: { perPage?: number; page?: number }
    ): Promise<GitHubCommitComment[]> => {
      const token = requireAuth()
      const params = new URLSearchParams()
      if (options?.perPage) params.set('per_page', String(Math.min(100, options.perPage)))
      if (options?.page) params.set('page', String(options.page))
      const qs = params.toString()
      return fetchGitHubJson(
        token,
        `${API}/repos/${owner}/${repo}/commits/${commitSha}/comments${qs ? `?${qs}` : ''}`,
        `Failed to list comments for commit ${commitSha}`
      )
    }
  )

  // Create a commit comment
  // POST /repos/{owner}/{repo}/commits/{commit_sha}/comments
  ipcMain.handle(
    'github:commit-comments:create',
    async (
      _event,
      owner: string,
      repo: string,
      commitSha: string,
      body: string,
      path?: string,
      position?: number
    ): Promise<GitHubCommitComment> => {
      const token = requireAuth()
      const payload: Record<string, unknown> = { body }
      if (path) payload.path = path
      if (position !== undefined) payload.position = position
      return fetchGitHubJson(
        token,
        `${API}/repos/${owner}/${repo}/commits/${commitSha}/comments`,
        `Failed to create comment on commit ${commitSha}`,
        { method: 'POST', body: JSON.stringify(payload) }
      )
    }
  )
}
