// ============================================================
// Auth & User
// ============================================================

export interface GitHubUser {
  login: string
  avatar_url: string
  name: string | null
  id: number
}

export interface AuthData {
  token: string
  scopes: string[]
  user: GitHubUser
}

// ============================================================
// Filesystem (local, not GitHub)
// ============================================================

export interface FileEntry {
  name: string
  path: string
  isDirectory: boolean
}

export interface GitRepoInfo {
  owner: string
  repo: string
}

// ============================================================
// Repositories
// ============================================================

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

// ============================================================
// Branches
// ============================================================

export interface GitHubBranch {
  name: string
  commit: {
    sha: string
    url: string
  }
  protected: boolean
  protection_url?: string
}

export interface GitHubBranchDetail extends GitHubBranch {
  protection?: {
    enabled: boolean
    required_status_checks?: {
      enforcement_level: string
      contexts: string[]
      checks: { context: string; app_id: number | null }[]
    }
  }
  _links: {
    self: string
    html: string
  }
}

export interface MergeUpstreamResult {
  message: string
  merge_type: string
  base_branch: string
}

export interface BranchMergeResult {
  sha: string
  node_id: string
  url: string
  html_url: string
  message?: string
  commit: {
    sha: string
    message: string
    author: { name: string; email: string; date: string } | null
    committer: { name: string; email: string; date: string } | null
  }
  parents: { sha: string; url: string }[]
}

// ============================================================
// Collaborators
// ============================================================

export interface GitHubCollaborator {
  login: string
  avatar_url: string
  id: number
  permissions?: {
    pull: boolean
    triage: boolean
    push: boolean
    maintain: boolean
    admin: boolean
  }
  role_name?: string
}

export interface CollaboratorInvitation {
  id: number
  repository: { full_name: string }
  invitee: GitHubUser | null
  inviter: GitHubUser
  permissions: string
  created_at: string
  html_url: string
}

export interface GitHubCollaboratorPermission {
  permission: string
  role_name: string
  user: GitHubUser
}

// ============================================================
// Commits
// ============================================================

export interface GitHubCommit {
  sha: string
  html_url: string
  url: string
  node_id: string
  commit: {
    message: string
    author: { name: string; email: string; date: string } | null
    committer: { name: string; email: string; date: string } | null
    tree: { sha: string; url: string }
    comment_count: number
  }
  author: { login: string; avatar_url: string } | null
  committer: { login: string; avatar_url: string } | null
  parents: { sha: string; url: string }[]
  stats?: { additions: number; deletions: number; total: number }
  files?: PullRequestFile[]
}

export interface GitHubCommitComparison {
  url: string
  html_url: string
  status: 'diverged' | 'ahead' | 'behind' | 'identical'
  ahead_by: number
  behind_by: number
  total_commits: number
  commits: GitHubCommit[]
  files?: PullRequestFile[]
}

export interface GitHubBranchShort {
  name: string
  commit: { sha: string; url: string }
  protected: boolean
}

// ============================================================
// Commit Comments
// ============================================================

export interface GitHubCommitComment {
  id: number
  node_id: string
  body: string
  path: string | null
  position: number | null
  line: number | null
  commit_id: string
  html_url: string
  url: string
  created_at: string
  updated_at: string
  user: { login: string; avatar_url: string }
}

// ============================================================
// Commit Statuses
// ============================================================

export interface GitHubCombinedStatus {
  state: 'failure' | 'pending' | 'success'
  total_count: number
  statuses: GitHubCommitStatus[]
  sha: string
  commit_url: string
  repository: { id: number; full_name: string }
}

export interface GitHubCommitStatus {
  id: number
  state: 'error' | 'failure' | 'pending' | 'success'
  description: string | null
  target_url: string | null
  context: string
  url: string
  created_at: string
  updated_at: string
  creator: { login: string; avatar_url: string } | null
}

export type CommitStatusState = 'error' | 'failure' | 'pending' | 'success'

// ============================================================
// Emojis
// ============================================================

export type GitHubEmojis = Record<string, string>

// ============================================================
// Pull Requests
// ============================================================

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

export interface CreatePullRequestInput {
  title: string
  head: string
  base: string
  body?: string
  draft?: boolean
  maintainer_can_modify?: boolean
  head_repo?: string
}

export interface UpdatePullRequestInput {
  title?: string
  body?: string
  state?: 'open' | 'closed'
  base?: string
  maintainer_can_modify?: boolean
}

export interface UpdateBranchResult {
  message: string
  url: string
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

export type PullRequestMergeMethod = 'merge' | 'squash' | 'rebase'

export interface PullRequestMergeResult {
  sha: string
  merged: boolean
  message: string
}

// ============================================================
// Pull Request Comments (issue comments + review comments)
// ============================================================

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

export interface CreateReviewCommentInput {
  body: string
  commitId: string
  path: string
  line: number
  side: PullRequestReviewLineSide
  startLine?: number
  startSide?: PullRequestReviewLineSide
  subjectType?: 'line' | 'file'
}

// ============================================================
// Reviews & Review Requests
// ============================================================

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

export interface ReviewRequestsResult {
  users: { login: string; avatar_url: string; id: number }[]
  teams: { id: number; name: string; slug: string; description: string | null }[]
}

// ============================================================
// Agent (Claude CLI stream-json events)
// ============================================================

export type AgentSessionStatus = 'running' | 'completed' | 'error' | 'cancelled'

export interface AgentSessionSummary {
  id: string
  prompt: string
  status: AgentSessionStatus
  startedAt: number
}

// Content blocks within assistant messages
export interface AgentContentBlockText {
  type: 'text'
  text: string
}

export interface AgentContentBlockToolUse {
  type: 'tool_use'
  id: string
  name: string
  input: Record<string, unknown>
}

export interface AgentContentBlockToolResult {
  type: 'tool_result'
  tool_use_id: string
  content: string
}

export type AgentContentBlock =
  | AgentContentBlockText
  | AgentContentBlockToolUse
  | AgentContentBlockToolResult

// Stream events from claude CLI --output-format stream-json
export interface AgentStreamInit {
  type: 'system'
  subtype: 'init'
  session_id: string
  tools: string[]
  model: string
}

export interface AgentStreamSystem {
  type: 'system'
  subtype: string
  message?: string
  [key: string]: unknown
}

export interface AgentStreamAssistant {
  type: 'assistant'
  message: {
    role: 'assistant'
    content: AgentContentBlock[]
    stop_reason: string | null
    usage?: {
      input_tokens: number
      output_tokens: number
    }
  }
  session_id: string
}

export interface AgentStreamUser {
  type: 'user'
  message: {
    role: 'user'
    content: AgentContentBlock[]
  }
  session_id: string
}

export interface AgentStreamResult {
  type: 'result'
  subtype: 'success' | 'error'
  is_error: boolean
  result: string
  duration_ms: number
  num_turns: number
  total_cost_usd: number
  session_id: string
}

export type AgentStreamEvent =
  | AgentStreamInit
  | AgentStreamSystem
  | AgentStreamAssistant
  | AgentStreamUser
  | AgentStreamResult

export interface AgentEvent {
  sessionId: string
  event: AgentStreamEvent
}

// Renderer-side agent session with accumulated events
export interface AgentSession {
  id: string
  prompt: string
  status: AgentSessionStatus
  startedAt: number
  events: AgentStreamEvent[]
  cliSessionId: string | null
  files: string[]
}
