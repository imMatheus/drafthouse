import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { getPathBasename } from '../lib/path'

export default function Home({ onOpenFolder }: { onOpenFolder: (path: string) => void }) {
  const [recentFolderError, setRecentFolderError] = useState<string | null>(null)
  const queryClient = useQueryClient()
  const { data: recentFolders } = useQuery({
    queryKey: ['recent-folders'],
    queryFn: () => window.api.fs.getRecentFolders()
  })

  const handleOpen = async () => {
    const path = await window.api.fs.openFolder()
    if (path) {
      setRecentFolderError(null)
      onOpenFolder(path)
    }
  }

  const handleOpenRecent = async (path: string) => {
    try {
      const openedPath = await window.api.fs.openRecent(path)
      setRecentFolderError(null)
      onOpenFolder(openedPath)
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : 'This recent folder could not be opened and was removed from the list.'

      setRecentFolderError(message)
      await queryClient.invalidateQueries({ queryKey: ['recent-folders'] })
    }
  }

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-8 p-8">
      <div className="flex flex-col items-center gap-2">
        <h1 className="text-3xl font-bold text-foreground">Welcome to Drafthouse</h1>
        <p className="text-sm text-foreground-muted">Open a folder to get started</p>
      </div>

      <button
        onClick={handleOpen}
        className="rounded-lg bg-accent px-5 py-2.5 font-medium text-foreground hover:bg-accent-hover"
      >
        Open Folder
      </button>

      {recentFolderError && (
        <div className="w-full max-w-sm rounded-lg border border-border bg-surface px-4 py-3">
          <p className="text-sm text-foreground-muted">{recentFolderError}</p>
        </div>
      )}

      {recentFolders && recentFolders.length > 0 && (
        <div className="w-full max-w-sm">
          <h2 className="mb-3 text-xs font-medium text-foreground-muted">Recent</h2>
          <ul className="flex flex-col gap-0.5">
            {recentFolders.map((folder) => (
              <li key={folder}>
                <button
                  onClick={() => handleOpenRecent(folder)}
                  className="flex w-full flex-col rounded-md px-3 py-2 text-left transition-colors hover:bg-surface-hover"
                >
                  <span className="text-sm text-foreground">{getPathBasename(folder)}</span>
                  <span className="truncate text-xs text-foreground-subtle">{folder}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
