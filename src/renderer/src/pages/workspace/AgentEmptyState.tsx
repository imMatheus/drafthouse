import AsciiArt from '../../components/AsciiArt'

const SUGGESTED_PROMPTS = [
  'Summarize the open pull requests and flag anything that looks risky',
  'Review my uncommitted changes and suggest improvements',
  'Find recently changed files and explain what they do',
  'Look for TODOs and FIXMEs in the codebase'
]

interface AgentEmptyStateProps {
  onSelectSuggestion: (prompt: string) => void
}

export default function AgentEmptyState({ onSelectSuggestion }: AgentEmptyStateProps) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-6 px-6">
      <AsciiArt />
      <p className="text-foreground-subtle text-sm">What would you like the agent to do?</p>
      <div className="flex max-w-2xl flex-wrap justify-center gap-2">
        {SUGGESTED_PROMPTS.map((prompt) => (
          <button
            key={prompt}
            type="button"
            onClick={() => onSelectSuggestion(prompt)}
            className="border-border bg-surface hover:bg-surface-hover text-foreground-muted hover:text-foreground rounded-full border px-3 py-1.5 text-xs transition-colors"
          >
            {prompt}
          </button>
        ))}
      </div>
    </div>
  )
}
