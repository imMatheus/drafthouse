import type { PullRequest } from '../../../shared/types'

// Case-insensitive match of a PR list against a free-text query. Every
// whitespace-separated term must match at least one field (title, author,
// number, or label name), so "alice fix" finds alice's fix PRs. A leading '#'
// on a number term is dropped so "#123" finds PR 123. Empty/whitespace query
// returns the list unchanged.
export function filterPullRequests(prs: PullRequest[], query: string): PullRequest[] {
  const terms = query
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .map((term) => (/^#\d+$/.test(term) ? term.slice(1) : term))
  if (terms.length === 0) return prs
  return prs.filter((pr) => {
    const fields = [pr.title, pr.user.login, String(pr.number), ...pr.labels.map((label) => label.name)].map((field) =>
      field.toLowerCase()
    )
    return terms.every((term) => fields.some((field) => field.includes(term)))
  })
}
