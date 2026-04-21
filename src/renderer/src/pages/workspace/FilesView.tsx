import { Fragment } from 'react'
import { useQuery } from '@tanstack/react-query'
import { ChevronRight } from 'lucide-react'
import { File, type FileContents } from '@pierre/diffs/react'
import { cn } from '../../lib/cn'
import { useTheme } from '../../hooks/useTheme'
import { BASE_CODE_OPTIONS, getLanguageFromPath } from '../../lib/diffs'

interface FilesViewProps {
  filePath: string
  folderPath: string
}

export default function FilesView({ filePath, folderPath }: FilesViewProps) {
  const { theme } = useTheme()
  const {
    data: fileContents,
    isLoading,
    error
  } = useQuery<string, Error>({
    queryKey: ['read-file', filePath],
    queryFn: () => window.api.fs.readFile(filePath),
    retry: false
  })

  const relativePath = getRelativePath(filePath, folderPath)
  const segments = relativePath.split('/')

  const file: FileContents = {
    name: filePath,
    contents: fileContents ?? '',
    lang: getLanguageFromPath(filePath)
  }

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="border-border bg-surface flex items-center gap-1.5 border-b px-4 py-2">
        {segments.map((segment, i) => (
          <Fragment key={i}>
            {i > 0 && <ChevronRight size={12} className="text-foreground-subtle shrink-0" />}
            <span className={cn('text-sm', i === segments.length - 1 ? 'text-foreground' : 'text-foreground-muted')}>
              {segment}
            </span>
          </Fragment>
        ))}
      </div>

      <div className="bg-background min-h-0 flex-1 overflow-auto">
        {isLoading ? null : error ? (
          <div className="px-4 py-6">
            <p className="text-foreground text-sm font-medium">File unavailable</p>
            <p className="text-foreground-muted mt-1 text-sm">{error.message}</p>
          </div>
        ) : (
          <File file={file} options={{ ...BASE_CODE_OPTIONS, themeType: theme, disableFileHeader: true }} />
        )}
      </div>
    </div>
  )
}

function getRelativePath(filePath: string, folderPath: string): string {
  if (filePath.startsWith(folderPath)) {
    const relative = filePath.slice(folderPath.length)
    return relative.startsWith('/') ? relative.slice(1) : relative
  }
  return filePath
}
