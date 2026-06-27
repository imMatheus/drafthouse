import { ipcMain } from 'electron'
import { requireAuth, fetchGitHubJson, API } from './client'
import type { GitHubRepo } from '../../shared/types'

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
