import { useQuery } from '@tanstack/react-query'
import { getPathBasename } from '../../lib/path'
import PlaceholderView from './PlaceholderView'

interface FilesViewProps {
  folderPath: string
  selectedFilePath: string | null
}

export default function FilesView({ folderPath, selectedFilePath }: FilesViewProps) {
  const {
    data: fileContents,
    isLoading,
    error
  } = useQuery<string, Error>({
    queryKey: ['read-file', selectedFilePath],
    queryFn: () => window.api.fs.readFile(selectedFilePath!),
    enabled: selectedFilePath !== null,
    retry: false
  })

  if (!selectedFilePath) {
    return (
      <PlaceholderView
        title="Files"
        description={`Choose a file from ${getPathBasename(folderPath)} to open it in the workspace.`}
      />
    )
  }

  if (isLoading) {
    return <p className="text-sm text-foreground-muted">Loading file...</p>
  }

  if (error) {
    return (
      <div className="max-w-xl rounded-lg border border-border bg-surface p-4">
        <h2 className="text-sm font-semibold text-foreground">File unavailable</h2>
        <p className="mt-2 text-sm text-foreground-muted">{error.message}</p>
      </div>
    )
  }

  return (
    <div className="overflow-hidden rounded-xl border border-border bg-surface">
      <div className="border-b border-border px-4 py-3">
        <p className="text-sm font-medium text-foreground">{getPathBasename(selectedFilePath)}</p>
        <p className="truncate text-xs text-foreground-subtle">{selectedFilePath}</p>
      </div>
      <pre className="overflow-x-auto p-4 text-sm leading-6 text-foreground">
        <code>{fileContents}</code>
      </pre>
    </div>
  )
}
