import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { ChevronRight, File, Folder } from 'lucide-react'
import { cn } from '../lib/cn'
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
        <p className="text-[10px] font-semibold uppercase tracking-wider text-foreground-muted">Explorer</p>
      </div>
      <div className="px-4 pb-2">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-foreground-muted">
          {getPathBasename(folderPath)}
        </p>
      </div>
      <div className="flex-1 overflow-y-auto">
        <FolderTree dirPath={folderPath} depth={0} selectedFilePath={selectedFilePath} onSelectFile={onSelectFile} />
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
  const {
    data: entries,
    isLoading,
    error
  } = useQuery({
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
            className={cn(
              'flex w-full items-center gap-1.5 py-[3px] pr-2 text-left text-xs transition-colors hover:bg-surface-hover',
              selectedFilePath === entry.path ? 'bg-surface-hover text-foreground' : 'text-foreground-muted'
            )}
            style={{ paddingLeft: depth * 12 + 16 }}
          >
            <File size={14} className="shrink-0 text-foreground-subtle" />
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
        <ChevronRight
          size={12}
          className={cn('shrink-0 text-foreground-subtle transition-transform', open && 'rotate-90')}
        />
        <Folder size={14} className="shrink-0 text-accent" />
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
