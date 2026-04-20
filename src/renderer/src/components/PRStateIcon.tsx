import { GitMerge, GitPullRequest, GitPullRequestClosed, GitPullRequestDraft } from 'lucide-react'
import type { PRState } from '../lib/prMentions'

export default function PRStateIcon({ state, size = 15 }: { state: PRState; size?: number }) {
  if (state === 'merged') return <GitMerge size={size} className="text-purple shrink-0" />
  if (state === 'closed') return <GitPullRequestClosed size={size} className="text-danger shrink-0" />
  if (state === 'draft') return <GitPullRequestDraft size={size} className="text-foreground-muted shrink-0" />
  return <GitPullRequest size={size} className="text-success shrink-0" />
}
