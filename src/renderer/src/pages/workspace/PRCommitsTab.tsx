import { useEffect, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { CheckCheck, ChevronLeft, ChevronRight, Copy, ExternalLink, GitCommit } from 'lucide-react'
import { cn } from '../../lib/cn'
import type { PaginatedPullRequestCommits, PullRequestCommit, PullRequestCommitAuthors } from '../../../../shared/types'
import PlaceholderView from './PlaceholderView'
import Tooltip from '../../components/Tooltip'
import Loading from '../../components/Loading'
import CommitActorStack, { formatCommitActorNames, getCommitActors } from '../../components/CommitActorStack'
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
  totalCommits,
  onOpenCommit
}: {
  owner: string
  repo: string
  number: number
  totalCommits: number
  onOpenCommit: (sha: string, title?: string) => void
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
  const { data: resolvedAuthors } = useQuery<PullRequestCommitAuthors, Error>({
    queryKey: ['pull-request-commit-authors', owner, repo, number],
    queryFn: () => window.api.github.pulls.listCommitAuthors(owner, repo, number),
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
        <div className="border-border bg-surface rounded-xl border px-4 py-3">
          <p className="text-foreground-muted text-sm">{error.message}</p>
        </div>
      ) : null}

      {isLoading ? <Loading label="Loading commits..." /> : null}

      {items.length > 0 ? (
        <div className="flex flex-col gap-6">
          {commitGroups.map((group) => (
            <CommitDayGroup
              key={group.dateKey}
              group={group}
              resolvedAuthors={resolvedAuthors}
              onOpenCommit={onOpenCommit}
            />
          ))}
        </div>
      ) : null}

      {!isLoading && !error && items.length === 0 ? (
        <div className="border-border bg-surface rounded-xl border border-dashed px-6 py-8 text-center">
          <p className="text-foreground-muted text-sm">No commits were returned for this page.</p>
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

      <div className="border-border bg-surface mx-auto mt-10 flex w-full max-w-2xl flex-wrap items-center justify-between gap-3 rounded-xl border px-4 py-3">
        <div>
          <h2 className="text-foreground text-sm font-semibold">Commits</h2>
          <p className="text-foreground-muted mt-1 text-sm tabular-nums">
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

function CommitDayGroup({
  group,
  resolvedAuthors,
  onOpenCommit
}: {
  group: CommitDayGroupData
  resolvedAuthors: PullRequestCommitAuthors | undefined
  onOpenCommit: (sha: string, title?: string) => void
}) {
  return (
    <section className="grid grid-cols-[2.25rem_minmax(0,1fr)] gap-3">
      <div className="relative flex justify-center">
        <div className="bg-border absolute top-7 bottom-0 w-px" />
        <div className="border-border bg-background text-foreground-muted relative z-10 mt-1 flex size-7 items-center justify-center rounded-full border">
          <GitCommit size={14} />
        </div>
      </div>

      <div className="min-w-0">
        <div className="mb-3 flex items-center gap-2">
          <h3 className="text-foreground text-sm font-semibold">Commits on {group.label}</h3>
          <span className="text-foreground-subtle text-xs">
            {group.items.length} commit{group.items.length !== 1 ? 's' : ''}
          </span>
        </div>

        <div className="border-border bg-surface overflow-hidden rounded-xl border">
          {group.items.map((commit, index) => (
            <CommitRow
              key={commit.sha}
              commit={commit}
              isLast={index === group.items.length - 1}
              resolvedAuthors={resolvedAuthors}
              onOpenCommit={onOpenCommit}
            />
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
    'inline-flex items-center gap-1.5 rounded-lg border border-border bg-interactive px-3 py-2 text-xs font-medium text-foreground transition-[background-color,color,transform] hover:bg-interactive-hover active:scale-[0.96] disabled:cursor-not-allowed disabled:text-foreground-subtle disabled:hover:bg-interactive disabled:active:scale-100'

  return (
    <div className="flex items-center gap-2">
      <button type="button" onClick={onPrevious} disabled={page <= 1} className={buttonClass}>
        <ChevronLeft size={14} />
        Previous
      </button>
      <span className="text-foreground-muted min-w-20 text-center text-xs tabular-nums">
        Page {page} of {totalPages}
      </span>
      <button type="button" onClick={onNext} disabled={page >= totalPages} className={buttonClass}>
        Next
        <ChevronRight size={14} />
      </button>
    </div>
  )
}

function CommitRow({
  commit,
  isLast,
  resolvedAuthors,
  onOpenCommit
}: {
  commit: PullRequestCommit
  isLast: boolean
  resolvedAuthors: PullRequestCommitAuthors | undefined
  onOpenCommit: (sha: string, title?: string) => void
}) {
  const subject = getCommitSubject(commit.commit.message)
  const body = getCommitBody(commit.commit.message)
  const bodyPreview = body.split('\n')[0] ?? ''
  const actors = getCommitActors(commit, resolvedAuthors)
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
    <div className={cn('px-5 py-4', !isLast && 'border-border border-b')}>
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => onOpenCommit(commit.sha, subject)}
              className="text-foreground hover:text-accent min-w-0 flex-1 truncate text-left text-[15px] font-semibold transition-colors"
            >
              {subject}
            </button>
            {isMergeCommit ? (
              <span className="bg-purple/10 text-purple rounded-full px-2 py-0.5 text-[11px] font-medium">Merge</span>
            ) : null}
          </div>

          {bodyPreview ? <p className="text-foreground-muted mt-1 truncate text-sm">{bodyPreview}</p> : null}

          <div className="text-foreground-muted mt-3 flex flex-wrap items-center gap-x-2 gap-y-2 text-sm">
            <CommitActorStack actors={actors} />
            <span>
              <span className="text-foreground font-medium">{formatCommitActorNames(actors)}</span> committed{' '}
              {authoredLabel}
            </span>
            {commitDate != null ? (
              <span className="text-foreground-subtle">&middot; {formatAbsoluteDate(commitDate)}</span>
            ) : null}
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-1">
          <span className="text-foreground-muted rounded-md px-2 py-1 font-mono text-sm tabular-nums">
            {commit.sha.slice(0, 7)}
          </span>
          <Tooltip label={isCopied ? 'Copied' : 'Copy SHA'} side="top">
            <button
              type="button"
              onClick={handleCopySha}
              className="text-foreground-muted hover:bg-interactive hover:text-foreground inline-flex size-9 items-center justify-center rounded-lg transition-[background-color,color,transform] active:scale-[0.96]"
              aria-label={isCopied ? 'Copied SHA' : 'Copy SHA'}
            >
              {isCopied ? <CheckCheck size={16} /> : <Copy size={16} />}
            </button>
          </Tooltip>
          <Tooltip label="Open commit on GitHub" side="top">
            <a
              href={commit.html_url}
              target="_blank"
              rel="noreferrer"
              className="text-foreground-muted hover:bg-interactive hover:text-foreground inline-flex size-9 items-center justify-center rounded-lg transition-[background-color,color,transform] active:scale-[0.96]"
              aria-label="Open commit on GitHub"
            >
              <ExternalLink size={16} />
            </a>
          </Tooltip>
        </div>
      </div>
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
