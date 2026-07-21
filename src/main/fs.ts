import { ipcMain, dialog, app, BrowserWindow, type WebContents } from 'electron'
import { dirname, join, relative, resolve, isAbsolute } from 'path'
import { readdirSync, statSync, readFileSync, writeFileSync, existsSync, realpathSync, watch, type FSWatcher } from 'fs'
import type {
  FileEntry,
  GitRepoInfo,
  SearchFileResult,
  SearchMatch,
  SearchOptions,
  SearchResults
} from '../shared/types'

const allowedRoots = new Map<number, string>()

interface FileWatcherEntry {
  watcher: FSWatcher
  refCount: number
  debounce: NodeJS.Timeout | null
}

const fileWatchersByWebContents = new WeakMap<WebContents, Map<string, FileWatcherEntry>>()

function getRecentPath(): string {
  return join(app.getPath('userData'), 'recent-folders.json')
}

function isExistingDirectory(dirPath: string): boolean {
  try {
    return statSync(dirPath).isDirectory()
  } catch {
    return false
  }
}

function loadRecentFolders(): string[] {
  const p = getRecentPath()
  if (!existsSync(p)) return []
  try {
    const recentFolders = JSON.parse(readFileSync(p, 'utf-8')) as unknown
    if (!Array.isArray(recentFolders)) {
      return []
    }

    const validRecentFolders = recentFolders.filter(
      (folderPath): folderPath is string => typeof folderPath === 'string' && isExistingDirectory(folderPath)
    )

    if (validRecentFolders.length !== recentFolders.length) {
      writeFileSync(p, JSON.stringify(validRecentFolders))
    }

    return validRecentFolders
  } catch {
    return []
  }
}

function addRecentFolder(folderPath: string): string[] {
  const recent = loadRecentFolders().filter((f) => f !== folderPath)
  recent.unshift(folderPath)
  const trimmed = recent.slice(0, 10)
  writeFileSync(getRecentPath(), JSON.stringify(trimmed))
  return trimmed
}

function removeRecentFolder(folderPath: string): string[] {
  const recent = loadRecentFolders().filter((f) => f !== folderPath)
  writeFileSync(getRecentPath(), JSON.stringify(recent))
  return recent
}

function resolveExistingPath(targetPath: string): string {
  return realpathSync(resolve(targetPath))
}

function resolveExistingDirectory(dirPath: string): string {
  const resolvedPath = resolveExistingPath(dirPath)
  if (!statSync(resolvedPath).isDirectory()) {
    throw new Error('Path is not a directory')
  }
  return resolvedPath
}

function setAllowedRoot(sender: WebContents, folderPath: string): string {
  const shouldAttachCleanup = !allowedRoots.has(sender.id)
  const resolvedFolderPath = resolveExistingDirectory(folderPath)

  allowedRoots.set(sender.id, resolvedFolderPath)

  if (shouldAttachCleanup) {
    sender.once('destroyed', () => {
      allowedRoots.delete(sender.id)
    })
  }

  return resolvedFolderPath
}

export function requireAllowedPath(sender: WebContents, targetPath: string): string {
  const rootPath = allowedRoots.get(sender.id)
  if (!rootPath) {
    throw new Error('Open a folder before browsing files')
  }

  const resolvedPath = resolveExistingPath(targetPath)
  const pathFromRoot = relative(rootPath, resolvedPath)
  const isInsideRoot = pathFromRoot === '' || (!pathFromRoot.startsWith('..') && !isAbsolute(pathFromRoot))

  if (!isInsideRoot) {
    throw new Error('Access denied for a path outside the opened folder')
  }

  return resolvedPath
}

export function requireAllowedDirectory(sender: WebContents, dirPath: string): string {
  const resolvedPath = requireAllowedPath(sender, dirPath)
  if (!statSync(resolvedPath).isDirectory()) {
    throw new Error('Path is not a directory')
  }
  return resolvedPath
}

function requireAllowedFile(sender: WebContents, filePath: string): string {
  const resolvedPath = requireAllowedPath(sender, filePath)
  if (!statSync(resolvedPath).isFile()) {
    throw new Error('Path is not a file')
  }
  return resolvedPath
}

const SKIP_DIRS = new Set([
  'node_modules',
  '.git',
  'dist',
  'out',
  'build',
  '.next',
  '__pycache__',
  '.venv',
  'vendor',
  'coverage',
  '.cache',
  '.turbo',
  '.nuxt',
  '.output',
  '.svelte-kit',
  'target',
  '.gradle',
  '.idea',
  '.vscode'
])

const MAX_RECURSIVE_ENTRIES = 50_000

function readDirectoryRecursive(rootPath: string): string[] {
  const results: string[] = []

  function walk(dirPath: string): void {
    if (results.length >= MAX_RECURSIVE_ENTRIES) return

    let entries: string[]
    try {
      entries = readdirSync(dirPath)
    } catch {
      return
    }

    for (const name of entries) {
      if (results.length >= MAX_RECURSIVE_ENTRIES) return
      if (name.startsWith('.')) continue

      const fullPath = join(dirPath, name)
      try {
        const stat = statSync(fullPath)
        if (stat.isDirectory()) {
          if (!SKIP_DIRS.has(name)) {
            walk(fullPath)
          }
        } else {
          results.push(relative(rootPath, fullPath))
        }
      } catch {
        // Skip entries we can't stat
      }
    }
  }

  walk(rootPath)
  return results
}

const SEARCH_BINARY_EXTENSIONS = new Set([
  'png',
  'jpg',
  'jpeg',
  'gif',
  'webp',
  'bmp',
  'ico',
  'svg',
  'avif',
  'mp3',
  'mp4',
  'wav',
  'avi',
  'mov',
  'mkv',
  'flac',
  'ogg',
  'webm',
  'zip',
  'tar',
  'gz',
  'tgz',
  'rar',
  '7z',
  'bz2',
  'xz',
  'pdf',
  'doc',
  'docx',
  'xls',
  'xlsx',
  'ppt',
  'pptx',
  'exe',
  'dll',
  'so',
  'dylib',
  'wasm',
  'bin',
  'o',
  'a',
  'class',
  'jar',
  'ttf',
  'otf',
  'woff',
  'woff2',
  'eot',
  'node'
])

const SEARCH_MAX_FILES = 5000
const SEARCH_MAX_RESULTS = 2000
const SEARCH_MAX_MATCHES_PER_FILE = 100
const SEARCH_MAX_FILE_BYTES = 1_000_000
const SEARCH_MAX_LINE_LENGTH = 1000

function buildSearchRegex(query: string, options: SearchOptions): RegExp | null {
  const escaped = options.isRegex ? query : query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const pattern = options.wholeWord ? `\\b${escaped}\\b` : escaped
  try {
    return new RegExp(pattern, options.caseSensitive ? 'g' : 'gi')
  } catch {
    return null
  }
}

function searchLine(lineText: string, lineNumber: number, regex: RegExp): SearchMatch[] {
  const matches: SearchMatch[] = []
  regex.lastIndex = 0
  let match: RegExpExecArray | null
  while ((match = regex.exec(lineText)) !== null && matches.length < SEARCH_MAX_MATCHES_PER_FILE) {
    matches.push({ line: lineNumber, text: lineText, matchStart: match.index, matchLength: match[0].length })
    // Guard against zero-width matches looping forever (e.g. `a*`).
    if (match.index === regex.lastIndex) regex.lastIndex++
  }
  return matches
}

function searchFileContents(content: string, regex: RegExp): SearchMatch[] {
  const matches: SearchMatch[] = []
  const lines = content.split('\n')
  for (let i = 0; i < lines.length && matches.length < SEARCH_MAX_MATCHES_PER_FILE; i++) {
    let line = lines[i]
    if (line.endsWith('\r')) line = line.slice(0, -1)
    if (line.length > SEARCH_MAX_LINE_LENGTH) line = line.slice(0, SEARCH_MAX_LINE_LENGTH)
    matches.push(...searchLine(line, i + 1, regex))
  }
  return matches.slice(0, SEARCH_MAX_MATCHES_PER_FILE)
}

function searchDirectory(rootPath: string, query: string, options: SearchOptions): SearchResults {
  const regex = buildSearchRegex(query, options)
  if (!regex) {
    return { files: [], totalMatches: 0, truncated: false, invalidRegex: true }
  }

  const files: SearchFileResult[] = []
  let totalMatches = 0
  let filesScanned = 0
  let truncated = false

  function walk(dirPath: string, re: RegExp): void {
    if (truncated) return

    let entries: string[]
    try {
      entries = readdirSync(dirPath)
    } catch {
      return
    }

    for (const name of entries) {
      if (truncated) return
      if (name.startsWith('.')) continue

      const fullPath = join(dirPath, name)
      let stat: ReturnType<typeof statSync>
      try {
        stat = statSync(fullPath)
      } catch {
        continue
      }

      if (stat.isDirectory()) {
        if (!SKIP_DIRS.has(name)) walk(fullPath, re)
        continue
      }

      const ext = name.split('.').pop()?.toLowerCase() ?? ''
      if (SEARCH_BINARY_EXTENSIONS.has(ext) || stat.size > SEARCH_MAX_FILE_BYTES) continue

      if (++filesScanned > SEARCH_MAX_FILES) {
        truncated = true
        return
      }

      let content: string
      try {
        content = readFileSync(fullPath, 'utf-8')
      } catch {
        continue
      }
      if (content.includes('\u0000')) continue // binary file slipped past the extension filter

      const matches = searchFileContents(content, re)
      if (matches.length === 0) continue

      files.push({ path: relative(rootPath, fullPath), matches })
      totalMatches += matches.length
      if (totalMatches >= SEARCH_MAX_RESULTS) {
        truncated = true
        return
      }
    }
  }

  walk(rootPath, regex)
  return { files, totalMatches, truncated, invalidRegex: false }
}

function readDirectory(dirPath: string): FileEntry[] {
  try {
    const entries = readdirSync(dirPath)
    return entries
      .filter((name) => !name.startsWith('.'))
      .map((name) => {
        const fullPath = join(dirPath, name)
        try {
          const stat = statSync(fullPath)
          return { name, path: fullPath, isDirectory: stat.isDirectory() }
        } catch {
          return { name, path: fullPath, isDirectory: false }
        }
      })
      .sort((a, b) => {
        if (a.isDirectory !== b.isDirectory) return a.isDirectory ? -1 : 1
        return a.name.localeCompare(b.name)
      })
  } catch {
    throw new Error('Unable to read this folder. It may have been moved, deleted, or permissions may have changed.')
  }
}

// Locate the git config holding the remote URLs, starting at `dirPath` and
// walking up — git commands work from subdirectories, so the opened folder is
// often below the repo root. When `.git` is a pointer file (linked worktrees,
// submodules) the `gitdir:` reference is followed, and for linked worktrees
// the `commondir` file leads back to the shared .git directory that owns the
// config.
function findGitConfigPath(dirPath: string): string | null {
  let current = resolve(dirPath)
  while (true) {
    const dotGit = join(current, '.git')
    if (existsSync(dotGit)) {
      if (statSync(dotGit).isDirectory()) return join(dotGit, 'config')
      const pointer = readFileSync(dotGit, 'utf-8').match(/^gitdir:\s*(.+)$/m)
      if (!pointer) return null
      const gitDir = resolve(current, pointer[1].trim())
      const commonDirFile = join(gitDir, 'commondir')
      if (existsSync(commonDirFile)) {
        return join(resolve(gitDir, readFileSync(commonDirFile, 'utf-8').trim()), 'config')
      }
      return join(gitDir, 'config')
    }
    const parent = dirname(current)
    if (parent === current) return null
    current = parent
  }
}

function getGitRepoInfo(dirPath: string): GitRepoInfo | null {
  const configPath = findGitConfigPath(dirPath)
  if (!configPath || !existsSync(configPath)) return null
  const config = readFileSync(configPath, 'utf-8')
  // Repo names may contain dots (next.js), so only a literal trailing `.git`
  // is stripped; https, scp-style, and ssh:// GitHub remotes all match.
  const match = config.match(
    /url\s*=\s*(?:https?:\/\/github\.com\/|git@github\.com:|ssh:\/\/git@github\.com\/)([^/\s]+)\/([^/\s]+?)(?:\.git)?\/?\s*$/m
  )
  if (!match) return null
  return { owner: match[1], repo: match[2] }
}

export function registerFsHandlers(): void {
  ipcMain.handle('fs:open-folder', async (event) => {
    const window = BrowserWindow.fromWebContents(event.sender)
    const result = await dialog.showOpenDialog(window!, {
      properties: ['openDirectory']
    })
    if (result.canceled || result.filePaths.length === 0) return null
    const folderPath = setAllowedRoot(event.sender, result.filePaths[0])
    addRecentFolder(folderPath)
    return folderPath
  })

  ipcMain.handle('fs:read-dir', (event, dirPath: string) => {
    return readDirectory(requireAllowedDirectory(event.sender, dirPath))
  })

  ipcMain.handle('fs:read-dir-recursive', (event, dirPath: string) => {
    return readDirectoryRecursive(requireAllowedDirectory(event.sender, dirPath))
  })

  ipcMain.handle(
    'fs:search-in-files',
    (event, dirPath: string, query: string, options: SearchOptions): SearchResults => {
      const root = requireAllowedDirectory(event.sender, dirPath)
      if (query.trim().length === 0) {
        return { files: [], totalMatches: 0, truncated: false, invalidRegex: false }
      }
      return searchDirectory(root, query, options ?? {})
    }
  )

  ipcMain.handle('fs:read-file', (event, filePath: string) => {
    try {
      return readFileSync(requireAllowedFile(event.sender, filePath), 'utf-8')
    } catch {
      throw new Error('Unable to read this file. It may have changed or is not readable as text.')
    }
  })

  ipcMain.handle('fs:write-file', (event, filePath: string, content: string) => {
    writeFileSync(requireAllowedFile(event.sender, filePath), content, 'utf-8')
  })

  // Watch a single file for changes. Each renderer keeps its own per-path
  // watcher; on `change` we send `fs:file-changed` back so the renderer can
  // refetch. This is the source of truth for "file content on disk has
  // changed" — works for any editor (Claude, the user's terminal, git
  // operations) without us having to enumerate change sources.
  ipcMain.handle('fs:watch-file', (event, filePath: string) => {
    const sender = event.sender
    const resolved = requireAllowedFile(sender, filePath)
    let map = fileWatchersByWebContents.get(sender)
    if (!map) {
      map = new Map()
      fileWatchersByWebContents.set(sender, map)
      sender.once('destroyed', () => {
        const m = fileWatchersByWebContents.get(sender)
        if (!m) return
        for (const w of m.values()) w.watcher.close()
        fileWatchersByWebContents.delete(sender)
      })
    }
    const existing = map.get(resolved)
    if (existing) {
      existing.refCount += 1
      return
    }
    // Editors that save atomically (vim, VS Code) replace the file via
    // rename, which leaves the watch bound to a dead inode — re-arm on the
    // path when that happens. The error listener matters too: an FSWatcher
    // error with no listener is an uncaught exception in the main process.
    const armWatcher = (): FSWatcher => {
      const watcher = watch(resolved, (eventType) => {
        const entry = map!.get(resolved)
        if (!entry) return
        if (eventType === 'rename') {
          entry.watcher.close()
          try {
            entry.watcher = armWatcher()
          } catch {
            // The replacement isn't on disk (yet); the entry stays so unwatch
            // still cleans up.
            return
          }
        }
        // Coalesce rapid bursts (some editors emit several `change` events
        // for one save). 50 ms is below human perception but well above the
        // typical multi-event burst.
        if (entry.debounce !== null) clearTimeout(entry.debounce)
        entry.debounce = setTimeout(() => {
          entry.debounce = null
          if (sender.isDestroyed()) return
          sender.send('fs:file-changed', resolved)
        }, 50)
      })
      watcher.on('error', (err) => {
        console.error(`[fs] watcher error for ${resolved}:`, err)
      })
      return watcher
    }
    map.set(resolved, { watcher: armWatcher(), refCount: 1, debounce: null })
  })

  ipcMain.handle('fs:unwatch-file', (event, filePath: string) => {
    const sender = event.sender
    const map = fileWatchersByWebContents.get(sender)
    if (!map) return
    // Resolve leniently: requireAllowedFile realpaths, which throws once the
    // file is deleted — and would leak the watcher forever. The lookup only
    // reaches this sender's own watchers, so the sandbox check isn't
    // load-bearing here.
    let resolved = filePath
    try {
      resolved = requireAllowedFile(sender, filePath)
    } catch {
      // Fall through with the raw path; renderer paths are already resolved.
    }
    const entry = map.get(resolved)
    if (!entry) return
    entry.refCount -= 1
    if (entry.refCount > 0) return
    if (entry.debounce !== null) clearTimeout(entry.debounce)
    entry.watcher.close()
    map.delete(resolved)
  })

  ipcMain.handle('fs:get-recent-folders', () => {
    return loadRecentFolders()
  })

  ipcMain.handle('fs:open-recent', (event, folderPath: string) => {
    try {
      const resolvedFolderPath = setAllowedRoot(event.sender, folderPath)
      addRecentFolder(resolvedFolderPath)
      return resolvedFolderPath
    } catch {
      removeRecentFolder(folderPath)
      throw new Error('This recent folder is no longer available and has been removed from the list.')
    }
  })

  ipcMain.handle('fs:get-git-info', (event, dirPath: string) => {
    return getGitRepoInfo(requireAllowedDirectory(event.sender, dirPath))
  })

  ipcMain.handle('fs:pick-files', async (event) => {
    const window = BrowserWindow.fromWebContents(event.sender)
    const result = await dialog.showOpenDialog(window!, {
      properties: ['openFile', 'multiSelections']
    })
    if (result.canceled) return []
    return result.filePaths
  })

  ipcMain.handle('fs:read-file-data-url', (event, filePath: string) => {
    const resolved = requireAllowedFile(event.sender, filePath)
    const ext = filePath.split('.').pop()?.toLowerCase() ?? ''
    const mimeTypes: Record<string, string> = {
      png: 'image/png',
      jpg: 'image/jpeg',
      jpeg: 'image/jpeg',
      gif: 'image/gif',
      webp: 'image/webp',
      svg: 'image/svg+xml',
      bmp: 'image/bmp',
      ico: 'image/x-icon'
    }
    const mime = mimeTypes[ext] ?? 'application/octet-stream'
    const data = readFileSync(resolved)
    return `data:${mime};base64,${data.toString('base64')}`
  })
}
