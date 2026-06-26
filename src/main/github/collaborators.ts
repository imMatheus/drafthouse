import { ipcMain } from 'electron'
import { requireAuth, fetchGitHubJson, fetchGitHubVoid, fetchGitHubCheck, getGitHubHeaders, API } from './client'
import type { GitHubCollaborator, GitHubCollaboratorPermission, CollaboratorInvitation } from '../../shared/types'

export function registerCollaboratorsHandlers(): void {
  // List repository collaborators
  // GET /repos/{owner}/{repo}/collaborators
  ipcMain.handle(
    'github:collaborators:list',
    async (
      _event,
      owner: string,
      repo: string,
      options?: {
        affiliation?: 'outside' | 'direct' | 'all'
        permission?: 'pull' | 'triage' | 'push' | 'maintain' | 'admin'
        perPage?: number
        page?: number
      }
    ): Promise<GitHubCollaborator[]> => {
      const token = requireAuth()
      const params = new URLSearchParams()
      if (options?.affiliation) params.set('affiliation', options.affiliation)
      if (options?.permission) params.set('permission', options.permission)
      if (options?.perPage) params.set('per_page', String(Math.min(100, options.perPage)))
      if (options?.page) params.set('page', String(options.page))
      const qs = params.toString()
      return fetchGitHubJson(
        token,
        `${API}/repos/${owner}/${repo}/collaborators${qs ? `?${qs}` : ''}`,
        `Failed to list collaborators for ${owner}/${repo}`
      )
    }
  )

  // Check if a user is a repository collaborator
  // GET /repos/{owner}/{repo}/collaborators/{username}
  ipcMain.handle(
    'github:collaborators:check',
    async (_event, owner: string, repo: string, username: string): Promise<boolean> => {
      const token = requireAuth()
      return fetchGitHubCheck(
        token,
        `${API}/repos/${owner}/${repo}/collaborators/${encodeURIComponent(username)}`,
        `Failed to check collaborator ${username}`
      )
    }
  )

  // Add a repository collaborator
  // PUT /repos/{owner}/{repo}/collaborators/{username}
  ipcMain.handle(
    'github:collaborators:add',
    async (
      _event,
      owner: string,
      repo: string,
      username: string,
      permission?: string
    ): Promise<CollaboratorInvitation | null> => {
      const token = requireAuth()
      const body = permission ? JSON.stringify({ permission }) : undefined
      // Returns 201 with invitation body for new invites, 204 for existing collaborators
      const response = await fetch(`${API}/repos/${owner}/${repo}/collaborators/${encodeURIComponent(username)}`, {
        method: 'PUT',
        body,
        headers: getGitHubHeaders(token, body ? { 'Content-Type': 'application/json' } : {})
      })

      if (response.status === 204) return null
      if (response.status === 201) return response.json() as Promise<CollaboratorInvitation>

      if (response.status === 401) {
        throw new Error('GitHub authentication expired. Log out and sign in again.')
      }
      if (response.status === 403) {
        throw new Error(`Failed to add collaborator ${username}`)
      }
      throw new Error(`Failed to add collaborator ${username}: GitHub returned ${response.status}`)
    }
  )

  // Remove a repository collaborator
  // DELETE /repos/{owner}/{repo}/collaborators/{username}
  ipcMain.handle(
    'github:collaborators:remove',
    async (_event, owner: string, repo: string, username: string): Promise<void> => {
      const token = requireAuth()
      return fetchGitHubVoid(
        token,
        `${API}/repos/${owner}/${repo}/collaborators/${encodeURIComponent(username)}`,
        `Failed to remove collaborator ${username}`,
        { method: 'DELETE' }
      )
    }
  )

  // Get repository permissions for a user
  // GET /repos/{owner}/{repo}/collaborators/{username}/permission
  ipcMain.handle(
    'github:collaborators:get-permission',
    async (_event, owner: string, repo: string, username: string): Promise<GitHubCollaboratorPermission> => {
      const token = requireAuth()
      return fetchGitHubJson(
        token,
        `${API}/repos/${owner}/${repo}/collaborators/${encodeURIComponent(username)}/permission`,
        `Failed to get permissions for ${username}`
      )
    }
  )
}
