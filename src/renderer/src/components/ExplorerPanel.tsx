import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { getPathBasename } from '../lib/path'

export default function ExplorerPanel({
  folderPath,
  selectedFilePath,
  onSelectFile
}: {
  folderPath: string
  selectedFilePath: string | null
  onSelectFile: (path: string) => void
}) {
  return (
    <div className="flex h-screen w-60 shrink-0 flex-col border-r border-border bg-surface">
      <div className="px-4 py-3">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-foreground-muted">
          Explorer
        </p>
      </div>
      <div className="px-4 pb-2">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-foreground-muted">
          {getPathBasename(folderPath)}
        </p>
      </div>
      <div className="flex-1 overflow-y-auto">
        <FolderTree
          dirPath={folderPath}
          depth={0}
          selectedFilePath={selectedFilePath}
          onSelectFile={onSelectFile}
        />
      </div>
    </div>
  )
}

function FolderTree({
  dirPath,
  depth,
  selectedFilePath,
  onSelectFile
}: {
  dirPath: string
  depth: number
  selectedFilePath: string | null
  onSelectFile: (path: string) => void
}) {
  const { data: entries, isLoading, error } = useQuery({
    queryKey: ['read-dir', dirPath],
    queryFn: () => window.api.fs.readDir(dirPath),
    retry: false
  })

  if (isLoading) {
    return (
      <p className="py-1 text-xs text-foreground-subtle" style={{ paddingLeft: depth * 12 + 16 }}>
        ...
      </p>
    )
  }

  if (error) {
    const message =
      error instanceof Error
        ? error.message
        : 'Unable to read this folder. It may have been moved or permissions may have changed.'

    return (
      <p className="py-1 pr-3 text-xs text-foreground-subtle" style={{ paddingLeft: depth * 12 + 16 }}>
        {message}
      </p>
    )
  }

  return (
    <>
      {entries?.map((entry) =>
        entry.isDirectory ? (
          <FolderNode
            key={entry.path}
            entry={entry}
            depth={depth}
            selectedFilePath={selectedFilePath}
            onSelectFile={onSelectFile}
          />
        ) : (
          <button
            key={entry.path}
            onClick={() => onSelectFile(entry.path)}
            className={`flex w-full items-center gap-1.5 py-[3px] pr-2 text-left text-xs transition-colors hover:bg-surface-hover ${
              selectedFilePath === entry.path
                ? 'bg-surface-hover text-foreground'
                : 'text-foreground-muted'
            }`}
            style={{ paddingLeft: depth * 12 + 16 }}
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 text-foreground-subtle">
              <path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z" />
              <path d="M14 2v4a2 2 0 0 0 2 2h4" />
            </svg>
            <span className="truncate">{entry.name}</span>
          </button>
        )
      )}
    </>
  )
}

function FolderNode({
  entry,
  depth,
  selectedFilePath,
  onSelectFile
}: {
  entry: { name: string; path: string }
  depth: number
  selectedFilePath: string | null
  onSelectFile: (path: string) => void
}) {
  const [open, setOpen] = useState(false)

  return (
    <>
      <button
        onClick={() => setOpen(!open)}
        className="flex w-full items-center gap-1.5 py-[3px] pr-2 text-left text-xs text-foreground hover:bg-surface-hover"
        style={{ paddingLeft: depth * 12 + 8 }}
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="12"
          height="12"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className={`shrink-0 text-foreground-subtle transition-transform ${open ? 'rotate-90' : ''}`}
        >
          <path d="m9 18 6-6-6-6" />
        </svg>
        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 text-accent">
          <path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z" />
        </svg>
        <span className="truncate">{entry.name}</span>
      </button>
      {open && (
        <FolderTree
          dirPath={entry.path}
          depth={depth + 1}
          selectedFilePath={selectedFilePath}
          onSelectFile={onSelectFile}
        />
      )}
    </>
  )
}
