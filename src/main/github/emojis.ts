import { ipcMain } from 'electron'
import { requireAuth, fetchGitHubJson, API } from './client'
import type { GitHubEmojis } from '../../shared/types'

export function registerEmojisHandlers(): void {
  // Get emojis
  // GET /emojis
  ipcMain.handle('github:emojis:get', async (): Promise<GitHubEmojis> => {
    const token = requireAuth()
    return fetchGitHubJson(token, `${API}/emojis`, 'Failed to get emojis')
  })
}
