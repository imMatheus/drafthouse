import type { AgentContext, PullRequest, PullRequestDetail } from '../../../shared/types'

export interface PRMentionMatch {
  /** The full matched text including `@` */
  raw: string
  /** The `@` position in the value (character index) */
  startIndex: number
  /** Position right after the last matched char (exclusive) */
  endIndex: number
  /** The query portion after `@` (without the leading `@`, may start with `pr` or digits) */
  query: string
}

/**
 * Finds the `@`-triggered mention at the cursor position, if any.
 * Triggers anywhere in the text as long as the `@` is at the start of the
 * value or preceded by whitespace. The mention extends from `@` up to the
 * cursor, containing only word chars (letters/digits).
 */
export function findActiveMention(value: string, cursor: number): PRMentionMatch | null {
  if (cursor <= 0 || cursor > value.length) return null

  let start = cursor - 1
  while (start >= 0) {
    const ch = value[start]
    if (ch === '@') break
    if (!/[A-Za-z0-9]/.test(ch)) return null
    start--
  }
  if (start < 0) return null
  if (value[start] !== '@') return null

  const prevChar = start === 0 ? '' : value[start - 1]
  if (prevChar && !/\s/.test(prevChar)) return null

  const raw = value.slice(start, cursor)
  const query = raw.slice(1)
  return { raw, startIndex: start, endIndex: cursor, query }
}

/**
 * Parses all `@prN` mentions from the prompt text and returns the unique PR numbers
 * referenced. Only considers mentions whose `@` is at the start or follows whitespace.
 */
export function extractMentionedPRNumbers(text: string): number[] {
  const numbers = new Set<number>()
  const regex = /(^|\s)@pr(\d+)\b/gi
  let match: RegExpExecArray | null
  while ((match = regex.exec(text)) !== null) {
    numbers.add(Number(match[2]))
  }
  return Array.from(numbers)
}

interface RankedPR {
  pr: PullRequest
  score: number
}

function statePriority(pr: PullRequest): number {
  if (pr.state === 'open') return 0
  if (pr.merged_at) return 1
  return 2
}

/**
 * Filters + ranks PRs for the autocomplete dropdown.
 * - Empty query → most-recently-updated open PRs first, then merged, then closed.
 * - Numeric query (including `pr123` or `123`) → PRs whose number starts with / contains the digits.
 * - Text query → case-insensitive match on title, author login, or `#N`.
 */
export function searchPRs(prs: PullRequest[], rawQuery: string, limit = 8): PullRequest[] {
  const query = rawQuery.trim().toLowerCase()
  const numericPart = query.replace(/^pr/, '').replace(/[^0-9]/g, '')
  const isNumeric = numericPart.length > 0 && /^(pr)?\d+$/.test(query.replace(/\s/g, ''))

  if (query === '' || query === 'pr') {
    return [...prs]
      .sort((a, b) => {
        const sp = statePriority(a) - statePriority(b)
        if (sp !== 0) return sp
        return b.updated_at.localeCompare(a.updated_at)
      })
      .slice(0, limit)
  }

  const ranked: RankedPR[] = []
  for (const pr of prs) {
    const numberStr = String(pr.number)
    const title = pr.title.toLowerCase()
    const login = pr.user.login.toLowerCase()
    let score = -1

    if (isNumeric) {
      if (numberStr === numericPart) score = 100
      else if (numberStr.startsWith(numericPart)) score = 80
      else if (numberStr.includes(numericPart)) score = 40
    } else {
      const textQuery = query.startsWith('pr') ? query.slice(2).trim() : query
      if (textQuery === '') continue
      if (title.startsWith(textQuery)) score = 70
      else if (title.includes(textQuery)) score = 50
      else if (login.includes(textQuery)) score = 30
      else if (numberStr.includes(textQuery)) score = 20
    }

    if (score < 0) continue
    score -= statePriority(pr) * 5
    ranked.push({ pr, score })
  }

  ranked.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score
    return b.pr.updated_at.localeCompare(a.pr.updated_at)
  })

  return ranked.slice(0, limit).map((r) => r.pr)
}

export type PRState = 'open' | 'merged' | 'closed' | 'draft'

/**
 * Returns a human-readable state label for display in the dropdown / context block.
 */
export function prStateLabel(pr: PullRequest | PullRequestDetail): PRState {
  if (pr.merged_at) return 'merged'
  if (pr.state === 'closed') return 'closed'
  if (pr.draft) return 'draft'
  return 'open'
}

/**
 * Builds a context block referencing the given PRs. Used both as the
 * `systemPromptSuffix` of an `AgentContext` (for new sessions) and as an
 * inline prompt prefix (for continuation messages where no system prompt
 * can be re-applied).
 */
export function buildMentionedPRContextBlock(
  owner: string,
  repo: string,
  prs: PullRequestDetail[]
): string | null {
  if (prs.length === 0) return null

  const sections = prs.map((pr) => {
    const state = prStateLabel(pr)
    const bodyExcerpt = pr.body ? pr.body.trim().slice(0, 800) : '(no description)'
    const truncated = pr.body && pr.body.length > 800 ? '\n...(truncated)' : ''
    return [
      `### PR #${pr.number}: ${pr.title}`,
      `- State: ${state}`,
      `- Author: ${pr.user.login}`,
      `- Branch: \`${pr.head.ref}\` → \`${pr.base.ref}\``,
      `- Diff stats: +${pr.additions}/-${pr.deletions} across ${pr.changed_files} files`,
      `- URL: ${pr.html_url}`,
      ``,
      `Description:`,
      bodyExcerpt + truncated
    ].join('\n')
  })

  return [
    `## Referenced Pull Requests`,
    `Repository: ${owner}/${repo}`,
    ``,
    sections.join('\n\n'),
    ``,
    `You can run \`gh pr view <number>\` or \`gh pr diff <number>\` for more detail on any referenced PR.`
  ].join('\n')
}

/**
 * Builds an `AgentContext` for a new agent session started from the agents
 * view with one or more PRs mentioned via `@prN`. Uses the same suffix-based
 * mechanism as the PR detail view so the context persists across turns in
 * the session.
 */
export function buildPullRequestMentionsAgentContext(params: {
  owner: string
  repo: string
  prs: PullRequestDetail[]
}): AgentContext | null {
  const { owner, repo, prs } = params
  const block = buildMentionedPRContextBlock(owner, repo, prs)
  if (!block) return null

  const label = prs.length === 1 ? `PR #${prs[0].number}` : `${prs.length} PRs`
  const prSummaries = prs.map((pr) => ({
    number: pr.number,
    title: pr.title,
    state: prStateLabel(pr)
  }))
  return {
    source: 'pull-request',
    systemPromptSuffix: block,
    label,
    repoFullName: `${owner}/${repo}`,
    prNumber: prs.length === 1 ? prs[0].number : undefined,
    prTitle: prs.length === 1 ? prs[0].title : undefined,
    prState: prs.length === 1 ? prSummaries[0].state : undefined,
    prs: prSummaries
  }
}

export interface MentionSegment {
  type: 'text' | 'mention'
  text: string
  prNumber?: number
}

/**
 * Splits the prompt text into alternating text / mention segments so the
 * overlay renderer can highlight `@prN` references. Only matches where the
 * `@` is at the start of the string or preceded by whitespace — same rule
 * as `findActiveMention` and `extractMentionedPRNumbers`.
 */
export function splitTextIntoMentionSegments(text: string): MentionSegment[] {
  const segments: MentionSegment[] = []
  const regex = /@pr(\d+)\b/gi
  let lastIndex = 0
  let match: RegExpExecArray | null
  while ((match = regex.exec(text)) !== null) {
    const prev = match.index === 0 ? '' : text[match.index - 1]
    if (prev && !/\s/.test(prev)) continue

    if (match.index > lastIndex) {
      segments.push({ type: 'text', text: text.slice(lastIndex, match.index) })
    }
    segments.push({ type: 'mention', text: match[0], prNumber: Number(match[1]) })
    lastIndex = match.index + match[0].length
  }
  if (lastIndex < text.length) {
    segments.push({ type: 'text', text: text.slice(lastIndex) })
  }
  if (segments.length === 0) {
    segments.push({ type: 'text', text })
  }
  return segments
}

/**
 * Removes every `@prN` occurrence of the given PR number from the text,
 * collapsing any resulting doubled spaces. Used when the user clicks the
 * X on a PR pill above the prompt bar.
 */
export function removePRMention(text: string, prNumber: number): string {
  const re = new RegExp(`\\s?@pr${prNumber}\\b`, 'gi')
  return text.replace(re, '').replace(/  +/g, ' ')
}
