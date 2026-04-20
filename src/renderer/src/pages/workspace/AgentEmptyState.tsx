import { FileClock, GitPullRequest, GitCompare, ListTodo, type LucideIcon } from 'lucide-react'
import AsciiArt from '../../components/AsciiArt'
import { cn } from '../../lib/cn'

const SUGGESTED_PROMPTS: Array<{ prompt: string; icon: LucideIcon; iconClassName: string }> = [
  {
    prompt: 'Summarize the open pull requests and flag anything that looks risky',
    icon: GitPullRequest,
    iconClassName: 'text-success'
  },
  {
    prompt: 'Review my uncommitted changes and suggest improvements',
    icon: GitCompare,
    iconClassName: 'text-accent'
  },
  {
    prompt: 'Find recently changed files and explain what they do',
    icon: FileClock,
    iconClassName: 'text-purple'
  },
  {
    prompt: 'Look for TODOs and FIXMEs in the codebase',
    icon: ListTodo,
    iconClassName: 'text-danger'
  }
]

interface AgentEmptyStateProps {
  onSelectSuggestion: (prompt: string) => void
}

export default function AgentEmptyState({ onSelectSuggestion }: AgentEmptyStateProps) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-6 px-6">
      <AsciiArt />
      <p className="text-foreground-subtle text-sm">What would you like the agent to do?</p>
      <div className="flex w-full max-w-md flex-col items-stretch gap-1.5">
        {SUGGESTED_PROMPTS.map(({ prompt, icon: Icon, iconClassName }) => (
          <button
            key={prompt}
            type="button"
            onClick={() => onSelectSuggestion(prompt)}
            className="border-border bg-surface hover:bg-surface-hover text-foreground-muted hover:text-foreground flex items-center gap-2.5 rounded-full border px-3.5 py-2 text-left text-xs transition-colors"
          >
            <Icon size={14} strokeWidth={1.8} className={cn('shrink-0', iconClassName)} />
            <span className="min-w-0 flex-1">{prompt}</span>
          </button>
        ))}
      </div>
    </div>
  )
}
