import type { PullRequest } from '../../../shared/types'

// Case-insensitive match of a PR list against a free-text query (title, author,
// number, or label name). Empty/whitespace query returns the list unchanged.
export function filterPullRequests(prs: PullRequest[], query: string): PullRequest[] {
  const lower = query.trim().toLowerCase()
  if (!lower) return prs
  return prs.filter(
    (pr) =>
      pr.title.toLowerCase().includes(lower) ||
      pr.user.login.toLowerCase().includes(lower) ||
      String(pr.number).includes(lower) ||
      pr.labels.some((l) => l.name.toLowerCase().includes(lower))
  )
}
