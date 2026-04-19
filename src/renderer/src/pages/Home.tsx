import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { FolderOpen } from 'lucide-react'
import { getPathBasename } from '../lib/path'
import AsciiArt from '../components/AsciiArt'

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
        error instanceof Error ? error.message : 'This recent folder could not be opened and was removed from the list.'

      setRecentFolderError(message)
      await queryClient.invalidateQueries({ queryKey: ['recent-folders'] })
    }
  }

  return (
    <div className="flex min-h-full flex-1 items-center justify-center px-6 py-12">
      <div className="flex w-full max-w-md flex-col items-center gap-8">
        <AsciiArt className="size-32" />

        <div className="flex flex-col items-center gap-1.5 text-center">
          <h1 className="text-foreground text-2xl font-semibold tracking-tight">Welcome to Drafthouse</h1>
          <p className="text-foreground-muted text-sm">Open a folder to get started</p>
        </div>

        <button
          onClick={handleOpen}
          className="border-border bg-interactive hover:bg-interactive-hover text-foreground inline-flex items-center gap-2 rounded-lg border px-4 py-2 text-sm font-medium transition-colors"
        >
          <FolderOpen size={14} />
          Open Folder
        </button>

        {recentFolderError ? (
          <div className="border-danger/30 bg-danger/5 w-full rounded-lg border px-3 py-2">
            <p className="text-foreground-muted text-xs">{recentFolderError}</p>
          </div>
        ) : null}

        {recentFolders && recentFolders.length > 0 ? (
          <div className="w-full">
            <h2 className="text-foreground-subtle mb-2 text-[11px] font-semibold tracking-wider uppercase">Recent</h2>
            <ul className="-mx-2 flex flex-col">
              {recentFolders.map((folder) => (
                <li key={folder}>
                  <button
                    onClick={() => handleOpenRecent(folder)}
                    className="hover:bg-surface-hover flex w-full flex-col gap-0.5 rounded-md px-2 py-1.5 text-left transition-colors"
                  >
                    <span className="text-foreground text-sm font-medium">{getPathBasename(folder)}</span>
                    <span className="text-foreground-subtle truncate text-xs">{folder}</span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </div>
    </div>
  )
}
