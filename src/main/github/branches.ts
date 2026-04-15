import { ipcMain } from 'electron'
import { requireAuth, fetchGitHubJson, API } from './client'
import type { GitHubBranch, GitHubBranchDetail, MergeUpstreamResult, BranchMergeResult } from '../../shared/types'

export function registerBranchesHandlers(): void {
  // List branches
  // GET /repos/{owner}/{repo}/branches
  ipcMain.handle(
    'github:branches:list',
    async (
      _event,
      owner: string,
      repo: string,
      options?: { protected?: boolean; perPage?: number; page?: number }
    ): Promise<GitHubBranch[]> => {
      const token = requireAuth()
      const params = new URLSearchParams()
      if (options?.protected !== undefined) params.set('protected', String(options.protected))
      if (options?.perPage) params.set('per_page', String(Math.min(100, options.perPage)))
      if (options?.page) params.set('page', String(options.page))
      const qs = params.toString()
      return fetchGitHubJson(
        token,
        `${API}/repos/${owner}/${repo}/branches${qs ? `?${qs}` : ''}`,
        `Failed to list branches for ${owner}/${repo}`
      )
    }
  )

  // Get a branch
  // GET /repos/{owner}/{repo}/branches/{branch}
  ipcMain.handle(
    'github:branches:get',
    async (_event, owner: string, repo: string, branch: string): Promise<GitHubBranchDetail> => {
      const token = requireAuth()
      return fetchGitHubJson(
        token,
        `${API}/repos/${owner}/${repo}/branches/${encodeURIComponent(branch)}`,
        `Failed to get branch ${branch}`
      )
    }
  )

  // Rename a branch
  // POST /repos/{owner}/{repo}/branches/{branch}/rename
  ipcMain.handle(
    'github:branches:rename',
    async (_event, owner: string, repo: string, branch: string, newName: string): Promise<GitHubBranch> => {
      const token = requireAuth()
      return fetchGitHubJson(
        token,
        `${API}/repos/${owner}/${repo}/branches/${encodeURIComponent(branch)}/rename`,
        `Failed to rename branch ${branch}`,
        { method: 'POST', body: JSON.stringify({ new_name: newName }) }
      )
    }
  )

  // Sync a fork branch with the upstream repository
  // POST /repos/{owner}/{repo}/merge-upstream
  ipcMain.handle(
    'github:branches:sync-fork',
    async (_event, owner: string, repo: string, branch: string): Promise<MergeUpstreamResult> => {
      const token = requireAuth()
      return fetchGitHubJson(
        token,
        `${API}/repos/${owner}/${repo}/merge-upstream`,
        `Failed to sync fork branch ${branch}`,
        { method: 'POST', body: JSON.stringify({ branch }) }
      )
    }
  )

  // Merge a branch
  // POST /repos/{owner}/{repo}/merges
  ipcMain.handle(
    'github:branches:merge',
    async (
      _event,
      owner: string,
      repo: string,
      base: string,
      head: string,
      commitMessage?: string
    ): Promise<BranchMergeResult> => {
      const token = requireAuth()
      const payload: Record<string, string> = { base, head }
      if (commitMessage) payload.commit_message = commitMessage
      return fetchGitHubJson(token, `${API}/repos/${owner}/${repo}/merges`, `Failed to merge ${head} into ${base}`, {
        method: 'POST',
        body: JSON.stringify(payload)
      })
    }
  )
}
