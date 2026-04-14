import { ipcMain, dialog, app, BrowserWindow, type WebContents } from 'electron'
import { join, relative, resolve, isAbsolute } from 'path'
import { readdirSync, statSync, readFileSync, writeFileSync, existsSync, realpathSync } from 'fs'
import type { FileEntry, GitRepoInfo } from '../shared/types'

const allowedRoots = new Map<number, string>()

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

function requireAllowedPath(sender: WebContents, targetPath: string): string {
  const rootPath = allowedRoots.get(sender.id)
  if (!rootPath) {
    throw new Error('Open a folder before browsing files')
  }

  const resolvedPath = resolveExistingPath(targetPath)
  const pathFromRoot = relative(rootPath, resolvedPath)
  const isInsideRoot =
    pathFromRoot === '' || (!pathFromRoot.startsWith('..') && !isAbsolute(pathFromRoot))

  if (!isInsideRoot) {
    throw new Error('Access denied for a path outside the opened folder')
  }

  return resolvedPath
}

function requireAllowedDirectory(sender: WebContents, dirPath: string): string {
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

function getGitRepoInfo(dirPath: string): GitRepoInfo | null {
  const configPath = join(dirPath, '.git', 'config')
  if (!existsSync(configPath)) return null
  const config = readFileSync(configPath, 'utf-8')
  const match = config.match(/url\s*=\s*(?:https?:\/\/github\.com\/|git@github\.com:)([^/]+)\/([^/\s.]+?)(?:\.git)?\s*$/m)
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

  ipcMain.handle('fs:read-file', (event, filePath: string) => {
    try {
      return readFileSync(requireAllowedFile(event.sender, filePath), 'utf-8')
    } catch {
      throw new Error('Unable to read this file. It may have changed or is not readable as text.')
    }
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

  ipcMain.handle('fs:read-file-data-url', (_event, filePath: string) => {
    const ext = filePath.split('.').pop()?.toLowerCase() ?? ''
    const mimeTypes: Record<string, string> = {
      png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg',
      gif: 'image/gif', webp: 'image/webp', svg: 'image/svg+xml',
      bmp: 'image/bmp', ico: 'image/x-icon'
    }
    const mime = mimeTypes[ext] ?? 'application/octet-stream'
    const data = readFileSync(filePath)
    return `data:${mime};base64,${data.toString('base64')}`
  })
}
