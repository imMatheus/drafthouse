import { git, GitError } from './git'
import { gitDiffToPullRequestFiles } from './gitDiffToFiles'
import type {
  ComputePullRequestDiffInput,
  FetchPullRequestRefsInput,
  FetchPullRequestRefsResult,
  PullRequestFile
} from '../shared/types'

// Canonical `git` flags for diff/ref operations on behalf of the PR viewer.
// Normalizing these away from the user's git config keeps our output identical
// to what GitHub renders regardless of `core.autocrlf`, text filters, or path
// quoting settings.
const CONFIG_FLAGS = ['-c', 'core.autocrlf=false', '-c', 'core.safecrlf=false', '-c', 'core.quotepath=off']

// Serialize `git fetch` per-cwd so concurrent PR opens don't spawn dozens of
// parallel fetches against the same repo. `git diff`/`rev-parse` are cheap and
// don't need this.
const fetchInFlight = new Map<string, Promise<void>>()

function runFetches(cwd: string, invocations: string[][]): Promise<void> {
  const existing = fetchInFlight.get(cwd)
  if (existing) return existing
  const promise = Promise.allSettled(
    invocations.map((args) => git(cwd, [...CONFIG_FLAGS, ...args], { timeoutMs: 20_000 }))
  )
    .then(() => undefined)
    .finally(() => fetchInFlight.delete(cwd))
  fetchInFlight.set(cwd, promise)
  return promise
}

async function revParse(cwd: string, ref: string): Promise<string | null> {
  try {
    const out = await git(cwd, [...CONFIG_FLAGS, 'rev-parse', '--verify', '--quiet', `${ref}^{commit}`])
    const sha = out.trim()
    return sha.length > 0 ? sha : null
  } catch (err) {
    // `rev-parse --verify --quiet` should exit 0/stdout empty or 1/stderr
    // empty. Anything else we treat as "ref doesn't exist here" for the
    // purposes of resolution (callers decide whether that's fatal).
    if (err instanceof GitError && (err.kind === 'missing-ref' || err.kind === 'unknown')) return null
    throw err
  }
}

/**
 * Verify the `origin` remote points at the GitHub repo we think it does.
 * Returning `false` is the cue for the caller to skip local compute entirely
 * and fall back to REST — running `git fetch origin` would pull the wrong
 * refs. We match lax (accept either SSH or HTTPS, with or without `.git`).
 */
async function isOriginForRepo(cwd: string, owner: string, repo: string): Promise<boolean> {
  try {
    const url = (await git(cwd, ['remote', 'get-url', 'origin'])).trim()
    const needle = `${owner}/${repo}`.toLowerCase()
    const normalized = url.toLowerCase().replace(/\.git$/, '')
    return normalized.endsWith(`/${needle}`) || normalized.endsWith(`:${needle}`)
  } catch {
    return false
  }
}

export async function fetchPullRequestRefs(input: FetchPullRequestRefsInput): Promise<FetchPullRequestRefsResult> {
  const { cwd, owner, repo, number, baseRef, headRef } = input

  if (!(await isOriginForRepo(cwd, owner, repo))) {
    throw new GitError('origin-mismatch', `origin does not point at ${owner}/${repo}`)
  }

  const prRemoteRef = `refs/remotes/origin/pr/${number}`
  await runFetches(cwd, [
    ['fetch', '--no-write-fetch-head', 'origin', baseRef],
    ['fetch', '--no-write-fetch-head', 'origin', `pull/${number}/head:${prRemoteRef}`]
  ])

  const baseSha = await revParse(cwd, `refs/remotes/origin/${baseRef}`)
  if (!baseSha) {
    throw new GitError('missing-ref', `base ref origin/${baseRef} not resolvable after fetch`)
  }

  // Prefer the user's local branch for head — that's where Claude's un-pushed
  // commits live. Fall back to the origin pr/N ref we just fetched.
  const localHeadSha = await revParse(cwd, `refs/heads/${headRef}`)
  if (localHeadSha) return { baseSha, headSha: localHeadSha, headRefUsed: 'local' }
  const originHeadSha = await revParse(cwd, prRemoteRef)
  if (!originHeadSha) {
    throw new GitError('refs-unavailable', `neither refs/heads/${headRef} nor ${prRemoteRef} resolve`)
  }
  return { baseSha, headSha: originHeadSha, headRefUsed: 'origin-pr' }
}

export async function computePullRequestDiff(input: ComputePullRequestDiffInput): Promise<PullRequestFile[]> {
  const { cwd, owner, repo, baseSha, headSha, blobUrlHeadSha } = input

  // Pinned to shas so a concurrent fetch can't shift results mid-diff.
  const diffText = await git(
    cwd,
    [
      ...CONFIG_FLAGS,
      'diff',
      '--find-renames',
      '--unified=3',
      '--no-color',
      '--no-textconv',
      `${baseSha}...${headSha}`
    ],
    { timeoutMs: 30_000 }
  )

  return gitDiffToPullRequestFiles(diffText, { owner, repo, blobUrlHeadSha })
}
