import { Files, Sun, Moon } from 'lucide-react'
import { useTheme } from '../hooks/useTheme'

export default function ActivityBar({
  explorerVisible,
  onToggleExplorer
}: {
  explorerVisible: boolean
  onToggleExplorer: () => void
}) {
  const { theme, toggleTheme } = useTheme()

  return (
    <div className="flex h-screen w-11 shrink-0 flex-col items-center border-r border-border bg-background py-2">
      <div className="flex w-full flex-col items-center gap-1">
        <button
          onClick={onToggleExplorer}
          className={`relative flex h-9 w-9 items-center justify-center rounded-md transition-colors ${
            explorerVisible
              ? 'bg-surface-hover text-foreground'
              : 'text-foreground-subtle hover:bg-surface-hover hover:text-foreground'
          }`}
          title="Explorer"
        >
          <Files size={18} strokeWidth={1.5} />
        </button>
      </div>

      <div className="mt-auto flex w-full justify-center">
        <button
          onClick={toggleTheme}
          className="flex h-9 w-9 items-center justify-center rounded-md text-foreground-subtle transition-colors hover:bg-surface-hover hover:text-foreground"
          title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
        >
          {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
        </button>
      </div>
    </div>
  )
}
