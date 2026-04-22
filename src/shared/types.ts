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
// Local Git (CLI-based)
// ============================================================

export type GitStatusCode = 'M' | 'A' | 'D' | 'R' | 'C' | 'U' | '?' | '!'

export interface GitChangedFile {
  path: string
  oldPath?: string
  indexStatus: GitStatusCode | ' '
  workTreeStatus: GitStatusCode | ' '
}

export interface GitBranchInfo {
  name: string
  upstream: string | null
  ahead: number
  behind: number
}

export interface GitLogEntry {
  hash: string
  message: string
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

export interface ResolvedCommitAuthor {
  name: string
  email: string | null
  avatarUrl: string
  login: string | null
}

export type PullRequestCommitAuthors = Record<string, ResolvedCommitAuthor[]>

export interface PullRequestReviewThreadSummary {
  /** GraphQL node ID for the thread (needed for resolve/unresolve mutations) */
  id: string
  isResolved: boolean
  /** REST comment IDs belonging to this thread — used to correlate with REST comment data */
  commentDatabaseIds: number[]
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

// Inputs/outputs for the local-git PR diff path. `fetchPullRequestRefs`
// synchronizes origin refs and resolves shas; `computePullRequestDiff` runs
// a pinned-sha `git diff` against those refs and parses the output into the
// `PullRequestFile[]` shape the renderer already consumes.
export interface FetchPullRequestRefsInput {
  cwd: string
  owner: string
  repo: string
  number: number
  baseRef: string
  headRef: string
}

export interface FetchPullRequestRefsResult {
  baseSha: string
  headSha: string
  /** Whether we resolved head from the user's local branch or from refs/remotes/origin/pr/N. */
  headRefUsed: 'local' | 'origin-pr'
}

export interface ComputePullRequestDiffInput {
  cwd: string
  owner: string
  repo: string
  number: number
  baseSha: string
  headSha: string
  /** GitHub's head sha. Used only to build `blob_url` so the link works even when local is ahead of origin. */
  blobUrlHeadSha: string
}

export type GitErrorKind =
  | 'timeout'
  | 'not-a-repo'
  | 'missing-ref'
  | 'fetch-failed'
  | 'git-not-found'
  | 'origin-mismatch'
  | 'refs-unavailable'
  | 'unknown'

export interface GitErrorPayload {
  kind: GitErrorKind
  message: string
}

export type PullRequestMergeMethod = 'merge' | 'squash' | 'rebase'

export interface PullRequestMergeResult {
  sha: string
  merged: boolean
  message: string
}

// ============================================================
// Reactions
// ============================================================

export type ReactionContent = '+1' | '-1' | 'laugh' | 'confused' | 'heart' | 'hooray' | 'rocket' | 'eyes'

export interface GitHubReaction {
  id: number
  content: ReactionContent
  user: {
    login: string
  }
}

// ============================================================
// Pull Request Comments (issue comments + review comments)
// ============================================================

export interface PullRequestComment {
  id: number
  node_id: string
  html_url: string
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
  node_id: string
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

export interface AgentContext {
  /** e.g. "pull-request", "issue", "source-control" */
  source: string
  /** Text appended to the Claude system prompt via --append-system-prompt */
  systemPromptSuffix: string
  /** Human-readable label shown in the agent tab title, e.g. "PR #42" */
  label: string
  /** When true, session is rendered inline (e.g. in a PR view) and hidden from the agent panel */
  inline?: boolean
  /** For diff-line sessions: the file path this session is anchored to */
  filePath?: string
  /** For diff-line sessions: the line number this session is anchored to */
  lineNumber?: number
  /** For diff-line sessions: which side of the diff ('LEFT' or 'RIGHT') */
  side?: string
  /** Display info for the context banner in the agent chat view */
  prNumber?: number
  prTitle?: string
  prState?: 'open' | 'merged' | 'closed' | 'draft'
  headBranch?: string
  baseBranch?: string
  repoFullName?: string
  /** For sessions started from multiple `@prN` mentions in the agents view */
  prs?: { number: number; title: string; state: 'open' | 'merged' | 'closed' | 'draft' }[]
  /** For "Fix with Claude" sessions: the comment ID the session was launched from */
  commentId?: number
}

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

export type AgentContentBlock = AgentContentBlockText | AgentContentBlockToolUse | AgentContentBlockToolResult

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
    id?: string
    role: 'assistant'
    content: AgentContentBlock[]
    stop_reason: string | null
    usage?: {
      input_tokens: number
      output_tokens: number
    }
  }
  session_id: string
  streaming?: boolean
}

export type AgentPartialMessageSubEvent =
  | {
      type: 'message_start'
      message: {
        id: string
        role: 'assistant'
        content: AgentContentBlock[]
        stop_reason: string | null
        usage?: { input_tokens: number; output_tokens: number }
      }
    }
  | { type: 'content_block_start'; index: number; content_block: AgentContentBlock }
  | {
      type: 'content_block_delta'
      index: number
      delta:
        | { type: 'text_delta'; text: string }
        | { type: 'input_json_delta'; partial_json: string }
        | { type: 'thinking_delta'; thinking: string }
        | { type: string; [key: string]: unknown }
    }
  | { type: 'content_block_stop'; index: number }
  | { type: 'message_delta'; delta: { stop_reason: string | null }; usage?: { output_tokens: number } }
  | { type: 'message_stop' }

export interface AgentStreamPartialMessage {
  type: 'stream_event'
  event: AgentPartialMessageSubEvent
  parent_tool_use_id: string | null
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
  | AgentStreamPartialMessage

export interface AgentEvent {
  sessionId: string
  event: AgentStreamEvent
}

// Session metadata — everything except the per-token events list. Event-free
// shape is what gets prop-drilled through the app; the events stream lives in
// the AgentSessions context so per-token updates don't re-render the tree.
export interface AgentSessionMeta {
  id: string
  prompt: string
  status: AgentSessionStatus
  startedAt: number
  cliSessionId: string | null
  files: string[]
  context?: AgentContext
}

// Renderer-side agent session with accumulated events. Kept for components
// that still receive a combined view (e.g. persistence); prefer AgentSessionMeta
// + useAgentSessionEvents(id) at the boundary of re-render-sensitive trees.
export interface AgentSession extends AgentSessionMeta {
  events: AgentStreamEvent[]
}
