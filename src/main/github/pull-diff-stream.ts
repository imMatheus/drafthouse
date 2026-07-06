import { ipcMain, type IpcMainInvokeEvent, type WebContents } from 'electron'
import { requireAuth, getGitHubHeaders, API } from './client'

// Streams a raw unified diff (pull request or commit) to the renderer one
// network chunk at a time so the viewer can parse and render files as they
// arrive instead of waiting for the whole patch. The renderer generates the
// streamId, subscribes to the chunk/end/error channels, then invokes the start
// handler — so there is no subscribe-after-first-chunk race.

const CHUNK_CHANNEL = 'github:pull-diff-chunk'
const END_CHANNEL = 'github:pull-diff-end'
const ERROR_CHANNEL = 'github:pull-diff-error'

interface DiffStreamError {
  streamId: string
  message: string
  // `true` when GitHub refused to render the diff because it is too large; the
  // renderer falls back to the per-file REST endpoint in that case.
  tooLarge: boolean
}

const activeStreams = new Map<string, AbortController>()

function send(sender: WebContents, channel: string, payload: unknown): void {
  if (!sender.isDestroyed()) {
    sender.send(channel, payload)
  }
}

/** Streams `url` (served with the diff media type) to the renderer. */
async function streamDiff(event: IpcMainInvokeEvent, streamId: string, url: string, label: string): Promise<void> {
  const token = requireAuth()
  const sender = event.sender

  // Replace any stale controller for this id (renderer reuses ids on retry).
  activeStreams.get(streamId)?.abort()
  const controller = new AbortController()
  activeStreams.set(streamId, controller)

  const fail = (message: string, tooLarge = false): void => {
    send(sender, ERROR_CHANNEL, { streamId, message, tooLarge } satisfies DiffStreamError)
  }

  try {
    const response = await fetch(url, {
      headers: getGitHubHeaders(token, { Accept: 'application/vnd.github.v3.diff' }),
      signal: controller.signal
    })

    if (!response.ok) {
      if (response.status === 401) {
        fail('GitHub authentication expired. Log out and sign in again.')
      } else if (response.status === 403 && response.headers.get('x-ratelimit-remaining') === '0') {
        fail('GitHub API rate limit exceeded. Try again later.')
      } else if (response.status === 406) {
        // GitHub returns 406 when the diff is too large to render.
        fail(`The diff for ${label} is too large to stream.`, true)
      } else {
        fail(`Failed to load the diff for ${label} (${response.status}).`)
      }
      return
    }

    if (!response.body) {
      fail(`GitHub returned an empty diff for ${label}.`)
      return
    }

    const reader = response.body.getReader()
    try {
      for (;;) {
        const { done, value } = await reader.read()
        if (done) break
        if (value && value.byteLength > 0) {
          send(sender, CHUNK_CHANNEL, { streamId, chunk: value })
        }
      }
    } finally {
      reader.releaseLock()
    }

    send(sender, END_CHANNEL, { streamId })
  } catch (error) {
    // An abort is an expected cancellation, not an error worth surfacing.
    if (controller.signal.aborted) return
    fail(error instanceof Error ? error.message : `Failed to load the diff for ${label}.`)
  } finally {
    activeStreams.delete(streamId)
  }
}

export function registerPullDiffStreamHandlers(): void {
  ipcMain.handle(
    'github:pulls:stream-diff',
    (event, streamId: string, owner: string, repo: string, number: number): Promise<void> =>
      streamDiff(event, streamId, `${API}/repos/${owner}/${repo}/pulls/${number}`, `PR #${number}`)
  )

  ipcMain.handle(
    'github:commits:stream-diff',
    (event, streamId: string, owner: string, repo: string, ref: string): Promise<void> =>
      streamDiff(event, streamId, `${API}/repos/${owner}/${repo}/commits/${ref}`, `commit ${ref.slice(0, 7)}`)
  )

  ipcMain.handle('github:pulls:cancel-diff', (_event, streamId: string): void => {
    activeStreams.get(streamId)?.abort()
    activeStreams.delete(streamId)
  })
}
