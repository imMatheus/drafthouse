import type { PullRequestFile, PullRequestReviewComment, PullRequestReviewLineSide } from '../../../../shared/types'

export type ParsedDiffLineKind = 'hunk' | 'addition' | 'deletion' | 'context' | 'meta'

export interface ParsedDiffLine {
  id: string
  kind: ParsedDiffLineKind
  content: string
  oldLineNumber: number | null
  newLineNumber: number | null
  commentSide: PullRequestReviewLineSide | null
  commentLine: number | null
}

export interface ParsedDiffHunk {
  id: string
  header: string
  lines: ParsedDiffLine[]
}

export interface ParsedPullRequestFileDiff {
  hunks: ParsedDiffHunk[]
  hasRenderablePatch: boolean
}

export interface ReviewThreadAnchor {
  side: PullRequestReviewLineSide
  line: number
}

export function parsePullRequestFileDiff(file: PullRequestFile): ParsedPullRequestFileDiff {
  if (!file.patch) {
    return {
      hunks: [],
      hasRenderablePatch: false
    }
  }

  const rawLines = file.patch.split('\n')
  const hunks: ParsedDiffHunk[] = []
  let currentHunk: ParsedDiffHunk | null = null
  let oldLineNumber = 0
  let newLineNumber = 0
  let lineIndex = 0

  const pushCurrentHunk = (): void => {
    if (currentHunk) {
      hunks.push(currentHunk)
    }
  }

  for (const rawLine of rawLines) {
    if (rawLine.startsWith('@@')) {
      pushCurrentHunk()

      const match = rawLine.match(/@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/)
      oldLineNumber = match ? Number(match[1]) : 0
      newLineNumber = match ? Number(match[2]) : 0
      lineIndex = 0
      currentHunk = {
        id: `${file.filename}-hunk-${hunks.length}`,
        header: rawLine,
        lines: []
      }
      continue
    }

    if (!currentHunk) {
      currentHunk = {
        id: `${file.filename}-hunk-${hunks.length}`,
        header: '',
        lines: []
      }
    }

    lineIndex += 1

    if (rawLine.startsWith('-')) {
      currentHunk.lines.push({
        id: `${currentHunk.id}-line-${lineIndex}`,
        kind: 'deletion',
        content: rawLine.slice(1),
        oldLineNumber,
        newLineNumber: null,
        commentSide: 'LEFT',
        commentLine: oldLineNumber
      })
      oldLineNumber += 1
      continue
    }

    if (rawLine.startsWith('+')) {
      currentHunk.lines.push({
        id: `${currentHunk.id}-line-${lineIndex}`,
        kind: 'addition',
        content: rawLine.slice(1),
        oldLineNumber: null,
        newLineNumber,
        commentSide: 'RIGHT',
        commentLine: newLineNumber
      })
      newLineNumber += 1
      continue
    }

    if (rawLine.startsWith('\\')) {
      // Skip git metadata lines like "\ No newline at end of file"
      continue
    }

    currentHunk.lines.push({
      id: `${currentHunk.id}-line-${lineIndex}`,
      kind: 'context',
      content: rawLine.startsWith(' ') ? rawLine.slice(1) : rawLine,
      oldLineNumber,
      newLineNumber,
      commentSide: 'RIGHT',
      commentLine: newLineNumber
    })
    oldLineNumber += 1
    newLineNumber += 1
  }

  pushCurrentHunk()

  return {
    hunks,
    hasRenderablePatch: true
  }
}

export function getReviewCommentAnchor(comment: PullRequestReviewComment): ReviewThreadAnchor | null {
  const side = normalizeReviewCommentSide(comment.side ?? comment.start_side)
  const line = comment.line ?? comment.original_line ?? comment.start_line ?? comment.original_start_line ?? null

  if (!side || typeof line !== 'number' || Number.isNaN(line)) {
    return null
  }

  return {
    side,
    line
  }
}

function normalizeReviewCommentSide(value: string | null | undefined): PullRequestReviewLineSide | null {
  if (value === 'LEFT' || value === 'RIGHT') {
    return value
  }

  return null
}

export function getDiffThreadKey(path: string, side: PullRequestReviewLineSide, line: number): string {
  return `${path}::${side}::${line}`
}

export function splitDiffHunkToContents(diffHunk: string): { original: string; modified: string } {
  const lines = diffHunk.split('\n')
  const originalLines: string[] = []
  const modifiedLines: string[] = []

  for (const line of lines) {
    if (line.startsWith('@@') || line.startsWith('\\')) continue
    if (line.startsWith('-')) {
      originalLines.push(line.slice(1))
    } else if (line.startsWith('+')) {
      modifiedLines.push(line.slice(1))
    } else {
      const content = line.startsWith(' ') ? line.slice(1) : line
      originalLines.push(content)
      modifiedLines.push(content)
    }
  }

  return { original: originalLines.join('\n'), modified: modifiedLines.join('\n') }
}
