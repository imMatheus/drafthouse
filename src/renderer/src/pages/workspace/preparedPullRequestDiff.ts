import type { AgentSession, PullRequestReviewDraftComment, PullRequestReviewLineSide } from '../../../../shared/types'
import type { PullRequestReviewThread } from './pullRequestShared'
import { getDiffThreadKey, type ParsedDiffLine, type ParsedPullRequestFileDiff } from './pullRequestDiff'

export interface HunkGap {
  key: string
  hiddenCount: number
  afterNewLine: number
  beforeNewLine: number
}

export interface PreparedDraftEntry {
  comment: PullRequestReviewDraftComment
  /** Index in the top-level `draftReviewComments` array — needed for removal. */
  index: number
}

export interface PreparedDiffRow {
  line: ParsedDiffLine
  /** Stable thread/draft row key ("path::side::line") or null if this line is not commentable. */
  rowKey: string | null
  threads: readonly PullRequestReviewThread[]
  drafts: readonly PreparedDraftEntry[]
  sessions: readonly AgentSession[]
}

export interface PreparedDiffPair {
  left: PreparedDiffRow | null
  right: PreparedDiffRow | null
}

export interface PreparedDiffHunk {
  id: string
  header: string
  rows: readonly PreparedDiffRow[]
  /** Pairs for split view — context rows share the same row reference on both sides. */
  pairs: readonly PreparedDiffPair[]
  gapAfter: HunkGap | null
}

export interface PreparedFileDiff {
  hunks: readonly PreparedDiffHunk[]
  beforeFirstGap: HunkGap | null
  anchoredThreadIds: ReadonlySet<number>
  unanchoredThreads: readonly PullRequestReviewThread[]
  hasRenderablePatch: boolean
}

const EMPTY_THREADS: readonly PullRequestReviewThread[] = Object.freeze([])
const EMPTY_DRAFTS: readonly PreparedDraftEntry[] = Object.freeze([])
const EMPTY_SESSIONS: readonly AgentSession[] = Object.freeze([])

/**
 * Joins a parsed diff with its file-scoped annotations (threads, drafts, agent sessions)
 * into a single pre-indexed structure ready for rendering. One pass over the hunks
 * computes per-row annotations, split-view pairs, hunk gaps, and anchored-thread tracking.
 *
 * Render code walks `hunks[].rows` (unified) or `hunks[].pairs` (split) and reads
 * annotations directly off each row — no per-row Map lookups or string concatenation.
 */
export function preparePullRequestFileDiff(
  parsed: ParsedPullRequestFileDiff,
  filename: string,
  fileThreads: readonly PullRequestReviewThread[],
  fileDrafts: readonly PreparedDraftEntry[],
  fileSessions: readonly AgentSession[]
): PreparedFileDiff {
  const threadsByRowKey = indexByRowKey(
    fileThreads,
    filename,
    (t) => t.side,
    (t) => t.line
  )
  const draftsByRowKey = indexByRowKey(
    fileDrafts,
    filename,
    (d) => d.comment.side,
    (d) => d.comment.line
  )

  const sessionsByLine = new Map<number, AgentSession[]>()
  for (const session of fileSessions) {
    const line = session.context?.lineNumber
    if (typeof line !== 'number') continue
    const bucket = sessionsByLine.get(line)
    if (bucket) bucket.push(session)
    else sessionsByLine.set(line, [session])
  }

  const anchoredThreadIds = new Set<number>()
  const preparedHunks: PreparedDiffHunk[] = []
  let beforeFirstGap: HunkGap | null = null

  for (let i = 0; i < parsed.hunks.length; i++) {
    const hunk = parsed.hunks[i]
    const rows: PreparedDiffRow[] = new Array(hunk.lines.length)

    for (let j = 0; j < hunk.lines.length; j++) {
      const line = hunk.lines[j]
      const rowKey =
        line.commentSide != null && line.commentLine != null
          ? getDiffThreadKey(filename, line.commentSide, line.commentLine)
          : null

      const threads = rowKey !== null ? (threadsByRowKey.get(rowKey) ?? EMPTY_THREADS) : EMPTY_THREADS
      for (const thread of threads) anchoredThreadIds.add(thread.id)

      const drafts = rowKey !== null ? (draftsByRowKey.get(rowKey) ?? EMPTY_DRAFTS) : EMPTY_DRAFTS
      const sessions =
        line.commentLine != null ? (sessionsByLine.get(line.commentLine) ?? EMPTY_SESSIONS) : EMPTY_SESSIONS

      rows[j] = { line, rowKey, threads, drafts, sessions }
    }

    const pairs = computeSplitPairs(rows)
    const gapAfter = i < parsed.hunks.length - 1 ? computeGapBetween(hunk, parsed.hunks[i + 1]) : null

    if (i === 0) {
      beforeFirstGap = computeGapBeforeFirstHunk(hunk)
    }

    preparedHunks.push({
      id: hunk.id,
      header: hunk.header,
      rows,
      pairs,
      gapAfter
    })
  }

  const unanchoredThreads = fileThreads.filter((thread) => !anchoredThreadIds.has(thread.id))

  return {
    hunks: preparedHunks,
    beforeFirstGap,
    anchoredThreadIds,
    unanchoredThreads,
    hasRenderablePatch: parsed.hasRenderablePatch
  }
}

function indexByRowKey<T>(
  items: readonly T[],
  filename: string,
  getSide: (item: T) => PullRequestReviewLineSide | null | undefined,
  getLine: (item: T) => number | null | undefined
): Map<string, T[]> {
  const map = new Map<string, T[]>()
  for (const item of items) {
    const side = getSide(item)
    const line = getLine(item)
    if (side == null || line == null) continue
    const key = getDiffThreadKey(filename, side, line)
    const bucket = map.get(key)
    if (bucket) bucket.push(item)
    else map.set(key, [item])
  }
  return map
}

function computeSplitPairs(rows: readonly PreparedDiffRow[]): PreparedDiffPair[] {
  const pairs: PreparedDiffPair[] = []
  let i = 0
  while (i < rows.length) {
    const row = rows[i]
    const kind = row.line.kind
    if (kind === 'context' || kind === 'meta' || kind === 'hunk') {
      pairs.push({ left: row, right: row })
      i++
      continue
    }
    const deletions: PreparedDiffRow[] = []
    const additions: PreparedDiffRow[] = []
    while (i < rows.length && rows[i].line.kind === 'deletion') {
      deletions.push(rows[i])
      i++
    }
    while (i < rows.length && rows[i].line.kind === 'addition') {
      additions.push(rows[i])
      i++
    }
    const maxLen = Math.max(deletions.length, additions.length)
    for (let j = 0; j < maxLen; j++) {
      pairs.push({
        left: j < deletions.length ? deletions[j] : null,
        right: j < additions.length ? additions[j] : null
      })
    }
  }
  return pairs
}

function computeGapBeforeFirstHunk(hunk: { lines: ParsedDiffLine[] }): HunkGap | null {
  const firstLine = hunk.lines[0]
  if (!firstLine) return null
  const firstNew = firstLine.newLineNumber ?? firstLine.oldLineNumber ?? 1
  if (firstNew <= 1) return null
  return {
    key: `gap-1-${firstNew}`,
    hiddenCount: firstNew - 1,
    afterNewLine: 1,
    beforeNewLine: firstNew
  }
}

function computeGapBetween(hunk: { lines: ParsedDiffLine[] }, nextHunk: { lines: ParsedDiffLine[] }): HunkGap | null {
  const lastLine = hunk.lines[hunk.lines.length - 1]
  const nextFirst = nextHunk.lines[0]
  if (!lastLine || !nextFirst) return null
  const lastNew = (lastLine.newLineNumber ?? lastLine.oldLineNumber ?? 0) + 1
  const nextNew = nextFirst.newLineNumber ?? nextFirst.oldLineNumber ?? 0
  if (nextNew <= lastNew) return null
  return {
    key: `gap-${lastNew}-${nextNew}`,
    hiddenCount: nextNew - lastNew,
    afterNewLine: lastNew,
    beforeNewLine: nextNew
  }
}
