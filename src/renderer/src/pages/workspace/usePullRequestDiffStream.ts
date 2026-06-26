import { processFile, type CodeViewDiffItem } from '@pierre/diffs'
import type { CodeViewHandle } from '@pierre/diffs/react'
import { type RefObject, useEffect, useRef, useState } from 'react'
import { streamGitPatchFiles } from '../../lib/streamGitPatchFiles'
import {
  appendFileDiff,
  createPrDiffAccumulator,
  takePendingItems,
  type PrDiffDiffStats,
  type PrDiffFileMeta
} from '../../lib/prDiffAccumulator'
import { wrapGitPatch } from '../../lib/diffs'

// Publish cadence for streamed files. The first file is published immediately
// so the viewer paints fast; the rest are batched so a fast stream doesn't
// thrash React. Mirrors diffshub's loader budget at a smaller scale.
const PUBLISH_INTERVAL_MS = 80
const PUBLISH_BATCH_SIZE = 20
const WORK_BUDGET_MS = 8

export type PrDiffLoadState = 'streaming' | 'ready' | 'error'

class DiffStreamError extends Error {
  readonly tooLarge: boolean
  constructor(message: string, tooLarge: boolean) {
    super(message)
    this.tooLarge = tooLarge
  }
}

interface UsePullRequestDiffStreamArgs<TMeta> {
  owner: string
  repo: string
  number: number
  headSha: string
  viewerRef: RefObject<CodeViewHandle<TMeta> | null>
  /**
   * Called for each freshly parsed batch right before it is handed to the
   * viewer, so the consumer can attach line annotations to brand-new items.
   * Must be referentially stable across renders.
   */
  prepareItems: (items: CodeViewDiffItem<TMeta>[]) => void
}

interface UsePullRequestDiffStreamResult<TMeta> {
  /** Remount key for the CodeView — changes per request so a new PR mounts fresh. */
  viewerKey: number
  /**
   * The first streamed batch, used to seed the CodeView's `initialItems` at
   * mount. `initialItems` only seeds once, so the viewer must be mounted only
   * after this is non-empty; subsequent batches go in via `addItems`.
   */
  initialItems: CodeViewDiffItem<TMeta>[]
  fileMetas: PrDiffFileMeta[]
  diffStats: PrDiffDiffStats | null
  /** Bumps on every publish so consumers can re-run annotation effects. */
  itemsRevision: number
  loadState: PrDiffLoadState
  errorMessage: string | null
  retry: () => void
}

export function usePullRequestDiffStream<TMeta>({
  owner,
  repo,
  number,
  headSha,
  viewerRef,
  prepareItems
}: UsePullRequestDiffStreamArgs<TMeta>): UsePullRequestDiffStreamResult<TMeta> {
  const [viewerKey, setViewerKey] = useState(0)
  const [initialItems, setInitialItems] = useState<CodeViewDiffItem<TMeta>[]>([])
  const [fileMetas, setFileMetas] = useState<PrDiffFileMeta[]>([])
  const [diffStats, setDiffStats] = useState<PrDiffDiffStats | null>(null)
  const [itemsRevision, setItemsRevision] = useState(0)
  const [loadState, setLoadState] = useState<PrDiffLoadState>('streaming')
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [loadAttempt, setLoadAttempt] = useState(0)
  const requestIdRef = useRef(0)
  const prepareItemsRef = useRef(prepareItems)
  prepareItemsRef.current = prepareItems

  useEffect(() => {
    const requestId = ++requestIdRef.current
    const isCurrent = (): boolean => requestIdRef.current === requestId
    const blobUrlBase = `https://github.com/${owner}/${repo}/blob/${headSha}`
    const cacheKeyPrefix = `${owner}/${repo}/${number}/${headSha}`
    const accumulator = createPrDiffAccumulator<TMeta>()

    setViewerKey(requestId)
    setInitialItems([])
    setFileMetas([])
    setDiffStats(null)
    setItemsRevision(0)
    setErrorMessage(null)
    setLoadState('streaming')

    let cancelStream: (() => void) | null = null
    let streamController: ReadableStreamDefaultController<Uint8Array> | null = null
    let pendingCount = 0
    let hasPublished = false
    let lastPublish = performance.now()
    let lastYield = lastPublish

    const flush = (): void => {
      if (pendingCount === 0 || !isCurrent()) return
      pendingCount = 0
      lastPublish = performance.now()
      const pending = takePendingItems(accumulator)
      prepareItemsRef.current(pending)
      if (!hasPublished) {
        // First batch seeds the viewer's initialItems at mount.
        hasPublished = true
        setInitialItems(pending)
      } else {
        const viewer = viewerRef.current
        if (viewer) viewer.addItems(pending)
        // Viewer not mounted yet (rare race) — fold into initialItems instead.
        else setInitialItems((prev) => [...prev, ...pending])
      }
      setFileMetas(accumulator.fileMetas.slice())
      setDiffStats({ ...accumulator.diffStats })
      setItemsRevision((revision) => revision + 1)
    }

    const maybeFlush = async (): Promise<void> => {
      const elapsed = performance.now() - lastPublish
      if (!hasPublished || pendingCount >= PUBLISH_BATCH_SIZE || elapsed >= PUBLISH_INTERVAL_MS) {
        flush()
        await yieldToBrowser()
        lastYield = performance.now()
        return
      }
      if (performance.now() - lastYield >= WORK_BUDGET_MS) {
        await yieldToBrowser()
        lastYield = performance.now()
      }
    }

    const ingestFile = async (fileText: string, cacheKeyIndex: number): Promise<void> => {
      const fileDiff = processFile(fileText, { cacheKey: `${cacheKeyPrefix}/${cacheKeyIndex}`, isGitDiff: true })
      if (!fileDiff || !isCurrent()) return
      appendFileDiff(accumulator, fileDiff, { blobUrlBase })
      pendingCount++
      await maybeFlush()
    }

    const buildStream = (): ReadableStream<Uint8Array> =>
      new ReadableStream<Uint8Array>({
        start(controller) {
          streamController = controller
          cancelStream = window.api.github.pulls.streamDiff(owner, repo, number, {
            onChunk: (chunk) => {
              try {
                controller.enqueue(chunk)
              } catch {
                // Controller already closed (request superseded); drop the chunk.
              }
            },
            onEnd: () => {
              try {
                controller.close()
              } catch {
                // Already closed.
              }
            },
            onError: (message, tooLarge) => {
              try {
                controller.error(new DiffStreamError(message, tooLarge))
              } catch {
                // Already settled.
              }
            }
          })
        },
        cancel() {
          cancelStream?.()
          cancelStream = null
        }
      })

    // Per-file REST fallback for diffs GitHub refuses to render in one stream.
    const runRestFallback = async (): Promise<void> => {
      const files = await window.api.github.pulls.listFiles(owner, repo, number)
      if (!isCurrent()) return
      for (const file of files) {
        if (!file.patch) continue
        await ingestFile(wrapGitPatch(file.filename, file.patch), accumulator.fileIndex)
      }
      flush()
      if (isCurrent()) setLoadState('ready')
    }

    const run = async (): Promise<void> => {
      try {
        await streamGitPatchFiles(buildStream(), (fileText) => ingestFile(fileText, accumulator.fileIndex))
        if (!isCurrent()) return
        flush()
        setLoadState('ready')
      } catch (error) {
        if (!isCurrent()) return
        if (error instanceof DiffStreamError && error.tooLarge) {
          try {
            await runRestFallback()
          } catch (fallbackError) {
            if (!isCurrent()) return
            setErrorMessage(messageFor(fallbackError))
            setLoadState('error')
          }
          return
        }
        setErrorMessage(messageFor(error))
        setLoadState('error')
      }
    }

    void run()

    return () => {
      // Invalidate the in-flight run, stop the upstream fetch, and unblock the
      // reader so streamGitPatchFiles resolves instead of hanging.
      requestIdRef.current++
      cancelStream?.()
      try {
        streamController?.close()
      } catch {
        // Already closed/errored.
      }
    }
  }, [owner, repo, number, headSha, loadAttempt, viewerRef])

  return {
    viewerKey,
    initialItems,
    fileMetas,
    diffStats,
    itemsRevision,
    loadState,
    errorMessage,
    retry: () => setLoadAttempt((attempt) => attempt + 1)
  }
}

function messageFor(error: unknown): string {
  return error instanceof Error && error.message ? error.message : 'We couldn’t load this diff. Try again.'
}

function yieldToBrowser(): Promise<void> {
  return new Promise((resolve) => {
    let settled = false
    const settle = (): void => {
      if (settled) return
      settled = true
      window.clearTimeout(timeout)
      resolve()
    }
    const timeout = window.setTimeout(settle, 50)
    window.requestAnimationFrame(settle)
  })
}
