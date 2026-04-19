import { ElectronAPI } from '@electron-toolkit/preload'
import type {
  AgentEvent,
  AgentSessionSummary,
  AuthData,
  FileEntry,
  GitHubRepo,
  GitRepoInfo,
  GitChangedFile,
  GitBranchInfo,
  GitLogEntry,
  GitHubReaction,
  ReactionContent,
  GitHubBranch,
  GitHubBranchDetail,
  MergeUpstreamResult,
  BranchMergeResult,
  GitHubCollaborator,
  GitHubCollaboratorPermission,
  CollaboratorInvitation,
  GitHubCommit,
  GitHubCommitComparison,
  GitHubBranchShort,
  GitHubCommitComment,
  GitHubCombinedStatus,
  GitHubCommitStatus,
  CommitStatusState,
  GitHubEmojis,
  PullRequest,
  PullRequestDetail,
  PullRequestCommit,
  PaginatedPullRequestCommits,
  PullRequestCommitAuthors,
  PullRequestFile,
  PullRequestMergeMethod,
  PullRequestMergeResult,
  CreatePullRequestInput,
  UpdatePullRequestInput,
  UpdateBranchResult,
  PullRequestComment,
  PullRequestReviewComment,
  CreateReviewCommentInput,
  PullRequestReview,
  PullRequestReviewEvent,
  SubmitPullRequestReviewInput,
  ReviewRequestsResult
} from '../shared/types'

// ============================================================
// Auth API (login/logout/user only)
// ============================================================

interface AuthAPI {
  login: () => Promise<AuthData | null>
  logout: () => Promise<null>
  getUser: () => Promise<AuthData | null>
  onDeviceCode: (callback: (data: { userCode: string }) => void) => () => void
}

// ============================================================
// GitHub API — organized by domain
// ============================================================

interface GitHubReposAPI {
  list: (query?: string) => Promise<GitHubRepo[]>
  getContent: (owner: string, repo: string, path: string, ref: string) => Promise<string>
}

interface GitHubBranchesAPI {
  list: (
    owner: string,
    repo: string,
    options?: { protected?: boolean; perPage?: number; page?: number }
  ) => Promise<GitHubBranch[]>
  get: (owner: string, repo: string, branch: string) => Promise<GitHubBranchDetail>
  rename: (owner: string, repo: string, branch: string, newName: string) => Promise<GitHubBranch>
  syncFork: (owner: string, repo: string, branch: string) => Promise<MergeUpstreamResult>
  merge: (owner: string, repo: string, base: string, head: string, commitMessage?: string) => Promise<BranchMergeResult>
}

interface GitHubCollaboratorsAPI {
  list: (
    owner: string,
    repo: string,
    options?: {
      affiliation?: 'outside' | 'direct' | 'all'
      permission?: 'pull' | 'triage' | 'push' | 'maintain' | 'admin'
      perPage?: number
      page?: number
    }
  ) => Promise<GitHubCollaborator[]>
  check: (owner: string, repo: string, username: string) => Promise<boolean>
  add: (owner: string, repo: string, username: string, permission?: string) => Promise<CollaboratorInvitation | null>
  remove: (owner: string, repo: string, username: string) => Promise<void>
  getPermission: (owner: string, repo: string, username: string) => Promise<GitHubCollaboratorPermission>
}

interface GitHubCommitsAPI {
  list: (
    owner: string,
    repo: string,
    options?: {
      sha?: string
      path?: string
      author?: string
      committer?: string
      since?: string
      until?: string
      perPage?: number
      page?: number
    }
  ) => Promise<GitHubCommit[]>
  get: (
    owner: string,
    repo: string,
    ref: string,
    options?: { page?: number; perPage?: number }
  ) => Promise<GitHubCommit>
  compare: (
    owner: string,
    repo: string,
    basehead: string,
    options?: { page?: number; perPage?: number }
  ) => Promise<GitHubCommitComparison>
  listBranchesForHead: (owner: string, repo: string, commitSha: string) => Promise<GitHubBranchShort[]>
  listPullRequests: (
    owner: string,
    repo: string,
    commitSha: string,
    options?: { perPage?: number; page?: number }
  ) => Promise<PullRequest[]>
}

interface GitHubCommitCommentsAPI {
  listForRepo: (
    owner: string,
    repo: string,
    options?: { perPage?: number; page?: number }
  ) => Promise<GitHubCommitComment[]>
  get: (owner: string, repo: string, commentId: number) => Promise<GitHubCommitComment>
  update: (owner: string, repo: string, commentId: number, body: string) => Promise<GitHubCommitComment>
  delete: (owner: string, repo: string, commentId: number) => Promise<void>
  listForCommit: (
    owner: string,
    repo: string,
    commitSha: string,
    options?: { perPage?: number; page?: number }
  ) => Promise<GitHubCommitComment[]>
  create: (
    owner: string,
    repo: string,
    commitSha: string,
    body: string,
    path?: string,
    position?: number
  ) => Promise<GitHubCommitComment>
}

interface GitHubCommitStatusesAPI {
  getCombined: (
    owner: string,
    repo: string,
    ref: string,
    options?: { perPage?: number; page?: number }
  ) => Promise<GitHubCombinedStatus>
  list: (
    owner: string,
    repo: string,
    ref: string,
    options?: { perPage?: number; page?: number }
  ) => Promise<GitHubCommitStatus[]>
  create: (
    owner: string,
    repo: string,
    sha: string,
    state: CommitStatusState,
    options?: { targetUrl?: string | null; description?: string | null; context?: string }
  ) => Promise<GitHubCommitStatus>
}

interface GitHubEmojisAPI {
  get: () => Promise<GitHubEmojis>
}

interface GitHubPullsAPI {
  list: (
    owner: string,
    repo: string,
    options?: {
      state?: 'open' | 'closed' | 'all'
      head?: string
      base?: string
      sort?: 'created' | 'updated' | 'popularity' | 'long-running'
      direction?: 'asc' | 'desc'
      perPage?: number
      page?: number
    }
  ) => Promise<PullRequest[]>
  get: (owner: string, repo: string, number: number) => Promise<PullRequestDetail>
  create: (owner: string, repo: string, input: CreatePullRequestInput) => Promise<PullRequestDetail>
  update: (owner: string, repo: string, number: number, input: UpdatePullRequestInput) => Promise<PullRequestDetail>
  close: (owner: string, repo: string, number: number) => Promise<PullRequestDetail>
  reopen: (owner: string, repo: string, number: number) => Promise<PullRequestDetail>
  listCommits: (
    owner: string,
    repo: string,
    number: number,
    page?: number,
    perPage?: number
  ) => Promise<PaginatedPullRequestCommits>
  listCommitAuthors: (owner: string, repo: string, number: number) => Promise<PullRequestCommitAuthors>
  listFiles: (owner: string, repo: string, number: number) => Promise<PullRequestFile[]>
  checkMerged: (owner: string, repo: string, number: number) => Promise<boolean>
  merge: (
    owner: string,
    repo: string,
    number: number,
    mergeMethod: PullRequestMergeMethod,
    commitTitle?: string,
    commitMessage?: string
  ) => Promise<PullRequestMergeResult>
  updateBranch: (owner: string, repo: string, number: number, expectedHeadSha?: string) => Promise<UpdateBranchResult>
  convertToDraft: (nodeId: string) => Promise<void>
  markReady: (nodeId: string) => Promise<void>
}

type MinimizeClassifier = 'ABUSE' | 'OFF_TOPIC' | 'OUTDATED' | 'RESOLVED' | 'DUPLICATE' | 'SPAM'

interface GitHubPullCommentsAPI {
  listIssueComments: (owner: string, repo: string, number: number) => Promise<PullRequestComment[]>
  createIssueComment: (owner: string, repo: string, number: number, body: string) => Promise<PullRequestComment>
  updateIssueComment: (owner: string, repo: string, commentId: number, body: string) => Promise<PullRequestComment>
  deleteIssueComment: (owner: string, repo: string, commentId: number) => Promise<void>
  minimize: (nodeId: string, classifier: MinimizeClassifier) => Promise<void>
  listForPull: (
    owner: string,
    repo: string,
    number: number,
    options?: {
      sort?: 'created' | 'updated'
      direction?: 'asc' | 'desc'
      since?: string
      perPage?: number
      page?: number
    }
  ) => Promise<PullRequestReviewComment[]>
  listForRepo: (
    owner: string,
    repo: string,
    options?: {
      sort?: 'created' | 'updated'
      direction?: 'asc' | 'desc'
      since?: string
      perPage?: number
      page?: number
    }
  ) => Promise<PullRequestReviewComment[]>
  get: (owner: string, repo: string, commentId: number) => Promise<PullRequestReviewComment>
  create: (
    owner: string,
    repo: string,
    number: number,
    input: CreateReviewCommentInput
  ) => Promise<PullRequestReviewComment>
  createReply: (
    owner: string,
    repo: string,
    number: number,
    commentId: number,
    body: string
  ) => Promise<PullRequestReviewComment>
  update: (owner: string, repo: string, commentId: number, body: string) => Promise<PullRequestReviewComment>
  delete: (owner: string, repo: string, commentId: number) => Promise<void>
}

interface GitHubReviewRequestsAPI {
  get: (owner: string, repo: string, number: number) => Promise<ReviewRequestsResult>
  request: (
    owner: string,
    repo: string,
    number: number,
    reviewers?: string[],
    teamReviewers?: string[]
  ) => Promise<PullRequestDetail>
  remove: (owner: string, repo: string, number: number, reviewers: string[], teamReviewers?: string[]) => Promise<void>
}

interface GitHubReviewsAPI {
  list: (
    owner: string,
    repo: string,
    number: number,
    options?: { perPage?: number; page?: number }
  ) => Promise<PullRequestReview[]>
  get: (owner: string, repo: string, number: number, reviewId: number) => Promise<PullRequestReview>
  create: (
    owner: string,
    repo: string,
    number: number,
    input: SubmitPullRequestReviewInput
  ) => Promise<PullRequestReview>
  update: (owner: string, repo: string, number: number, reviewId: number, body: string) => Promise<PullRequestReview>
  deletePending: (owner: string, repo: string, number: number, reviewId: number) => Promise<PullRequestReview>
  listComments: (
    owner: string,
    repo: string,
    number: number,
    reviewId: number,
    options?: { perPage?: number; page?: number }
  ) => Promise<PullRequestReviewComment[]>
  dismiss: (
    owner: string,
    repo: string,
    number: number,
    reviewId: number,
    message: string,
    event?: string
  ) => Promise<PullRequestReview>
  submitPending: (
    owner: string,
    repo: string,
    number: number,
    reviewId: number,
    reviewEvent: PullRequestReviewEvent,
    body?: string
  ) => Promise<PullRequestReview>
}

interface GitHubReactionsAPI {
  listForIssueComment: (owner: string, repo: string, commentId: number) => Promise<GitHubReaction[]>
  createForIssueComment: (
    owner: string,
    repo: string,
    commentId: number,
    content: ReactionContent
  ) => Promise<GitHubReaction>
  listForPullComment: (owner: string, repo: string, commentId: number) => Promise<GitHubReaction[]>
  createForPullComment: (
    owner: string,
    repo: string,
    commentId: number,
    content: ReactionContent
  ) => Promise<GitHubReaction>
  delete: (owner: string, repo: string, reactionId: number) => Promise<void>
}

interface GitHubAPI {
  repos: GitHubReposAPI
  branches: GitHubBranchesAPI
  collaborators: GitHubCollaboratorsAPI
  commits: GitHubCommitsAPI
  commitComments: GitHubCommitCommentsAPI
  commitStatuses: GitHubCommitStatusesAPI
  emojis: GitHubEmojisAPI
  pulls: GitHubPullsAPI
  pullComments: GitHubPullCommentsAPI
  reactions: GitHubReactionsAPI
  reviewRequests: GitHubReviewRequestsAPI
  reviews: GitHubReviewsAPI
}

// ============================================================
// Local Git API
// ============================================================

interface GitAPI {
  status: (cwd: string) => Promise<GitChangedFile[]>
  branchInfo: (cwd: string) => Promise<GitBranchInfo>
  diff: (cwd: string, filePath: string, staged: boolean) => Promise<string>
  showFile: (cwd: string, filePath: string) => Promise<string>
  showStagedFile: (cwd: string, filePath: string) => Promise<string>
  stage: (cwd: string, filePaths: string[]) => Promise<void>
  unstage: (cwd: string, filePaths: string[]) => Promise<void>
  stageAll: (cwd: string) => Promise<void>
  unstageAll: (cwd: string) => Promise<void>
  discard: (cwd: string, filePaths: string[]) => Promise<void>
  discardAll: (cwd: string) => Promise<void>
  commit: (cwd: string, message: string, amend?: boolean) => Promise<void>
  checkout: (cwd: string, branch: string) => Promise<void>
  listBranches: (cwd: string) => Promise<string[]>
  push: (cwd: string) => Promise<string>
  publishBranch: (cwd: string, branch: string) => Promise<string>
  pull: (cwd: string) => Promise<string>
  stash: (cwd: string, message?: string) => Promise<void>
  stashPop: (cwd: string) => Promise<void>
  log: (cwd: string, count?: number) => Promise<GitLogEntry[]>
}

// ============================================================
// Agent API
// ============================================================

interface AgentAPI {
  start: (cwd: string, prompt: string, files?: string[], appendSystemPrompt?: string) => Promise<{ sessionId: string }>
  continue: (sessionId: string, cliSessionId: string, cwd: string, prompt: string, files?: string[]) => Promise<void>
  stop: (sessionId: string) => Promise<void>
  listSessions: () => Promise<AgentSessionSummary[]>
  onEvent: (callback: (data: AgentEvent) => void) => () => void
}

// ============================================================
// Filesystem API
// ============================================================

interface FsAPI {
  openFolder: () => Promise<string | null>
  readDir: (path: string) => Promise<FileEntry[]>
  readDirRecursive: (path: string) => Promise<string[]>
  readFile: (path: string) => Promise<string>
  writeFile: (path: string, content: string) => Promise<void>
  getRecentFolders: () => Promise<string[]>
  openRecent: (path: string) => Promise<string>
  getGitInfo: (path: string) => Promise<GitRepoInfo | null>
  pickFiles: () => Promise<string[]>
  readFileDataUrl: (path: string) => Promise<string>
  onOpenFolder: (callback: (path: string) => void) => () => void
  onCloseTab: (callback: () => void) => () => void
}

// ============================================================
// Global Window API
// ============================================================

declare global {
  interface Window {
    electron: ElectronAPI
    api: {
      agent: AgentAPI
      auth: AuthAPI
      git: GitAPI
      github: GitHubAPI
      fs: FsAPI
    }
  }
}
