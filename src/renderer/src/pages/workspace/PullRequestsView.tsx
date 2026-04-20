import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  ArrowDownUp,
  Check,
  GitMerge,
  GitPullRequest,
  GitPullRequestClosed,
  GitPullRequestDraft,
  MessageSquare,
  Search,
  X
} from 'lucide-react'
import { cn } from '../../lib/cn'
import type { GitRepoInfo, PullRequest } from '../../../../shared/types'
import { formatRelativeTime } from './pullRequestShared'
import PlaceholderView from './PlaceholderView'
import Loading from '../../components/Loading'

type PrStateFilter = 'open' | 'closed'
type SortKey = 'newest' | 'oldest' | 'recently-updated' | 'least-recently-updated'

interface PullRequestsViewProps {
  gitInfo: GitRepoInfo | null | undefined
  gitInfoError: Error | null
  isLoadingGitInfo: boolean
  onOpenPullRequest: (number: number) => void
}

export default function PullRequestsView({
  gitInfo,
  gitInfoError,
  isLoadingGitInfo,
  onOpenPullRequest
}: PullRequestsViewProps) {
  const [stateFilter, setStateFilter] = useState<PrStateFilter>('open')
  const [searchQuery, setSearchQuery] = useState('')
  const [sortKey, setSortKey] = useState<SortKey>('newest')
  const [isSortOpen, setIsSortOpen] = useState(false)

  const {
    data: prs,
    isLoading,
    error
  } = useQuery<PullRequest[], Error>({
    queryKey: ['pull-requests', gitInfo?.owner, gitInfo?.repo, stateFilter],
    queryFn: () =>
      window.api.github.pulls.list(gitInfo!.owner, gitInfo!.repo, { state: stateFilter as 'open' | 'closed' | 'all' }),
    enabled: gitInfo != null,
    retry: false
  })

  if (isLoadingGitInfo) {
    return <Loading label="Checking repository metadata..." />
  }

  if (gitInfoError) {
    return (
      <div className="border-border bg-surface max-w-xl rounded-lg border p-4">
        <h2 className="text-foreground text-sm font-semibold">Repository metadata unavailable</h2>
        <p className="text-foreground-muted mt-2 text-sm">{gitInfoError.message}</p>
      </div>
    )
  }

  if (!gitInfo) {
    return (
      <PlaceholderView
        title="Pull Requests"
        description="This folder is not mapped to a GitHub repository yet, so pull requests are unavailable."
      />
    )
  }

  const filtered = filterAndSort(prs ?? [], searchQuery, sortKey)

  return (
    <div className="mx-auto max-w-4xl">
      <div className="flex items-center gap-3">
        <label className="border-border bg-surface flex flex-1 items-center gap-2 rounded-lg border px-3 py-2">
          <Search size={15} className="text-foreground-subtle shrink-0" />
          <input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search pull requests..."
            className="text-foreground placeholder:text-foreground-subtle w-full bg-transparent text-sm focus:outline-none"
          />
          {searchQuery ? (
            <button
              type="button"
              onClick={() => setSearchQuery('')}
              className="text-foreground-subtle hover:text-foreground shrink-0"
            >
              <X size={14} />
            </button>
          ) : null}
        </label>
      </div>

      <div className="border-border mt-4 rounded-xl border">
        <div className="bg-surface flex items-center justify-between gap-3 px-4 py-3">
          <div className="flex items-center gap-4">
            <button
              type="button"
              onClick={() => setStateFilter('open')}
              className={cn(
                'inline-flex items-center gap-1.5 text-sm font-medium',
                stateFilter === 'open' ? 'text-foreground' : 'text-foreground-muted hover:text-foreground'
              )}
            >
              <GitPullRequest size={15} />
              Open
              {stateFilter === 'open' && prs ? <span className="text-foreground-muted">{prs.length}</span> : null}
            </button>
            <button
              type="button"
              onClick={() => setStateFilter('closed')}
              className={cn(
                'inline-flex items-center gap-1.5 text-sm font-medium',
                stateFilter === 'closed' ? 'text-foreground' : 'text-foreground-muted hover:text-foreground'
              )}
            >
              <Check size={15} />
              Closed
              {stateFilter === 'closed' && prs ? <span className="text-foreground-muted">{prs.length}</span> : null}
            </button>
          </div>

          <div className="relative">
            <button
              type="button"
              onClick={() => setIsSortOpen(!isSortOpen)}
              className="text-foreground-muted hover:text-foreground inline-flex items-center gap-1.5 text-sm"
            >
              <ArrowDownUp size={14} />
              Sort
            </button>
            {isSortOpen ? (
              <>
                <div className="fixed inset-0 z-10" onClick={() => setIsSortOpen(false)} />
                <div className="border-border bg-surface absolute right-0 z-20 mt-2 w-56 overflow-hidden rounded-lg border shadow-xl">
                  <div className="border-border text-foreground-muted border-b px-3 py-2 text-xs font-medium">
                    Sort by
                  </div>
                  {SORT_OPTIONS.map((option) => (
                    <button
                      key={option.key}
                      type="button"
                      onClick={() => {
                        setSortKey(option.key)
                        setIsSortOpen(false)
                      }}
                      className="text-foreground hover:bg-surface-hover flex w-full items-center gap-2 px-3 py-2 text-left text-sm"
                    >
                      <span className="inline-flex size-4 items-center justify-center">
                        {sortKey === option.key ? <Check size={13} /> : null}
                      </span>
                      {option.label}
                    </button>
                  ))}
                </div>
              </>
            ) : null}
          </div>
        </div>

        {isLoading ? (
          <div className="flex justify-center px-4 py-8">
            <Loading label="Loading pull requests..." />
          </div>
        ) : error ? (
          <div className="text-foreground-muted px-4 py-8 text-center text-sm">{error.message}</div>
        ) : filtered.length === 0 ? (
          <div className="text-foreground-muted px-4 py-8 text-center text-sm">
            {searchQuery ? 'No pull requests match your search.' : `No ${stateFilter} pull requests.`}
          </div>
        ) : (
          <div>
            {filtered.map((pr) => (
              <PullRequestRow key={pr.number} pr={pr} onClick={() => onOpenPullRequest(pr.number)} />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function PullRequestRow({ pr, onClick }: { pr: PullRequest; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="border-border hover:bg-surface-hover flex w-full items-start gap-3 border-t px-4 py-3 text-left transition-colors"
    >
      <PullRequestStateIcon pr={pr} />

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-foreground hover:text-accent text-sm font-semibold">{pr.title}</span>
          {pr.labels.map((label) => (
            <span
              key={label.name}
              className="rounded-full border px-2 py-0.5 text-[11px] leading-tight font-medium"
              style={{
                borderColor: `#${label.color}60`,
                backgroundColor: `#${label.color}18`,
                color: `#${label.color}`
              }}
            >
              {label.name}
            </span>
          ))}
        </div>
        <p className="text-foreground-subtle mt-1 text-xs">
          #{pr.number} opened {formatRelativeTime(pr.created_at)} by {pr.user.login}
          {pr.draft ? (
            <>
              {' '}
              <span className="border-border text-foreground-muted ml-1 rounded border px-1.5 py-0.5 text-[10px] font-medium">
                Draft
              </span>
            </>
          ) : null}
        </p>
      </div>

      <div className="flex shrink-0 items-center gap-3">
        {pr.requested_reviewers.length > 0 ? (
          <div className="flex -space-x-1.5">
            {pr.requested_reviewers.slice(0, 3).map((reviewer) => (
              <img
                key={reviewer.login}
                src={reviewer.avatar_url}
                alt={reviewer.login}
                title={reviewer.login}
                className="border-background size-5 rounded-full border"
              />
            ))}
            {pr.requested_reviewers.length > 3 ? (
              <span className="border-background bg-interactive text-foreground-muted flex size-5 items-center justify-center rounded-full border text-[9px]">
                +{pr.requested_reviewers.length - 3}
              </span>
            ) : null}
          </div>
        ) : null}

        {pr.comments > 0 ? (
          <span className="text-foreground-muted inline-flex items-center gap-1 text-xs">
            <MessageSquare size={13} />
            {pr.comments}
          </span>
        ) : null}
      </div>
    </button>
  )
}

function PullRequestStateIcon({ pr }: { pr: PullRequest }) {
  if (pr.merged_at) {
    return (
      <span className="bg-purple/15 mt-0.5 inline-flex size-5 shrink-0 items-center justify-center rounded-full">
        <GitMerge size={12} strokeWidth={2} className="text-purple" />
      </span>
    )
  }
  if (pr.state === 'closed') {
    return (
      <span className="bg-danger/15 mt-0.5 inline-flex size-5 shrink-0 items-center justify-center rounded-full">
        <GitPullRequestClosed size={12} strokeWidth={2} className="text-danger" />
      </span>
    )
  }
  if (pr.draft) {
    return (
      <span className="bg-foreground-muted/15 mt-0.5 inline-flex size-5 shrink-0 items-center justify-center rounded-full">
        <GitPullRequestDraft size={12} strokeWidth={2} className="text-foreground-muted" />
      </span>
    )
  }
  return (
    <span className="bg-success/15 mt-0.5 inline-flex size-5 shrink-0 items-center justify-center rounded-full">
      <GitPullRequest size={12} strokeWidth={2} className="text-success" />
    </span>
  )
}

const SORT_OPTIONS: { key: SortKey; label: string }[] = [
  { key: 'newest', label: 'Newest' },
  { key: 'oldest', label: 'Oldest' },
  { key: 'recently-updated', label: 'Recently updated' },
  { key: 'least-recently-updated', label: 'Least recently updated' }
]

function filterAndSort(prs: PullRequest[], query: string, sort: SortKey): PullRequest[] {
  let result = prs

  if (query.trim()) {
    const lower = query.toLowerCase()
    result = result.filter(
      (pr) =>
        pr.title.toLowerCase().includes(lower) ||
        pr.user.login.toLowerCase().includes(lower) ||
        String(pr.number).includes(lower) ||
        pr.labels.some((l) => l.name.toLowerCase().includes(lower))
    )
  }

  const sorted = [...result]
  switch (sort) {
    case 'newest':
      sorted.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
      break
    case 'oldest':
      sorted.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
      break
    case 'recently-updated':
      sorted.sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime())
      break
    case 'least-recently-updated':
      sorted.sort((a, b) => new Date(a.updated_at).getTime() - new Date(b.updated_at).getTime())
      break
  }

  return sorted
}
