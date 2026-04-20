import { useEffect, useState } from 'react'
import type { PullRequestDetail } from '../../../shared/types'
import { prStateLabel, type PRState } from '../lib/prMentions'
import PRStateIcon from './PRStateIcon'
import { cn } from '../lib/cn'

const cache = new Map<string, Promise<PullRequestDetail | null>>()

function loadPR(owner: string, repo: string, number: number): Promise<PullRequestDetail | null> {
  const key = `${owner}/${repo}#${number}`
  const existing = cache.get(key)
  if (existing) return existing
  const promise = window.api.github.pulls.get(owner, repo, number).catch(() => null)
  cache.set(key, promise)
  return promise
}

const PR_URL_REGEX = /^https?:\/\/(?:www\.)?github\.com\/([^/\s]+)\/([^/\s]+)\/pull\/(\d+)(?:[/#?].*)?$/i

export function parsePRUrl(href: string | undefined): { owner: string; repo: string; number: number } | null {
  if (!href) return null
  const match = PR_URL_REGEX.exec(href)
  if (!match) return null
  return { owner: match[1], repo: match[2], number: Number(match[3]) }
}

interface PRPillProps {
  owner: string
  repo: string
  number: number
  href: string
  onClick?: () => void
}

export default function PRPill({ owner, repo, number, href, onClick }: PRPillProps) {
  const [pr, setPr] = useState<PullRequestDetail | null>(null)

  useEffect(() => {
    let cancelled = false
    loadPR(owner, repo, number).then((result) => {
      if (!cancelled) setPr(result)
    })
    return () => {
      cancelled = true
    }
  }, [owner, repo, number])

  const state: PRState = pr ? prStateLabel(pr) : 'open'
  const title = pr?.title

  const className = cn(
    'border-border bg-surface hover:bg-surface-hover !text-foreground no-underline',
    'inline-flex max-w-full items-center gap-1 rounded-md border px-1.5 py-0.5 align-baseline text-xs transition-colors'
  )

  const body = (
    <>
      <PRStateIcon state={state} size={12} />
      <span className="font-semibold">#{number}</span>
      {title ? <span className="text-foreground-muted max-w-[260px] truncate">{title}</span> : null}
    </>
  )

  if (onClick) {
    return (
      <button type="button" onClick={onClick} className={className}>
        {body}
      </button>
    )
  }

  return (
    <a href={href} target="_blank" rel="noreferrer" className={className}>
      {body}
    </a>
  )
}
