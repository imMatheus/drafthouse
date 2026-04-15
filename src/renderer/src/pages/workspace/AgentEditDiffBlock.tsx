import { useEffect, useState } from 'react'
import { cn } from '../../lib/cn'
import { useTheme } from '../../hooks/useTheme'
import { getLanguageFromPath, tokenizeDiffHunks, type HighlightedToken } from '../../lib/shiki'
import type { ParsedDiffHunk, ParsedDiffLine, ParsedDiffLineKind } from './pullRequestDiff'

interface AgentEditDiffBlockProps {
  filePath: string
  oldString: string
  newString: string
}

interface DiffLine {
  kind: ParsedDiffLineKind
  content: string
  lineNumber: number | null
}

function computeDiffLines(oldStr: string, newStr: string): DiffLine[] {
  const oldLines = oldStr.split('\n')
  const newLines = newStr.split('\n')

  // Find common prefix
  let prefixLen = 0
  while (prefixLen < oldLines.length && prefixLen < newLines.length && oldLines[prefixLen] === newLines[prefixLen]) {
    prefixLen++
  }

  // Find common suffix (not overlapping with prefix)
  let suffixLen = 0
  while (
    suffixLen < oldLines.length - prefixLen &&
    suffixLen < newLines.length - prefixLen &&
    oldLines[oldLines.length - 1 - suffixLen] === newLines[newLines.length - 1 - suffixLen]
  ) {
    suffixLen++
  }

  const lines: DiffLine[] = []
  let lineNum = 1

  // Common prefix (context)
  for (let i = 0; i < prefixLen; i++) {
    lines.push({ kind: 'context', content: oldLines[i], lineNumber: lineNum++ })
  }

  // Deletions
  const oldMiddleEnd = oldLines.length - suffixLen
  for (let i = prefixLen; i < oldMiddleEnd; i++) {
    lines.push({ kind: 'deletion', content: oldLines[i], lineNumber: lineNum++ })
  }

  // Additions
  for (let i = prefixLen; i < newLines.length - suffixLen; i++) {
    lines.push({ kind: 'addition', content: newLines[i], lineNumber: lineNum++ })
  }

  // Common suffix (context)
  for (let i = oldLines.length - suffixLen; i < oldLines.length; i++) {
    lines.push({ kind: 'context', content: oldLines[i], lineNumber: lineNum++ })
  }

  return lines
}

function buildHunk(filePath: string, diffLines: DiffLine[]): ParsedDiffHunk {
  let oldLine = 1
  let newLine = 1

  const lines: ParsedDiffLine[] = diffLines.map((dl, i) => {
    const line: ParsedDiffLine = {
      id: `${filePath}-edit-line-${i}`,
      kind: dl.kind,
      content: dl.content,
      oldLineNumber: dl.kind !== 'addition' ? oldLine : null,
      newLineNumber: dl.kind !== 'deletion' ? newLine : null,
      commentSide: null,
      commentLine: null
    }

    if (dl.kind === 'context') {
      oldLine++
      newLine++
    } else if (dl.kind === 'deletion') {
      oldLine++
    } else if (dl.kind === 'addition') {
      newLine++
    }

    return line
  })

  return {
    id: `${filePath}-edit-hunk-0`,
    header: '',
    lines
  }
}

export default function AgentEditDiffBlock({ filePath, oldString, newString }: AgentEditDiffBlockProps) {
  const { theme } = useTheme()
  const [tokenMap, setTokenMap] = useState<Map<string, HighlightedToken[]>>(new Map())

  const diffLines = computeDiffLines(oldString, newString)
  const hunk = buildHunk(filePath, diffLines)

  const addedCount = diffLines.filter((l) => l.kind === 'addition').length
  const removedCount = diffLines.filter((l) => l.kind === 'deletion').length

  const fileName = filePath.split('/').pop() ?? filePath

  useEffect(() => {
    const lang = getLanguageFromPath(filePath)
    tokenizeDiffHunks([hunk], lang, theme)
      .then(setTokenMap)
      .catch(() => {})
  }, [oldString, newString, filePath, theme])

  return (
    <div className="my-2 overflow-hidden rounded-md border border-border bg-surface">
      {/* Header */}
      <div className="flex items-center gap-2 border-b border-border px-3 py-2">
        <span className="size-2 rounded-full bg-success" />
        <span className="text-xs font-medium text-foreground">
          Edit(<span className="text-foreground-muted">{fileName}</span>)
        </span>
      </div>

      {/* Stats */}
      <div className="border-b border-border px-3 py-1.5 text-[11px] text-foreground-subtle">
        {addedCount > 0 && (
          <span>
            Added <strong className="font-medium text-foreground-muted">{addedCount}</strong> line
            {addedCount !== 1 ? 's' : ''}
          </span>
        )}
        {addedCount > 0 && removedCount > 0 && <span>, </span>}
        {removedCount > 0 && (
          <span>
            removed <strong className="font-medium text-foreground-muted">{removedCount}</strong> line
            {removedCount !== 1 ? 's' : ''}
          </span>
        )}
      </div>

      {/* Diff lines */}
      <div className="overflow-x-auto">
        <table className="w-full border-collapse font-mono text-xs">
          <tbody>
            {hunk.lines.map((line) => (
              <tr
                key={line.id}
                className={cn(
                  line.kind === 'addition' && 'bg-success/10',
                  line.kind === 'deletion' && 'bg-danger/10',
                  line.kind === 'context' && 'bg-background'
                )}
              >
                {/* Line number */}
                <td className="w-10 select-none px-2 py-0 text-right align-top text-foreground-subtle/50">
                  {line.oldLineNumber ?? line.newLineNumber ?? ''}
                </td>

                {/* Prefix */}
                <td className="w-4 select-none py-0 text-center align-top text-foreground-subtle">
                  {line.kind === 'addition' ? '+' : line.kind === 'deletion' ? '-' : ' '}
                </td>

                {/* Content */}
                <td className="whitespace-pre py-0 pr-4">
                  <DiffLineContent tokens={tokenMap.get(line.id)} fallback={line.content} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function DiffLineContent({ tokens, fallback }: { tokens: HighlightedToken[] | undefined; fallback: string }) {
  if (!tokens) return <>{fallback}</>

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
