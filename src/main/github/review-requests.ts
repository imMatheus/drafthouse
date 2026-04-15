import { ipcMain } from 'electron'
import { requireAuth, fetchGitHubJson, API } from './client'
import type { PullRequestDetail, ReviewRequestsResult } from '../../shared/types'

export function registerReviewRequestsHandlers(): void {
  // Get all requested reviewers for a pull request
  // GET /repos/{owner}/{repo}/pulls/{pull_number}/requested_reviewers
  ipcMain.handle(
    'github:review-requests:get',
    async (_event, owner: string, repo: string, number: number): Promise<ReviewRequestsResult> => {
      const token = requireAuth()
      return fetchGitHubJson(
        token,
        `${API}/repos/${owner}/${repo}/pulls/${number}/requested_reviewers`,
        `Failed to get requested reviewers for PR #${number}`
      )
    }
  )

  // Request reviewers for a pull request
  // POST /repos/{owner}/{repo}/pulls/{pull_number}/requested_reviewers
  ipcMain.handle(
    'github:review-requests:request',
    async (
      _event,
      owner: string,
      repo: string,
      number: number,
      reviewers?: string[],
      teamReviewers?: string[]
    ): Promise<PullRequestDetail> => {
      const token = requireAuth()
      const payload: Record<string, string[]> = {}
      if (reviewers?.length) payload.reviewers = reviewers
      if (teamReviewers?.length) payload.team_reviewers = teamReviewers
      return fetchGitHubJson(
        token,
        `${API}/repos/${owner}/${repo}/pulls/${number}/requested_reviewers`,
        `Failed to request reviewers for PR #${number}`,
        { method: 'POST', body: JSON.stringify(payload) }
      )
    }
  )

  // Remove requested reviewers from a pull request
  // DELETE /repos/{owner}/{repo}/pulls/{pull_number}/requested_reviewers
  ipcMain.handle(
    'github:review-requests:remove',
    async (
      _event,
      owner: string,
      repo: string,
      number: number,
      reviewers: string[],
      teamReviewers?: string[]
    ): Promise<void> => {
      const token = requireAuth()
      const payload: Record<string, string[]> = { reviewers }
      if (teamReviewers?.length) payload.team_reviewers = teamReviewers

      // DELETE with body requires manual fetch since fetchGitHubVoid doesn't support DELETE with body
      // GitHub's remove reviewers returns 200 with a body, not 204
      await fetchGitHubJson(
        token,
        `${API}/repos/${owner}/${repo}/pulls/${number}/requested_reviewers`,
        `Failed to remove reviewers from PR #${number}`,
        { method: 'DELETE', body: JSON.stringify(payload) }
      )
    }
  )
}
