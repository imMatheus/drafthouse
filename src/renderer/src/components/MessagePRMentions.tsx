import { extractMentionedPRNumbers } from '../lib/prMentions'
import { useWorkspaceContext } from '../contexts/WorkspaceContext'
import PRStateIcon from './PRStateIcon'
import type { AgentContext } from '../../../shared/types'

/**
 * Renders a compact list of PR chips for every `@prN` mention in the given
 * text, aligned to the right so it reads as a label on the user bubble that
 * follows. Looks the full PR details up from `session.context.prs`, which is
 * populated both at session start and by `mergePRsIntoContext` on each
 * continuation.
 */
export default function MessagePRMentions({
  text,
  allPRs
}: {
  text: string
  allPRs: AgentContext['prs']
}) {
  const workspace = useWorkspaceContext()
  const mentioned = extractMentionedPRNumbers(text)
  if (mentioned.length === 0) return null

  const lookup = new Map((allPRs ?? []).map((pr) => [pr.number, pr]))
  const prs = mentioned.map((n) => lookup.get(n)).filter((pr): pr is NonNullable<typeof pr> => pr != null)
  if (prs.length === 0) return null

  return (
    <div className="border-border bg-surface mb-1 ml-auto flex w-max flex-col items-end gap-0.5 rounded-lg border p-1">
      {prs.map((pr) => (
        <button
          key={pr.number}
          type="button"
          onClick={() => workspace?.onOpenPullRequest(pr.number)}
          className="hover:bg-surface-hover text-foreground flex items-center gap-1.5 rounded-md px-2 py-1 text-xs transition-colors"
        >
          <PRStateIcon state={pr.state} size={13} />
          <span className="font-semibold">#{pr.number}</span>
          <span className="text-foreground-muted max-w-[200px] truncate">{pr.title}</span>
        </button>
      ))}
    </div>
  )
}
