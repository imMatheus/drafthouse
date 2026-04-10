import { useQuery } from '@tanstack/react-query'
import { getPathBasename } from '../../lib/path'

interface FilesViewProps {
  filePath: string
}

export default function FilesView({ filePath }: FilesViewProps) {
  const {
    data: fileContents,
    isLoading,
    error
  } = useQuery<string, Error>({
    queryKey: ['read-file', filePath],
    queryFn: () => window.api.fs.readFile(filePath),
    retry: false
  })

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
        <p className="text-sm font-medium text-foreground">{getPathBasename(filePath)}</p>
        <p className="truncate text-xs text-foreground-subtle">{filePath}</p>
      </div>
      <pre className="overflow-x-auto p-4 text-sm leading-6 text-foreground">
        <code>{fileContents}</code>
      </pre>
    </div>
  )
}
