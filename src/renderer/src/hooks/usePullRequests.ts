import { useEffect, useState } from 'react'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import type { GitRepoInfo, PullRequest } from '../../../shared/types'

export type PullRequestListState = 'open' | 'closed' | 'all'

// Every key nests under ['pull-requests', owner, repo] so a single
// invalidation of that prefix (e.g. after merging or creating a PR) covers
// both lists and remote searches.
export const prQueryKeys = {
  all: ['pull-requests'] as const,
  repo: (owner: string | undefined, repo: string | undefined) => [...prQueryKeys.all, owner, repo] as const,
  list: (owner: string | undefined, repo: string | undefined, state: PullRequestListState) =>
    [...prQueryKeys.repo(owner, repo), state] as const,
  search: (owner: string | undefined, repo: string | undefined, state: PullRequestListState, query: string) =>
    [...prQueryKeys.repo(owner, repo), 'search', state, query] as const
}

const STALE_TIME_MS = 30_000

// GitHub's search endpoint is rate-limited to ~30 requests/minute (far below
// the core API), so remote searches wait for a typing pause and skip
// single-character queries.
const SEARCH_DEBOUNCE_MS = 300
const MIN_REMOTE_QUERY_LENGTH = 2

export function usePullRequestList(
  gitInfo: GitRepoInfo | null | undefined,
  options: { state: PullRequestListState; perPage?: number; enabled?: boolean }
) {
  return useQuery<PullRequest[], Error>({
    queryKey: prQueryKeys.list(gitInfo?.owner, gitInfo?.repo, options.state),
    queryFn: () =>
      window.api.github.pulls.list(gitInfo!.owner, gitInfo!.repo, { state: options.state, perPage: options.perPage }),
    enabled: (options.enabled ?? true) && gitInfo != null,
    staleTime: STALE_TIME_MS,
    retry: false
  })
}

export function usePullRequestSearch(
  gitInfo: GitRepoInfo | null | undefined,
  rawQuery: string,
  options?: { state?: 'open' | 'closed'; enabled?: boolean }
) {
  const [debouncedQuery, setDebouncedQuery] = useState('')
  const trimmed = rawQuery.trim()

  useEffect(() => {
    if (trimmed.length < MIN_REMOTE_QUERY_LENGTH) {
      setDebouncedQuery('')
      return
    }
    const timer = setTimeout(() => setDebouncedQuery(trimmed), SEARCH_DEBOUNCE_MS)
    return () => clearTimeout(timer)
  }, [trimmed])

  const query = useQuery<PullRequest[], Error>({
    queryKey: prQueryKeys.search(gitInfo?.owner, gitInfo?.repo, options?.state ?? 'all', debouncedQuery),
    queryFn: () =>
      window.api.github.pulls.search(gitInfo!.owner, gitInfo!.repo, { query: debouncedQuery, state: options?.state }),
    enabled: (options?.enabled ?? true) && gitInfo != null && debouncedQuery !== '',
    // Keep the previous results on screen while the next query fetches so
    // remote matches don't flash out on every keystroke pause.
    placeholderData: keepPreviousData,
    staleTime: STALE_TIME_MS,
    retry: false
  })

  // Below the minimum length the search is inert; hide cached data from an
  // earlier query so it can't leak into non-search UI.
  const active = debouncedQuery !== '' && trimmed.length >= MIN_REMOTE_QUERY_LENGTH
  return {
    results: active ? query.data : undefined,
    isSearching: active && query.isFetching,
    error: active ? query.error : null
  }
}
