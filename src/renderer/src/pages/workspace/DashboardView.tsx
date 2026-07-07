import { useState, type ReactNode } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { GitBranch, GitCommit, GitFork, Star } from 'lucide-react'
import type {
  CommitActivityWeek,
  GitHubCommit,
  GitHubRepoDetails,
  GitRepoInfo,
  PullRequest,
  RepoCommitActivity,
  RepoDailyCommits
} from '../../../../shared/types'
import { cn } from '../../lib/cn'
import { prStateLabel } from '../../lib/prMentions'
import { useAuth } from '../../hooks/useAuth'
import { prQueryKeys, usePullRequestList } from '../../hooks/usePullRequests'
import Loading from '../../components/Loading'
import PRStateIcon from '../../components/PRStateIcon'
import Tooltip from '../../components/Tooltip'
import { formatRelativeTime } from './pullRequestShared'

const PR_LIST_LIMIT = 8
const COMMIT_LIST_LIMIT = 8

interface DashboardViewProps {
  gitInfo: GitRepoInfo
  onOpenPullRequest: (number: number) => void
  onOpenCommit: (sha: string, title?: string) => void
}

export default function DashboardView({ gitInfo, onOpenPullRequest, onOpenCommit }: DashboardViewProps) {
  const { owner, repo } = gitInfo
  const { user } = useAuth()
  const login = user?.login

  const { data: details, error: detailsError } = useQuery<GitHubRepoDetails, Error>({
    queryKey: ['repo-details', owner, repo],
    queryFn: () => window.api.github.repos.get(owner, repo),
    staleTime: 5 * 60_000,
    retry: false
  })

  // null shows the rolling last-12-months view; a year shows that calendar year.
  const [selectedYear, setSelectedYear] = useState<number | null>(null)
  const currentYear = new Date().getUTCFullYear()

  const activity = useQuery<RepoCommitActivity, Error>({
    queryKey: ['repo-commit-activity', owner, repo],
    queryFn: () => window.api.github.repos.commitActivity(owner, repo),
    enabled: selectedYear == null,
    staleTime: 15 * 60_000,
    retry: false,
    // GitHub computes commit stats lazily and reports `pending` until they're
    // ready — poll until the real data lands.
    refetchInterval: (query) => (query.state.data?.pending ? 2500 : false)
  })

  const queryClient = useQueryClient()

  const dailyCommitsQueryOptions = (year: number) => ({
    queryKey: ['repo-daily-commits', owner, repo, year],
    queryFn: () =>
      window.api.github.repos.dailyCommits(
        owner,
        repo,
        new Date(Date.UTC(year, 0, 1)).toISOString(),
        new Date(Date.UTC(year + 1, 0, 1)).toISOString()
      ),
    // Past years never change; only the current year gets a staleness window.
    // The long gcTime keeps year hopping instant within a session.
    staleTime: year < currentYear ? Infinity : 5 * 60_000,
    gcTime: 60 * 60_000,
    retry: false
  })

  const yearActivity = useQuery<RepoDailyCommits, Error>({
    ...dailyCommitsQueryOptions(selectedYear ?? currentYear),
    enabled: selectedYear != null
  })

  // Warm the cache the moment a year button is hovered or focused, so the
  // data is usually already in flight (or cached) by click time.
  const prefetchYear = (year: number): void => {
    void queryClient.prefetchQuery(dailyCommitsQueryOptions(year))
  }

  const createdYear = details ? new Date(details.created_at).getUTCFullYear() : currentYear
  const years: number[] = []
  for (let year = currentYear; year >= createdYear; year--) years.push(year)

  const recentPRs = usePullRequestList(gitInfo, { state: 'all' })

  const myPRs = useQuery<PullRequest[], Error>({
    queryKey: prQueryKeys.search(owner, repo, 'all', `author:${login}`),
    queryFn: () => window.api.github.pulls.search(owner, repo, { query: `author:${login}` }),
    enabled: login != null,
    staleTime: 30_000,
    retry: false
  })

  const reviewRequests = useQuery<PullRequest[], Error>({
    queryKey: prQueryKeys.search(owner, repo, 'open', `review-requested:${login}`),
    queryFn: () => window.api.github.pulls.search(owner, repo, { query: `review-requested:${login}`, state: 'open' }),
    enabled: login != null,
    staleTime: 30_000,
    retry: false
  })

  const commits = useQuery<GitHubCommit[], Error>({
    queryKey: ['repo-recent-commits', owner, repo],
    queryFn: () => window.api.github.commits.list(owner, repo, { perPage: COMMIT_LIST_LIMIT }),
    staleTime: 60_000,
    retry: false
  })

  const signedOutLabel = login == null ? 'Sign in to GitHub to see these.' : null

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-4">
      <header className="animate-card-in">
        <h1 className="text-foreground text-xl font-semibold tracking-tight">
          {owner}/{repo}
        </h1>
        {details?.description ? (
          <p className="text-foreground-muted mt-1 text-sm text-pretty">{details.description}</p>
        ) : null}
        {detailsError ? <p className="text-danger mt-1 text-xs">Couldn't load repository details.</p> : null}
        {details ? (
          <div className="text-foreground-muted mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
            <span className="text-foreground flex items-center gap-1 tabular-nums">
              <Star size={12} />
              {details.stargazers_count.toLocaleString()}
            </span>
            <span className="text-foreground flex items-center gap-1 tabular-nums">
              <GitFork size={12} />
              {details.forks_count.toLocaleString()}
            </span>
            <span className="text-foreground flex items-center gap-1">
              <GitBranch size={12} />
              {details.default_branch}
            </span>
            {details.language ? <span>{details.language}</span> : null}
            <span>Last push {formatRelativeTime(details.pushed_at)}</span>
          </div>
        ) : null}
      </header>

      <DashboardCard title="Commit activity" className="animate-card-in [animation-delay:60ms]">
        <div className="flex items-start gap-6 px-4 py-3">
          <div className="min-w-0 flex-1">
            {selectedYear == null ? (
              activity.isLoading || activity.data?.pending ? (
                <ActivityGridSkeleton />
              ) : activity.error ? (
                <p className="text-foreground-muted text-xs">Couldn't load commit activity.</p>
              ) : activity.data && activity.data.weeks.length > 0 ? (
                <ActivityGrid weeks={weeksFromCommitActivity(activity.data.weeks)} year={null} truncated={false} />
              ) : (
                <p className="text-foreground-muted text-xs">No commit activity yet.</p>
              )
            ) : yearActivity.isLoading ? (
              <ActivityGridSkeleton />
            ) : yearActivity.error ? (
              <p className="text-foreground-muted text-xs">Couldn't load commit activity.</p>
            ) : yearActivity.data ? (
              <ActivityGrid
                weeks={weeksFromDailyCounts(yearActivity.data.days, selectedYear)}
                year={selectedYear}
                truncated={yearActivity.data.truncated}
              />
            ) : null}
          </div>
          <YearPicker years={years} selected={selectedYear} onSelect={setSelectedYear} onPrefetch={prefetchYear} />
        </div>
      </DashboardCard>

      <div className="grid gap-4 md:grid-cols-2">
        <DashboardCard
          title="Needs your review"
          count={reviewRequests.data?.length}
          className="animate-card-in [animation-delay:120ms]"
        >
          {signedOutLabel ? (
            <CardMessage>{signedOutLabel}</CardMessage>
          ) : (
            <PullRequestList
              query={reviewRequests}
              emptyLabel="No reviews waiting on you."
              onOpenPullRequest={onOpenPullRequest}
            />
          )}
        </DashboardCard>

        <DashboardCard
          title="Your pull requests"
          count={myPRs.data?.length}
          className="animate-card-in [animation-delay:180ms]"
        >
          {signedOutLabel ? (
            <CardMessage>{signedOutLabel}</CardMessage>
          ) : (
            <PullRequestList
              query={myPRs}
              emptyLabel="You have no pull requests in this repo."
              onOpenPullRequest={onOpenPullRequest}
            />
          )}
        </DashboardCard>

        <DashboardCard title="Recently updated" className="animate-card-in [animation-delay:240ms]">
          <PullRequestList query={recentPRs} emptyLabel="No pull requests yet." onOpenPullRequest={onOpenPullRequest} />
        </DashboardCard>

        <DashboardCard title="Recent commits" className="animate-card-in [animation-delay:300ms]">
          {commits.isLoading ? (
            <CardMessage>
              <Loading size="sm" label="Loading…" />
            </CardMessage>
          ) : commits.error ? (
            <CardMessage>Couldn't load commits.</CardMessage>
          ) : commits.data && commits.data.length > 0 ? (
            commits.data.slice(0, COMMIT_LIST_LIMIT).map((commit) => {
              const title = commit.commit.message.split('\n')[0]
              const authorName = commit.author?.login ?? commit.commit.author?.name ?? 'Unknown'
              const date = commit.commit.author?.date
              return (
                <button
                  key={commit.sha}
                  onClick={() => onOpenCommit(commit.sha, title)}
                  className="hover:bg-foreground/5 active:bg-foreground/10 flex w-full items-center gap-2.5 px-4 py-1.5 text-left transition-colors"
                >
                  {commit.author?.avatar_url ? (
                    <img
                      src={commit.author.avatar_url}
                      alt={authorName}
                      className="image-outline size-4 shrink-0 rounded-full"
                    />
                  ) : (
                    <GitCommit size={14} className="text-foreground-muted shrink-0" />
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="text-foreground truncate text-xs">{title}</p>
                    <p className="text-foreground-muted text-[10px]">
                      {authorName}
                      {date ? ` · ${formatRelativeTime(date)}` : ''}
                    </p>
                  </div>
                  <span className="text-foreground-muted shrink-0 font-mono text-[10px]">{commit.sha.slice(0, 7)}</span>
                </button>
              )
            })
          ) : (
            <CardMessage>No commits yet.</CardMessage>
          )}
        </DashboardCard>
      </div>
    </div>
  )
}

function DashboardCard({
  title,
  count,
  className,
  children
}: {
  title: string
  count?: number
  className?: string
  children: ReactNode
}) {
  return (
    <section className={cn('border-border bg-surface overflow-hidden rounded-xl border', className)}>
      <div className="border-border flex items-center justify-between border-b px-4 py-2.5">
        <h2 className="text-foreground text-xs font-semibold">{title}</h2>
        {count != null ? <span className="text-foreground-muted text-xs tabular-nums">{count}</span> : null}
      </div>
      <div className="py-1">{children}</div>
    </section>
  )
}

function CardMessage({ children }: { children: ReactNode }) {
  return <div className="text-foreground-muted px-4 py-3 text-xs">{children}</div>
}

function PullRequestList({
  query,
  emptyLabel,
  onOpenPullRequest
}: {
  query: { data: PullRequest[] | undefined; isLoading: boolean; error: Error | null }
  emptyLabel: string
  onOpenPullRequest: (number: number) => void
}) {
  if (query.isLoading) {
    return (
      <CardMessage>
        <Loading size="sm" label="Loading…" />
      </CardMessage>
    )
  }
  if (query.error) return <CardMessage>Couldn't load pull requests.</CardMessage>
  const prs = query.data ?? []
  if (prs.length === 0) return <CardMessage>{emptyLabel}</CardMessage>

  return (
    <>
      {prs.slice(0, PR_LIST_LIMIT).map((pr) => (
        <button
          key={pr.number}
          onClick={() => onOpenPullRequest(pr.number)}
          className="hover:bg-foreground/5 active:bg-foreground/10 flex w-full items-center gap-2.5 px-4 py-1.5 text-left transition-colors"
        >
          <PRStateIcon state={prStateLabel(pr)} size={14} />
          <div className="min-w-0 flex-1">
            <p className="text-foreground truncate text-xs">{pr.title}</p>
            <p className="text-foreground-muted text-[10px]">
              #{pr.number} · {pr.user.login} · updated {formatRelativeTime(pr.updated_at)}
            </p>
          </div>
        </button>
      ))}
    </>
  )
}

const MONTH_LABELS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const DAY_LABELS = ['', 'Mon', '', 'Wed', '', 'Fri', '']

// Cell size (10px) plus the 3px column gap — used to position month labels.
const WEEK_COLUMN_PITCH = 13

// All grid dates are handled in UTC: GitHub's commit-activity weeks are
// UTC-aligned, and the daily-commit buckets are keyed the same way, so the
// two views stay consistent regardless of the local timezone.
// A day is a commit count, 'future' for days still to come (drawn as faint
// empty squares), or null for padding days outside the range (drawn as gaps).
type ActivityDay = number | 'future' | null

interface ActivityWeek {
  // Unix seconds of the week's Sunday.
  start: number
  // Sun..Sat.
  days: ActivityDay[]
}

function weeksFromCommitActivity(weeks: CommitActivityWeek[]): ActivityWeek[] {
  return weeks.map((week) => ({ start: week.week, days: week.days }))
}

// Lay a year's daily counts onto Sunday-aligned columns. Days belonging to
// neighboring years render as gaps; days of the year that haven't happened
// yet render as faint empty squares.
function weeksFromDailyCounts(days: Record<string, number>, year: number): ActivityWeek[] {
  const cursor = new Date(Date.UTC(year, 0, 1))
  cursor.setUTCDate(cursor.getUTCDate() - cursor.getUTCDay())
  const end = new Date(Date.UTC(year + 1, 0, 1))
  const today = new Date()
  const weeks: ActivityWeek[] = []
  while (cursor < end) {
    const week: ActivityWeek = { start: Math.floor(cursor.getTime() / 1000), days: [] }
    for (let i = 0; i < 7; i++) {
      const inYear = cursor.getUTCFullYear() === year
      week.days.push(!inYear ? null : cursor > today ? 'future' : (days[utcDayKey(cursor)] ?? 0))
      cursor.setUTCDate(cursor.getUTCDate() + 1)
    }
    weeks.push(week)
  }
  return weeks
}

function utcDayKey(date: Date): string {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')}`
}

function cellTooltip(count: number, weekStart: number, dayIndex: number): string {
  const date = new Date(weekStart * 1000)
  date.setUTCDate(date.getUTCDate() + dayIndex)
  const formatted = date.toLocaleDateString(undefined, {
    timeZone: 'UTC',
    month: 'long',
    day: 'numeric',
    year: 'numeric'
  })
  return count === 0 ? `No commits on ${formatted}` : `${count} commit${count !== 1 ? 's' : ''} on ${formatted}`
}

function ActivityGrid({ weeks, year, truncated }: { weeks: ActivityWeek[]; year: number | null; truncated: boolean }) {
  const dayCounts = weeks.flatMap((week) => week.days).filter((count): count is number => typeof count === 'number')
  const totalCommits = dayCounts.reduce((sum, count) => sum + count, 0)
  const maxDay = Math.max(1, ...dayCounts)

  // A month label above the first week that enters it, skipping labels that
  // would crowd the previous one.
  const monthLabels: Array<{ index: number; label: string }> = []
  let lastMonth = -1
  weeks.forEach((week, index) => {
    const month = new Date(week.start * 1000).getUTCMonth()
    if (month !== lastMonth) {
      const prev = monthLabels[monthLabels.length - 1]
      if (!prev || index - prev.index >= 3) monthLabels.push({ index, label: MONTH_LABELS[month] })
      lastMonth = month
    }
  })

  return (
    <div>
      <p className="text-foreground mb-3 text-xs tabular-nums">
        {truncated ? 'Over ' : ''}
        {totalCommits.toLocaleString()} commit{totalCommits !== 1 ? 's' : ''}{' '}
        {year == null ? 'in the last year' : `in ${year}`}
      </p>
      <div className="overflow-x-auto">
        <div className="inline-flex flex-col">
          <div className="relative ml-8 h-4">
            {monthLabels.map(({ index, label }) => (
              <span
                key={`${label}-${index}`}
                className="text-foreground-muted absolute text-[10px]"
                style={{ left: index * WEEK_COLUMN_PITCH }}
              >
                {label}
              </span>
            ))}
          </div>
          <div className="flex">
            <div className="mr-1 flex w-7 flex-col gap-[3px]">
              {DAY_LABELS.map((label, i) => (
                <span key={i} className="text-foreground-muted flex h-2.5 items-center text-[10px] leading-none">
                  {label}
                </span>
              ))}
            </div>
            <div className="flex gap-[3px]">
              {weeks.map((week) => (
                <div key={week.start} className="flex flex-col gap-[3px]">
                  {week.days.map((count, dayIndex) =>
                    count == null ? (
                      <div key={dayIndex} className="size-2.5" />
                    ) : count === 'future' ? (
                      <div key={dayIndex} className="bg-foreground/5 size-2.5 rounded-[2px]" />
                    ) : (
                      <Tooltip key={dayIndex} label={cellTooltip(count, week.start, dayIndex)} delay={100}>
                        <div
                          className={cn(
                            'hover:ring-foreground/30 size-2.5 rounded-[2px] hover:ring-1',
                            activityCellClass(count, maxDay)
                          )}
                        />
                      </Tooltip>
                    )
                  )}
                </div>
              ))}
            </div>
          </div>
          <div className="text-foreground-muted mt-2 flex items-center justify-end gap-1 text-[10px]">
            Less
            <span className="bg-foreground/10 size-2.5 rounded-[2px]" />
            <span className="bg-accent/40 size-2.5 rounded-[2px]" />
            <span className="bg-accent/65 size-2.5 rounded-[2px]" />
            <span className="bg-accent/85 size-2.5 rounded-[2px]" />
            <span className="bg-accent size-2.5 rounded-[2px]" />
            More
          </div>
        </div>
      </div>
    </div>
  )
}

// Placeholder that mirrors ActivityGrid's layout while commit data loads.
const SKELETON_WEEKS = 52

function ActivityGridSkeleton() {
  return (
    <div className="animate-pulse">
      <div className="bg-foreground/10 mb-3 h-3 w-40 rounded" />
      <div className="overflow-x-auto">
        <div className="inline-flex flex-col">
          <div className="ml-8 h-4" />
          <div className="flex">
            <div className="mr-1 w-7" />
            <div className="flex gap-[3px]">
              {Array.from({ length: SKELETON_WEEKS }, (_, weekIndex) => (
                <div key={weekIndex} className="flex flex-col gap-[3px]">
                  {Array.from({ length: 7 }, (_, dayIndex) => (
                    <div key={dayIndex} className="bg-foreground/5 size-2.5 rounded-[2px]" />
                  ))}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function activityCellClass(count: number, maxDay: number): string {
  if (count === 0) return 'bg-foreground/10'
  const ratio = count / maxDay
  if (ratio <= 0.25) return 'bg-accent/40'
  if (ratio <= 0.5) return 'bg-accent/65'
  if (ratio <= 0.75) return 'bg-accent/85'
  return 'bg-accent'
}

function YearPicker({
  years,
  selected,
  onSelect,
  onPrefetch
}: {
  years: number[]
  selected: number | null
  onSelect: (year: number | null) => void
  onPrefetch: (year: number) => void
}) {
  return (
    <div className="flex shrink-0 flex-col gap-1">
      <YearButton active={selected == null} onClick={() => onSelect(null)}>
        Last 12 months
      </YearButton>
      {years.map((year) => (
        <YearButton
          key={year}
          active={selected === year}
          onClick={() => onSelect(year)}
          onWarm={() => onPrefetch(year)}
        >
          {year}
        </YearButton>
      ))}
    </div>
  )
}

function YearButton({
  active,
  onClick,
  onWarm,
  children
}: {
  active: boolean
  onClick: () => void
  onWarm?: () => void
  children: ReactNode
}) {
  return (
    <button
      onClick={onClick}
      onMouseEnter={onWarm}
      onFocus={onWarm}
      className={cn(
        'rounded-md px-3 py-1 text-left text-xs whitespace-nowrap tabular-nums transition-colors',
        active
          ? 'bg-accent text-accent-foreground'
          : 'text-foreground-muted hover:bg-foreground/5 hover:text-foreground'
      )}
    >
      {children}
    </button>
  )
}
