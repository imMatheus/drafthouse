import { ipcMain } from 'electron'
import { requireAuth, fetchGitHubJson, API } from './client'
import type { GitHubRepo } from '../../shared/types'

export function registerReposHandlers(): void {
  // List repositories / Search repositories
  // GET /user/repos or GET /search/repositories
  ipcMain.handle(
    'github:repos:list',
    async (_event, query?: string): Promise<GitHubRepo[]> => {
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
    }
  )
}
