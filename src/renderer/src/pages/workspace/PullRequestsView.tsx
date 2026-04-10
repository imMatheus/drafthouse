import { useQuery } from '@tanstack/react-query'
import { GitPullRequest } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import type { GitRepoInfo, PullRequest } from '../../../../shared/types'
import PlaceholderView from './PlaceholderView'

interface PullRequestsViewProps {
  gitInfo: GitRepoInfo | null | undefined
  gitInfoError: Error | null
  isLoadingGitInfo: boolean
}

export default function PullRequestsView({ gitInfo, gitInfoError, isLoadingGitInfo }: PullRequestsViewProps) {
  const navigate = useNavigate()

  const {
    data: prs,
    isLoading,
    error
  } = useQuery<PullRequest[], Error>({
    queryKey: ['pull-requests', gitInfo?.owner, gitInfo?.repo],
    queryFn: () => window.api.auth.getPullRequests(gitInfo!.owner, gitInfo!.repo),
    enabled: gitInfo !== null && gitInfo !== undefined,
    retry: false
  })

  if (isLoadingGitInfo) {
    return <p className="text-sm text-foreground-muted">Checking repository metadata...</p>
  }

  if (gitInfoError) {
    return (
      <div className="max-w-xl rounded-lg border border-border bg-surface p-4">
        <h2 className="text-sm font-semibold text-foreground">Repository metadata unavailable</h2>
        <p className="mt-2 text-sm text-foreground-muted">{gitInfoError.message}</p>
      </div>
    )
  }

  if (!gitInfo) {
    return (
      <PlaceholderView
        title="Pull Requests"
        description="This folder is not mapped to a GitHub repository yet, so pull requests are unavailable."
      />
    )
  }

  if (isLoading) {
    return <p className="text-sm text-foreground-muted">Loading pull requests...</p>
  }

  if (error) {
    return (
      <div className="max-w-xl rounded-lg border border-border bg-surface p-4">
        <h2 className="text-sm font-semibold text-foreground">Pull requests unavailable</h2>
        <p className="mt-2 text-sm text-foreground-muted">{error.message}</p>
      </div>
    )
  }

  if (!prs || prs.length === 0) {
    return <p className="text-sm text-foreground-muted">No open pull requests</p>
  }

  return (
    <div>
      <h2 className="mb-4 text-sm font-semibold text-foreground">Open Pull Requests</h2>
      <div className="flex flex-col gap-1">
        {prs.map((pr) => (
          <button
            key={pr.number}
            onClick={() => navigate(`/workspace/pulls/${pr.number}`)}
            className="flex items-start gap-3 rounded-lg border border-border bg-surface p-4 text-left hover:bg-surface-hover"
          >
            <GitPullRequest size={16} className="mt-0.5 shrink-0 text-success" />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-foreground">{pr.title}</p>
              <p className="mt-1 text-xs text-foreground-subtle">
                #{pr.number} opened by {pr.user.login}
              </p>
            </div>
            <img src={pr.user.avatar_url} alt={pr.user.login} className="h-6 w-6 shrink-0 rounded-full" />
          </button>
        ))}
      </div>
    </div>
  )
}
