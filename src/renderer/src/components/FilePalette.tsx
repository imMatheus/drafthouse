import React, { useState } from 'react'
import { Command } from 'cmdk'
import { useQuery } from '@tanstack/react-query'
import { getPathBasename, getPathDirname } from '../lib/path'
import { FileIcon } from './FileIcon'

function fuzzyMatch(text: string, query: string): number[] | null {
  if (!query) return []
  const lowerText = text.toLowerCase()
  const lowerQuery = query.toLowerCase()
  const positions: number[] = []
  let j = 0
  for (let i = 0; i < lowerText.length && j < lowerQuery.length; i++) {
    if (lowerText[i] === lowerQuery[j]) {
      positions.push(i)
      j++
    }
  }
  return j === lowerQuery.length ? positions : null
}

function scoreFuzzy(positions: number[], text: string): number {
  if (positions.length === 0) return 0
  let score = 0
  for (let k = 0; k < positions.length; k++) {
    const p = positions[k]
    if (k > 0 && p === positions[k - 1] + 1) score += 8
    const prev = p > 0 ? text[p - 1] : ''
    const cur = text[p]
    const isWordBoundary =
      p === 0 ||
      prev === '/' ||
      prev === '_' ||
      prev === '-' ||
      prev === '.' ||
      prev === ' ' ||
      (prev === prev.toLowerCase() && cur !== cur.toLowerCase())
    if (isWordBoundary) score += 4
  }
  score -= positions[positions.length - 1] - positions[0]
  return score
}

interface FileMatch {
  path: string
  target: 'basename' | 'path'
  positions: number[]
  score: number
}

function matchFile(relativePath: string, query: string): FileMatch | null {
  if (!query) {
    return { path: relativePath, target: 'basename', positions: [], score: 0 }
  }
  const basename = getPathBasename(relativePath)
  const basenamePositions = fuzzyMatch(basename, query)
  if (basenamePositions) {
    return {
      path: relativePath,
      target: 'basename',
      positions: basenamePositions,
      score: scoreFuzzy(basenamePositions, basename) + 1000
    }
  }
  const pathPositions = fuzzyMatch(relativePath, query)
  if (pathPositions) {
    return {
      path: relativePath,
      target: 'path',
      positions: pathPositions,
      score: scoreFuzzy(pathPositions, relativePath)
    }
  }
  return null
}

function HighlightedText({ text, positions }: { text: string; positions: number[] }) {
  if (positions.length === 0) return <>{text}</>

  const parts: React.ReactNode[] = []
  let cursor = 0
  let i = 0
  while (i < positions.length) {
    let j = i
    while (j + 1 < positions.length && positions[j + 1] === positions[j] + 1) j++
    const start = positions[i]
    const end = positions[j] + 1
    if (start > cursor) parts.push(<span key={`p-${i}`}>{text.slice(cursor, start)}</span>)
    parts.push(
      <span key={`h-${i}`} className="text-accent font-medium">
        {text.slice(start, end)}
      </span>
    )
    cursor = end
    i = j + 1
  }
  if (cursor < text.length) parts.push(<span key="tail">{text.slice(cursor)}</span>)
  return <>{parts}</>
}

function splitPositionsForSegments(
  match: FileMatch,
  relativePath: string
): { basenamePositions: number[]; dirnamePositions: number[] } {
  if (match.positions.length === 0) return { basenamePositions: [], dirnamePositions: [] }
  if (match.target === 'basename') {
    return { basenamePositions: match.positions, dirnamePositions: [] }
  }
  const dirname = getPathDirname(relativePath)
  const basenameStart = dirname.length === 0 ? 0 : dirname.length + 1
  const basenamePositions: number[] = []
  const dirnamePositions: number[] = []
  for (const p of match.positions) {
    if (p >= basenameStart) basenamePositions.push(p - basenameStart)
    else if (p < dirname.length) dirnamePositions.push(p)
  }
  return { basenamePositions, dirnamePositions }
}

interface FilePaletteProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  folderPath: string
  onOpenFile: (path: string) => void
}

const ITEM_CLASSES =
  'flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-xs text-foreground-muted data-[selected=true]:bg-interactive data-[selected=true]:text-foreground'

export default function FilePalette({ open, onOpenChange, folderPath, onOpenFile }: FilePaletteProps) {
  const [search, setSearch] = useState('')
  const strippedQuery = search.replace(/\s+/g, '')

  const { data: files } = useQuery<string[]>({
    queryKey: ['read-dir-recursive', folderPath],
    queryFn: () => window.api.fs.readDirRecursive(folderPath),
    enabled: open,
    staleTime: 30_000,
    retry: false
  })

  const matchedFiles = (files ?? [])
    .map((path) => matchFile(path, strippedQuery))
    .filter((m): m is FileMatch => m !== null)
    .sort((a, b) => b.score - a.score)
    .slice(0, strippedQuery ? 200 : 100)

  return (
    <Command.Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) setSearch('')
        onOpenChange(next)
      }}
      label="Go to File"
      shouldFilter={false}
      overlayClassName="fixed inset-0 z-50 bg-black/50"
      contentClassName="fixed left-1/2 top-[20%] z-50 w-[560px] -translate-x-1/2 overflow-hidden rounded-xl border border-border bg-surface shadow-2xl"
    >
      <Command.Input
        value={search}
        onValueChange={setSearch}
        placeholder="Search files by name"
        className="border-border text-foreground placeholder:text-foreground-subtle w-full border-b bg-transparent px-4 py-3 text-sm focus:outline-none"
      />

      <Command.List className="max-h-[420px] overflow-y-auto p-2">
        <Command.Empty className="text-foreground-subtle py-6 text-center text-xs">No files found.</Command.Empty>

        {matchedFiles.map((match) => {
          const basename = getPathBasename(match.path)
          const dirname = getPathDirname(match.path)
          const { basenamePositions, dirnamePositions } = splitPositionsForSegments(match, match.path)
          return (
            <Command.Item
              key={match.path}
              value={match.path}
              onSelect={() => {
                onOpenFile(`${folderPath}/${match.path}`)
                onOpenChange(false)
              }}
              className={ITEM_CLASSES}
            >
              <FileIcon name={basename} size={14} />
              <span className="text-foreground">
                <HighlightedText text={basename} positions={basenamePositions} />
              </span>
              <span className="text-foreground-subtle min-w-0 truncate">
                <HighlightedText text={dirname} positions={dirnamePositions} />
              </span>
            </Command.Item>
          )
        })}
      </Command.List>
    </Command.Dialog>
  )
}
