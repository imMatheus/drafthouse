import { ipcMain } from 'electron'
import { requireAuth, fetchGitHubJson, API } from './client'
import type { GitHubEmojis } from '../../shared/types'

let cached: GitHubEmojis | null = null
let inflight: Promise<GitHubEmojis> | null = null

export function registerEmojisHandlers(): void {
  // Get emojis
  // GET /emojis
  ipcMain.handle('github:emojis:get', async (): Promise<GitHubEmojis> => {
    if (cached) return cached
    if (inflight) return inflight
    const token = requireAuth()
    inflight = fetchGitHubJson<GitHubEmojis>(token, `${API}/emojis`, 'Failed to get emojis')
      .then((result) => {
        cached = result
        return result
      })
      .finally(() => {
        inflight = null
      })
    return inflight
  })
}
