import { ipcMain } from 'electron'
import { requireAuth, fetchGitHubJson, API } from './client'
import type {
  PullRequestReview,
  PullRequestReviewComment,
  PullRequestReviewEvent,
  SubmitPullRequestReviewInput
} from '../../shared/types'

export function registerReviewsHandlers(): void {
  // List reviews for a pull request
  // GET /repos/{owner}/{repo}/pulls/{pull_number}/reviews
  ipcMain.handle(
    'github:reviews:list',
    async (
      _event,
      owner: string,
      repo: string,
      number: number,
      options?: { perPage?: number; page?: number }
    ): Promise<PullRequestReview[]> => {
      const token = requireAuth()
      const params = new URLSearchParams()
      params.set('per_page', String(options?.perPage || 100))
      if (options?.page) params.set('page', String(options.page))
      return fetchGitHubJson(
        token,
        `${API}/repos/${owner}/${repo}/pulls/${number}/reviews?${params}`,
        `Failed to load reviews for PR #${number}`
      )
    }
  )

  // Get a review for a pull request
  // GET /repos/{owner}/{repo}/pulls/{pull_number}/reviews/{review_id}
  ipcMain.handle(
    'github:reviews:get',
    async (_event, owner: string, repo: string, number: number, reviewId: number): Promise<PullRequestReview> => {
      const token = requireAuth()
      return fetchGitHubJson(
        token,
        `${API}/repos/${owner}/${repo}/pulls/${number}/reviews/${reviewId}`,
        `Failed to get review ${reviewId}`
      )
    }
  )

  // Create a review for a pull request
  // POST /repos/{owner}/{repo}/pulls/{pull_number}/reviews
  ipcMain.handle(
    'github:reviews:create',
    async (
      _event,
      owner: string,
      repo: string,
      number: number,
      input: SubmitPullRequestReviewInput
    ): Promise<PullRequestReview> => {
      const token = requireAuth()
      return fetchGitHubJson(
        token,
        `${API}/repos/${owner}/${repo}/pulls/${number}/reviews`,
        'Failed to submit review',
        {
          method: 'POST',
          body: JSON.stringify({
            commit_id: input.commitId,
            body: input.body,
            event: input.event,
            comments: input.comments.map((comment) => ({
              body: comment.body,
              path: comment.path,
              line: comment.line,
              side: comment.side
            }))
          })
        }
      )
    }
  )

  // Update a review for a pull request
  // PUT /repos/{owner}/{repo}/pulls/{pull_number}/reviews/{review_id}
  ipcMain.handle(
    'github:reviews:update',
    async (
      _event,
      owner: string,
      repo: string,
      number: number,
      reviewId: number,
      body: string
    ): Promise<PullRequestReview> => {
      const token = requireAuth()
      return fetchGitHubJson(
        token,
        `${API}/repos/${owner}/${repo}/pulls/${number}/reviews/${reviewId}`,
        `Failed to update review ${reviewId}`,
        { method: 'PUT', body: JSON.stringify({ body }) }
      )
    }
  )

  // Delete a pending review for a pull request
  // DELETE /repos/{owner}/{repo}/pulls/{pull_number}/reviews/{review_id}
  ipcMain.handle(
    'github:reviews:delete-pending',
    async (_event, owner: string, repo: string, number: number, reviewId: number): Promise<PullRequestReview> => {
      const token = requireAuth()
      // DELETE returns the review object (200), not 204
      return fetchGitHubJson(
        token,
        `${API}/repos/${owner}/${repo}/pulls/${number}/reviews/${reviewId}`,
        `Failed to delete pending review ${reviewId}`,
        { method: 'DELETE' }
      )
    }
  )

  // List comments for a pull request review
  // GET /repos/{owner}/{repo}/pulls/{pull_number}/reviews/{review_id}/comments
  ipcMain.handle(
    'github:reviews:list-comments',
    async (
      _event,
      owner: string,
      repo: string,
      number: number,
      reviewId: number,
      options?: { perPage?: number; page?: number }
    ): Promise<PullRequestReviewComment[]> => {
      const token = requireAuth()
      const params = new URLSearchParams()
      if (options?.perPage) params.set('per_page', String(Math.min(100, options.perPage)))
      if (options?.page) params.set('page', String(options.page))
      const qs = params.toString()
      return fetchGitHubJson(
        token,
        `${API}/repos/${owner}/${repo}/pulls/${number}/reviews/${reviewId}/comments${qs ? `?${qs}` : ''}`,
        `Failed to list comments for review ${reviewId}`
      )
    }
  )

  // Dismiss a review for a pull request
  // PUT /repos/{owner}/{repo}/pulls/{pull_number}/reviews/{review_id}/dismissals
  ipcMain.handle(
    'github:reviews:dismiss',
    async (
      _event,
      owner: string,
      repo: string,
      number: number,
      reviewId: number,
      message: string,
      event?: string
    ): Promise<PullRequestReview> => {
      const token = requireAuth()
      const payload: Record<string, string> = { message }
      if (event) payload.event = event
      return fetchGitHubJson(
        token,
        `${API}/repos/${owner}/${repo}/pulls/${number}/reviews/${reviewId}/dismissals`,
        `Failed to dismiss review ${reviewId}`,
        { method: 'PUT', body: JSON.stringify(payload) }
      )
    }
  )

  // Submit a pending review for a pull request
  // POST /repos/{owner}/{repo}/pulls/{pull_number}/reviews/{review_id}/events
  ipcMain.handle(
    'github:reviews:submit-pending',
    async (
      _event,
      owner: string,
      repo: string,
      number: number,
      reviewId: number,
      reviewEvent: PullRequestReviewEvent,
      body?: string
    ): Promise<PullRequestReview> => {
      const token = requireAuth()
      const payload: Record<string, string> = { event: reviewEvent }
      if (body) payload.body = body
      return fetchGitHubJson(
        token,
        `${API}/repos/${owner}/${repo}/pulls/${number}/reviews/${reviewId}/events`,
        `Failed to submit pending review ${reviewId}`,
        { method: 'POST', body: JSON.stringify(payload) }
      )
    }
  )
}
