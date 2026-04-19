import { ipcMain } from 'electron'
import { requireAuth, fetchGitHubJson, fetchGitHubVoid, fetchGitHubGraphQL, API } from './client'
import type { PullRequestComment, PullRequestReviewComment, CreateReviewCommentInput } from '../../shared/types'

export type MinimizeClassifier = 'ABUSE' | 'OFF_TOPIC' | 'OUTDATED' | 'RESOLVED' | 'DUPLICATE' | 'SPAM'

export function registerPullCommentsHandlers(): void {
  // ============================================================
  // Issue comments (conversation tab comments on PRs)
  // ============================================================

  // List issue comments on a pull request
  // GET /repos/{owner}/{repo}/issues/{issue_number}/comments
  ipcMain.handle(
    'github:pull-comments:list-issue-comments',
    async (_event, owner: string, repo: string, number: number): Promise<PullRequestComment[]> => {
      const token = requireAuth()
      return fetchGitHubJson(
        token,
        `${API}/repos/${owner}/${repo}/issues/${number}/comments?per_page=100`,
        `Failed to load comments for PR #${number}`
      )
    }
  )

  // Create an issue comment on a pull request
  // POST /repos/{owner}/{repo}/issues/{issue_number}/comments
  ipcMain.handle(
    'github:pull-comments:create-issue-comment',
    async (_event, owner: string, repo: string, number: number, body: string): Promise<PullRequestComment> => {
      const token = requireAuth()
      return fetchGitHubJson(
        token,
        `${API}/repos/${owner}/${repo}/issues/${number}/comments`,
        'Failed to post comment',
        { method: 'POST', body: JSON.stringify({ body }) }
      )
    }
  )

  // Update an issue comment
  // PATCH /repos/{owner}/{repo}/issues/comments/{comment_id}
  ipcMain.handle(
    'github:pull-comments:update-issue-comment',
    async (_event, owner: string, repo: string, commentId: number, body: string): Promise<PullRequestComment> => {
      const token = requireAuth()
      return fetchGitHubJson(
        token,
        `${API}/repos/${owner}/${repo}/issues/comments/${commentId}`,
        `Failed to update comment ${commentId}`,
        { method: 'PATCH', body: JSON.stringify({ body }) }
      )
    }
  )

  // Delete an issue comment
  // DELETE /repos/{owner}/{repo}/issues/comments/{comment_id}
  ipcMain.handle(
    'github:pull-comments:delete-issue-comment',
    async (_event, owner: string, repo: string, commentId: number): Promise<void> => {
      const token = requireAuth()
      return fetchGitHubVoid(
        token,
        `${API}/repos/${owner}/${repo}/issues/comments/${commentId}`,
        `Failed to delete comment ${commentId}`,
        { method: 'DELETE' }
      )
    }
  )

  // List review threads via GraphQL — gives us thread IDs + isResolved state
  // that the REST API doesn't expose. Correlated to REST comments via databaseId.
  ipcMain.handle(
    'github:pull-comments:list-review-threads',
    async (
      _event,
      owner: string,
      repo: string,
      number: number
    ): Promise<Array<{ id: string; isResolved: boolean; commentDatabaseIds: number[] }>> => {
      const token = requireAuth()
      const results: Array<{ id: string; isResolved: boolean; commentDatabaseIds: number[] }> = []
      let cursor: string | null = null

      while (true) {
        const data = await fetchGitHubGraphQL<{
          repository: {
            pullRequest: {
              reviewThreads: {
                nodes: Array<{
                  id: string
                  isResolved: boolean
                  comments: { nodes: Array<{ databaseId: number | null }> }
                }>
                pageInfo: { hasNextPage: boolean; endCursor: string | null }
              }
            }
          }
        }>(
          token,
          `query($owner: String!, $name: String!, $number: Int!, $cursor: String) {
            repository(owner: $owner, name: $name) {
              pullRequest(number: $number) {
                reviewThreads(first: 100, after: $cursor) {
                  nodes {
                    id
                    isResolved
                    comments(first: 100) { nodes { databaseId } }
                  }
                  pageInfo { hasNextPage endCursor }
                }
              }
            }
          }`,
          { owner, name: repo, number, cursor },
          `Failed to load review threads for PR #${number}`
        )

        const connection = data.repository.pullRequest.reviewThreads
        for (const node of connection.nodes) {
          results.push({
            id: node.id,
            isResolved: node.isResolved,
            commentDatabaseIds: node.comments.nodes.map((c) => c.databaseId).filter((id): id is number => id != null)
          })
        }

        if (!connection.pageInfo.hasNextPage || !connection.pageInfo.endCursor) break
        cursor = connection.pageInfo.endCursor
      }

      return results
    }
  )

  // Resolve a review thread (GraphQL)
  ipcMain.handle('github:pull-comments:resolve-thread', async (_event, threadId: string): Promise<void> => {
    const token = requireAuth()
    await fetchGitHubGraphQL(
      token,
      `mutation($id: ID!) { resolveReviewThread(input: { threadId: $id }) { thread { isResolved } } }`,
      { id: threadId },
      'Failed to resolve review thread'
    )
  })

  // Unresolve a review thread (GraphQL)
  ipcMain.handle('github:pull-comments:unresolve-thread', async (_event, threadId: string): Promise<void> => {
    const token = requireAuth()
    await fetchGitHubGraphQL(
      token,
      `mutation($id: ID!) { unresolveReviewThread(input: { threadId: $id }) { thread { isResolved } } }`,
      { id: threadId },
      'Failed to unresolve review thread'
    )
  })

  // Minimize a comment (Hide) — works for both issue and review comments.
  // GraphQL: minimizeComment(subjectId, classifier)
  ipcMain.handle(
    'github:pull-comments:minimize',
    async (_event, nodeId: string, classifier: MinimizeClassifier): Promise<void> => {
      const token = requireAuth()
      await fetchGitHubGraphQL(
        token,
        `mutation($id: ID!, $classifier: ReportedContentClassifiers!) {
          minimizeComment(input: { subjectId: $id, classifier: $classifier }) {
            minimizedComment { isMinimized }
          }
        }`,
        { id: nodeId, classifier },
        'Failed to hide comment'
      )
    }
  )

  // ============================================================
  // Review comments (code-level comments on PR diffs)
  // ============================================================

  // List review comments on a pull request
  // GET /repos/{owner}/{repo}/pulls/{pull_number}/comments
  ipcMain.handle(
    'github:pull-comments:list-for-pull',
    async (
      _event,
      owner: string,
      repo: string,
      number: number,
      options?: {
        sort?: 'created' | 'updated'
        direction?: 'asc' | 'desc'
        since?: string
        perPage?: number
        page?: number
      }
    ): Promise<PullRequestReviewComment[]> => {
      const token = requireAuth()
      const params = new URLSearchParams()
      params.set('sort', options?.sort || 'created')
      params.set('direction', options?.direction || 'asc')
      if (options?.since) params.set('since', options.since)
      params.set('per_page', String(options?.perPage || 100))
      if (options?.page) params.set('page', String(options.page))
      return fetchGitHubJson(
        token,
        `${API}/repos/${owner}/${repo}/pulls/${number}/comments?${params}`,
        `Failed to load review comments for PR #${number}`
      )
    }
  )

  // List review comments in a repository
  // GET /repos/{owner}/{repo}/pulls/comments
  ipcMain.handle(
    'github:pull-comments:list-for-repo',
    async (
      _event,
      owner: string,
      repo: string,
      options?: {
        sort?: 'created' | 'updated'
        direction?: 'asc' | 'desc'
        since?: string
        perPage?: number
        page?: number
      }
    ): Promise<PullRequestReviewComment[]> => {
      const token = requireAuth()
      const params = new URLSearchParams()
      if (options?.sort) params.set('sort', options.sort)
      if (options?.direction) params.set('direction', options.direction)
      if (options?.since) params.set('since', options.since)
      if (options?.perPage) params.set('per_page', String(Math.min(100, options.perPage)))
      if (options?.page) params.set('page', String(options.page))
      const qs = params.toString()
      return fetchGitHubJson(
        token,
        `${API}/repos/${owner}/${repo}/pulls/comments${qs ? `?${qs}` : ''}`,
        `Failed to list review comments for ${owner}/${repo}`
      )
    }
  )

  // Get a review comment
  // GET /repos/{owner}/{repo}/pulls/comments/{comment_id}
  ipcMain.handle(
    'github:pull-comments:get',
    async (_event, owner: string, repo: string, commentId: number): Promise<PullRequestReviewComment> => {
      const token = requireAuth()
      return fetchGitHubJson(
        token,
        `${API}/repos/${owner}/${repo}/pulls/comments/${commentId}`,
        `Failed to get review comment ${commentId}`
      )
    }
  )

  // Create a review comment on a pull request
  // POST /repos/{owner}/{repo}/pulls/{pull_number}/comments
  ipcMain.handle(
    'github:pull-comments:create',
    async (
      _event,
      owner: string,
      repo: string,
      number: number,
      input: CreateReviewCommentInput
    ): Promise<PullRequestReviewComment> => {
      const token = requireAuth()
      const payload: Record<string, unknown> = {
        body: input.body,
        commit_id: input.commitId,
        path: input.path,
        line: input.line,
        side: input.side
      }
      if (input.startLine !== undefined) payload.start_line = input.startLine
      if (input.startSide) payload.start_side = input.startSide
      if (input.subjectType) payload.subject_type = input.subjectType
      return fetchGitHubJson(
        token,
        `${API}/repos/${owner}/${repo}/pulls/${number}/comments`,
        'Failed to post review comment',
        { method: 'POST', body: JSON.stringify(payload) }
      )
    }
  )

  // Create a reply to a review comment
  // POST /repos/{owner}/{repo}/pulls/{pull_number}/comments/{comment_id}/replies
  ipcMain.handle(
    'github:pull-comments:create-reply',
    async (
      _event,
      owner: string,
      repo: string,
      number: number,
      commentId: number,
      body: string
    ): Promise<PullRequestReviewComment> => {
      const token = requireAuth()
      return fetchGitHubJson(
        token,
        `${API}/repos/${owner}/${repo}/pulls/${number}/comments/${commentId}/replies`,
        'Failed to reply to review comment',
        { method: 'POST', body: JSON.stringify({ body }) }
      )
    }
  )

  // Update a review comment
  // PATCH /repos/{owner}/{repo}/pulls/comments/{comment_id}
  ipcMain.handle(
    'github:pull-comments:update',
    async (_event, owner: string, repo: string, commentId: number, body: string): Promise<PullRequestReviewComment> => {
      const token = requireAuth()
      return fetchGitHubJson(
        token,
        `${API}/repos/${owner}/${repo}/pulls/comments/${commentId}`,
        `Failed to update review comment ${commentId}`,
        { method: 'PATCH', body: JSON.stringify({ body }) }
      )
    }
  )

  // Delete a review comment
  // DELETE /repos/{owner}/{repo}/pulls/comments/{comment_id}
  ipcMain.handle(
    'github:pull-comments:delete',
    async (_event, owner: string, repo: string, commentId: number): Promise<void> => {
      const token = requireAuth()
      return fetchGitHubVoid(
        token,
        `${API}/repos/${owner}/${repo}/pulls/comments/${commentId}`,
        `Failed to delete review comment ${commentId}`,
        { method: 'DELETE' }
      )
    }
  )
}
