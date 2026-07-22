import { useEffect, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Building2,
  CheckCheck,
  ChevronLeft,
  ChevronRight,
  Copy,
  ExternalLink,
  GitCommit,
  MapPin,
  Users
} from 'lucide-react'
import { cn } from '../../lib/cn'
import type {
  GitHubUserProfile,
  PaginatedPullRequestCommits,
  PullRequestCommit,
  PullRequestCommitAuthors
} from '../../../../shared/types'
import PlaceholderView from './PlaceholderView'
import Tooltip from '../../components/Tooltip'
import Loading from '../../components/Loading'
import CommitActorStack, { getCommitActors, type CommitActor } from '../../components/CommitActorStack'
import * as HoverCard from '../../components/HoverCard'
import { formatAbsoluteDate, formatRelativeTime, getCommitBody, getCommitSubject } from './pullRequestShared'
import { useCopyToClipboard } from '../../hooks/useCopyToClipboard'

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

  const apiPage = totalPages - safePage + 1

  const { data, isLoading, error, isFetching } = useQuery<PaginatedPullRequestCommits, Error>({
    queryKey: ['pull-request-commits', owner, repo, number, apiPage],
    queryFn: () => window.api.github.pulls.listCommits(owner, repo, number, apiPage, COMMITS_PER_PAGE),
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
    const nextApiPage = apiPage - 1

    void queryClient.prefetchQuery({
      queryKey: ['pull-request-commits', owner, repo, number, nextApiPage],
      queryFn: () => window.api.github.pulls.listCommits(owner, repo, number, nextApiPage, COMMITS_PER_PAGE)
    })
  }, [number, owner, queryClient, repo, safePage, totalPages, apiPage])

  if (totalCommits === 0) {
    return <PlaceholderView title="Commits" description="This pull request does not contain any commits yet." />
  }

  const items = [...(data?.items ?? [])].reverse()
  const lastApiPageSize = ((totalCommits - 1) % COMMITS_PER_PAGE) + 1
  const rangeEnd = lastApiPageSize + (safePage - 1) * COMMITS_PER_PAGE
  const rangeStart = Math.max(1, rangeEnd - items.length + 1)
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
        <div className="flex flex-col gap-5">
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
    <section className="grid grid-cols-[2rem_minmax(0,1fr)] gap-3">
      <div className="relative flex justify-center">
        <div className="bg-border absolute top-6 bottom-0 w-px" />
        <div className="border-border bg-background text-foreground-muted relative z-10 mt-0.5 flex size-6 items-center justify-center rounded-full border">
          <GitCommit size={12} />
        </div>
      </div>

      <div className="min-w-0">
        <div className="mb-2 flex items-center gap-2">
          <h3 className="text-foreground text-xs font-semibold">Commits on {group.label}</h3>
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
  const { copied: isCopied, copy: copySha } = useCopyToClipboard()

  return (
    <div
      role="link"
      tabIndex={0}
      aria-label={`Open commit ${subject}`}
      onClick={(event) => {
        if (event.target instanceof Element && event.target.closest('a, button')) return
        onOpenCommit(commit.sha, subject)
      }}
      onKeyDown={(event) => {
        if (event.target !== event.currentTarget || (event.key !== 'Enter' && event.key !== ' ')) return
        event.preventDefault()
        onOpenCommit(commit.sha, subject)
      }}
      className={cn(
        'group hover:bg-surface-hover focus-visible:bg-surface-hover cursor-pointer px-4 py-2.5 transition-colors outline-none',
        !isLast && 'border-border border-b'
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="text-foreground group-hover:text-accent group-focus-visible:text-accent min-w-0 flex-1 truncate text-left text-sm font-medium transition-colors">
              {subject}
            </span>
            {isMergeCommit ? (
              <span className="bg-purple/10 text-purple rounded-full px-1.5 py-0.5 text-[10px] font-medium">Merge</span>
            ) : null}
          </div>

          {bodyPreview ? <p className="text-foreground-muted mt-0.5 truncate text-xs">{bodyPreview}</p> : null}

          <div className="text-foreground-muted mt-1.5 flex flex-wrap items-center gap-x-1.5 gap-y-1 text-xs">
            <CommitActorStack actors={actors} />
            <span>
              <CommitActorNames actors={actors} /> committed {authoredLabel}
            </span>
            {commitDate != null ? (
              <span className="text-foreground-subtle">&middot; {formatAbsoluteDate(commitDate)}</span>
            ) : null}
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-0.5">
          <span className="text-foreground-muted rounded-md px-1.5 py-1 font-mono text-xs tabular-nums">
            {commit.sha.slice(0, 7)}
          </span>
          <Tooltip label={isCopied ? 'Copied' : 'Copy SHA'} side="top">
            <button
              type="button"
              onClick={() => copySha(commit.sha)}
              className="text-foreground-muted hover:bg-interactive hover:text-foreground inline-flex size-7 items-center justify-center rounded-md transition-[background-color,color,transform] active:scale-[0.96]"
              aria-label={isCopied ? 'Copied SHA' : 'Copy SHA'}
            >
              {isCopied ? <CheckCheck size={13} /> : <Copy size={13} />}
            </button>
          </Tooltip>
          <Tooltip label="Open commit on GitHub" side="top">
            <a
              href={commit.html_url}
              target="_blank"
              rel="noreferrer"
              className="text-foreground-muted hover:bg-interactive hover:text-foreground inline-flex size-7 items-center justify-center rounded-md transition-[background-color,color,transform] active:scale-[0.96]"
              aria-label="Open commit on GitHub"
            >
              <ExternalLink size={13} />
            </a>
          </Tooltip>
        </div>
      </div>
    </div>
  )
}

function CommitActorNames({ actors }: { actors: CommitActor[] }) {
  if (actors.length === 0) return <span className="text-foreground font-medium">Unknown author</span>

  return (
    <span className="text-foreground font-medium">
      {actors.map((actor, index) => {
        const separator =
          index === 0 ? '' : index === actors.length - 1 ? (actors.length === 2 ? ' and ' : ', and ') : ', '
        return (
          <span key={`${actor.name}-${actor.login ?? actor.email ?? index}`}>
            {separator}
            <CommitActorHoverCard actor={actor} />
          </span>
        )
      })}
    </span>
  )
}

function CommitActorHoverCard({ actor }: { actor: CommitActor }) {
  const [open, setOpen] = useState(false)
  const [shouldLoadProfile, setShouldLoadProfile] = useState(false)
  const { data: profile } = useQuery<GitHubUserProfile, Error>({
    queryKey: ['github-user-profile', actor.login],
    queryFn: () => window.api.github.users.get(actor.login!),
    enabled: shouldLoadProfile && actor.login != null,
    retry: false,
    staleTime: 5 * 60 * 1000
  })

  if (!actor.login) return <span>{actor.name}</span>

  const profileUrl = profile?.html_url ?? `https://github.com/${encodeURIComponent(actor.login)}`
  const displayName = profile?.name ?? actor.name
  const avatarUrl = profile?.avatar_url ?? actor.avatarUrl

  return (
    <HoverCard.Root open={open} onOpenChange={setOpen} openDelay={1200} closeDelay={150}>
      <HoverCard.Trigger asChild>
        <a
          href={profileUrl}
          target="_blank"
          rel="noreferrer"
          onPointerEnter={() => setShouldLoadProfile(true)}
          onFocus={() => setShouldLoadProfile(true)}
          className="decoration-border hover:text-accent underline underline-offset-2 transition-colors"
        >
          {actor.name}
        </a>
      </HoverCard.Trigger>
      <HoverCard.Content>
        <div className="flex gap-3">
          <div className="bg-interactive flex size-11 shrink-0 items-center justify-center overflow-hidden rounded-full">
            {avatarUrl ? (
              <img src={avatarUrl} alt={displayName} className="image-outline size-full rounded-full object-cover" />
            ) : (
              <GitCommit size={18} className="text-foreground-muted" />
            )}
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-foreground truncate text-sm font-semibold">{displayName}</p>
            <p className="text-foreground-muted truncate text-xs">@{actor.login}</p>
          </div>
        </div>

        {profile?.bio ? (
          <p className="text-foreground-muted mt-3 text-xs leading-relaxed text-pretty">{profile.bio}</p>
        ) : null}

        {profile?.company || profile?.location || profile ? (
          <div className="text-foreground-muted mt-3 flex flex-col gap-1.5 text-xs">
            {profile.company ? (
              <span className="flex items-center gap-2">
                <Building2 size={13} className="text-foreground-subtle shrink-0" />
                <span className="truncate">{profile.company}</span>
              </span>
            ) : null}
            {profile.location ? (
              <span className="flex items-center gap-2">
                <MapPin size={13} className="text-foreground-subtle shrink-0" />
                <span className="truncate">{profile.location}</span>
              </span>
            ) : null}
            {profile ? (
              <span className="flex items-center gap-2">
                <Users size={13} className="text-foreground-subtle shrink-0" />
                <span className="tabular-nums">
                  {profile.followers.toLocaleString()} follower{profile.followers === 1 ? '' : 's'}
                </span>
              </span>
            ) : null}
          </div>
        ) : null}

        <a
          href={profileUrl}
          target="_blank"
          rel="noreferrer"
          className="bg-interactive text-foreground hover:bg-interactive-hover mt-3 inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium transition-[background-color,color,transform] active:scale-[0.96]"
        >
          View GitHub profile
          <ExternalLink size={12} />
        </a>
      </HoverCard.Content>
    </HoverCard.Root>
  )
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
