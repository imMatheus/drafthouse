import { useEffect, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { CheckCheck, ChevronLeft, ChevronRight, Copy, ExternalLink, GitCommit } from 'lucide-react'
import { cn } from '../../lib/cn'
import type { PaginatedPullRequestCommits, PullRequestCommit } from '../../../../shared/types'
import PlaceholderView from './PlaceholderView'
import { formatAbsoluteDate, formatRelativeTime } from './pullRequestShared'

const COMMITS_PER_PAGE = 100

interface CommitDayGroupData {
  dateKey: string
  label: string
  items: PullRequestCommit[]
}

export default function PRCommitsTab({
  owner,
  repo,
  number,
  totalCommits
}: {
  owner: string
  repo: string
  number: number
  totalCommits: number
}) {
  const [page, setPage] = useState(1)
  const queryClient = useQueryClient()
  const totalPages = Math.max(1, Math.ceil(totalCommits / COMMITS_PER_PAGE))
  const safePage = Math.min(page, totalPages)

  useEffect(() => {
    setPage(1)
  }, [owner, repo, number])

  useEffect(() => {
    if (page !== safePage) {
      setPage(safePage)
    }
  }, [page, safePage])

  const { data, isLoading, error, isFetching } = useQuery<PaginatedPullRequestCommits, Error>({
    queryKey: ['pull-request-commits', owner, repo, number, safePage],
    queryFn: () => window.api.github.pulls.listCommits(owner, repo, number, safePage, COMMITS_PER_PAGE),
    retry: false,
    enabled: totalCommits > 0
  })

  useEffect(() => {
    if (safePage >= totalPages) return

    void queryClient.prefetchQuery({
      queryKey: ['pull-request-commits', owner, repo, number, safePage + 1],
      queryFn: () => window.api.github.pulls.listCommits(owner, repo, number, safePage + 1, COMMITS_PER_PAGE)
    })
  }, [number, owner, queryClient, repo, safePage, totalPages])

  if (totalCommits === 0) {
    return <PlaceholderView title="Commits" description="This pull request does not contain any commits yet." />
  }

  const items = data?.items ?? []
  const rangeStart = (safePage - 1) * COMMITS_PER_PAGE + 1
  const rangeEnd = Math.min(totalCommits, rangeStart + Math.max(items.length - 1, 0))
  const commitGroups = groupCommitsByDay(items)

  return (
    <div className="flex flex-col gap-4">
      {error ? (
        <div className="rounded-xl border border-border bg-surface px-4 py-3">
          <p className="text-sm text-foreground-muted">{error.message}</p>
        </div>
      ) : null}

      {isLoading ? <p className="text-sm text-foreground-muted">Loading commits...</p> : null}

      {items.length > 0 ? (
        <div className="flex flex-col gap-6">
          {commitGroups.map((group) => (
            <CommitDayGroup key={group.dateKey} group={group} />
          ))}
        </div>
      ) : null}

      {!isLoading && !error && items.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border bg-surface px-6 py-8 text-center">
          <p className="text-sm text-foreground-muted">No commits were returned for this page.</p>
        </div>
      ) : null}

      {totalPages > 1 ? (
        <div className="flex justify-end">
          <PRCommitsPagination
            page={safePage}
            totalPages={totalPages}
            onPrevious={() => setPage((currentPage) => Math.max(1, currentPage - 1))}
            onNext={() => setPage((currentPage) => Math.min(totalPages, currentPage + 1))}
          />
        </div>
      ) : null}

      <div className="flex mt-10 mx-auto max-w-2xl w-full flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-surface px-4 py-3">
        <div>
          <h2 className="text-sm font-semibold text-foreground">Commits</h2>
          <p className="mt-1 text-sm text-foreground-muted">
            Showing {rangeStart}-{rangeEnd} of {totalCommits} commit{totalCommits !== 1 ? 's' : ''}
            {isFetching && !isLoading ? ' \u2022 Updating\u2026' : ''}
          </p>
        </div>
        <PRCommitsPagination
          page={safePage}
          totalPages={totalPages}
          onPrevious={() => setPage((currentPage) => Math.max(1, currentPage - 1))}
          onNext={() => setPage((currentPage) => Math.min(totalPages, currentPage + 1))}
        />
      </div>
    </div>
  )
}

function CommitDayGroup({ group }: { group: CommitDayGroupData }) {
  return (
    <section className="grid grid-cols-[2.25rem_minmax(0,1fr)] gap-3">
      <div className="relative flex justify-center">
        <div className="absolute top-7 bottom-0 w-px bg-border" />
        <div className="relative z-10 mt-1 flex size-7 items-center justify-center rounded-full border border-border bg-background text-foreground-muted">
          <GitCommit size={14} />
        </div>
      </div>

      <div className="min-w-0">
        <div className="mb-3 flex items-center gap-2">
          <h3 className="text-sm font-semibold text-foreground">Commits on {group.label}</h3>
          <span className="text-xs text-foreground-subtle">
            {group.items.length} commit{group.items.length !== 1 ? 's' : ''}
          </span>
        </div>

        <div className="overflow-hidden rounded-xl border border-border bg-surface">
          {group.items.map((commit, index) => (
            <CommitRow key={commit.sha} commit={commit} isLast={index === group.items.length - 1} />
          ))}
        </div>
      </div>
    </section>
  )
}

function PRCommitsPagination({
  page,
  totalPages,
  onPrevious,
  onNext
}: {
  page: number
  totalPages: number
  onPrevious: () => void
  onNext: () => void
}) {
  const buttonClass =
    'inline-flex items-center gap-1.5 rounded-lg border border-border bg-interactive px-3 py-2 text-xs font-medium text-foreground transition-colors hover:bg-interactive-hover disabled:cursor-not-allowed disabled:text-foreground-subtle disabled:hover:bg-interactive'

  return (
    <div className="flex items-center gap-2">
      <button type="button" onClick={onPrevious} disabled={page <= 1} className={buttonClass}>
        <ChevronLeft size={14} />
        Previous
      </button>
      <span className="min-w-20 text-center text-xs text-foreground-muted">
        Page {page} of {totalPages}
      </span>
      <button type="button" onClick={onNext} disabled={page >= totalPages} className={buttonClass}>
        Next
        <ChevronRight size={14} />
      </button>
    </div>
  )
}

function CommitRow({ commit, isLast }: { commit: PullRequestCommit; isLast: boolean }) {
  const subject = getCommitSubject(commit.commit.message)
  const body = getCommitBody(commit.commit.message)
  const bodyPreview = body.split('\n')[0] ?? ''
  const actors = getCommitActors(commit)
  const commitDate = commit.commit.author?.date ?? commit.commit.committer?.date ?? null
  const authoredLabel = commitDate != null ? formatRelativeTime(commitDate) : 'Date unavailable'
  const isMergeCommit = commit.parents.length > 1
  const [isCopied, setIsCopied] = useState(false)

  const handleCopySha = async (): Promise<void> => {
    try {
      await navigator.clipboard.writeText(commit.sha)
      setIsCopied(true)
      window.setTimeout(() => setIsCopied(false), 1500)
    } catch (error) {
      console.error('Failed to copy commit SHA:', error)
    }
  }

  return (
    <div className={cn('px-5 py-4', !isLast && 'border-b border-border')}>
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <p className="truncate text-[15px] font-semibold text-foreground">{subject}</p>
            {isMergeCommit ? (
              <span className="rounded-full bg-purple/10 px-2 py-0.5 text-[11px] font-medium text-purple">Merge</span>
            ) : null}
          </div>

          {bodyPreview ? <p className="mt-1 truncate text-sm text-foreground-muted">{bodyPreview}</p> : null}

          <div className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-2 text-sm text-foreground-muted">
            <CommitActorStack actors={actors} />
            <span>
              <span className="font-medium text-foreground">{formatCommitActorNames(actors)}</span> committed{' '}
              {authoredLabel}
            </span>
            {commitDate != null ? (
              <span className="text-foreground-subtle">&middot; {formatAbsoluteDate(commitDate)}</span>
            ) : null}
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-1">
          <span className="rounded-md px-2 py-1 font-mono text-sm text-foreground-muted">{commit.sha.slice(0, 7)}</span>
          <button
            type="button"
            onClick={handleCopySha}
            className="inline-flex size-9 items-center justify-center rounded-lg text-foreground-muted transition-colors hover:bg-interactive hover:text-foreground"
            title={isCopied ? 'Copied' : 'Copy SHA'}
            aria-label={isCopied ? 'Copied SHA' : 'Copy SHA'}
          >
            {isCopied ? <CheckCheck size={16} /> : <Copy size={16} />}
          </button>
          <a
            href={commit.html_url}
            target="_blank"
            rel="noreferrer"
            className="inline-flex size-9 items-center justify-center rounded-lg text-foreground-muted transition-colors hover:bg-interactive hover:text-foreground"
            title="Open commit on GitHub"
            aria-label="Open commit on GitHub"
          >
            <ExternalLink size={16} />
          </a>
        </div>
      </div>
    </div>
  )
}

function CommitActorStack({ actors }: { actors: Array<{ name: string; avatarUrl: string | null }> }) {
  const visibleActors = actors.slice(0, 2)

  return (
    <div className="flex items-center">
      {visibleActors.map((actor, index) => (
        <div
          key={`${actor.name}-${index}`}
          className={cn(
            'flex size-6 items-center justify-center overflow-hidden rounded-full border border-surface bg-interactive',
            index > 0 && '-ml-2'
          )}
        >
          {actor.avatarUrl ? (
            <img src={actor.avatarUrl} alt={actor.name} className="size-full object-cover" />
          ) : (
            <GitCommit size={12} className="text-foreground-muted" />
          )}
        </div>
      ))}
    </div>
  )
}

function getCommitSubject(message: string): string {
  return message.split('\n')[0]?.trim() || 'Untitled commit'
}

function getCommitBody(message: string): string {
  return message.split('\n').slice(1).join('\n').trim()
}

function groupCommitsByDay(commits: PullRequestCommit[]): CommitDayGroupData[] {
  const groups = new Map<string, CommitDayGroupData>()

  for (const commit of commits) {
    const commitDate = commit.commit.author?.date ?? commit.commit.committer?.date ?? null
    const dateKey = commitDate ? commitDate.slice(0, 10) : 'unknown'
    const existingGroup = groups.get(dateKey)

    if (existingGroup) {
      existingGroup.items.push(commit)
      continue
    }

    groups.set(dateKey, {
      dateKey,
      label: commitDate ? formatCommitGroupLabel(commitDate) : 'Unknown date',
      items: [commit]
    })
  }

  return Array.from(groups.values())
}

function formatCommitGroupLabel(dateStr: string): string {
  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric'
  }).format(new Date(dateStr))
}

function getCommitActors(commit: PullRequestCommit): Array<{ name: string; avatarUrl: string | null }> {
  const entries = [
    {
      name: commit.author?.login ?? commit.commit.author?.name ?? null,
      avatarUrl: commit.author?.avatar_url ?? null
    },
    {
      name: commit.committer?.login ?? commit.commit.committer?.name ?? null,
      avatarUrl: commit.committer?.avatar_url ?? null
    }
  ].filter((entry): entry is { name: string; avatarUrl: string | null } => Boolean(entry.name))

  const deduped = new Map<string, { name: string; avatarUrl: string | null }>()

  for (const entry of entries) {
    const key = entry.name.toLowerCase()
    if (!deduped.has(key)) {
      deduped.set(key, entry)
    }
  }

  return Array.from(deduped.values())
}

function formatCommitActorNames(actors: Array<{ name: string }>): string {
  if (actors.length === 0) return 'Unknown author'
  if (actors.length === 1) return actors[0]!.name
  if (actors.length === 2) return `${actors[0]!.name} and ${actors[1]!.name}`
  return `${actors[0]!.name}, ${actors[1]!.name}, and ${actors.length - 2} others`
}
