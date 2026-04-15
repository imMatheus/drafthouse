import { ipcMain } from 'electron'
import { requireAuth, fetchGitHubJson, API } from './client'
import type { GitHubCommit, GitHubCommitComparison, GitHubBranchShort, PullRequest } from '../../shared/types'

export function registerCommitsHandlers(): void {
  // List commits
  // GET /repos/{owner}/{repo}/commits
  ipcMain.handle(
    'github:commits:list',
    async (
      _event,
      owner: string,
      repo: string,
      options?: {
        sha?: string
        path?: string
        author?: string
        committer?: string
        since?: string
        until?: string
        perPage?: number
        page?: number
      }
    ): Promise<GitHubCommit[]> => {
      const token = requireAuth()
      const params = new URLSearchParams()
      if (options?.sha) params.set('sha', options.sha)
      if (options?.path) params.set('path', options.path)
      if (options?.author) params.set('author', options.author)
      if (options?.committer) params.set('committer', options.committer)
      if (options?.since) params.set('since', options.since)
      if (options?.until) params.set('until', options.until)
      if (options?.perPage) params.set('per_page', String(Math.min(100, options.perPage)))
      if (options?.page) params.set('page', String(options.page))
      const qs = params.toString()
      return fetchGitHubJson(
        token,
        `${API}/repos/${owner}/${repo}/commits${qs ? `?${qs}` : ''}`,
        `Failed to list commits for ${owner}/${repo}`
      )
    }
  )

  // Get a commit
  // GET /repos/{owner}/{repo}/commits/{ref}
  ipcMain.handle(
    'github:commits:get',
    async (
      _event,
      owner: string,
      repo: string,
      ref: string,
      options?: { page?: number; perPage?: number }
    ): Promise<GitHubCommit> => {
      const token = requireAuth()
      const params = new URLSearchParams()
      if (options?.page) params.set('page', String(options.page))
      if (options?.perPage) params.set('per_page', String(Math.min(100, options.perPage)))
      const qs = params.toString()
      return fetchGitHubJson(
        token,
        `${API}/repos/${owner}/${repo}/commits/${encodeURIComponent(ref)}${qs ? `?${qs}` : ''}`,
        `Failed to get commit ${ref}`
      )
    }
  )

  // Compare two commits
  // GET /repos/{owner}/{repo}/compare/{basehead}
  ipcMain.handle(
    'github:commits:compare',
    async (
      _event,
      owner: string,
      repo: string,
      basehead: string,
      options?: { page?: number; perPage?: number }
    ): Promise<GitHubCommitComparison> => {
      const token = requireAuth()
      const params = new URLSearchParams()
      if (options?.page) params.set('page', String(options.page))
      if (options?.perPage) params.set('per_page', String(Math.min(100, options.perPage)))
      const qs = params.toString()
      return fetchGitHubJson(
        token,
        `${API}/repos/${owner}/${repo}/compare/${encodeURIComponent(basehead)}${qs ? `?${qs}` : ''}`,
        `Failed to compare commits ${basehead}`
      )
    }
  )

  // List branches for HEAD commit
  // GET /repos/{owner}/{repo}/commits/{commit_sha}/branches-where-head
  ipcMain.handle(
    'github:commits:list-branches-for-head',
    async (_event, owner: string, repo: string, commitSha: string): Promise<GitHubBranchShort[]> => {
      const token = requireAuth()
      return fetchGitHubJson(
        token,
        `${API}/repos/${owner}/${repo}/commits/${commitSha}/branches-where-head`,
        `Failed to list branches for commit ${commitSha}`
      )
    }
  )

  // List pull requests associated with a commit
  // GET /repos/{owner}/{repo}/commits/{commit_sha}/pulls
  ipcMain.handle(
    'github:commits:list-pull-requests',
    async (
      _event,
      owner: string,
      repo: string,
      commitSha: string,
      options?: { perPage?: number; page?: number }
    ): Promise<PullRequest[]> => {
      const token = requireAuth()
      const params = new URLSearchParams()
      if (options?.perPage) params.set('per_page', String(Math.min(100, options.perPage)))
      if (options?.page) params.set('page', String(options.page))
      const qs = params.toString()
      return fetchGitHubJson(
        token,
        `${API}/repos/${owner}/${repo}/commits/${commitSha}/pulls${qs ? `?${qs}` : ''}`,
        `Failed to list pull requests for commit ${commitSha}`
      )
    }
  )
}
