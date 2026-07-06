import { useRef, type ComponentProps, type ReactNode } from 'react'
import {
  parseDiffFromFile,
  processFile,
  type CodeViewDiffItem,
  type CodeViewFileItem,
  type CodeViewItem,
  type DiffLineAnnotation,
  type FileContents
} from '@pierre/diffs'
import { CodeView } from '@pierre/diffs/react'

/**
 * StrictMode-safe single-file / single-diff rendering.
 *
 * The standalone `File` / `MultiFileDiff` / `PatchDiff` components from
 * `@pierre/diffs/react` hydrate their custom element imperatively from a ref
 * callback and don't survive React StrictMode's double-mount: in development
 * they render an empty `<diffs-container>`. `CodeView` re-runs its setup when
 * the node re-attaches, so every inline surface renders through a one-item
 * CodeView instead. Don't reintroduce the standalone components.
 */

type CodeViewOptions = ComponentProps<typeof CodeView>['options']

/** Single file contents (markdown code blocks, unchanged-file views). */
export function FileCodeBlock({
  file,
  options,
  className
}: {
  file: FileContents
  options: CodeViewOptions
  className?: string
}) {
  // CodeView reconciles controlled `items` by reference — rebuild the array
  // only when the file actually changes so re-renders don't re-tokenize. The
  // monotonic `version` is what makes CodeView re-sync an id-matched item:
  // its reconciler keeps the old record when versions are equal, so a reused
  // component instance switching content would otherwise render stale code.
  const cacheRef = useRef<{ file: FileContents; version: number; items: CodeViewFileItem[] } | null>(null)
  const cached = cacheRef.current
  if (
    !cached ||
    cached.file.name !== file.name ||
    cached.file.contents !== file.contents ||
    cached.file.lang !== file.lang
  ) {
    const version = (cached?.version ?? 0) + 1
    cacheRef.current = { file, version, items: [{ id: 'file', type: 'file', file, version }] }
  }

  return <CodeView items={cacheRef.current!.items} options={options} className={className} />
}

/**
 * Diff between two full contents of one file. Full contents (not hunks) are
 * what make whole-file-context syntax highlighting and expandable unchanged
 * regions work. Identical contents render as a plain file view.
 */
export function DiffContentsBlock({
  filePath,
  oldContents,
  newContents,
  lang,
  options,
  className
}: {
  filePath: string
  oldContents: string
  newContents: string
  lang?: FileContents['lang']
  options: CodeViewOptions
  className?: string
}) {
  const cacheRef = useRef<{
    path: string
    oldContents: string
    newContents: string
    version: number
    items: CodeViewItem[]
  } | null>(null)
  const cached = cacheRef.current
  if (!cached || cached.path !== filePath || cached.oldContents !== oldContents || cached.newContents !== newContents) {
    // Version bump forces CodeView to re-sync the id-matched item (see above).
    const version = (cached?.version ?? 0) + 1
    cacheRef.current = {
      path: filePath,
      oldContents,
      newContents,
      version,
      items: buildDiffItems(filePath, oldContents, newContents, lang, version)
    }
  }

  return <CodeView items={cacheRef.current!.items} options={options} className={className} />
}

function buildDiffItems(
  filePath: string,
  oldContents: string,
  newContents: string,
  lang: FileContents['lang'],
  version: number
): CodeViewItem[] {
  const newFile: FileContents = { name: filePath, contents: newContents, lang }
  if (oldContents === newContents) {
    return [{ id: 'file', type: 'file', file: newFile, version }]
  }
  try {
    const fileDiff = parseDiffFromFile({ name: filePath, contents: oldContents, lang }, newFile)
    return [{ id: 'diff', type: 'diff', fileDiff, version }]
  } catch {
    // parseDiffFromFile throws on degenerate inputs — fall back to the new file.
    return [{ id: 'file', type: 'file', file: newFile, version }]
  }
}

/** A raw git patch (hunks only), e.g. review-thread diff hunks. */
export function PatchCodeBlock<T = undefined>({
  patch,
  options,
  lineAnnotations,
  renderAnnotation,
  className,
  fallback = null
}: {
  patch: string
  options: ComponentProps<typeof CodeView<T>>['options']
  lineAnnotations?: DiffLineAnnotation<T>[]
  renderAnnotation?: ComponentProps<typeof CodeView<T>>['renderAnnotation']
  className?: string
  /** Rendered when the patch can't be parsed. */
  fallback?: ReactNode
}) {
  const cacheRef = useRef<{
    patch: string
    lineAnnotations?: DiffLineAnnotation<T>[]
    version: number
    items: CodeViewDiffItem<T>[] | null
  } | null>(null)
  const cached = cacheRef.current
  if (!cached || cached.patch !== patch || cached.lineAnnotations !== lineAnnotations) {
    // Version bump forces CodeView to re-sync the id-matched item (see above).
    const version = (cached?.version ?? 0) + 1
    const fileDiff = processFile(patch, { isGitDiff: true })
    cacheRef.current = {
      patch,
      lineAnnotations,
      version,
      items: fileDiff ? [{ id: 'diff', type: 'diff', fileDiff, annotations: lineAnnotations, version }] : null
    }
  }

  const items = cacheRef.current!.items
  if (!items) return <>{fallback}</>

  return <CodeView<T> items={items} options={options} renderAnnotation={renderAnnotation} className={className} />
}
