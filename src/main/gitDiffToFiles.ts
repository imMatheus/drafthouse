import parseGitDiffDefault from 'parse-git-diff'
import type { PullRequestFile } from '../shared/types'

// electron-vite bundles the main process as CJS without applying ES-module
// default-import interop, so `import x from 'cjs-with-default-export'` hands
// back the whole module object at runtime. Unwrap `.default` ourselves.
const parseGitDiff = (
  typeof parseGitDiffDefault === 'function'
    ? parseGitDiffDefault
    : (parseGitDiffDefault as { default: typeof parseGitDiffDefault }).default
) as typeof parseGitDiffDefault

type GitDiff = ReturnType<typeof parseGitDiff>
type AnyFileChange = GitDiff['files'][number]
type AnyChunk = AnyFileChange['chunks'][number]
type Chunk = Extract<AnyChunk, { type: 'Chunk' }>
type CombinedChunk = Extract<AnyChunk, { type: 'CombinedChunk' }>
type AnyLineChange = Chunk['changes'][number]

/**
 * Adapt `parse-git-diff` output into the `PullRequestFile[]` shape the
 * renderer already consumes (same shape GitHub's REST `listFiles` returns).
 *
 * `patch` is serialized as the hunk body only (starting with `@@ …`), matching
 * GitHub's REST convention — `wrapGitPatch` in `src/renderer/src/lib/diffs.ts`
 * prepends the `diff --git`/`---`/`+++` headers on the renderer side.
 *
 * `blob_url` uses the caller-supplied GitHub head sha so links to the remote
 * keep working even when the local head is ahead of origin (un-pushed commits).
 */
export function gitDiffToPullRequestFiles(
  diffText: string,
  opts: { owner: string; repo: string; blobUrlHeadSha: string }
): PullRequestFile[] {
  if (!diffText.trim()) return []
  const parsed: GitDiff = parseGitDiff(diffText)
  return parsed.files.map((file) => fileChangeToPullRequestFile(file, opts))
}

function fileChangeToPullRequestFile(
  file: AnyFileChange,
  opts: { owner: string; repo: string; blobUrlHeadSha: string }
): PullRequestFile {
  const { filename, previousFilename, status } = resolveNameAndStatus(file)
  const { additions, deletions, hasAnyHunk, hasBinary } = summarizeChunks(file.chunks)
  const patch = hasBinary || !hasAnyHunk ? undefined : serializePatch(file.chunks)
  return {
    sha: null,
    filename,
    status,
    additions,
    deletions,
    changes: additions + deletions,
    blob_url: `https://github.com/${opts.owner}/${opts.repo}/blob/${opts.blobUrlHeadSha}/${filename}`,
    raw_url: null,
    contents_url: '',
    ...(patch !== undefined ? { patch } : {}),
    ...(previousFilename !== undefined ? { previous_filename: previousFilename } : {})
  }
}

function resolveNameAndStatus(file: AnyFileChange): {
  filename: string
  previousFilename?: string
  status: string
} {
  switch (file.type) {
    case 'AddedFile':
      return { filename: file.path, status: 'added' }
    case 'DeletedFile':
      return { filename: file.path, status: 'removed' }
    case 'RenamedFile':
      return { filename: file.pathAfter, previousFilename: file.pathBefore, status: 'renamed' }
    case 'ChangedFile':
      return { filename: file.path, status: 'modified' }
    default: {
      const never: never = file
      return never
    }
  }
}

function summarizeChunks(chunks: readonly AnyChunk[]): {
  additions: number
  deletions: number
  hasAnyHunk: boolean
  hasBinary: boolean
} {
  let additions = 0
  let deletions = 0
  let hasAnyHunk = false
  let hasBinary = false
  for (const chunk of chunks) {
    if (chunk.type === 'BinaryFilesChunk') {
      hasBinary = true
      continue
    }
    hasAnyHunk = true
    for (const change of chunk.changes) {
      if (change.type === 'AddedLine') additions++
      else if (change.type === 'DeletedLine') deletions++
    }
  }
  return { additions, deletions, hasAnyHunk, hasBinary }
}

function serializePatch(chunks: readonly AnyChunk[]): string {
  const parts: string[] = []
  for (const chunk of chunks) {
    if (chunk.type === 'BinaryFilesChunk') continue
    parts.push(serializeHunkHeader(chunk))
    for (const change of chunk.changes) {
      parts.push(serializeLine(change))
    }
  }
  return parts.join('\n')
}

function serializeHunkHeader(chunk: Chunk | CombinedChunk): string {
  const context = chunk.context ? ` ${chunk.context}` : ''
  if (chunk.type === 'CombinedChunk') {
    const a = formatRange(chunk.fromFileRangeA)
    const b = formatRange(chunk.fromFileRangeB)
    const to = formatRange(chunk.toFileRange)
    return `@@@ -${a} -${b} +${to} @@@${context}`
  }
  const from = formatRange(chunk.fromFileRange)
  const to = formatRange(chunk.toFileRange)
  return `@@ -${from} +${to} @@${context}`
}

function formatRange(range: { start: number; lines: number }): string {
  return range.lines === 1 ? `${range.start}` : `${range.start},${range.lines}`
}

function serializeLine(change: AnyLineChange): string {
  switch (change.type) {
    case 'AddedLine':
      return `+${change.content}`
    case 'DeletedLine':
      return `-${change.content}`
    case 'UnchangedLine':
      return ` ${change.content}`
    case 'MessageLine':
      // `\ No newline at end of file` and similar diagnostic lines.
      return `\\ ${change.content}`
    default: {
      const never: never = change
      return never
    }
  }
}
