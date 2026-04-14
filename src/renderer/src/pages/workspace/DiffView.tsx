import { useEffect, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { ExternalLink } from 'lucide-react'
import { cn } from '../../lib/cn'
import { useTheme } from '../../hooks/useTheme'
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
  const leftRef = useRef<HTMLDivElement>(null)
  const rightRef = useRef<HTMLDivElement>(null)
  const isSyncing = useRef(false)

  // Fetch the unified diff from git
  const { data: diffText, isLoading: isDiffLoading } = useQuery<string, Error>({
    queryKey: ['git-diff', folderPath, filePath, staged],
    queryFn: () => window.api.git.diff(folderPath, filePath, staged),
    retry: false
  })

  // For untracked/new files, diff is empty — read the file content directly
  const isEmptyDiff = diffText != null && !diffText.trim()
  const absolutePath = `${folderPath}/${filePath}`
  const { data: fileContent, isLoading: isFileLoading } = useQuery<string, Error>({
    queryKey: ['read-file', absolutePath],
    queryFn: () => window.api.fs.readFile(absolutePath),
    enabled: isEmptyDiff,
    retry: false
  })

  // Parse diff into aligned pairs for side-by-side view
  const [alignedPairs, setAlignedPairs] = useState<AlignedPair[] | null>(null)
  const [leftTokens, setLeftTokens] = useState<HighlightedToken[][] | null>(null)
  const [rightTokens, setRightTokens] = useState<HighlightedToken[][] | null>(null)

  useEffect(() => {
    if (diffText == null) {
      setAlignedPairs(null)
      setLeftTokens(null)
      setRightTokens(null)
      return
    }

    // For untracked files: no diff, show entire file as additions
    if (!diffText.trim()) {
      if (fileContent == null) return

      const lines = fileContent.split('\n')
      const pairs: AlignedPair[] = lines.map((content, i) => ({
        left: null,
        right: { kind: 'addition', content, oldLineNumber: null, newLineNumber: i + 1 }
      }))
      setAlignedPairs(pairs)
      setLeftTokens([])

      const lang = getLanguageFromPath(filePath)
      tokenizeCode(fileContent, lang, theme).then(setRightTokens).catch(() => {})
      return
    }

    const pairs = parseDiffToAlignedPairs(diffText)
    setAlignedPairs(pairs)

    const lang = getLanguageFromPath(filePath)

    // Tokenize left (original) side
    const leftCode = pairs
      .filter((p) => p.left !== null)
      .map((p) => p.left!.content)
      .join('\n')

    if (leftCode) {
      tokenizeCode(leftCode, lang, theme).then(setLeftTokens).catch(() => {})
    } else {
      setLeftTokens([])
    }

    // Tokenize right (modified) side
    const rightCode = pairs
      .filter((p) => p.right !== null)
      .map((p) => p.right!.content)
      .join('\n')

    if (rightCode) {
      tokenizeCode(rightCode, lang, theme).then(setRightTokens).catch(() => {})
    } else {
      setRightTokens([])
    }
  }, [diffText, fileContent, filePath, theme])

  // Build token maps indexed by aligned pair position
  const leftTokenMap = buildTokenMap(alignedPairs, 'left', leftTokens)
  const rightTokenMap = buildTokenMap(alignedPairs, 'right', rightTokens)

  // Synchronized scrolling
  const handleScroll = (source: 'left' | 'right'): void => {
    if (isSyncing.current) return
    isSyncing.current = true

    const sourceEl = source === 'left' ? leftRef.current : rightRef.current
    const targetEl = source === 'left' ? rightRef.current : leftRef.current

    if (sourceEl && targetEl) {
      targetEl.scrollTop = sourceEl.scrollTop
      targetEl.scrollLeft = sourceEl.scrollLeft
    }

    isSyncing.current = false
  }

  if (isDiffLoading || (isEmptyDiff && isFileLoading)) {
    return (
      <div className="flex h-full items-center justify-center">
        <p className="text-sm text-foreground-muted">Loading diff...</p>
      </div>
    )
  }

  if (!alignedPairs) {
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

      {/* Split diff view */}
      <div className="flex min-h-0 flex-1">
        {/* Left pane - original */}
        <div
          ref={leftRef}
          className="flex-1 overflow-auto border-r border-border"
          onScroll={() => handleScroll('left')}
        >
          <table className="w-full border-collapse font-mono text-xs">
            <tbody>
              {alignedPairs.map((pair, i) => (
                <DiffRow
                  key={i}
                  line={pair.left}
                  tokens={leftTokenMap.get(i)}
                  side="left"
                />
              ))}
            </tbody>
          </table>
        </div>

        {/* Right pane - modified */}
        <div
          ref={rightRef}
          className="flex-1 overflow-auto"
          onScroll={() => handleScroll('right')}
        >
          <table className="w-full border-collapse font-mono text-xs">
            <tbody>
              {alignedPairs.map((pair, i) => (
                <DiffRow
                  key={i}
                  line={pair.right}
                  tokens={rightTokenMap.get(i)}
                  side="right"
                />
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

function DiffRow({
  line,
  tokens,
  side
}: {
  line: DiffLine | null
  tokens: HighlightedToken[] | undefined
  side: 'left' | 'right'
}) {
  if (!line) {
    // Empty placeholder row
    return (
      <tr className="bg-surface">
        <td className="w-12 select-none border-r border-border bg-surface px-2 py-0 text-right text-foreground-subtle">
          &nbsp;
        </td>
        <td className="px-3 py-0 whitespace-pre">
          &nbsp;
        </td>
      </tr>
    )
  }

  const lineNumber = side === 'left' ? line.oldLineNumber : line.newLineNumber

  return (
    <tr
      className={cn(
        line.kind === 'deletion' && 'bg-danger/10',
        line.kind === 'addition' && 'bg-success/10',
        line.kind === 'context' && 'bg-background'
      )}
    >
      <td className="w-12 select-none border-r border-border px-2 py-0 text-right text-foreground-subtle">
        {lineNumber}
      </td>
      <td className="px-3 py-0 whitespace-pre">
        {tokens ? (
          tokens.map((token, i) => (
            <span key={i} style={token.color ? { color: token.color } : undefined}>
              {token.content}
            </span>
          ))
        ) : (
          <span className="text-foreground">{line.content}</span>
        )}
      </td>
    </tr>
  )
}

function parseDiffToAlignedPairs(diffText: string): AlignedPair[] {
  const lines = diffText.split('\n')
  const diffLines: DiffLine[] = []

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
      diffLines.push({
        kind: 'deletion',
        content: line.slice(1),
        oldLineNumber: oldLine,
        newLineNumber: null
      })
      oldLine++
    } else if (line.startsWith('+')) {
      diffLines.push({
        kind: 'addition',
        content: line.slice(1),
        oldLineNumber: null,
        newLineNumber: newLine
      })
      newLine++
    } else if (line.startsWith('\\')) {
      // "\ No newline at end of file" — skip
    } else {
      // Context line
      const content = line.startsWith(' ') ? line.slice(1) : line
      diffLines.push({
        kind: 'context',
        content,
        oldLineNumber: oldLine,
        newLineNumber: newLine
      })
      oldLine++
      newLine++
    }
  }

  // Align deletions and additions into side-by-side pairs
  const pairs: AlignedPair[] = []
  let i = 0

  while (i < diffLines.length) {
    const current = diffLines[i]

    if (current.kind === 'context') {
      pairs.push({ left: current, right: current })
      i++
      continue
    }

    // Collect consecutive deletions and additions
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

    // Pair them up
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
  alignedPairs: AlignedPair[] | null,
  side: 'left' | 'right',
  tokens: HighlightedToken[][] | null
): Map<number, HighlightedToken[]> {
  const map = new Map<number, HighlightedToken[]>()
  if (!alignedPairs || !tokens) return map

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
