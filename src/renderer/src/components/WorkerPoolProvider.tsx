import {
  WorkerPoolContextProvider,
  type WorkerInitializationRenderOptions,
  type WorkerPoolOptions
} from '@pierre/diffs/react'
import type { ReactNode } from 'react'
import { DIFFS_THEMES } from '../lib/diffs'

// Off-main-thread syntax highlighting for every @pierre/diffs surface beneath
// this provider (the streaming PR CodeView, plus the MultiFileDiff/PatchDiff
// views). Without it, shiki tokenization runs on the main thread and janks
// scrolling on large diffs.

// Cap the pool: a couple of workers is plenty and avoids spawning one per core
// on big machines.
const POOL_SIZE = Math.min(3, Math.max(1, (globalThis.navigator?.hardwareConcurrency ?? 2) - 1))

const POOL_OPTIONS: WorkerPoolOptions = {
  poolSize: POOL_SIZE,
  workerFactory() {
    return new Worker(new URL('@pierre/diffs/worker/worker.js', import.meta.url), { type: 'module' })
  }
}

// Warm the highlighter with our theme pair and the languages we hit most so the
// first diffs don't pay a cold lazy-load. Other languages resolve on demand.
const HIGHLIGHTER_OPTIONS: WorkerInitializationRenderOptions = {
  theme: DIFFS_THEMES,
  langs: ['typescript', 'tsx', 'javascript', 'jsx', 'json', 'css', 'html', 'markdown', 'python', 'go', 'rust', 'bash'],
  preferredHighlighter: 'shiki-wasm'
}

export default function WorkerPoolProvider({ children }: { children: ReactNode }) {
  return (
    <WorkerPoolContextProvider poolOptions={POOL_OPTIONS} highlighterOptions={HIGHLIGHTER_OPTIONS}>
      {children}
    </WorkerPoolContextProvider>
  )
}
