import { ipcMain } from 'electron'
import { requireAuth, fetchGitHubJson, API } from './client'
import type { GitHubUserProfile } from '../../shared/types'

export function registerUsersHandlers(): void {
  ipcMain.handle('github:users:get', async (_event, username: string): Promise<GitHubUserProfile> => {
    const token = requireAuth()
    return fetchGitHubJson(
      token,
      `${API}/users/${encodeURIComponent(username)}`,
      `Failed to load GitHub profile for ${username}`
    )
  })
}
