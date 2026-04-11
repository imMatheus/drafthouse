export interface GitHubUser {
  login: string
  avatar_url: string
  name: string | null
  id: number
}

export interface GitHubRepo {
  name: string
  full_name: string
  description: string | null
  html_url: string
  owner: {
    login: string
    avatar_url: string
  }
}

export interface AuthData {
  token: string
  scopes: string[]
  user: GitHubUser
}

export interface FileEntry {
  name: string
  path: string
  isDirectory: boolean
}

export interface GitRepoInfo {
  owner: string
  repo: string
}

export interface PullRequest {
  number: number
  title: string
  state: string
  draft: boolean
  html_url: string
  created_at: string
  updated_at: string
  merged_at: string | null
  comments: number
  user: {
    login: string
    avatar_url: string
  }
  labels: {
    name: string
    color: string
  }[]
  assignees: {
    login: string
    avatar_url: string
  }[]
  requested_reviewers: {
    login: string
    avatar_url: string
  }[]
}

export interface PullRequestComment {
  id: number
  body: string
  created_at: string
  updated_at: string
  user: {
    login: string
    avatar_url: string
  }
}

export interface PullRequestReviewComment {
  pull_request_review_id: number
  id: number
  body: string
  path: string
  diff_hunk: string | null
  commit_id?: string
  original_commit_id?: string
  line?: number | null
  original_line?: number | null
  side?: string | null
  start_line?: number | null
  original_start_line?: number | null
  start_side?: string | null
  original_position?: number | null
  position?: number | null
  in_reply_to_id?: number | null
  html_url: string
  created_at: string
  updated_at: string
  user: {
    login: string
    avatar_url: string
  }
}

export interface PullRequestReview {
  id: number
  body: string
  state: string
  submitted_at: string | null
  user: {
    login: string
    avatar_url: string
  } | null
}

export interface PullRequestCommit {
  sha: string
  html_url: string
  commit: {
    message: string
    author: {
      name: string
      email: string
      date: string
    } | null
    committer: {
      name: string
      email: string
      date: string
    } | null
  }
  author: {
    login: string
    avatar_url: string
  } | null
  committer: {
    login: string
    avatar_url: string
  } | null
  parents: {
    sha: string
  }[]
}

export interface PaginatedPullRequestCommits {
  items: PullRequestCommit[]
  page: number
  perPage: number
}

export interface PullRequestDetail extends PullRequest {
  node_id: string
  body: string | null
  merged: boolean
  draft: boolean
  mergeable: boolean | null
  mergeable_state: string
  additions: number
  deletions: number
  changed_files: number
  commits: number
  head: {
    ref: string
    label: string
    sha: string
  }
  base: {
    ref: string
    label: string
    sha: string
  }
  labels: {
    name: string
    color: string
  }[]
  assignees: {
    login: string
    avatar_url: string
  }[]
  requested_reviewers: {
    login: string
    avatar_url: string
  }[]
}

export interface PullRequestFile {
  sha: string | null
  filename: string
  status: string
  additions: number
  deletions: number
  changes: number
  blob_url: string
  raw_url: string | null
  contents_url: string
  patch?: string
  previous_filename?: string
}

export type PullRequestReviewLineSide = 'LEFT' | 'RIGHT'

export interface PullRequestReviewDraftComment {
  body: string
  path: string
  line: number
  side: PullRequestReviewLineSide
}

export type PullRequestReviewEvent = 'COMMENT' | 'APPROVE' | 'REQUEST_CHANGES'

export interface SubmitPullRequestReviewInput {
  commitId: string
  body: string
  event: PullRequestReviewEvent
  comments: PullRequestReviewDraftComment[]
}

export type PullRequestMergeMethod = 'merge' | 'squash' | 'rebase'

export interface PullRequestMergeResult {
  sha: string
  merged: boolean
  message: string
}
