import { GitCommit } from 'lucide-react'
import { cn } from '../lib/cn'
import type { GitHubCommit, PullRequestCommit, PullRequestCommitAuthors } from '../../../shared/types'

export interface CommitActor {
  name: string
  avatarUrl: string | null
}

interface CommitActorStackProps {
  actors: CommitActor[]
  size?: 'sm' | 'md'
  max?: number
  className?: string
}

export default function CommitActorStack({ actors, size = 'md', max = 2, className }: CommitActorStackProps) {
  const visible = actors.slice(0, max)
  const extra = actors.length - visible.length
  const sizeClass = size === 'sm' ? 'size-5' : 'size-6'
  const iconSize = size === 'sm' ? 10 : 12

  return (
    <div className={cn('flex items-center', className)}>
      {visible.map((actor, index) => (
        <div
          key={`${actor.name}-${index}`}
          title={actor.name}
          className={cn(
            'border-surface bg-interactive flex items-center justify-center overflow-hidden rounded-full border',
            sizeClass,
            index > 0 && '-ml-2'
          )}
        >
          {actor.avatarUrl ? (
            <img src={actor.avatarUrl} alt={actor.name} className="size-full object-cover" />
          ) : (
            <GitCommit size={iconSize} className="text-foreground-muted" />
          )}
        </div>
      ))}
      {extra > 0 ? (
        <div
          className={cn(
            'border-surface bg-interactive text-foreground-muted -ml-2 flex items-center justify-center rounded-full border text-[10px] font-medium',
            sizeClass
          )}
          title={actors
            .slice(max)
            .map((a) => a.name)
            .join(', ')}
        >
          +{extra}
        </div>
      ) : null}
    </div>
  )
}

export function getCommitActors(
  commit: PullRequestCommit | GitHubCommit,
  resolved?: PullRequestCommitAuthors
): CommitActor[] {
  const graphqlAuthors = resolved?.[commit.sha]
  if (graphqlAuthors && graphqlAuthors.length > 0) {
    return graphqlAuthors.map((a) => ({
      name: a.login ?? a.name,
      avatarUrl: a.avatarUrl
    }))
  }

  const entries: Array<CommitActor | null> = [
    {
      name: commit.author?.login ?? commit.commit.author?.name ?? '',
      avatarUrl: commit.author?.avatar_url ?? null
    },
    {
      name: commit.committer?.login ?? commit.commit.committer?.name ?? '',
      avatarUrl: commit.committer?.avatar_url ?? null
    },
    ...parseCoAuthors(commit.commit.message).map(({ name, email }) => ({
      name,
      avatarUrl: avatarFromEmail(email)
    }))
  ]

  const deduped = new Map<string, CommitActor>()
  for (const entry of entries) {
    if (!entry || !entry.name) continue
    const key = entry.name.toLowerCase()
    const existing = deduped.get(key)
    if (!existing || (!existing.avatarUrl && entry.avatarUrl)) {
      deduped.set(key, entry)
    }
  }
  return Array.from(deduped.values())
}

export function formatCommitActorNames(actors: CommitActor[]): string {
  if (actors.length === 0) return 'Unknown author'
  if (actors.length === 1) return actors[0]!.name
  if (actors.length === 2) return `${actors[0]!.name} and ${actors[1]!.name}`
  return `${actors[0]!.name}, ${actors[1]!.name}, and ${actors.length - 2} others`
}

function parseCoAuthors(message: string): Array<{ name: string; email: string | null }> {
  const authors: Array<{ name: string; email: string | null }> = []
  const lines = message.split('\n')
  for (const line of lines) {
    const match = line.match(/^Co-authored-by:\s*(.+?)\s*<([^>]*)>\s*$/i)
    if (match) authors.push({ name: match[1]!, email: match[2] || null })
  }
  return authors
}

function avatarFromEmail(email: string | null): string | null {
  if (!email) return null
  const noreplyWithId = email.match(/^(\d+)\+[^@]+@users\.noreply\.github\.com$/i)
  if (noreplyWithId) return `https://avatars.githubusercontent.com/u/${noreplyWithId[1]}?v=4`
  const noreplyLegacy = email.match(/^([^@+]+)@users\.noreply\.github\.com$/i)
  if (noreplyLegacy) return `https://github.com/${noreplyLegacy[1]}.png?size=80`
  return null
}
