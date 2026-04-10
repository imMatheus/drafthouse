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
  html_url: string
  created_at: string
  user: {
    login: string
    avatar_url: string
  }
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
  line?: number | null
  side?: string | null
  start_line?: number | null
  start_side?: string | null
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

export interface PullRequestDetail extends PullRequest {
  body: string | null
  merged: boolean
  draft: boolean
  additions: number
  deletions: number
  changed_files: number
  commits: number
  head: {
    ref: string
    label: string
  }
  base: {
    ref: string
    label: string
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
