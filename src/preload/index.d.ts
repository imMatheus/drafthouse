import { ElectronAPI } from '@electron-toolkit/preload'
import type {
  AuthData,
  FileEntry,
  GitHubRepo,
  GitRepoInfo,
  PaginatedPullRequestCommits,
  PullRequest,
  PullRequestComment,
  PullRequestDetail,
  PullRequestFile,
  PullRequestMergeMethod,
  PullRequestMergeResult,
  PullRequestReview,
  PullRequestReviewComment,
  PullRequestReviewDraftComment,
  PullRequestReviewEvent
} from '../shared/types'

interface AuthAPI {
  login: () => Promise<AuthData | null>
  logout: () => Promise<null>
  getUser: () => Promise<AuthData | null>
  onDeviceCode: (callback: (data: { userCode: string }) => void) => () => void
  getRepos: (query?: string) => Promise<GitHubRepo[] | null>
  getPullRequests: (owner: string, repo: string, state?: string) => Promise<PullRequest[]>
  getPullRequest: (owner: string, repo: string, number: number) => Promise<PullRequestDetail>
  getPullRequestCommits: (
    owner: string,
    repo: string,
    number: number,
    page?: number,
    perPage?: number
  ) => Promise<PaginatedPullRequestCommits>
  getPullRequestComments: (
    owner: string,
    repo: string,
    number: number
  ) => Promise<PullRequestComment[]>
  getPullRequestReviewComments: (
    owner: string,
    repo: string,
    number: number
  ) => Promise<PullRequestReviewComment[]>
  getPullRequestReviews: (
    owner: string,
    repo: string,
    number: number
  ) => Promise<PullRequestReview[]>
  getPullRequestFiles: (owner: string, repo: string, number: number) => Promise<PullRequestFile[]>
  createPullRequestComment: (
    owner: string,
    repo: string,
    number: number,
    body: string
  ) => Promise<PullRequestComment>
  createPullRequestReviewComment: (
    owner: string,
    repo: string,
    number: number,
    input: {
      body: string
      commitId: string
      path: string
      line: number
      side: 'LEFT' | 'RIGHT'
    }
  ) => Promise<PullRequestReviewComment>
  replyToPullRequestReviewComment: (
    owner: string,
    repo: string,
    number: number,
    commentId: number,
    body: string
  ) => Promise<PullRequestReviewComment>
  submitPullRequestReview: (
    owner: string,
    repo: string,
    number: number,
    input: {
      commitId: string
      body: string
      event: PullRequestReviewEvent
      comments: PullRequestReviewDraftComment[]
    }
  ) => Promise<PullRequestReview>
  mergePullRequest: (
    owner: string,
    repo: string,
    number: number,
    mergeMethod: PullRequestMergeMethod,
    commitTitle?: string,
    commitMessage?: string
  ) => Promise<PullRequestMergeResult>
  closePullRequest: (owner: string, repo: string, number: number) => Promise<PullRequestDetail>
  reopenPullRequest: (owner: string, repo: string, number: number) => Promise<PullRequestDetail>
  convertPullRequestToDraft: (nodeId: string) => Promise<void>
  markPullRequestReady: (nodeId: string) => Promise<void>
}

interface FsAPI {
  openFolder: () => Promise<string | null>
  readDir: (path: string) => Promise<FileEntry[]>
  readFile: (path: string) => Promise<string>
  getRecentFolders: () => Promise<string[]>
  openRecent: (path: string) => Promise<string>
  getGitInfo: (path: string) => Promise<GitRepoInfo | null>
  onOpenFolder: (callback: (path: string) => void) => () => void
  onCloseTab: (callback: () => void) => () => void
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
