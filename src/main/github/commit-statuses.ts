import { ipcMain } from 'electron'
import { requireAuth, fetchGitHubJson, API } from './client'
import type { GitHubCombinedStatus, GitHubCommitStatus, CommitStatusState } from '../../shared/types'

export function registerCommitStatusesHandlers(): void {
  // Get the combined status for a specific reference
  // GET /repos/{owner}/{repo}/commits/{ref}/status
  ipcMain.handle(
    'github:commit-statuses:get-combined',
    async (
      _event,
      owner: string,
      repo: string,
      ref: string,
      options?: { perPage?: number; page?: number }
    ): Promise<GitHubCombinedStatus> => {
      const token = requireAuth()
      const params = new URLSearchParams()
      if (options?.perPage) params.set('per_page', String(Math.min(100, options.perPage)))
      if (options?.page) params.set('page', String(options.page))
      const qs = params.toString()
      return fetchGitHubJson(
        token,
        `${API}/repos/${owner}/${repo}/commits/${encodeURIComponent(ref)}/status${qs ? `?${qs}` : ''}`,
        `Failed to get combined status for ${ref}`
      )
    }
  )

  // List commit statuses for a reference
  // GET /repos/{owner}/{repo}/commits/{ref}/statuses
  ipcMain.handle(
    'github:commit-statuses:list',
    async (
      _event,
      owner: string,
      repo: string,
      ref: string,
      options?: { perPage?: number; page?: number }
    ): Promise<GitHubCommitStatus[]> => {
      const token = requireAuth()
      const params = new URLSearchParams()
      if (options?.perPage) params.set('per_page', String(Math.min(100, options.perPage)))
      if (options?.page) params.set('page', String(options.page))
      const qs = params.toString()
      return fetchGitHubJson(
        token,
        `${API}/repos/${owner}/${repo}/commits/${encodeURIComponent(ref)}/statuses${qs ? `?${qs}` : ''}`,
        `Failed to list statuses for ${ref}`
      )
    }
  )

  // Create a commit status
  // POST /repos/{owner}/{repo}/statuses/{sha}
  ipcMain.handle(
    'github:commit-statuses:create',
    async (
      _event,
      owner: string,
      repo: string,
      sha: string,
      state: CommitStatusState,
      options?: {
        targetUrl?: string | null
        description?: string | null
        context?: string
      }
    ): Promise<GitHubCommitStatus> => {
      const token = requireAuth()
      const payload: Record<string, unknown> = { state }
      if (options?.targetUrl !== undefined) payload.target_url = options.targetUrl
      if (options?.description !== undefined) payload.description = options.description
      if (options?.context) payload.context = options.context
      return fetchGitHubJson(
        token,
        `${API}/repos/${owner}/${repo}/statuses/${sha}`,
        `Failed to create status for ${sha}`,
        { method: 'POST', body: JSON.stringify(payload) }
      )
    }
  )
}
