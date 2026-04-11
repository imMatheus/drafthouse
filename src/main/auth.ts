import { BrowserWindow, ipcMain, app, shell } from 'electron'
import { join } from 'path'
import { readFileSync, writeFileSync, existsSync } from 'fs'
import type {
  AuthData,
  GitHubRepo,
  GitHubUser,
  PullRequestFile,
  PullRequest,
  PullRequestComment,
  PullRequestCommit,
  PullRequestReview,
  PullRequestReviewComment,
  PullRequestDetail,
  PaginatedPullRequestCommits,
  SubmitPullRequestReviewInput
} from '../shared/types'

const GITHUB_CLIENT_ID = import.meta.env.MAIN_VITE_GITHUB_CLIENT_ID
const GITHUB_API_VERSION = '2026-03-10'

function getAuthPath(): string {
  return join(app.getPath('userData'), 'auth.json')
}

function loadAuth(): AuthData | null {
  const authPath = getAuthPath()
  if (!existsSync(authPath)) return null
  try {
    const data = JSON.parse(readFileSync(authPath, 'utf-8')) as Partial<AuthData>
    if (typeof data.token !== 'string' || !data.token) return null
    if (!Array.isArray(data.scopes) || !data.scopes.includes('repo')) return null
    if (!data.user) return null
    return data as AuthData
  } catch {
    return null
  }
}

function saveAuth(data: AuthData): void {
  writeFileSync(getAuthPath(), JSON.stringify(data))
}

function clearAuth(): void {
  const authPath = getAuthPath()
  if (existsSync(authPath)) {
    writeFileSync(authPath, '')
  }
}

async function requestDeviceCode(): Promise<{
  device_code: string
  user_code: string
  verification_uri: string
  interval: number
  expires_in: number
}> {
  const res = await fetch('https://github.com/login/device/code', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json'
    },
    body: JSON.stringify({
      client_id: GITHUB_CLIENT_ID,
      scope: 'read:user repo'
    })
  })

  const data = await res.json()
  if (data.error) throw new Error(data.error_description || data.error)
  return data
}

async function pollForToken(
  deviceCode: string,
  interval: number
): Promise<{ token: string; scopes: string[] }> {
  const wait = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms))

  while (true) {
    await wait(interval * 1000)

    const res = await fetch('https://github.com/login/oauth/access_token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json'
      },
      body: JSON.stringify({
        client_id: GITHUB_CLIENT_ID,
        device_code: deviceCode,
        grant_type: 'urn:ietf:params:oauth:grant-type:device_code'
      })
    })

    const data = await res.json()

    if (data.access_token) {
      const scopeValue = typeof data.scope === 'string' ? data.scope : ''
      const scopes = scopeValue
        .split(',')
        .map((scope) => scope.trim())
        .filter(Boolean)

      return { token: data.access_token, scopes }
    }
    if (data.error === 'authorization_pending') continue
    if (data.error === 'slow_down') {
      interval += 5
      continue
    }
    throw new Error(data.error_description || data.error)
  }
}

async function fetchGitHubUser(token: string): Promise<GitHubUser> {
  return fetchGitHubJson<GitHubUser>(token, 'https://api.github.com/user', 'Failed to fetch user')
}

async function fetchRepos(token: string, query?: string): Promise<GitHubRepo[]> {
  if (query) {
    const data = await fetchGitHubJson<{ items: GitHubRepo[] }>(
      token,
      `https://api.github.com/search/repositories?q=${encodeURIComponent(query)}&per_page=10&affiliation=owner,collaborator,organization_member`,
      'Failed to search repos'
    )
    return data.items
  }

  return fetchGitHubJson<GitHubRepo[]>(
    token,
    'https://api.github.com/user/repos?sort=pushed&per_page=10&affiliation=owner,collaborator,organization_member',
    'Failed to fetch repos'
  )
}

function getGitHubHeaders(
  token: string,
  extraHeaders: Record<string, string> = {}
): Record<string, string> {
  return {
    Accept: 'application/vnd.github+json',
    Authorization: `Bearer ${token}`,
    'X-GitHub-Api-Version': GITHUB_API_VERSION,
    ...extraHeaders
  }
}

async function readGitHubErrorMessage(response: Response): Promise<string> {
  try {
    const data = (await response.json()) as { message?: string }
    if (typeof data.message === 'string' && data.message.length > 0) {
      return data.message
    }
  } catch {
    // Ignore parse failures and fall back to the HTTP status below.
  }

  return `GitHub returned ${response.status}`
}

async function fetchGitHubJson<T>(
  token: string,
  url: string,
  errorContext: string,
  options?: {
    method?: string
    body?: string
    headers?: Record<string, string>
  }
): Promise<T> {
  const response = await fetch(url, {
    method: options?.method,
    body: options?.body,
    headers: getGitHubHeaders(token, options?.headers)
  })

  if (!response.ok) {
    const githubMessage = await readGitHubErrorMessage(response)

    if (response.status === 401) {
      throw new Error('GitHub authentication expired. Log out and sign in again.')
    }

    if (response.status === 403 && response.headers.get('x-ratelimit-remaining') === '0') {
      throw new Error('GitHub API rate limit exceeded. Try again later.')
    }

    if (response.status === 403 || response.status === 404) {
      throw new Error(errorContext)
    }

    throw new Error(`${errorContext}: ${githubMessage}`)
  }

  return response.json() as Promise<T>
}

async function fetchGitHubPaginatedCollection<T>(
  token: string,
  url: string,
  errorContext: string
): Promise<T[]> {
  const items: T[] = []
  let page = 1

  while (true) {
    const pageItems = await fetchGitHubJson<T[]>(
      token,
      `${url}${url.includes('?') ? '&' : '?'}per_page=100&page=${page}`,
      errorContext
    )

    items.push(...pageItems)

    if (pageItems.length < 100) {
      return items
    }

    page += 1
  }
}

export function registerAuthHandlers(): void {
  ipcMain.handle('auth:login', async (event) => {
    const { device_code, user_code, verification_uri, interval } = await requestDeviceCode()

    shell.openExternal(`${verification_uri}?code=${user_code}`)

    const window = BrowserWindow.fromWebContents(event.sender)
    window?.webContents.send('auth:device-code', { userCode: user_code })

    const { token, scopes } = await pollForToken(device_code, interval)
    const user = await fetchGitHubUser(token)
    const authData: AuthData = { token, scopes, user }
    saveAuth(authData)
    return authData
  })

  ipcMain.handle('auth:logout', () => {
    clearAuth()
    return null
  })

  ipcMain.handle('auth:get-user', () => {
    return loadAuth()
  })

  ipcMain.handle('auth:get-repos', async (_event, query?: string) => {
    const auth = loadAuth()
    if (!auth) return null
    return fetchRepos(auth.token, query)
  })

  ipcMain.handle(
    'auth:get-pull-requests',
    async (_event, owner: string, repo: string, state?: string): Promise<PullRequest[]> => {
      const resolvedState = state || 'open'
      const auth = loadAuth()
      if (!auth) {
        throw new Error('GitHub authentication is missing. Log in again to load pull requests.')
      }

      return fetchGitHubJson<PullRequest[]>(
        auth.token,
        `https://api.github.com/repos/${owner}/${repo}/pulls?state=${resolvedState}&per_page=50&sort=updated&direction=desc`,
        `Unable to load pull requests for ${owner}/${repo}. If this is a private repository, log out and sign in again to grant repo access.`
      )
    }
  )

  ipcMain.handle(
    'auth:get-pull-request',
    async (_event, owner: string, repo: string, number: number): Promise<PullRequestDetail> => {
      const auth = loadAuth()
      if (!auth) {
        throw new Error('GitHub authentication is missing. Log in again to load this pull request.')
      }

      return fetchGitHubJson<PullRequestDetail>(
        auth.token,
        `https://api.github.com/repos/${owner}/${repo}/pulls/${number}`,
        `Failed to load pull request #${number}`
      )
    }
  )

  ipcMain.handle(
    'auth:get-pull-request-commits',
    async (
      _event,
      owner: string,
      repo: string,
      number: number,
      page = 1,
      perPage = 10
    ): Promise<PaginatedPullRequestCommits> => {
      const auth = loadAuth()
      if (!auth) {
        throw new Error('GitHub authentication is missing. Log in again to load commits.')
      }

      const sanitizedPage = Number.isFinite(page) && page > 0 ? Math.floor(page) : 1
      const sanitizedPerPage =
        Number.isFinite(perPage) && perPage > 0 ? Math.min(100, Math.floor(perPage)) : 10

      const items = await fetchGitHubJson<PullRequestCommit[]>(
        auth.token,
        `https://api.github.com/repos/${owner}/${repo}/pulls/${number}/commits?page=${sanitizedPage}&per_page=${sanitizedPerPage}`,
        `Failed to load commits for PR #${number}`
      )

      return {
        items,
        page: sanitizedPage,
        perPage: sanitizedPerPage
      }
    }
  )

  ipcMain.handle(
    'auth:get-pull-request-comments',
    async (_event, owner: string, repo: string, number: number): Promise<PullRequestComment[]> => {
      const auth = loadAuth()
      if (!auth) {
        throw new Error('GitHub authentication is missing. Log in again to load comments.')
      }

      return fetchGitHubJson<PullRequestComment[]>(
        auth.token,
        `https://api.github.com/repos/${owner}/${repo}/issues/${number}/comments?per_page=100`,
        `Failed to load comments for PR #${number}`
      )
    }
  )

  ipcMain.handle(
    'auth:get-pull-request-review-comments',
    async (
      _event,
      owner: string,
      repo: string,
      number: number
    ): Promise<PullRequestReviewComment[]> => {
      const auth = loadAuth()
      if (!auth) {
        throw new Error('GitHub authentication is missing. Log in again to load review comments.')
      }

      return fetchGitHubJson<PullRequestReviewComment[]>(
        auth.token,
        `https://api.github.com/repos/${owner}/${repo}/pulls/${number}/comments?sort=created&direction=asc&per_page=100`,
        `Failed to load review comments for PR #${number}`
      )
    }
  )

  ipcMain.handle(
    'auth:get-pull-request-reviews',
    async (_event, owner: string, repo: string, number: number): Promise<PullRequestReview[]> => {
      const auth = loadAuth()
      if (!auth) {
        throw new Error('GitHub authentication is missing. Log in again to load reviews.')
      }

      return fetchGitHubJson<PullRequestReview[]>(
        auth.token,
        `https://api.github.com/repos/${owner}/${repo}/pulls/${number}/reviews?per_page=100`,
        `Failed to load reviews for PR #${number}`
      )
    }
  )

  ipcMain.handle(
    'auth:get-pull-request-files',
    async (_event, owner: string, repo: string, number: number): Promise<PullRequestFile[]> => {
      const auth = loadAuth()
      if (!auth) {
        throw new Error(
          'GitHub authentication is missing. Log in again to load pull request files.'
        )
      }

      return fetchGitHubPaginatedCollection<PullRequestFile>(
        auth.token,
        `https://api.github.com/repos/${owner}/${repo}/pulls/${number}/files`,
        `Failed to load files for PR #${number}`
      )
    }
  )

  ipcMain.handle(
    'auth:create-pull-request-comment',
    async (
      _event,
      owner: string,
      repo: string,
      number: number,
      body: string
    ): Promise<PullRequestComment> => {
      const auth = loadAuth()
      if (!auth) {
        throw new Error('GitHub authentication is missing. Log in again to post a comment.')
      }

      return fetchGitHubJson<PullRequestComment>(
        auth.token,
        `https://api.github.com/repos/${owner}/${repo}/issues/${number}/comments`,
        'Failed to post comment',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ body })
        }
      )
    }
  )

  ipcMain.handle(
    'auth:create-pull-request-review-comment',
    async (
      _event,
      owner: string,
      repo: string,
      number: number,
      input: { body: string; commitId: string; path: string; line: number; side: 'LEFT' | 'RIGHT' }
    ): Promise<PullRequestReviewComment> => {
      const auth = loadAuth()
      if (!auth) {
        throw new Error('GitHub authentication is missing. Log in again to post a review comment.')
      }

      return fetchGitHubJson<PullRequestReviewComment>(
        auth.token,
        `https://api.github.com/repos/${owner}/${repo}/pulls/${number}/comments`,
        'Failed to post review comment',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            body: input.body,
            commit_id: input.commitId,
            path: input.path,
            line: input.line,
            side: input.side
          })
        }
      )
    }
  )

  ipcMain.handle(
    'auth:reply-to-pull-request-review-comment',
    async (
      _event,
      owner: string,
      repo: string,
      number: number,
      commentId: number,
      body: string
    ): Promise<PullRequestReviewComment> => {
      const auth = loadAuth()
      if (!auth) {
        throw new Error(
          'GitHub authentication is missing. Log in again to reply to a review comment.'
        )
      }

      return fetchGitHubJson<PullRequestReviewComment>(
        auth.token,
        `https://api.github.com/repos/${owner}/${repo}/pulls/${number}/comments/${commentId}/replies`,
        'Failed to reply to review comment',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ body })
        }
      )
    }
  )

  ipcMain.handle(
    'auth:submit-pull-request-review',
    async (
      _event,
      owner: string,
      repo: string,
      number: number,
      input: SubmitPullRequestReviewInput
    ): Promise<PullRequestReview> => {
      const auth = loadAuth()
      if (!auth) {
        throw new Error('GitHub authentication is missing. Log in again to submit a review.')
      }

      return fetchGitHubJson<PullRequestReview>(
        auth.token,
        `https://api.github.com/repos/${owner}/${repo}/pulls/${number}/reviews`,
        'Failed to submit review',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
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
}
