import { ElectronAPI } from '@electron-toolkit/preload'
import type {
  AuthData,
  GitHubRepo,
  FileEntry,
  GitRepoInfo,
  PullRequest,
  PullRequestComment,
  PullRequestReview,
  PullRequestReviewComment,
  PullRequestDetail
} from '../shared/types'

interface AuthAPI {
  login: () => Promise<AuthData | null>
  logout: () => Promise<null>
  getUser: () => Promise<AuthData | null>
  onDeviceCode: (callback: (data: { userCode: string }) => void) => () => void
  getRepos: (query?: string) => Promise<GitHubRepo[] | null>
  getPullRequests: (owner: string, repo: string) => Promise<PullRequest[]>
  getPullRequest: (owner: string, repo: string, number: number) => Promise<PullRequestDetail>
  getPullRequestComments: (owner: string, repo: string, number: number) => Promise<PullRequestComment[]>
  getPullRequestReviewComments: (
    owner: string,
    repo: string,
    number: number
  ) => Promise<PullRequestReviewComment[]>
  getPullRequestReviews: (owner: string, repo: string, number: number) => Promise<PullRequestReview[]>
  createPullRequestComment: (
    owner: string,
    repo: string,
    number: number,
    body: string
  ) => Promise<PullRequestComment>
}

interface FsAPI {
  openFolder: () => Promise<string | null>
  readDir: (path: string) => Promise<FileEntry[]>
  readFile: (path: string) => Promise<string>
  getRecentFolders: () => Promise<string[]>
  openRecent: (path: string) => Promise<string>
  getGitInfo: (path: string) => Promise<GitRepoInfo | null>
  onOpenFolder: (callback: (path: string) => void) => () => void
}

declare global {
  interface Window {
    electron: ElectronAPI
    api: {
      auth: AuthAPI
      fs: FsAPI
    }
  }
}
