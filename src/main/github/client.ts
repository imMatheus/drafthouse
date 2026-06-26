import { loadAuth } from '../auth'

const GITHUB_API_VERSION = '2026-03-10'
const API = 'https://api.github.com'

export { API, GITHUB_API_VERSION }

export function requireAuth(): string {
  const auth = loadAuth()
  if (!auth) {
    throw new Error('GitHub authentication is missing. Log in again.')
  }
  return auth.token
}

export function getGitHubHeaders(token: string, extraHeaders: Record<string, string> = {}): Record<string, string> {
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

async function throwGitHubError(response: Response, errorContext: string): Promise<never> {
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

export async function fetchGitHubJson<T>(
  token: string,
  url: string,
  errorContext: string,
  options?: {
    method?: string
    body?: string
  }
): Promise<T> {
  const extraHeaders: Record<string, string> = {}
  if (options?.body) {
    extraHeaders['Content-Type'] = 'application/json'
  }

  const response = await fetch(url, {
    method: options?.method,
    body: options?.body,
    headers: getGitHubHeaders(token, extraHeaders)
  })

  if (!response.ok) {
    await throwGitHubError(response, errorContext)
  }

  return response.json() as Promise<T>
}

export async function fetchGitHubVoid(
  token: string,
  url: string,
  errorContext: string,
  options?: {
    method?: string
    body?: string
  }
): Promise<void> {
  const extraHeaders: Record<string, string> = {}
  if (options?.body) {
    extraHeaders['Content-Type'] = 'application/json'
  }

  const response = await fetch(url, {
    method: options?.method,
    body: options?.body,
    headers: getGitHubHeaders(token, extraHeaders)
  })

  if (!response.ok) {
    await throwGitHubError(response, errorContext)
  }
}

export async function fetchGitHubCheck(token: string, url: string, errorContext: string): Promise<boolean> {
  const response = await fetch(url, {
    headers: getGitHubHeaders(token)
  })

  if (response.status === 204) return true
  if (response.status === 404) return false

  await throwGitHubError(response, errorContext)
  return false // unreachable, throwGitHubError always throws
}

export async function fetchGitHubPaginatedCollection<T>(
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

export async function fetchGitHubGraphQL<T>(
  token: string,
  query: string,
  variables: Record<string, unknown>,
  errorContext: string
): Promise<T> {
  const response = await fetch(`${API}/graphql`, {
    method: 'POST',
    headers: getGitHubHeaders(token, { 'Content-Type': 'application/json' }),
    body: JSON.stringify({ query, variables })
  })

  if (!response.ok) {
    await throwGitHubError(response, errorContext)
  }

  const json = (await response.json()) as { data?: T; errors?: { message: string }[] }

  if (json.errors?.length) {
    throw new Error(`${errorContext}: ${json.errors[0].message}`)
  }

  if (!json.data) {
    throw new Error(`${errorContext}: No data returned`)
  }

  return json.data
}
