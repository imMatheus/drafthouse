import { Fragment, useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { ChevronRight } from 'lucide-react'
import { cn } from '../../lib/cn'
import { useTheme } from '../../hooks/useTheme'
import { getLanguageFromPath, tokenizeCode, type HighlightedToken } from '../../lib/shiki'

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

  const [tokens, setTokens] = useState<HighlightedToken[][] | null>(null)

  useEffect(() => {
    if (fileContents == null) {
      setTokens(null)
      return
    }
    const lang = getLanguageFromPath(filePath)
    tokenizeCode(fileContents, lang, theme)
      .then(setTokens)
      .catch(() => {})
  }, [fileContents, filePath, theme])

  const relativePath = getRelativePath(filePath, folderPath)
  const segments = relativePath.split('/')

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="flex items-center gap-1.5 border-b border-border bg-surface px-4 py-2">
        {segments.map((segment, i) => (
          <Fragment key={i}>
            {i > 0 && <ChevronRight size={12} className="shrink-0 text-foreground-subtle" />}
            <span className={cn('text-sm', i === segments.length - 1 ? 'text-foreground' : 'text-foreground-muted')}>
              {segment}
            </span>
          </Fragment>
        ))}
      </div>

      <div className="min-h-0 flex-1 overflow-auto bg-background">
        {isLoading ? (
          <div className="px-4 py-6">
            <p className="text-sm text-foreground-muted">Loading file...</p>
          </div>
        ) : error ? (
          <div className="px-4 py-6">
            <p className="text-sm font-medium text-foreground">File unavailable</p>
            <p className="mt-1 text-sm text-foreground-muted">{error.message}</p>
          </div>
        ) : (
          <CodeView tokens={tokens} rawContent={fileContents ?? ''} />
        )}
      </div>
    </div>
  )
}

function CodeView({ tokens, rawContent }: { tokens: HighlightedToken[][] | null; rawContent: string }) {
  const lines: HighlightedToken[][] =
    tokens ?? rawContent.split('\n').map((line) => [{ content: line, color: undefined }])

  return (
    <table className="min-w-full border-collapse font-mono text-[13px] leading-6">
      <tbody>
        {lines.map((lineTokens, i) => (
          <tr key={i} className="hover:bg-surface-hover">
            <td className="sticky left-0 select-none bg-background px-3 py-0 text-right text-xs text-foreground-subtle">
              {i + 1}
            </td>
            <td className="py-0 w-full pr-4 pl-4 whitespace-pre">
              <TokenizedLine tokens={lineTokens} />
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

function TokenizedLine({ tokens }: { tokens: HighlightedToken[] }) {
  return (
    <>
      {tokens.map((token, i) =>
        token.color ? (
          <span key={i} style={{ color: token.color }}>
            {token.content}
          </span>
        ) : (
          <span key={i}>{token.content}</span>
        )
      )}
    </>
  )
}

function getRelativePath(filePath: string, folderPath: string): string {
  if (filePath.startsWith(folderPath)) {
    const relative = filePath.slice(folderPath.length)
    return relative.startsWith('/') ? relative.slice(1) : relative
  }
  return filePath
}
