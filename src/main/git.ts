import { ipcMain } from 'electron'
import { execFile } from 'child_process'
import { join } from 'path'
import { unlinkSync, statSync } from 'fs'
import { requireAllowedDirectory } from './fs'
import type { GitChangedFile, GitBranchInfo, GitLogEntry, GitStatusCode } from '../shared/types'

export type GitErrorKind =
  | 'timeout'
  | 'not-a-repo'
  | 'missing-ref'
  | 'fetch-failed'
  | 'git-not-found'
  | 'origin-mismatch'
  | 'refs-unavailable'
  | 'unknown'

/**
 * Typed error for git failures. The `kind` discriminant lets the renderer
 * decide between silent REST fallback and surfacing a CTA to the user.
 *
 * Electron's IPC boundary strips custom Error properties during rejection
 * serialization, so we also prefix the message with a `[GitError:<kind>]`
 * sentinel and parse it back on the renderer side (see `readGitErrorKind`
 * in PRFilesTab.tsx).
 */
export class GitError extends Error {
  kind: GitErrorKind
  constructor(kind: GitErrorKind, message: string) {
    super(`[GitError:${kind}] ${message}`)
    this.name = 'GitError'
    this.kind = kind
  }
}

interface GitOptions {
  /** Per-invocation timeout. Default 15s. */
  timeoutMs?: number
  signal?: AbortSignal
}

// Hardened execFile env: prevents git from waiting on credential prompts or
// interactive TTY features that would hang the main process indefinitely.
const GIT_ENV = {
  ...process.env,
  GIT_TERMINAL_PROMPT: '0',
  GIT_ASKPASS: 'echo',
  SSH_ASKPASS: 'echo'
}

export function git(cwd: string, args: string[], opts: GitOptions = {}): Promise<string> {
  const { timeoutMs = 15_000, signal } = opts
  return new Promise((resolve, reject) => {
    const child = execFile(
      'git',
      args,
      {
        cwd,
        maxBuffer: 64 * 1024 * 1024,
        timeout: timeoutMs,
        env: GIT_ENV,
        signal
      },
      (error, stdout, stderr) => {
        if (error) {
          reject(toGitError(error as NodeJS.ErrnoException, stderr, stdout))
          return
        }
        resolve(stdout)
      }
    )
    // Keep a reference so Node doesn't complain about unused vars; child is
    // managed entirely via the callback.
    void child
  })
}

function toGitError(error: NodeJS.ErrnoException, stderr: string, stdout: string): GitError {
  const message = (stderr || '').trim() || (stdout || '').trim() || error.message
  if (error.code === 'ENOENT') return new GitError('git-not-found', 'git binary not found on PATH')
  // execFile sets `killed` with SIGTERM when the timeout fires.
  if ((error as { killed?: boolean }).killed && (error as { signal?: string }).signal === 'SIGTERM') {
    return new GitError('timeout', message || 'git command timed out')
  }
  if (/not a git repository/i.test(message)) return new GitError('not-a-repo', message)
  if (/unknown revision|bad revision|ambiguous argument|does not have any commits/i.test(message)) {
    return new GitError('missing-ref', message)
  }
  if (/could not read from remote|couldn't find remote|authentication failed|permission denied/i.test(message)) {
    return new GitError('fetch-failed', message)
  }
  return new GitError('unknown', message)
}

function parseStatusCode(char: string): GitStatusCode | ' ' {
  if (char === ' ') return ' '
  if ('MADRCU?!'.includes(char)) return char as GitStatusCode
  return ' '
}

async function gitStatus(cwd: string): Promise<GitChangedFile[]> {
  const output = await git(cwd, ['status', '--porcelain=v1', '-uall'])
  if (!output.trim()) return []

  const files: GitChangedFile[] = []

  for (const line of output.split('\n')) {
    if (line.length < 3) continue

    const indexStatus = parseStatusCode(line[0])
    const workTreeStatus = parseStatusCode(line[1])
    const rest = line.slice(3)

    // Handle renames: "R  old -> new"
    const renameMatch = rest.match(/^(.+?) -> (.+)$/)
    if (renameMatch) {
      files.push({
        path: renameMatch[2],
        oldPath: renameMatch[1],
        indexStatus,
        workTreeStatus
      })
    } else {
      files.push({
        path: rest,
        indexStatus,
        workTreeStatus
      })
    }
  }

  return files
}

async function gitBranchInfo(cwd: string): Promise<GitBranchInfo> {
  const [name, upstream] = await Promise.all([
    git(cwd, ['branch', '--show-current']).then((output) => output.trim()),
    git(cwd, ['rev-parse', '--abbrev-ref', '--symbolic-full-name', '@{upstream}'])
      .then((output) => output.trim())
      .catch(() => null)
  ])

  let ahead = 0
  let behind = 0

  if (upstream) {
    try {
      const counts = (await git(cwd, ['rev-list', '--left-right', '--count', 'HEAD...@{upstream}'])).trim()
      const parts = counts.split('\t')
      ahead = Number(parts[0]) || 0
      behind = Number(parts[1]) || 0
    } catch {
      // Can't determine ahead/behind
    }
  }

  return { name, upstream, ahead, behind }
}

async function gitDiff(cwd: string, filePath: string, staged: boolean): Promise<string> {
  const args = ['diff']
  if (staged) args.push('--cached')
  args.push('--', filePath)
  return git(cwd, args)
}

async function gitShowFile(cwd: string, filePath: string): Promise<string> {
  try {
    return await git(cwd, ['show', `HEAD:${filePath}`])
  } catch {
    // File doesn't exist at HEAD (new file)
    return ''
  }
}

async function gitShowStagedFile(cwd: string, filePath: string): Promise<string> {
  try {
    return await git(cwd, ['show', `:${filePath}`])
  } catch {
    return ''
  }
}

async function gitStage(cwd: string, filePaths: string[]): Promise<void> {
  await git(cwd, ['add', '--', ...filePaths])
}

async function gitUnstage(cwd: string, filePaths: string[]): Promise<void> {
  await git(cwd, ['restore', '--staged', '--', ...filePaths])
}

async function gitStageAll(cwd: string): Promise<void> {
  await git(cwd, ['add', '-A'])
}

async function gitUnstageAll(cwd: string): Promise<void> {
  await git(cwd, ['reset', 'HEAD'])
}

async function gitDiscard(cwd: string, filePaths: string[]): Promise<void> {
  // Separate tracked and untracked files
  const statusOutput = await git(cwd, ['status', '--porcelain=v1', '--', ...filePaths])
  const tracked: string[] = []
  const untracked: string[] = []

  for (const line of statusOutput.split('\n')) {
    if (line.length < 3) continue
    const path = line.slice(3).replace(/ -> .+$/, '')
    if (line.startsWith('??')) {
      untracked.push(path)
    } else {
      tracked.push(path)
    }
  }

  if (tracked.length > 0) {
    await git(cwd, ['checkout', '--', ...tracked])
  }
  for (const path of untracked) {
    try {
      const fullPath = join(cwd, path)
      const stat = statSync(fullPath)
      if (stat.isFile()) {
        unlinkSync(fullPath)
      }
    } catch {
      // File may already be gone
    }
  }
}

async function gitDiscardAll(cwd: string): Promise<void> {
  await git(cwd, ['checkout', '--', '.'])
  await git(cwd, ['clean', '-fd'])
}

async function gitCommit(cwd: string, message: string, amend: boolean): Promise<void> {
  const args = ['commit', '-m', message]
  if (amend) args.push('--amend')
  await git(cwd, args)
}

async function gitCheckout(cwd: string, branch: string): Promise<void> {
  await git(cwd, ['checkout', branch])
}

async function gitListBranches(cwd: string): Promise<string[]> {
  const output = await git(cwd, ['branch', '--format=%(refname:short)'])
  return output
    .split('\n')
    .map((s) => s.trim())
    .filter(Boolean)
}

async function gitPush(cwd: string): Promise<string> {
  return git(cwd, ['push'])
}

async function gitPublishBranch(cwd: string, branch: string): Promise<string> {
  return git(cwd, ['push', '-u', 'origin', branch])
}

async function gitPull(cwd: string): Promise<string> {
  return git(cwd, ['pull'])
}

async function gitStash(cwd: string, message?: string): Promise<void> {
  const args = ['stash', 'push']
  if (message) args.push('-m', message)
  await git(cwd, args)
}

async function gitStashPop(cwd: string): Promise<void> {
  await git(cwd, ['stash', 'pop'])
}

async function gitLog(cwd: string, count: number): Promise<GitLogEntry[]> {
  const output = await git(cwd, ['log', `--max-count=${count}`, '--format=%H%n%s'])

  if (!output.trim()) return []

  const lines = output.trim().split('\n')
  const entries: GitLogEntry[] = []

  for (let i = 0; i + 1 < lines.length; i += 2) {
    entries.push({
      hash: lines[i],
      message: lines[i + 1]
    })
  }

  return entries
}

export function registerGitHandlers(): void {
  ipcMain.handle('git:status', (event, cwd: string) => {
    requireAllowedDirectory(event.sender, cwd)
    return gitStatus(cwd)
  })

  ipcMain.handle('git:branch-info', (event, cwd: string) => {
    requireAllowedDirectory(event.sender, cwd)
    return gitBranchInfo(cwd)
  })

  ipcMain.handle('git:diff', (event, cwd: string, filePath: string, staged: boolean) => {
    requireAllowedDirectory(event.sender, cwd)
    return gitDiff(cwd, filePath, staged)
  })

  ipcMain.handle('git:show-file', (event, cwd: string, filePath: string) => {
    requireAllowedDirectory(event.sender, cwd)
    return gitShowFile(cwd, filePath)
  })

  ipcMain.handle('git:show-staged-file', (event, cwd: string, filePath: string) => {
    requireAllowedDirectory(event.sender, cwd)
    return gitShowStagedFile(cwd, filePath)
  })

  ipcMain.handle('git:stage', (event, cwd: string, filePaths: string[]) => {
    requireAllowedDirectory(event.sender, cwd)
    return gitStage(cwd, filePaths)
  })

  ipcMain.handle('git:unstage', (event, cwd: string, filePaths: string[]) => {
    requireAllowedDirectory(event.sender, cwd)
    return gitUnstage(cwd, filePaths)
  })

  ipcMain.handle('git:stage-all', (event, cwd: string) => {
    requireAllowedDirectory(event.sender, cwd)
    return gitStageAll(cwd)
  })

  ipcMain.handle('git:unstage-all', (event, cwd: string) => {
    requireAllowedDirectory(event.sender, cwd)
    return gitUnstageAll(cwd)
  })

  ipcMain.handle('git:discard', (event, cwd: string, filePaths: string[]) => {
    requireAllowedDirectory(event.sender, cwd)
    return gitDiscard(cwd, filePaths)
  })

  ipcMain.handle('git:discard-all', (event, cwd: string) => {
    requireAllowedDirectory(event.sender, cwd)
    return gitDiscardAll(cwd)
  })

  ipcMain.handle('git:commit', (event, cwd: string, message: string, amend?: boolean) => {
    requireAllowedDirectory(event.sender, cwd)
    return gitCommit(cwd, message, amend ?? false)
  })

  ipcMain.handle('git:checkout', (event, cwd: string, branch: string) => {
    requireAllowedDirectory(event.sender, cwd)
    return gitCheckout(cwd, branch)
  })

  ipcMain.handle('git:list-branches', (event, cwd: string) => {
    requireAllowedDirectory(event.sender, cwd)
    return gitListBranches(cwd)
  })

  ipcMain.handle('git:push', (event, cwd: string) => {
    requireAllowedDirectory(event.sender, cwd)
    return gitPush(cwd)
  })

  ipcMain.handle('git:publish-branch', (event, cwd: string, branch: string) => {
    requireAllowedDirectory(event.sender, cwd)
    return gitPublishBranch(cwd, branch)
  })

  ipcMain.handle('git:pull', (event, cwd: string) => {
    requireAllowedDirectory(event.sender, cwd)
    return gitPull(cwd)
  })

  ipcMain.handle('git:stash', (event, cwd: string, message?: string) => {
    requireAllowedDirectory(event.sender, cwd)
    return gitStash(cwd, message)
  })

  ipcMain.handle('git:stash-pop', (event, cwd: string) => {
    requireAllowedDirectory(event.sender, cwd)
    return gitStashPop(cwd)
  })

  ipcMain.handle('git:log', (event, cwd: string, count?: number) => {
    requireAllowedDirectory(event.sender, cwd)
    return gitLog(cwd, count ?? 20)
  })
}
