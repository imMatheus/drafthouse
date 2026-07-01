import { useState } from 'react'
import { Command } from 'cmdk'
import { Check, GitPullRequest, Plus, Terminal, X } from 'lucide-react'
import type { AgentSessionMeta, GitRepoInfo } from '../../../shared/types'
import { cn } from '../lib/cn'
import AgentSpinner from '../pages/workspace/AgentSpinner'
import Loading from './Loading'
import PRStateIcon from './PRStateIcon'
import { prStateLabel } from '../lib/prMentions'
import { filterPullRequests } from '../lib/pullRequestFilter'
import { usePullRequestList, usePullRequestSearch } from '../hooks/usePullRequests'

function matchesQuery(text: string, query: string): boolean {
  if (!query) return true
  const lower = text.toLowerCase()
  return query
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .every((term) => lower.includes(term))
}

type ResourceFilter = 'all' | 'pulls' | 'agents'

interface CommandPaletteProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  gitInfo: GitRepoInfo | null | undefined
  agentSessions: AgentSessionMeta[]
  onOpenPullRequest: (number: number) => void
  onSelectAgentSession: (sessionId: string) => void
  onNewAgent: () => void
}

const GROUP_HEADING_CLASSES =
  '[&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-[10px] [&_[cmdk-group-heading]]:font-semibold [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-wider [&_[cmdk-group-heading]]:text-foreground-muted'

const ITEM_CLASSES =
  'flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-xs text-foreground-muted data-[selected=true]:bg-interactive data-[selected=true]:text-foreground'

export default function CommandPalette({
  open,
  onOpenChange,
  gitInfo,
  agentSessions,
  onOpenPullRequest,
  onSelectAgentSession,
  onNewAgent
}: CommandPaletteProps) {
  const [filter, setFilter] = useState<ResourceFilter>('all')
  const [search, setSearch] = useState('')

  const {
    data: prs,
    isLoading: prsLoading,
    error: prsError
  } = usePullRequestList(gitInfo, { state: 'open', enabled: open })

  // Remote search over the whole repo (all states) — surfaces PRs that aren't
  // in the locally cached open set.
  const {
    results: remotePrs,
    isSearching: remoteSearching,
    error: searchError
  } = usePullRequestSearch(gitInfo, search, { enabled: open })

  const sessions = [...agentSessions].sort((a, b) => b.startedAt - a.startedAt)

  const showPulls = filter === 'all' || filter === 'pulls'
  const showAgents = filter === 'all' || filter === 'agents'
  const showNewAgent = showAgents && matchesQuery('new agent', search)

  const localMatchedPrs = filterPullRequests(prs ?? [], search)

  // Merge local matches with remote results, local first, deduped by number.
  const seenPrNumbers = new Set(localMatchedPrs.map((pr) => pr.number))
  const matchedPrs = [...localMatchedPrs, ...(remotePrs ?? []).filter((pr) => !seenPrNumbers.has(pr.number))]

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
        placeholder="Search pull requests, sessions..."
        className="border-border text-foreground placeholder:text-foreground-subtle w-full border-b bg-transparent px-4 py-3 text-sm focus:outline-none"
      />

      <div className="border-border flex items-center gap-1 border-b px-3 py-2">
        <FilterChip active={filter === 'all'} onClick={() => setFilter('all')} label="All" />
        <FilterChip
          active={filter === 'pulls'}
          onClick={() => setFilter('pulls')}
          icon={GitPullRequest}
          label="Pull Requests"
        />
        <FilterChip active={filter === 'agents'} onClick={() => setFilter('agents')} icon={Terminal} label="Agents" />
      </div>

      <Command.List className="max-h-[340px] overflow-y-auto p-2">
        <Command.Empty className="text-foreground-subtle py-6 text-center text-xs">
          {prsLoading || remoteSearching ? (
            <Loading size="sm" label="Searching…" />
          ) : prsError || searchError ? (
            "Couldn't load pull requests from GitHub."
          ) : (
            'No results found.'
          )}
        </Command.Empty>

        {showNewAgent ? (
          <Command.Group heading="Actions" className={GROUP_HEADING_CLASSES}>
            <Command.Item
              value="action:new-agent"
              onSelect={() => {
                onNewAgent()
                onOpenChange(false)
              }}
              className={ITEM_CLASSES}
            >
              <Plus size={14} className="text-foreground-subtle shrink-0" />
              <span className="text-foreground min-w-0 flex-1 truncate">New Agent</span>
            </Command.Item>
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
                <PRStateIcon state={prStateLabel(pr)} size={14} />
                <span className="text-foreground min-w-0 flex-1 truncate">{pr.title}</span>
                <span className="text-foreground-subtle shrink-0">#{pr.number}</span>
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
                <AgentStatusIndicator status={session.status} />
                <span className="text-foreground min-w-0 flex-1 truncate">{session.prompt}</span>
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
  icon?: typeof GitPullRequest
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

function AgentStatusIndicator({ status }: { status: AgentSessionMeta['status'] }) {
  if (status === 'running') return <AgentSpinner />
  if (status === 'completed') return <Check size={12} className="text-success shrink-0" />
  if (status === 'error' || status === 'cancelled') return <X size={12} className="text-foreground-subtle shrink-0" />
  return null
}
