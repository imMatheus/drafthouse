import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  Check,
  GitMerge,
  GitPullRequest,
  GitPullRequestClosed,
  GitPullRequestDraft,
  Search,
  X
} from 'lucide-react'
import { cn } from '../lib/cn'
import type { GitRepoInfo, PullRequest } from '../../../shared/types'

interface PullRequestsPanelProps {
  gitInfo: GitRepoInfo | null | undefined
  isLoadingGitInfo: boolean
  onOpenPullRequest: (number: number) => void
}

export default function PullRequestsPanel({
  gitInfo,
  isLoadingGitInfo,
  onOpenPullRequest
}: PullRequestsPanelProps) {
  const [stateFilter, setStateFilter] = useState<'open' | 'closed'>('open')
  const [searchQuery, setSearchQuery] = useState('')

  const {
    data: prs,
    isLoading,
    error
  } = useQuery<PullRequest[], Error>({
    queryKey: ['pull-requests', gitInfo?.owner, gitInfo?.repo, stateFilter],
    queryFn: () => window.api.github.pulls.list(gitInfo!.owner, gitInfo!.repo, { state: stateFilter }),
    enabled: gitInfo != null,
    retry: false
  })

  const filtered = prs?.filter((pr) => {
    if (!searchQuery.trim()) return true
    const lower = searchQuery.toLowerCase()
    return (
      pr.title.toLowerCase().includes(lower) ||
      pr.user.login.toLowerCase().includes(lower) ||
      String(pr.number).includes(lower)
    )
  }) ?? []

  return (
    <div className="flex h-screen w-60 shrink-0 flex-col border-r border-border bg-surface">
      <div className="px-4 py-3">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-foreground-muted">
          Pull Requests
        </p>
      </div>

      {/* Search */}
      <div className="px-3 pb-2">
        <label className="flex items-center gap-1.5 rounded border border-border bg-background px-2 py-1">
          <Search size={12} className="shrink-0 text-foreground-subtle" />
          <input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search..."
            className="w-full bg-transparent text-xs text-foreground placeholder:text-foreground-subtle focus:outline-none"
          />
          {searchQuery ? (
            <button onClick={() => setSearchQuery('')} className="shrink-0 text-foreground-subtle hover:text-foreground">
              <X size={10} />
            </button>
          ) : null}
        </label>
      </div>

      {/* Open / Closed filter */}
      <div className="flex items-center gap-3 px-4 pb-2">
        <button
          onClick={() => setStateFilter('open')}
          className={cn(
            'flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider',
            stateFilter === 'open' ? 'text-foreground' : 'text-foreground-subtle hover:text-foreground-muted'
          )}
        >
          <GitPullRequest size={11} />
          Open
          {stateFilter === 'open' && prs ? (
            <span className="text-foreground-subtle">{prs.length}</span>
          ) : null}
        </button>
        <button
          onClick={() => setStateFilter('closed')}
          className={cn(
            'flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider',
            stateFilter === 'closed' ? 'text-foreground' : 'text-foreground-subtle hover:text-foreground-muted'
          )}
        >
          <Check size={11} />
          Closed
          {stateFilter === 'closed' && prs ? (
            <span className="text-foreground-subtle">{prs.length}</span>
          ) : null}
        </button>
      </div>

      {/* PR list */}
      <div className="flex-1 overflow-y-auto">
        {isLoadingGitInfo ? (
          <p className="px-4 py-4 text-xs text-foreground-subtle">Loading...</p>
        ) : !gitInfo ? (
          <p className="px-4 py-4 text-xs text-foreground-subtle">No GitHub repo detected</p>
        ) : isLoading ? (
          <p className="px-4 py-4 text-xs text-foreground-subtle">Loading pull requests...</p>
        ) : error ? (
          <p className="px-4 py-4 text-xs text-foreground-subtle">{error.message}</p>
        ) : filtered.length === 0 ? (
          <p className="px-4 py-4 text-xs text-foreground-subtle">
            {searchQuery ? 'No matches' : `No ${stateFilter} pull requests`}
          </p>
        ) : (
          filtered.map((pr) => (
            <button
              key={pr.number}
              onClick={() => onOpenPullRequest(pr.number)}
              className="flex w-full items-center gap-2 px-4 py-[5px] text-left transition-colors hover:bg-surface-hover"
            >
              <PrStateIcon pr={pr} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-xs text-foreground">{pr.title}</p>
                <p className="text-[10px] text-foreground-subtle">
                  #{pr.number} by {pr.user.login}
                </p>
              </div>
            </button>
          ))
        )}
      </div>
    </div>
  )
}

function PrStateIcon({ pr }: { pr: PullRequest }) {
  if (pr.merged_at) {
    return <GitMerge size={14} className="shrink-0 text-purple" />
  }
  if (pr.state === 'closed') {
    return <GitPullRequestClosed size={14} className="shrink-0 text-danger" />
  }
  if (pr.draft) {
    return <GitPullRequestDraft size={14} className="shrink-0 text-foreground-muted" />
  }
  return <GitPullRequest size={14} className="shrink-0 text-success" />
}
