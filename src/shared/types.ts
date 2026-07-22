// ============================================================
// Auth & User
// ============================================================

export interface GitHubUser {
  login: string
  avatar_url: string
  name: string | null
  id: number
}

export interface GitHubUserProfile extends GitHubUser {
  html_url: string
  bio: string | null
  company: string | null
  location: string | null
  followers: number
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
// Codebase search
// ============================================================

export interface SearchOptions {
  caseSensitive?: boolean
  wholeWord?: boolean
  isRegex?: boolean
}

export interface SearchMatch {
  /** 1-based line number. */
  line: number
  /** The (possibly truncated) full text of the matching line. */
  text: string
  /** 0-based column where the match starts within `text`. */
  matchStart: number
  matchLength: number
}

export interface SearchFileResult {
  /** Path relative to the searched root. */
  path: string
  matches: SearchMatch[]
}

export interface SearchResults {
  files: SearchFileResult[]
  totalMatches: number
  /** True when a result cap was hit and the search stopped early. */
  truncated: boolean
  /** True when `isRegex` was set but the query failed to compile. */
  invalidRegex: boolean
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

export interface GitHubRepoDetails {
  name: string
  full_name: string
  description: string | null
  html_url: string
  default_branch: string
  stargazers_count: number
  forks_count: number
  open_issues_count: number
  language: string | null
  pushed_at: string
  created_at: string
}

export interface CommitActivityWeek {
  // Unix timestamp (seconds) of the week's start (Sunday).
  week: number
  total: number
  // Commit counts per day, Sunday through Saturday.
  days: number[]
}

export interface RepoCommitActivity {
  // GitHub computes these stats lazily and answers 202 until they're ready.
  pending: boolean
  weeks: CommitActivityWeek[]
}

export interface RepoDailyCommits {
  // Commit counts keyed by local calendar day (YYYY-MM-DD).
  days: Record<string, number>
  // True when the page cap was hit, meaning counts cover only the most
  // recent commits in the range.
  truncated: boolean
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

export type AgentSessionStatus =
  | 'running'
  | 'completed'
  | 'error'
  | 'cancelled'
  /** Was running when the app quit or the process died between persisted turns */
  | 'interrupted'

/**
 * Permission modes understood by the claude CLI (--permission-mode /
 * set_permission_mode). 'default' is the CLI's legacy alias for what its help
 * now calls "manual" — kept as the wire value for persisted-session compat.
 */
export type AgentPermissionMode = 'bypassPermissions' | 'default' | 'acceptEdits' | 'plan' | 'auto'

/** Reasoning effort levels understood by the claude CLI (--effort). */
export type AgentEffortLevel = 'low' | 'medium' | 'high' | 'xhigh' | 'max'

// Content blocks within assistant messages
export interface AgentContentBlockText {
  type: 'text'
  text: string
}

export interface AgentContentBlockThinking {
  type: 'thinking'
  thinking: string
  signature?: string
}

export interface AgentContentBlockRedactedThinking {
  type: 'redacted_thinking'
  data?: string
}

export interface AgentContentBlockImage {
  type: 'image'
  source: {
    type: 'base64'
    media_type: string
    data: string
  }
}

export interface AgentContentBlockToolUse {
  type: 'tool_use'
  id: string
  name: string
  input: Record<string, unknown>
  // Raw accumulator for `input_json_delta` chunks while streaming; parsed into
  // `input` on `content_block_stop`. Absent on finalized (non-streaming) blocks.
  partialJson?: string
}

/**
 * Tool results come back as a plain string, or as a list of blocks (text,
 * image — e.g. reading an image file — or tool-specific shapes). Anything
 * unrecognized must render via a safe fallback, never crash.
 */
export type AgentToolResultContent =
  | string
  | Array<AgentContentBlockText | AgentContentBlockImage | { type: string; [key: string]: unknown }>

export interface AgentContentBlockToolResult {
  type: 'tool_result'
  tool_use_id: string
  content?: AgentToolResultContent
  is_error?: boolean
}

export type AgentContentBlock =
  | AgentContentBlockText
  | AgentContentBlockThinking
  | AgentContentBlockRedactedThinking
  | AgentContentBlockImage
  | AgentContentBlockToolUse
  | AgentContentBlockToolResult

// Stream events from claude CLI --output-format stream-json
export interface AgentStreamInit {
  type: 'system'
  subtype: 'init'
  session_id: string
  tools: string[]
  model: string
  permissionMode?: string
}

export interface AgentStreamSystem {
  type: 'system'
  subtype: string
  message?: string
  [key: string]: unknown
}

/**
 * Per-message usage as reported by the API. The prompt (everything the model
 * read) is input + both cache figures — that sum is the live context size.
 */
export interface AgentMessageUsage {
  input_tokens: number
  output_tokens: number
  cache_creation_input_tokens?: number
  cache_read_input_tokens?: number
}

export interface AgentStreamAssistant {
  type: 'assistant'
  message: {
    id?: string
    role: 'assistant'
    content: AgentContentBlock[]
    stop_reason?: string | null
    usage?: AgentMessageUsage
  }
  /** Set on sub-agent (Task tool) messages; null/absent on the main thread. */
  parent_tool_use_id?: string | null
  session_id: string
  /** True while this message is being accumulated from partial stream events. */
  streaming?: boolean
  /** Set once a streamed message got its message_stop — used to dedupe the CLI's per-block final events. */
  streamed?: boolean
}

export type AgentPartialMessageSubEvent =
  | {
      type: 'message_start'
      message: {
        id: string
        role: 'assistant'
        content: AgentContentBlock[]
        stop_reason?: string | null
        usage?: AgentMessageUsage
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
  | { type: 'message_delta'; delta: { stop_reason?: string | null }; usage?: { output_tokens: number } }
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
    /** The CLI can emit either a block list or a bare string. */
    content: AgentContentBlock[] | string
  }
  /** Set on sub-agent (Task tool) tool results. */
  parent_tool_use_id?: string | null
  session_id: string
  /** Local echo of a prompt we sent (not emitted by the CLI). */
  synthetic?: boolean
  /** File paths attached alongside a synthetic prompt echo. */
  attachedFiles?: string[]
}

export interface AgentStreamResult {
  type: 'result'
  subtype: 'success' | 'error_max_turns' | 'error_during_execution' | string
  is_error: boolean
  result?: string
  duration_ms: number
  num_turns: number
  total_cost_usd?: number
  usage?: { input_tokens?: number; output_tokens?: number; [key: string]: unknown }
  session_id: string
}

/**
 * Synthesized by the main process (not the CLI): process lifecycle problems
 * the conversation must surface — spawn failures, missing binary, dirty exits.
 */
export interface AgentStreamLifecycle {
  type: 'lifecycle'
  subtype: 'spawn_error' | 'binary_missing' | 'exit'
  message: string
  exitCode?: number | null
  stderrTail?: string
  /** True when the process died mid-turn: the renderer marks the session errored. */
  failedTurn?: boolean
}

/**
 * Synthesized by the main process from a `can_use_tool` control request: the
 * CLI is waiting for an allow/deny decision (permission prompts, plan approval).
 */
export interface AgentStreamPermissionRequest {
  type: 'permission_request'
  requestId: string
  toolName: string
  input: Record<string, unknown>
  toolUseId?: string
  description?: string
}

export interface AgentStreamPermissionResolved {
  type: 'permission_resolved'
  requestId: string
  behavior: 'allow' | 'deny'
  /** Input the request was allowed with — e.g. AskUserQuestion `answers`, so the UI can show what was chosen. */
  updatedInput?: Record<string, unknown>
}

export type AgentStreamEvent =
  | AgentStreamInit
  | AgentStreamSystem
  | AgentStreamAssistant
  | AgentStreamUser
  | AgentStreamResult
  | AgentStreamPartialMessage
  | AgentStreamLifecycle
  | AgentStreamPermissionRequest
  | AgentStreamPermissionResolved

export interface AgentEvent {
  sessionId: string
  event: AgentStreamEvent
}

export interface AgentPermissionResponse {
  behavior: 'allow' | 'deny'
  /** Shown to the model when denying. */
  message?: string
  updatedInput?: Record<string, unknown>
}

// Session metadata — everything except the per-token events list. Event-free
// shape is what gets prop-drilled through the app; the events stream lives in
// the AgentSessions context so per-token updates don't re-render the tree.
export interface AgentSessionMeta {
  id: string
  prompt: string
  status: AgentSessionStatus
  startedAt: number
  lastActivityAt: number
  cliSessionId: string | null
  files: string[]
  context?: AgentContext
  permissionMode: AgentPermissionMode
  /** Model override for the session; null follows the CLI default. */
  model: string | null
  /** Model the CLI reported in its init event, e.g. "claude-opus-4-8". */
  initModel?: string
  /** Reasoning effort override; null follows the CLI default. Applied at spawn (--effort). */
  effort?: AgentEffortLevel | null
  totalCostUsd?: number
  cwd: string
}

export interface AgentStartRequest {
  cwd: string
  prompt: string
  files?: string[]
  permissionMode: AgentPermissionMode
  model?: string | null
  effort?: AgentEffortLevel | null
  context?: AgentContext
}

/** Per-session options the UI can choose when starting a session (mode selector, model picker). */
export interface AgentStartOptions {
  permissionMode?: AgentPermissionMode
  model?: string | null
  effort?: AgentEffortLevel | null
}

export interface AgentSendRequest {
  sessionId: string
  /** The text shown in the UI bubble. */
  prompt: string
  /** The text actually sent to the CLI when extra context is injected (falls back to `prompt`). */
  cliPrompt?: string
  files?: string[]
}

/** What `agent:list` returns for one persisted or live session. */
export interface AgentSessionSnapshot {
  meta: AgentSessionMeta
  /** Whether the main process currently has a live child for this session. */
  live: boolean
}
