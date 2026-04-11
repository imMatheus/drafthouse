import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { getPathBasename } from '../../lib/path'
import {
  getLanguageFromPath,
  tokenizeCode,
  type HighlightedToken
} from '../../lib/shiki'
import { useTheme } from '../../hooks/useTheme'

interface FilesViewProps {
  filePath: string
}

export default function FilesView({ filePath }: FilesViewProps) {
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
    tokenizeCode(fileContents, lang, theme).then(setTokens)
  }, [fileContents, filePath, theme])

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

  const lines: HighlightedToken[][] = tokens ?? (fileContents?.split('\n') ?? []).map((line) => [{ content: line, color: undefined }])
  const gutterWidth = String(lines.length).length

  return (
    <div className="overflow-hidden rounded-xl border border-border bg-surface">
      <div className="border-b border-border px-4 py-3">
        <p className="text-sm font-medium text-foreground">{getPathBasename(filePath)}</p>
        <p className="truncate text-xs text-foreground-subtle">{filePath}</p>
      </div>
      <div className="overflow-x-auto">
        <table className="min-w-full border-collapse font-mono text-[13px] leading-6">
          <tbody>
            {lines.map((lineTokens, i) => (
              <tr key={i} className="hover:bg-surface-hover">
                <td
                  className="select-none border-r border-border px-3 py-0 text-right text-xs text-foreground-subtle"
                  style={{ minWidth: gutterWidth * 8 + 24 }}
                >
                  {i + 1}
                </td>
                <td className="px-4 py-0 whitespace-pre">
                  <TokenizedLine tokens={lineTokens} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
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
