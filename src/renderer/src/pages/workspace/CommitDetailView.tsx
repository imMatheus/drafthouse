import { useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Check, Copy, ExternalLink } from 'lucide-react'
import { useCopyToClipboard } from '../../hooks/useCopyToClipboard'
import type { GitHubCommit } from '../../../../shared/types'
import CommitActorStack, { formatCommitActorNames, getCommitActors } from '../../components/CommitActorStack'
import Tooltip from '../../components/Tooltip'
import { LoadingView } from '../../components/Loading'
import { ChangedFilesViewer } from './PRFilesTab'
import { DiffStat, formatAbsoluteDate, formatRelativeTime, getCommitBody, getCommitSubject } from './pullRequestShared'

interface CommitDetailViewProps {
  owner: string
  repo: string
  commitSha: string
  onTitleChange?: (title: string) => void
}

/**
 * Commit tab: commit metadata header on top of the same streamed changed-files
 * viewer the PR files tab uses (sidebar, virtualized diffs, expandable
 * unchanged regions) — minus the review-only machinery.
 */
export default function CommitDetailView({ owner, repo, commitSha, onTitleChange }: CommitDetailViewProps) {
  const { copied: shaCopied, copy: copySha } = useCopyToClipboard()

  const {
    data: commit,
    isLoading,
    error
  } = useQuery<GitHubCommit, Error>({
    queryKey: ['commit', owner, repo, commitSha],
    queryFn: () => window.api.github.commits.get(owner, repo, commitSha, { perPage: 100 }),
    retry: false
  })

  const subject = commit ? getCommitSubject(commit.commit.message) : 'Untitled commit'
  const body = commit ? getCommitBody(commit.commit.message) : ''

  useEffect(() => {
    if (commit) {
      onTitleChange?.(subject)
    }
  }, [commit, onTitleChange, subject])

  if (isLoading) {
    return <LoadingView label="Loading commit..." />
  }

  if (error) {
    return (
      <div className="border-border bg-surface max-w-xl rounded-lg border p-4">
        <h2 className="text-foreground text-sm font-semibold">Commit unavailable</h2>
        <p className="text-foreground-muted mt-2 text-sm">{error.message}</p>
      </div>
    )
  }

  if (!commit) {
    return null
  }

  const commitDate = commit.commit.author?.date ?? commit.commit.committer?.date ?? null
  const actors = getCommitActors(commit)
  const stats = commit.stats
  const isMergeCommit = commit.parents.length > 1

  return (
    <div>
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-foreground min-w-0 truncate text-xl font-semibold">{subject}</h1>
            {isMergeCommit ? (
              <span className="bg-purple/10 text-purple rounded-full px-2 py-0.5 text-xs font-medium">Merge</span>
            ) : null}
          </div>

          <div className="text-foreground-muted mt-3 flex flex-wrap items-center gap-x-3 gap-y-2 text-sm">
            <CommitActorStack actors={actors} />
            <span>
              <span className="text-foreground font-medium">{formatCommitActorNames(actors)}</span>
              {commitDate ? ` committed ${formatRelativeTime(commitDate)}` : ' authored this commit'}
            </span>
            {commitDate ? <span className="text-foreground-subtle">{formatAbsoluteDate(commitDate)}</span> : null}
            <span className="text-foreground-muted rounded-md px-2 py-1 font-mono text-sm">
              {commit.sha.slice(0, 7)}
            </span>
            <Tooltip label={shaCopied ? 'Copied' : 'Copy SHA'} side="top">
              <button
                type="button"
                onClick={() => copySha(commitSha)}
                className="text-foreground-subtle hover:bg-interactive hover:text-foreground inline-flex size-8 items-center justify-center rounded-md transition-colors"
                aria-label={shaCopied ? 'Copied SHA' : 'Copy SHA'}
              >
                {shaCopied ? <Check size={14} className="text-success" /> : <Copy size={14} />}
              </button>
            </Tooltip>
            {stats ? <DiffStat additions={stats.additions} deletions={stats.deletions} /> : null}
          </div>
        </div>

        <a
          href={commit.html_url}
          target="_blank"
          rel="noreferrer"
          className="border-border bg-interactive text-foreground hover:bg-interactive-hover inline-flex shrink-0 items-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-medium transition-colors"
        >
          View on GitHub
          <ExternalLink size={13} />
        </a>
      </div>

      {body ? (
        <div className="border-border bg-surface mt-4 rounded-xl border px-4 py-3">
          <p className="text-foreground-muted text-sm leading-relaxed whitespace-pre-wrap">{body}</p>
        </div>
      ) : null}

      <div className="mt-6">
        <ChangedFilesViewer
          owner={owner}
          repo={repo}
          source={{ kind: 'commit', sha: commitSha }}
          headSha={commit.sha}
          baseSha={commit.parents[0]?.sha ?? null}
        />
      </div>
    </div>
  )
}
