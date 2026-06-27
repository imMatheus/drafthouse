import { useEffect, useRef, useState, type ReactNode } from 'react'
import { useQuery } from '@tanstack/react-query'
import { ChevronDown, ChevronRight, Search } from 'lucide-react'
import type { SearchMatch, SearchResults } from '../../../shared/types'
import { cn } from '../lib/cn'
import { getPathBasename, getPathDirname } from '../lib/path'
import { FileIcon } from './FileIcon'
import Loading from './Loading'
import Tooltip from './Tooltip'

interface SearchPanelProps {
  folderPath: string
  onOpenFile: (path: string) => void
  /** Bumped by the parent (Cmd+Shift+F) to re-focus the input. */
  focusNonce: number
}

const MIN_QUERY_LENGTH = 2

export default function SearchPanel({ folderPath, onOpenFile, focusNonce }: SearchPanelProps) {
  const [query, setQuery] = useState('')
  const [debouncedQuery, setDebouncedQuery] = useState('')
  const [caseSensitive, setCaseSensitive] = useState(false)
  const [wholeWord, setWholeWord] = useState(false)
  const [isRegex, setIsRegex] = useState(false)
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())
  const inputRef = useRef<HTMLInputElement>(null)

  // Focus + select whenever the panel is summoned (mount or Cmd+Shift+F).
  useEffect(() => {
    inputRef.current?.focus()
    inputRef.current?.select()
  }, [focusNonce])

  // Debounce so we don't hit the main process on every keystroke.
  useEffect(() => {
    if (query.trim().length < MIN_QUERY_LENGTH) {
      setDebouncedQuery('')
      return
    }
    const timer = setTimeout(() => setDebouncedQuery(query), 250)
    return () => clearTimeout(timer)
  }, [query])

  const enabled = debouncedQuery.trim().length >= MIN_QUERY_LENGTH

  const { data, isFetching } = useQuery<SearchResults>({
    queryKey: ['search-in-files', folderPath, debouncedQuery, caseSensitive, wholeWord, isRegex],
    queryFn: () => window.api.fs.searchInFiles(folderPath, debouncedQuery, { caseSensitive, wholeWord, isRegex }),
    enabled,
    placeholderData: (prev) => prev,
    retry: false
  })

  const results = enabled ? data : undefined

  const toggleFile = (path: string): void => {
    setCollapsed((prev) => {
      const next = new Set(prev)
      if (next.has(path)) next.delete(path)
      else next.add(path)
      return next
    })
  }

  return (
    <div className="border-border bg-surface flex min-h-0 w-60 shrink-0 flex-col border-r">
      <div className="px-4 py-3">
        <p className="text-foreground-muted text-[10px] font-semibold tracking-wider uppercase">Search</p>
      </div>

      <div className="px-3 pb-2">
        <div className="border-border bg-background flex items-center gap-1.5 rounded border px-2 py-1">
          <Search size={12} className="text-foreground-subtle shrink-0" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search"
            className="text-foreground placeholder:text-foreground-subtle min-w-0 flex-1 bg-transparent text-xs focus:outline-none"
          />
          <div className="flex shrink-0 items-center gap-0.5">
            <ToggleButton active={caseSensitive} onClick={() => setCaseSensitive((v) => !v)} label="Match case">
              Aa
            </ToggleButton>
            <ToggleButton active={wholeWord} onClick={() => setWholeWord((v) => !v)} label="Match whole word">
              {'\\b'}
            </ToggleButton>
            <ToggleButton active={isRegex} onClick={() => setIsRegex((v) => !v)} label="Use regular expression">
              .*
            </ToggleButton>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        {!enabled ? (
          <p className="text-foreground-subtle px-4 py-3 text-xs">
            Type at least {MIN_QUERY_LENGTH} characters to search.
          </p>
        ) : results?.invalidRegex ? (
          <p className="text-danger px-4 py-3 text-xs">Invalid regular expression.</p>
        ) : !results ? (
          <div className="px-4 py-3">
            <Loading size="sm" label="Searching..." />
          </div>
        ) : results.files.length === 0 ? (
          <p className="text-foreground-subtle px-4 py-3 text-xs">No results found.</p>
        ) : (
          <>
            <div className="text-foreground-subtle flex items-center justify-between px-4 pb-1 text-[10px]">
              <span>
                {results.totalMatches} result{results.totalMatches !== 1 ? 's' : ''} in {results.files.length} file
                {results.files.length !== 1 ? 's' : ''}
              </span>
              {isFetching ? <span>…</span> : null}
            </div>
            {results.truncated ? (
              <p className="text-foreground-subtle px-4 pb-1 text-[10px]">
                Showing partial results — refine your query.
              </p>
            ) : null}
            {results.files.map((file) => {
              const isCollapsed = collapsed.has(file.path)
              return (
                <div key={file.path}>
                  <button
                    type="button"
                    onClick={() => toggleFile(file.path)}
                    className="hover:bg-surface-hover flex w-full items-center gap-1.5 px-2 py-1 text-left"
                  >
                    {isCollapsed ? (
                      <ChevronRight size={12} className="text-foreground-subtle shrink-0" />
                    ) : (
                      <ChevronDown size={12} className="text-foreground-subtle shrink-0" />
                    )}
                    <FileIcon name={getPathBasename(file.path)} size={13} />
                    <span className="text-foreground shrink-0 truncate text-xs font-medium">
                      {getPathBasename(file.path)}
                    </span>
                    <span className="text-foreground-subtle min-w-0 flex-1 truncate text-[10px]">
                      {getPathDirname(file.path)}
                    </span>
                    <span className="text-foreground-subtle shrink-0 text-[10px] tabular-nums">
                      {file.matches.length}
                    </span>
                  </button>
                  {!isCollapsed
                    ? file.matches.map((match, i) => (
                        <MatchRow
                          key={`${match.line}-${match.matchStart}-${i}`}
                          match={match}
                          onClick={() => onOpenFile(`${folderPath}/${file.path}`)}
                        />
                      ))
                    : null}
                </div>
              )
            })}
          </>
        )}
      </div>
    </div>
  )
}

function ToggleButton({
  active,
  onClick,
  label,
  children
}: {
  active: boolean
  onClick: () => void
  label: string
  children: ReactNode
}) {
  return (
    <Tooltip label={label} side="bottom">
      <button
        type="button"
        onClick={onClick}
        aria-label={label}
        aria-pressed={active}
        className={cn(
          'flex size-5 items-center justify-center rounded text-[10px] font-medium transition-colors',
          active
            ? 'bg-accent text-accent-foreground'
            : 'text-foreground-subtle hover:bg-surface-hover hover:text-foreground'
        )}
      >
        {children}
      </button>
    </Tooltip>
  )
}

function MatchRow({ match, onClick }: { match: SearchMatch; onClick: () => void }) {
  // Left-trim for display, adjusting the highlight offset so it still lines up.
  const leading = match.text.length - match.text.trimStart().length
  const display = match.text.trimStart()
  const start = Math.max(0, match.matchStart - leading)
  const before = display.slice(0, start)
  const hit = display.slice(start, start + match.matchLength)
  const after = display.slice(start + match.matchLength)

  return (
    <button
      type="button"
      onClick={onClick}
      className="hover:bg-surface-hover flex w-full items-baseline gap-2 py-0.5 pr-2 pl-7 text-left"
    >
      <span className="text-foreground-subtle shrink-0 text-[10px] tabular-nums">{match.line}</span>
      <span className="text-foreground-muted min-w-0 flex-1 truncate font-mono text-[11px]">
        {before}
        <mark className="bg-accent/30 text-foreground rounded-sm">{hit}</mark>
        {after}
      </span>
    </button>
  )
}
