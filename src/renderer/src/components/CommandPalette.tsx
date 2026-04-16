import { useState } from 'react'
import { Command } from 'cmdk'
import { useQuery } from '@tanstack/react-query'
import { FileText, GitMerge, GitPullRequest, GitPullRequestClosed, GitPullRequestDraft, Terminal } from 'lucide-react'
import type { AgentSession, GitRepoInfo, PullRequest } from '../../../shared/types'
import { cn } from '../lib/cn'
import { getPathBasename, getPathDirname } from '../lib/path'
import { FileIcon } from './FileIcon'

function matchesQuery(text: string, query: string): boolean {
  if (!query) return true
  const lower = text.toLowerCase()
  return query
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .every((term) => lower.includes(term))
}

function fileMatchScore(relativePath: string, query: string): number {
  if (!query) return 0
  const basename = getPathBasename(relativePath).toLowerCase()
  const q = query.toLowerCase().replace(/\s+/g, '')
  if (basename === q) return 1000
  if (basename.startsWith(q)) return 800
  if (basename.includes(q)) return 600
  if (relativePath.toLowerCase().includes(q)) return 400
  return 100
}

type ResourceFilter = 'all' | 'files' | 'pulls' | 'agents'

interface CommandPaletteProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  folderPath: string
  gitInfo: GitRepoInfo | null | undefined
  agentSessions: AgentSession[]
  onOpenFile: (path: string) => void
  onOpenPullRequest: (number: number) => void
  onSelectAgentSession: (sessionId: string) => void
}

const GROUP_HEADING_CLASSES =
  '[&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-[10px] [&_[cmdk-group-heading]]:font-semibold [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-wider [&_[cmdk-group-heading]]:text-foreground-muted'

const ITEM_CLASSES =
  'flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-xs text-foreground-muted data-[selected=true]:bg-interactive data-[selected=true]:text-foreground'

export default function CommandPalette({
  open,
  onOpenChange,
  folderPath,
  gitInfo,
  agentSessions,
  onOpenFile,
  onOpenPullRequest,
  onSelectAgentSession
}: CommandPaletteProps) {
  const [filter, setFilter] = useState<ResourceFilter>('all')
  const [search, setSearch] = useState('')

  const { data: files } = useQuery<string[]>({
    queryKey: ['read-dir-recursive', folderPath],
    queryFn: () => window.api.fs.readDirRecursive(folderPath),
    enabled: open,
    staleTime: 30_000,
    retry: false
  })

  const { data: prs } = useQuery<PullRequest[]>({
    queryKey: ['pull-requests', gitInfo?.owner, gitInfo?.repo, 'open'],
    queryFn: () => window.api.github.pulls.list(gitInfo!.owner, gitInfo!.repo, { state: 'open' }),
    enabled: open && gitInfo != null,
    staleTime: 30_000,
    retry: false
  })

  const sessions = agentSessions.filter((s) => !s.context?.inline).sort((a, b) => b.startedAt - a.startedAt)

  const showFiles = filter === 'all' || filter === 'files'
  const showPulls = filter === 'all' || filter === 'pulls'
  const showAgents = filter === 'all' || filter === 'agents'

  const matchedFiles = (files ?? [])
    .filter((path) => matchesQuery(path, search) || matchesQuery(getPathBasename(path), search))
    .sort((a, b) => fileMatchScore(b, search) - fileMatchScore(a, search))
    .slice(0, search ? 100 : 50)

  const matchedPrs = (prs ?? []).filter(
    (pr) => matchesQuery(pr.title, search) || matchesQuery(pr.user.login, search) || String(pr.number).includes(search)
  )

  const matchedSessions = sessions
    .filter((s) => matchesQuery(s.prompt, search) || matchesQuery(s.context?.label ?? '', search))
    .slice(0, 20)

  return (
    <Command.Dialog
      open={open}
      onOpenChange={onOpenChange}
      label="Command Palette"
      shouldFilter={false}
      overlayClassName="fixed inset-0 z-50 bg-black/50"
      contentClassName="fixed left-1/2 top-[20%] z-50 w-[560px] -translate-x-1/2 overflow-hidden rounded-xl border border-border bg-surface shadow-2xl"
    >
      <Command.Input
        value={search}
        onValueChange={setSearch}
        placeholder="Search files, pull requests, sessions..."
        className="w-full border-b border-border bg-transparent px-4 py-3 text-sm text-foreground placeholder:text-foreground-subtle focus:outline-none"
      />

      <div className="flex items-center gap-1 border-b border-border px-3 py-2">
        <FilterChip active={filter === 'all'} onClick={() => setFilter('all')} label="All" />
        <FilterChip active={filter === 'files'} onClick={() => setFilter('files')} icon={FileText} label="Files" />
        <FilterChip
          active={filter === 'pulls'}
          onClick={() => setFilter('pulls')}
          icon={GitPullRequest}
          label="Pull Requests"
        />
        <FilterChip active={filter === 'agents'} onClick={() => setFilter('agents')} icon={Terminal} label="Agents" />
      </div>

      <Command.List className="max-h-[340px] overflow-y-auto p-2">
        <Command.Empty className="py-6 text-center text-xs text-foreground-subtle">No results found.</Command.Empty>

        {showFiles && matchedFiles.length > 0 ? (
          <Command.Group heading="Files" className={GROUP_HEADING_CLASSES}>
            {matchedFiles.map((relativePath) => (
              <Command.Item
                key={relativePath}
                value={`file:${relativePath}`}
                onSelect={() => {
                  onOpenFile(`${folderPath}/${relativePath}`)
                  onOpenChange(false)
                }}
                className={ITEM_CLASSES}
              >
                <FileIcon name={getPathBasename(relativePath)} size={14} />
                <span className="text-foreground">{getPathBasename(relativePath)}</span>
                <span className="truncate text-foreground-subtle">{getPathDirname(relativePath)}</span>
              </Command.Item>
            ))}
          </Command.Group>
        ) : null}

        {showPulls && matchedPrs.length > 0 ? (
          <Command.Group heading="Pull Requests" className={GROUP_HEADING_CLASSES}>
            {matchedPrs.map((pr) => (
              <Command.Item
                key={pr.number}
                value={`pr:${pr.number}`}
                onSelect={() => {
                  onOpenPullRequest(pr.number)
                  onOpenChange(false)
                }}
                className={ITEM_CLASSES}
              >
                <PrStateIcon state={pr.state} draft={pr.draft} merged={pr.merged_at != null} />
                <span className="min-w-0 flex-1 truncate text-foreground">{pr.title}</span>
                <span className="shrink-0 text-foreground-subtle">#{pr.number}</span>
              </Command.Item>
            ))}
          </Command.Group>
        ) : null}

        {showAgents && matchedSessions.length > 0 ? (
          <Command.Group heading="Agent Sessions" className={GROUP_HEADING_CLASSES}>
            {matchedSessions.map((session) => (
              <Command.Item
                key={session.id}
                value={`agent:${session.id}`}
                onSelect={() => {
                  onSelectAgentSession(session.id)
                  onOpenChange(false)
                }}
                className={ITEM_CLASSES}
              >
                <Terminal size={14} className="shrink-0 text-foreground-subtle" />
                <span className="min-w-0 flex-1 truncate text-foreground">{session.prompt}</span>
                <AgentStatusBadge status={session.status} />
              </Command.Item>
            ))}
          </Command.Group>
        ) : null}
      </Command.List>
    </Command.Dialog>
  )
}

function FilterChip({
  active,
  onClick,
  icon: Icon,
  label
}: {
  active: boolean
  onClick: () => void
  icon?: typeof FileText
  label: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs transition-colors',
        active
          ? 'bg-interactive text-foreground'
          : 'text-foreground-muted hover:bg-interactive/50 hover:text-foreground'
      )}
    >
      {Icon ? <Icon size={12} /> : null}
      {label}
    </button>
  )
}

function PrStateIcon({ state, draft, merged }: { state: string; draft: boolean; merged: boolean }) {
  if (merged) return <GitMerge size={14} className="shrink-0 text-purple" />
  if (state === 'closed') return <GitPullRequestClosed size={14} className="shrink-0 text-danger" />
  if (draft) return <GitPullRequestDraft size={14} className="shrink-0 text-foreground-muted" />
  return <GitPullRequest size={14} className="shrink-0 text-success" />
}

function AgentStatusBadge({ status }: { status: string }) {
  switch (status) {
    case 'running':
      return <span className="size-2 shrink-0 animate-pulse rounded-full bg-accent" />
    case 'completed':
      return <span className="size-2 shrink-0 rounded-full bg-success" />
    case 'error':
    case 'cancelled':
      return <span className="size-2 shrink-0 rounded-full bg-danger" />
    default:
      return null
  }
}
