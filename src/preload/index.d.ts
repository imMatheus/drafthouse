import { ElectronAPI } from '@electron-toolkit/preload'
import type { AuthData, GitHubRepo } from '../shared/types'

interface AuthAPI {
  login: () => Promise<AuthData | null>
  logout: () => Promise<null>
  getUser: () => Promise<AuthData | null>
  onDeviceCode: (callback: (data: { userCode: string }) => void) => void
  getRepos: () => Promise<GitHubRepo[] | null>
}

declare global {
  interface Window {
    electron: ElectronAPI
    api: {
      auth: AuthAPI
    }
  }
}
