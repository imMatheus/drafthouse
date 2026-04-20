import AsciiArt from '../../components/AsciiArt'

const TIPS: Array<{ label: string; keys: string[] }> = [
  { label: 'Open the command palette', keys: ['⌘', 'K'] },
  { label: 'Toggle the sidebar', keys: ['⌘', 'B'] },
  { label: 'Jump to pull requests', keys: ['⌘', '3'] },
  { label: 'Open the agent', keys: ['⌘', '4'] }
]

export default function WelcomeView() {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-8 px-6">
      <AsciiArt alt="Drafthouse" />

      <div className="flex flex-col items-center gap-2 text-center">
        <h1 className="text-foreground text-2xl font-semibold tracking-tight">Welcome to Drafthouse</h1>
        <p className="text-foreground-muted max-w-sm text-sm">
          Read code, review pull requests, and pair with your agent — all without leaving the workspace.
        </p>
      </div>

      <div className="flex flex-col gap-2">
        {TIPS.map((tip) => (
          <div key={tip.label} className="flex items-center justify-between gap-8">
            <span className="text-foreground-subtle text-xs">{tip.label}</span>
            <div className="flex gap-1">
              {tip.keys.map((key, i) => (
                <kbd
                  key={i}
                  className="border-border bg-surface text-foreground-muted flex size-5 items-center justify-center rounded border text-[10px] font-medium"
                >
                  {key}
                </kbd>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
