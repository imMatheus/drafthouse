import type { CodeViewDiffItem, FileDiffMetadata } from '@pierre/diffs'

// Accumulates streamed file diffs into CodeView items plus the lightweight
// per-file metadata the PR Files tab needs for its own file tree, diff stats,
// and comment grouping. This is a trimmed analogue of diffshub's data
// accumulator — we keep the app's existing file tree, so none of the
// @pierre/trees path-store machinery is needed here.

export type PrDiffFileStatus = 'added' | 'removed' | 'modified' | 'renamed'

export interface PrDiffFileMeta {
  /** Stable id of the CodeView item for this file (used to scroll/anchor). */
  itemId: string
  filename: string
  previousFilename?: string
  status: PrDiffFileStatus
  additions: number
  deletions: number
  /**
   * The raw per-file git patch this item was parsed from. Kept so the file can
   * be re-parsed with full old/new contents later (`processFile(patch, { oldFile,
   * newFile })`) to make a non-partial, *expandable* diff — GitHub's streamed
   * `.diff` only carries changed regions, so the collapsed "N unmodified lines"
   * bars aren't expandable until we enrich the patch with the surrounding lines.
   */
  patchText: string
}

export interface PrDiffDiffStats {
  fileCount: number
  additions: number
  deletions: number
}

export interface PrDiffAccumulator<TMeta> {
  items: CodeViewDiffItem<TMeta>[]
  pendingItems: CodeViewDiffItem<TMeta>[]
  fileMetas: PrDiffFileMeta[]
  diffStats: PrDiffDiffStats
  /** Guards against duplicate paths producing colliding CodeView item ids. */
  itemIdCounts: Map<string, number>
  fileIndex: number
}

export function createPrDiffAccumulator<TMeta>(): PrDiffAccumulator<TMeta> {
  return {
    items: [],
    pendingItems: [],
    fileMetas: [],
    diffStats: { fileCount: 0, additions: 0, deletions: 0 },
    itemIdCounts: new Map(),
    fileIndex: 0
  }
}

function mapStatus(type: FileDiffMetadata['type']): PrDiffFileStatus {
  switch (type) {
    case 'new':
      return 'added'
    case 'deleted':
      return 'removed'
    case 'rename-pure':
    case 'rename-changed':
      return 'renamed'
    default:
      return 'modified'
  }
}

function uniqueItemId(itemIdCounts: Map<string, number>, path: string): string {
  const seen = itemIdCounts.get(path) ?? 0
  itemIdCounts.set(path, seen + 1)
  return seen === 0 ? path : `${path}?${seen}`
}

interface AppendOptions {
  /** Raw git patch this file was parsed from, kept for later expansion. */
  patchText: string
}

/**
 * Appends one parsed file diff. Returns the created item so the caller can
 * batch-publish it to the viewer; the item is also tracked in `pendingItems`
 * and the metadata in `fileMetas`/`diffStats`.
 */
export function appendFileDiff<TMeta>(
  accumulator: PrDiffAccumulator<TMeta>,
  fileDiff: FileDiffMetadata,
  options: AppendOptions
): CodeViewDiffItem<TMeta> {
  let additions = 0
  let deletions = 0
  for (const hunk of fileDiff.hunks) {
    additions += hunk.additionLines
    deletions += hunk.deletionLines
  }

  const filename = fileDiff.name
  const itemId = uniqueItemId(accumulator.itemIdCounts, filename)
  const item: CodeViewDiffItem<TMeta> = {
    id: itemId,
    type: 'diff',
    fileDiff,
    version: 0
  }

  accumulator.items.push(item)
  accumulator.pendingItems.push(item)
  accumulator.fileMetas.push({
    itemId,
    filename,
    previousFilename: fileDiff.prevName,
    status: mapStatus(fileDiff.type),
    additions,
    deletions,
    patchText: options.patchText
  })

  accumulator.diffStats.fileCount++
  accumulator.diffStats.additions += additions
  accumulator.diffStats.deletions += deletions
  accumulator.fileIndex++

  return item
}

export function takePendingItems<TMeta>(accumulator: PrDiffAccumulator<TMeta>): CodeViewDiffItem<TMeta>[] {
  const pending = accumulator.pendingItems
  accumulator.pendingItems = []
  return pending
}
