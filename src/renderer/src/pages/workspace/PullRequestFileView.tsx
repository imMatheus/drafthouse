import { Fragment } from 'react'
import { useQuery } from '@tanstack/react-query'
import { ChevronRight, GitPullRequest } from 'lucide-react'
import type { FileContents } from '@pierre/diffs'
import { cn } from '../../lib/cn'
import { useTheme } from '../../hooks/useTheme'
import { BASE_CODE_OPTIONS, getLanguageFromPath } from '../../lib/diffs'
import { FileCodeBlock } from '../../components/CodeViewBlock'
import { LoadingView } from '../../components/Loading'

interface PullRequestFileViewProps {
  owner: string
  repo: string
  number: number
  filePath: string
  gitRef: string
}

export default function PullRequestFileView({ owner, repo, number, filePath, gitRef }: PullRequestFileViewProps) {
  const { theme } = useTheme()
  const {
    data: fileContents,
    isLoading,
    error
  } = useQuery<string, Error>({
    queryKey: ['pull-request-file-content', owner, repo, number, filePath, gitRef],
    queryFn: () => window.api.github.repos.getContent(owner, repo, filePath, gitRef),
    retry: false
  })

  const segments = filePath.split('/').filter(Boolean)
  const file: FileContents = {
    name: filePath,
    contents: fileContents ?? '',
    lang: getLanguageFromPath(filePath)
  }

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="border-border bg-surface flex items-center gap-1.5 border-b px-4 py-2">
        <span className="bg-accent-bg text-accent inline-flex shrink-0 items-center gap-1 rounded px-1.5 py-0.5 text-xs font-medium tabular-nums">
          <GitPullRequest size={12} />
          PR #{number}
        </span>
        <span className="text-foreground-subtle shrink-0 text-xs tabular-nums">{gitRef.slice(0, 7)}</span>
        {segments.map((segment, i) => (
          <Fragment key={i}>
            <ChevronRight size={12} className="text-foreground-subtle shrink-0" />
            <span
              className={cn(
                'min-w-0 truncate text-sm',
                i === segments.length - 1 ? 'text-foreground' : 'text-foreground-muted'
              )}
            >
              {segment}
            </span>
          </Fragment>
        ))}
      </div>

      <div className="bg-background min-h-0 flex-1 overflow-auto">
        {isLoading ? (
          <LoadingView label="Loading file..." />
        ) : error ? (
          <div className="px-4 py-6">
            <p className="text-foreground text-sm font-medium">File unavailable</p>
            <p className="text-foreground-muted mt-1 text-sm">{error.message}</p>
          </div>
        ) : (
          <FileCodeBlock file={file} options={{ ...BASE_CODE_OPTIONS, themeType: theme, disableFileHeader: true }} />
        )}
      </div>
    </div>
  )
}
