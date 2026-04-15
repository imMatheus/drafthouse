import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { ExternalLink } from 'lucide-react'
import { cn } from '../../lib/cn'
import { useTheme } from '../../hooks/useTheme'
import { useSettings } from '../../hooks/useSettings'
import { getLanguageFromPath, tokenizeCode, type HighlightedToken } from '../../lib/shiki'

interface DiffViewProps {
  filePath: string
  folderPath: string
  staged: boolean
  onOpenFile?: (path: string) => void
}

interface DiffLine {
  kind: 'context' | 'addition' | 'deletion'
  content: string
  oldLineNumber: number | null
  newLineNumber: number | null
}

interface AlignedPair {
  left: DiffLine | null
  right: DiffLine | null
}

export default function DiffView({ filePath, folderPath, staged, onOpenFile }: DiffViewProps) {
  const { theme } = useTheme()
  const { settings } = useSettings()

  const { data: diffText, isLoading: isDiffLoading } = useQuery<string, Error>({
    queryKey: ['git-diff', folderPath, filePath, staged],
    queryFn: () => window.api.git.diff(folderPath, filePath, staged),
    retry: false
  })

  const isEmptyDiff = diffText != null && !diffText.trim()
  const absolutePath = `${folderPath}/${filePath}`
  const { data: fileContent, isLoading: isFileLoading } = useQuery<string, Error>({
    queryKey: ['read-file', absolutePath],
    queryFn: () => window.api.fs.readFile(absolutePath),
    enabled: isEmptyDiff,
    retry: false
  })

  // Parse diff lines (unified list)
  const [diffLines, setDiffLines] = useState<DiffLine[]>([])
  const [alignedPairs, setAlignedPairs] = useState<AlignedPair[]>([])
  const [leftTokens, setLeftTokens] = useState<HighlightedToken[][] | null>(null)
  const [rightTokens, setRightTokens] = useState<HighlightedToken[][] | null>(null)
  const [unifiedTokens, setUnifiedTokens] = useState<HighlightedToken[][] | null>(null)

  useEffect(() => {
    if (diffText == null) {
      setDiffLines([])
      setAlignedPairs([])
      setLeftTokens(null)
      setRightTokens(null)
      setUnifiedTokens(null)
      return
    }

    if (!diffText.trim()) {
      if (fileContent == null) return

      const lines = fileContent.split('\n')
      const dl: DiffLine[] = lines.map((content, i) => ({
        kind: 'addition',
        content,
        oldLineNumber: null,
        newLineNumber: i + 1
      }))
      setDiffLines(dl)

      const pairs: AlignedPair[] = dl.map((line) => ({ left: null, right: line }))
      setAlignedPairs(pairs)

      setLeftTokens([])
      const lang = getLanguageFromPath(filePath)
      tokenizeCode(fileContent, lang, theme)
        .then((t) => {
          setRightTokens(t)
          setUnifiedTokens(t)
        })
        .catch(() => {})
      return
    }

    const dl = parseDiffLines(diffText)
    setDiffLines(dl)
    setAlignedPairs(alignDiffLines(dl))

    const lang = getLanguageFromPath(filePath)

    // Tokenize for split view
    const leftCode = dl
      .filter((l) => l.kind !== 'addition')
      .map((l) => l.content)
      .join('\n')
    const rightCode = dl
      .filter((l) => l.kind !== 'deletion')
      .map((l) => l.content)
      .join('\n')

    if (leftCode) {
      tokenizeCode(leftCode, lang, theme)
        .then(setLeftTokens)
        .catch(() => {})
    } else {
      setLeftTokens([])
    }

    if (rightCode) {
      tokenizeCode(rightCode, lang, theme)
        .then(setRightTokens)
        .catch(() => {})
    } else {
      setRightTokens([])
    }

    // Tokenize for unified view (all lines in order)
    const allCode = dl.map((l) => l.content).join('\n')
    if (allCode) {
      tokenizeCode(allCode, lang, theme)
        .then(setUnifiedTokens)
        .catch(() => {})
    } else {
      setUnifiedTokens([])
    }
  }, [diffText, fileContent, filePath, theme])

  const leftTokenMap = buildTokenMap(alignedPairs, 'left', leftTokens)
  const rightTokenMap = buildTokenMap(alignedPairs, 'right', rightTokens)

  if (isDiffLoading || (isEmptyDiff && isFileLoading)) {
    return (
      <div className="flex h-full items-center justify-center">
        <p className="text-sm text-foreground-muted">Loading diff...</p>
      </div>
    )
  }

  if (diffLines.length === 0 && alignedPairs.length === 0) {
    return null
  }

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-2 border-b border-border bg-surface px-4 py-2">
        <span className="text-xs font-medium text-foreground">{filePath}</span>
        <span className="rounded bg-interactive px-1.5 py-0.5 text-[10px] text-foreground-muted">
          {staged ? 'Staged' : 'Working Tree'}
        </span>
        {onOpenFile ? (
          <button
            onClick={() => onOpenFile(`${folderPath}/${filePath}`)}
            className="ml-auto flex items-center gap-1 text-xs text-foreground-muted hover:text-foreground"
          >
            <ExternalLink size={12} />
            Open File
          </button>
        ) : null}
      </div>

      {settings.diffViewMode === 'split' ? (
        /* Split diff view — single table, fixed columns, no x-overflow */
        <div className="min-h-0 flex-1 overflow-y-auto">
          <table className="w-full table-fixed border-collapse font-mono text-xs">
            <colgroup>
              <col className="w-10" />
              <col className="w-1/2" />
              <col className="w-10" />
              <col className="w-1/2" />
            </colgroup>
            <tbody>
              {alignedPairs.map((pair, i) => (
                <tr key={i}>
                  {/* Left */}
                  <td
                    className={cn(
                      'border-r border-border px-2 py-0 text-right text-foreground-subtle',
                      pair.left?.kind === 'deletion' ? 'bg-danger/10' : pair.left ? 'bg-background' : 'bg-surface'
                    )}
                  >
                    {pair.left?.oldLineNumber ?? ''}
                  </td>
                  <td
                    className={cn(
                      'overflow-hidden border-r border-border px-3 py-0 whitespace-pre-wrap break-all',
                      pair.left?.kind === 'deletion' ? 'bg-danger/10' : pair.left ? 'bg-background' : 'bg-surface'
                    )}
                  >
                    {pair.left ? (
                      <TokenizedContent tokens={leftTokenMap.get(i)} fallback={pair.left.content} />
                    ) : (
                      '\u00A0'
                    )}
                  </td>
                  {/* Right */}
                  <td
                    className={cn(
                      'border-r border-border px-2 py-0 text-right text-foreground-subtle',
                      pair.right?.kind === 'addition' ? 'bg-success/10' : pair.right ? 'bg-background' : 'bg-surface'
                    )}
                  >
                    {pair.right?.newLineNumber ?? ''}
                  </td>
                  <td
                    className={cn(
                      'overflow-hidden px-3 py-0 whitespace-pre-wrap break-all',
                      pair.right?.kind === 'addition' ? 'bg-success/10' : pair.right ? 'bg-background' : 'bg-surface'
                    )}
                  >
                    {pair.right ? (
                      <TokenizedContent tokens={rightTokenMap.get(i)} fallback={pair.right.content} />
                    ) : (
                      '\u00A0'
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        /* Unified diff view */
        <div className="min-h-0 flex-1 overflow-auto">
          <table className="w-full border-collapse font-mono text-xs">
            <tbody>
              {diffLines.map((line, i) => (
                <UnifiedDiffRow key={i} line={line} tokens={unifiedTokens?.[i]} />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

function UnifiedDiffRow({ line, tokens }: { line: DiffLine; tokens: HighlightedToken[] | undefined }) {
  return (
    <tr
      className={cn(
        line.kind === 'deletion' && 'bg-danger/10',
        line.kind === 'addition' && 'bg-success/10',
        line.kind === 'context' && 'bg-background'
      )}
    >
      <td className="w-12 select-none px-2 py-0 text-right text-foreground-subtle/50">{line.oldLineNumber ?? ''}</td>
      <td className="w-12 select-none px-2 py-0 text-right text-foreground-subtle/50">{line.newLineNumber ?? ''}</td>
      <td className="w-4 select-none py-0 text-center text-foreground-subtle">
        {line.kind === 'addition' ? '+' : line.kind === 'deletion' ? '-' : ' '}
      </td>
      <td className="py-0 pr-4 whitespace-pre">
        <TokenizedContent tokens={tokens} fallback={line.content} />
      </td>
    </tr>
  )
}

function TokenizedContent({ tokens, fallback }: { tokens: HighlightedToken[] | undefined; fallback: string }) {
  if (!tokens) return <span className="text-foreground">{fallback}</span>

  return (
    <>
      {tokens.map((token, i) => (
        <span key={i} style={token.color ? { color: token.color } : undefined}>
          {token.content}
        </span>
      ))}
    </>
  )
}

function parseDiffLines(diffText: string): DiffLine[] {
  const lines = diffText.split('\n')
  const result: DiffLine[] = []

  let oldLine = 0
  let newLine = 0
  let inHunk = false

  for (const line of lines) {
    if (line.startsWith('@@')) {
      const match = line.match(/@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/)
      if (match) {
        oldLine = Number(match[1])
        newLine = Number(match[2])
      }
      inHunk = true
      continue
    }

    if (!inHunk) continue

    if (line.startsWith('-')) {
      result.push({ kind: 'deletion', content: line.slice(1), oldLineNumber: oldLine, newLineNumber: null })
      oldLine++
    } else if (line.startsWith('+')) {
      result.push({ kind: 'addition', content: line.slice(1), oldLineNumber: null, newLineNumber: newLine })
      newLine++
    } else if (line.startsWith('\\')) {
      // skip "\ No newline at end of file"
    } else {
      const content = line.startsWith(' ') ? line.slice(1) : line
      result.push({ kind: 'context', content, oldLineNumber: oldLine, newLineNumber: newLine })
      oldLine++
      newLine++
    }
  }

  return result
}

function alignDiffLines(diffLines: DiffLine[]): AlignedPair[] {
  const pairs: AlignedPair[] = []
  let i = 0

  while (i < diffLines.length) {
    const current = diffLines[i]

    if (current.kind === 'context') {
      pairs.push({ left: current, right: current })
      i++
      continue
    }

    const deletions: DiffLine[] = []
    const additions: DiffLine[] = []

    while (i < diffLines.length && diffLines[i].kind === 'deletion') {
      deletions.push(diffLines[i])
      i++
    }
    while (i < diffLines.length && diffLines[i].kind === 'addition') {
      additions.push(diffLines[i])
      i++
    }

    const maxLen = Math.max(deletions.length, additions.length)
    for (let j = 0; j < maxLen; j++) {
      pairs.push({
        left: j < deletions.length ? deletions[j] : null,
        right: j < additions.length ? additions[j] : null
      })
    }
  }

  return pairs
}

function buildTokenMap(
  alignedPairs: AlignedPair[],
  side: 'left' | 'right',
  tokens: HighlightedToken[][] | null
): Map<number, HighlightedToken[]> {
  const map = new Map<number, HighlightedToken[]>()
  if (!tokens) return map

  let tokenIdx = 0
  for (let i = 0; i < alignedPairs.length; i++) {
    const line = side === 'left' ? alignedPairs[i].left : alignedPairs[i].right
    if (line !== null) {
      if (tokenIdx < tokens.length) {
        map.set(i, tokens[tokenIdx])
      }
      tokenIdx++
    }
  }

  return map
}
