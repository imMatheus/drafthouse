import { useState } from 'react'
import { Check, GitPullRequest, Search, X } from 'lucide-react'
import { cn } from '../lib/cn'
import type { GitRepoInfo } from '../../../shared/types'
import PRStateIcon from './PRStateIcon'
import { prStateLabel } from '../lib/prMentions'
import { filterPullRequests } from '../lib/pullRequestFilter'
import { usePullRequestList, usePullRequestSearch } from '../hooks/usePullRequests'
import Loading from './Loading'

interface PullRequestsPanelProps {
  gitInfo: GitRepoInfo | null | undefined
  isLoadingGitInfo: boolean
  onOpenPullRequest: (number: number) => void
  activePRNumber?: number | null
  onPullRequestDragStart?: (number: number) => void
  onDragEnd?: () => void
}

export default function PullRequestsPanel({
  gitInfo,
  isLoadingGitInfo,
  onOpenPullRequest,
  activePRNumber,
  onPullRequestDragStart,
  onDragEnd
}: PullRequestsPanelProps) {
  const [stateFilter, setStateFilter] = useState<'open' | 'closed'>('open')
  const [searchQuery, setSearchQuery] = useState('')
  const trimmedQuery = searchQuery.trim()

  const { data: prs, isLoading, error } = usePullRequestList(gitInfo, { state: stateFilter })
  const {
    results: searchResults,
    isSearching,
    error: searchError
  } = usePullRequestSearch(gitInfo, searchQuery, { state: stateFilter })

  // Prefer remote search results; while they're still debouncing, loading for
  // the first time, or failed, fall back to a local filter over the last list
  // result so the sidebar doesn't go blank.
  const displayedPRs = trimmedQuery === '' ? (prs ?? []) : (searchResults ?? filterPullRequests(prs ?? [], searchQuery))

  const noResults = !isLoading && displayedPRs.length === 0

  return (
    <div className="border-border bg-surface flex min-h-0 w-60 shrink-0 flex-col border-r">
      <div className="px-4 py-3">
        <p className="text-foreground-muted text-[10px] font-semibold tracking-wider uppercase">Pull Requests</p>
      </div>

      <div className="px-3 pb-2">
        <label className="border-border bg-background flex items-center gap-1.5 rounded border px-2 py-1">
          <Search size={12} className="text-foreground-subtle shrink-0" />
          <input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search..."
            className="text-foreground placeholder:text-foreground-subtle w-full bg-transparent text-xs focus:outline-none"
          />
          {searchQuery ? (
            <button
              onClick={() => setSearchQuery('')}
              className="text-foreground-subtle hover:text-foreground shrink-0"
            >
              <X size={10} />
            </button>
          ) : null}
        </label>
      </div>

      <div className="flex items-center gap-3 px-4 pb-2">
        <button
          onClick={() => setStateFilter('open')}
          className={cn(
            'flex items-center gap-1 text-[10px] font-semibold tracking-wider uppercase',
            stateFilter === 'open' ? 'text-foreground' : 'text-foreground-subtle hover:text-foreground-muted'
          )}
        >
          <GitPullRequest size={11} />
          Open
          {stateFilter === 'open' && trimmedQuery === '' && prs ? (
            <span className="text-foreground-subtle">{prs.length}</span>
          ) : null}
        </button>
        <button
          onClick={() => setStateFilter('closed')}
          className={cn(
            'flex items-center gap-1 text-[10px] font-semibold tracking-wider uppercase',
            stateFilter === 'closed' ? 'text-foreground' : 'text-foreground-subtle hover:text-foreground-muted'
          )}
        >
          <Check size={11} />
          Closed
          {stateFilter === 'closed' && trimmedQuery === '' && prs ? (
            <span className="text-foreground-subtle">{prs.length}</span>
          ) : null}
        </button>
        {searchError ? (
          <span className="text-danger ml-auto text-[10px]">Search failed</span>
        ) : isSearching ? (
          <Loading size="sm" label="Searching…" className="ml-auto text-[10px]" />
        ) : null}
      </div>

      <div className="flex-1 overflow-y-auto">
        {isLoadingGitInfo ? (
          <div className="px-4 py-4">
            <Loading size="sm" />
          </div>
        ) : !gitInfo ? (
          <p className="text-foreground-subtle px-4 py-4 text-xs">No GitHub repo detected</p>
        ) : isLoading ? (
          <div className="px-4 py-4">
            <Loading size="sm" label="Loading pull requests..." />
          </div>
        ) : error ? (
          <p className="text-foreground-subtle px-4 py-4 text-xs">{error.message}</p>
        ) : noResults ? (
          <p className="text-foreground-subtle px-4 py-4 text-xs">
            {trimmedQuery !== '' ? 'No matches' : `No ${stateFilter} pull requests`}
          </p>
        ) : (
          displayedPRs.map((pr) => {
            const isActive = pr.number === activePRNumber
            return (
              <button
                key={pr.number}
                draggable={onPullRequestDragStart != null}
                onDragStart={(e) => {
                  onPullRequestDragStart?.(pr.number)
                  e.dataTransfer.effectAllowed = 'copyMove'
                  e.dataTransfer.setData('text/plain', `#${pr.number}`)
                }}
                onDragEnd={() => onDragEnd?.()}
                onClick={() => onOpenPullRequest(pr.number)}
                className={cn(
                  'flex w-full items-center gap-2 px-4 py-[5px] text-left transition-colors',
                  isActive ? 'bg-border' : 'hover:bg-surface-hover'
                )}
              >
                <PRStateIcon state={prStateLabel(pr)} size={14} />
                <div className="min-w-0 flex-1">
                  <p className={cn('truncate text-xs', isActive ? 'text-foreground font-medium' : 'text-foreground')}>
                    {pr.title}
                  </p>
                  <p className="text-foreground-subtle text-[10px]">
                    #{pr.number} by {pr.user.login}
                  </p>
                </div>
              </button>
            )
          })
        )}
      </div>
    </div>
  )
}
