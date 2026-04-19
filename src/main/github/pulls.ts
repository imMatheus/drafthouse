import { ipcMain } from 'electron'
import {
  requireAuth,
  fetchGitHubJson,
  fetchGitHubCheck,
  fetchGitHubPaginatedCollection,
  fetchGitHubGraphQL,
  API
} from './client'
import type {
  PullRequest,
  PullRequestDetail,
  PullRequestCommit,
  PaginatedPullRequestCommits,
  PullRequestFile,
  PullRequestMergeMethod,
  PullRequestMergeResult,
  CreatePullRequestInput,
  UpdatePullRequestInput,
  UpdateBranchResult
} from '../../shared/types'

export function registerPullsHandlers(): void {
  // List pull requests
  // GET /repos/{owner}/{repo}/pulls
  ipcMain.handle(
    'github:pulls:list',
    async (
      _event,
      owner: string,
      repo: string,
      options?: {
        state?: 'open' | 'closed' | 'all'
        head?: string
        base?: string
        sort?: 'created' | 'updated' | 'popularity' | 'long-running'
        direction?: 'asc' | 'desc'
        perPage?: number
        page?: number
      }
    ): Promise<PullRequest[]> => {
      const token = requireAuth()
      const params = new URLSearchParams()
      params.set('state', options?.state || 'open')
      if (options?.head) params.set('head', options.head)
      if (options?.base) params.set('base', options.base)
      params.set('sort', options?.sort || 'updated')
      params.set('direction', options?.direction || 'desc')
      params.set('per_page', String(options?.perPage || 50))
      if (options?.page) params.set('page', String(options.page))
      return fetchGitHubJson(
        token,
        `${API}/repos/${owner}/${repo}/pulls?${params}`,
        `Unable to load pull requests for ${owner}/${repo}. If this is a private repository, log out and sign in again to grant repo access.`
      )
    }
  )

  // Get a pull request
  // GET /repos/{owner}/{repo}/pulls/{pull_number}
  ipcMain.handle(
    'github:pulls:get',
    async (_event, owner: string, repo: string, number: number): Promise<PullRequestDetail> => {
      const token = requireAuth()
      return fetchGitHubJson(
        token,
        `${API}/repos/${owner}/${repo}/pulls/${number}`,
        `Failed to load pull request #${number}`
      )
    }
  )

  // Create a pull request
  // POST /repos/{owner}/{repo}/pulls
  ipcMain.handle(
    'github:pulls:create',
    async (_event, owner: string, repo: string, input: CreatePullRequestInput): Promise<PullRequestDetail> => {
      const token = requireAuth()
      const payload: Record<string, unknown> = {
        title: input.title,
        head: input.head,
        base: input.base
      }
      if (input.body !== undefined) payload.body = input.body
      if (input.draft !== undefined) payload.draft = input.draft
      if (input.maintainer_can_modify !== undefined) payload.maintainer_can_modify = input.maintainer_can_modify
      if (input.head_repo) payload.head_repo = input.head_repo
      return fetchGitHubJson(token, `${API}/repos/${owner}/${repo}/pulls`, `Failed to create pull request`, {
        method: 'POST',
        body: JSON.stringify(payload)
      })
    }
  )

  // Update a pull request
  // PATCH /repos/{owner}/{repo}/pulls/{pull_number}
  ipcMain.handle(
    'github:pulls:update',
    async (
      _event,
      owner: string,
      repo: string,
      number: number,
      input: UpdatePullRequestInput
    ): Promise<PullRequestDetail> => {
      const token = requireAuth()
      return fetchGitHubJson(token, `${API}/repos/${owner}/${repo}/pulls/${number}`, `Failed to update PR #${number}`, {
        method: 'PATCH',
        body: JSON.stringify(input)
      })
    }
  )

  // Close a pull request (convenience wrapper around update)
  ipcMain.handle(
    'github:pulls:close',
    async (_event, owner: string, repo: string, number: number): Promise<PullRequestDetail> => {
      const token = requireAuth()
      return fetchGitHubJson(token, `${API}/repos/${owner}/${repo}/pulls/${number}`, `Failed to close PR #${number}`, {
        method: 'PATCH',
        body: JSON.stringify({ state: 'closed' })
      })
    }
  )

  // Reopen a pull request (convenience wrapper around update)
  ipcMain.handle(
    'github:pulls:reopen',
    async (_event, owner: string, repo: string, number: number): Promise<PullRequestDetail> => {
      const token = requireAuth()
      return fetchGitHubJson(token, `${API}/repos/${owner}/${repo}/pulls/${number}`, `Failed to reopen PR #${number}`, {
        method: 'PATCH',
        body: JSON.stringify({ state: 'open' })
      })
    }
  )

  // List commits on a pull request
  // GET /repos/{owner}/{repo}/pulls/{pull_number}/commits
  ipcMain.handle(
    'github:pulls:list-commits',
    async (
      _event,
      owner: string,
      repo: string,
      number: number,
      page = 1,
      perPage = 10
    ): Promise<PaginatedPullRequestCommits> => {
      const token = requireAuth()
      const sanitizedPage = Number.isFinite(page) && page > 0 ? Math.floor(page) : 1
      const sanitizedPerPage = Number.isFinite(perPage) && perPage > 0 ? Math.min(100, Math.floor(perPage)) : 10

      const items = await fetchGitHubJson<PullRequestCommit[]>(
        token,
        `${API}/repos/${owner}/${repo}/pulls/${number}/commits?page=${sanitizedPage}&per_page=${sanitizedPerPage}`,
        `Failed to load commits for PR #${number}`
      )

      return { items, page: sanitizedPage, perPage: sanitizedPerPage }
    }
  )

  // Resolve all authors (main + co-authors) for commits on a PR via GraphQL.
  // Returns a map of commit SHA to its authors list with avatar URLs resolved.
  ipcMain.handle(
    'github:pulls:list-commit-authors',
    async (
      _event,
      owner: string,
      repo: string,
      number: number
    ): Promise<Record<string, Array<{ name: string; email: string | null; avatarUrl: string; login: string | null }>>> => {
      const token = requireAuth()
      const result: Record<string, Array<{ name: string; email: string | null; avatarUrl: string; login: string | null }>> = {}
      let cursor: string | null = null

      while (true) {
        const data = await fetchGitHubGraphQL<{
          repository: {
            pullRequest: {
              commits: {
                nodes: Array<{
                  commit: {
                    oid: string
                    authors: {
                      nodes: Array<{
                        name: string | null
                        email: string | null
                        avatarUrl: string
                        user: { login: string } | null
                      }>
                    }
                  }
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
                commits(first: 100, after: $cursor) {
                  nodes {
                    commit {
                      oid
                      authors(first: 10) {
                        nodes {
                          name
                          email
                          avatarUrl
                          user { login }
                        }
                      }
                    }
                  }
                  pageInfo { hasNextPage endCursor }
                }
              }
            }
          }`,
          { owner, name: repo, number, cursor },
          `Failed to resolve commit authors for PR #${number}`
        )

        const connection = data.repository.pullRequest.commits
        for (const node of connection.nodes) {
          result[node.commit.oid] = node.commit.authors.nodes
            .filter((a) => a.name)
            .map((a) => ({
              name: a.name!,
              email: a.email,
              avatarUrl: a.avatarUrl,
              login: a.user?.login ?? null
            }))
        }

        if (!connection.pageInfo.hasNextPage || !connection.pageInfo.endCursor) break
        cursor = connection.pageInfo.endCursor
      }

      return result
    }
  )

  // List pull request files
  // GET /repos/{owner}/{repo}/pulls/{pull_number}/files
  ipcMain.handle(
    'github:pulls:list-files',
    async (_event, owner: string, repo: string, number: number): Promise<PullRequestFile[]> => {
      const token = requireAuth()
      return fetchGitHubPaginatedCollection<PullRequestFile>(
        token,
        `${API}/repos/${owner}/${repo}/pulls/${number}/files`,
        `Failed to load files for PR #${number}`
      )
    }
  )

  // Check if a pull request has been merged
  // GET /repos/{owner}/{repo}/pulls/{pull_number}/merge
  ipcMain.handle(
    'github:pulls:check-merged',
    async (_event, owner: string, repo: string, number: number): Promise<boolean> => {
      const token = requireAuth()
      return fetchGitHubCheck(
        token,
        `${API}/repos/${owner}/${repo}/pulls/${number}/merge`,
        `Failed to check merge status for PR #${number}`
      )
    }
  )

  // Merge a pull request
  // PUT /repos/{owner}/{repo}/pulls/{pull_number}/merge
  ipcMain.handle(
    'github:pulls:merge',
    async (
      _event,
      owner: string,
      repo: string,
      number: number,
      mergeMethod: PullRequestMergeMethod,
      commitTitle?: string,
      commitMessage?: string
    ): Promise<PullRequestMergeResult> => {
      const token = requireAuth()
      const payload: Record<string, string> = { merge_method: mergeMethod }
      if (commitTitle) payload.commit_title = commitTitle
      if (commitMessage) payload.commit_message = commitMessage
      return fetchGitHubJson(
        token,
        `${API}/repos/${owner}/${repo}/pulls/${number}/merge`,
        `Failed to merge PR #${number}`,
        { method: 'PUT', body: JSON.stringify(payload) }
      )
    }
  )

  // Update a pull request branch
  // PUT /repos/{owner}/{repo}/pulls/{pull_number}/update-branch
  ipcMain.handle(
    'github:pulls:update-branch',
    async (
      _event,
      owner: string,
      repo: string,
      number: number,
      expectedHeadSha?: string
    ): Promise<UpdateBranchResult> => {
      const token = requireAuth()
      const payload: Record<string, string> = {}
      if (expectedHeadSha) payload.expected_head_sha = expectedHeadSha
      return fetchGitHubJson(
        token,
        `${API}/repos/${owner}/${repo}/pulls/${number}/update-branch`,
        `Failed to update branch for PR #${number}`,
        { method: 'PUT', body: JSON.stringify(payload) }
      )
    }
  )

  // Convert a pull request to draft (GraphQL)
  ipcMain.handle('github:pulls:convert-to-draft', async (_event, nodeId: string): Promise<void> => {
    const token = requireAuth()
    await fetchGitHubGraphQL(
      token,
      `mutation($id: ID!) {
          convertPullRequestToDraft(input: { pullRequestId: $id }) {
            pullRequest { isDraft }
          }
        }`,
      { id: nodeId },
      'Failed to convert PR to draft'
    )
  })

  // Mark a pull request as ready for review (GraphQL)
  ipcMain.handle('github:pulls:mark-ready', async (_event, nodeId: string): Promise<void> => {
    const token = requireAuth()
    await fetchGitHubGraphQL(
      token,
      `mutation($id: ID!) {
          markPullRequestAsReadyForReview(input: { pullRequestId: $id }) {
            pullRequest { isDraft }
          }
        }`,
      { id: nodeId },
      'Failed to mark PR as ready for review'
    )
  })
}
