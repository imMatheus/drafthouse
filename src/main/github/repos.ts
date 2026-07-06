import { ipcMain } from 'electron'
import { requireAuth, fetchGitHubJson, getGitHubHeaders, throwGitHubError, API } from './client'
import type {
  CommitActivityWeek,
  GitHubRepo,
  GitHubRepoDetails,
  RepoCommitActivity,
  RepoDailyCommits
} from '../../shared/types'

export function registerReposHandlers(): void {
  // List repositories / Search repositories
  // GET /user/repos or GET /search/repositories
  ipcMain.handle('github:repos:list', async (_event, query?: string): Promise<GitHubRepo[]> => {
    const token = requireAuth()

    if (query) {
      const data = await fetchGitHubJson<{ items: GitHubRepo[] }>(
        token,
        `${API}/search/repositories?q=${encodeURIComponent(query)}&per_page=10&affiliation=owner,collaborator,organization_member`,
        'Failed to search repos'
      )
      return data.items
    }

    return fetchGitHubJson(
      token,
      `${API}/user/repos?sort=pushed&per_page=10&affiliation=owner,collaborator,organization_member`,
      'Failed to fetch repos'
    )
  })

  // Get repository details
  // GET /repos/{owner}/{repo}
  ipcMain.handle('github:repos:get', async (_event, owner: string, repo: string): Promise<GitHubRepoDetails> => {
    const token = requireAuth()
    return fetchGitHubJson(token, `${API}/repos/${owner}/${repo}`, `Failed to load repository ${owner}/${repo}`)
  })

  // Weekly commit activity for the last year
  // GET /repos/{owner}/{repo}/stats/commit_activity
  // GitHub computes these stats lazily and answers 202 (with an empty body)
  // until they're ready, so that case is reported as `pending` for the
  // renderer to poll rather than treated as an error.
  ipcMain.handle(
    'github:repos:commit-activity',
    async (_event, owner: string, repo: string): Promise<RepoCommitActivity> => {
      const token = requireAuth()
      const response = await fetch(`${API}/repos/${owner}/${repo}/stats/commit_activity`, {
        headers: getGitHubHeaders(token)
      })
      if (response.status === 202) return { pending: true, weeks: [] }
      if (!response.ok) await throwGitHubError(response, `Failed to load commit activity for ${owner}/${repo}`)
      const weeks = (await response.json()) as CommitActivityWeek[]
      return { pending: false, weeks: Array.isArray(weeks) ? weeks : [] }
    }
  )

  // Per-day commit counts on the default branch for a date range, for the
  // dashboard's activity graph. The commits API has no aggregation, so page 1
  // is fetched alone to learn the total page count from the Link header, and
  // the remaining pages are pulled through a small concurrency pool in a
  // single wave. Counts are bucketed by UTC calendar day (matching GitHub's
  // own UTC-aligned commit-activity stats). Very active ranges stop at the
  // page cap and report `truncated` instead of fetching without bound.
  ipcMain.handle(
    'github:repos:daily-commits',
    async (_event, owner: string, repo: string, since: string, until: string): Promise<RepoDailyCommits> => {
      const token = requireAuth()
      const PER_PAGE = 100
      const MAX_PAGES = 50
      const CONCURRENCY = 10
      const errorContext = `Failed to load commit history for ${owner}/${repo}`

      type CommitPage = Array<{ commit: { committer: { date: string } | null } }>

      const pageUrl = (page: number): string => {
        const params = new URLSearchParams({ since, until, per_page: String(PER_PAGE), page: String(page) })
        return `${API}/repos/${owner}/${repo}/commits?${params}`
      }

      const days: Record<string, number> = {}
      const bucketCommits = (commits: CommitPage): void => {
        for (const item of commits) {
          const date = item.commit.committer?.date
          if (!date) continue
          const day = new Date(date)
          const key = `${day.getUTCFullYear()}-${String(day.getUTCMonth() + 1).padStart(2, '0')}-${String(day.getUTCDate()).padStart(2, '0')}`
          days[key] = (days[key] ?? 0) + 1
        }
      }

      const first = await fetch(pageUrl(1), { headers: getGitHubHeaders(token) })
      if (!first.ok) await throwGitHubError(first, errorContext)
      bucketCommits((await first.json()) as CommitPage)

      const lastPage = parseLastPageFromLinkHeader(first.headers.get('link')) ?? 1
      const pageCount = Math.min(lastPage, MAX_PAGES)
      if (pageCount > 1) {
        const remaining = Array.from({ length: pageCount - 1 }, (_, i) => i + 2)
        let cursor = 0
        const drain = async (): Promise<void> => {
          while (cursor < remaining.length) {
            const page = remaining[cursor++]
            bucketCommits(await fetchGitHubJson<CommitPage>(token, pageUrl(page), errorContext))
          }
        }
        await Promise.all(Array.from({ length: Math.min(CONCURRENCY, remaining.length) }, drain))
      }

      return { days, truncated: lastPage > MAX_PAGES }
    }
  )

  // Get file content at a specific ref
  // GET /repos/{owner}/{repo}/contents/{path}?ref={ref}
  ipcMain.handle(
    'github:repos:get-content',
    async (_event, owner: string, repo: string, path: string, ref: string): Promise<string> => {
      const token = requireAuth()
      const encodedPath = path.split('/').map(encodeURIComponent).join('/')
      const data = await fetchGitHubJson<{ content: string; encoding: string }>(
        token,
        `${API}/repos/${owner}/${repo}/contents/${encodedPath}?ref=${encodeURIComponent(ref)}`,
        `Failed to fetch file content for ${path}`
      )
      if (data.encoding === 'base64') {
        return Buffer.from(data.content, 'base64').toString('utf-8')
      }
      return data.content
    }
  )
}

// GitHub's Link pagination header, e.g.
// <https://api.github.com/...&page=2>; rel="next", <https://api.github.com/...&page=34>; rel="last"
function parseLastPageFromLinkHeader(header: string | null): number | null {
  if (!header) return null
  const match = header.match(/[?&]page=(\d+)[^>]*>;\s*rel="last"/)
  return match ? Number(match[1]) : null
}
