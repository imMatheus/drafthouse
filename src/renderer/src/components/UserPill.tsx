import { Sun, Moon, LogOut } from 'lucide-react'
import { useAuth } from '../hooks/useAuth'
import { useTheme } from '../hooks/useTheme'
import Tooltip from './Tooltip'

export default function UserPill() {
  const { user, logout } = useAuth()
  const { theme, toggleTheme } = useTheme()

  return (
    <div className="border-border bg-surface absolute top-3 left-3 z-10 flex items-center gap-1.5 rounded-full border py-1 pr-1.5 pl-1 shadow-sm">
      <img src={user?.avatar_url} alt={user?.login} className="size-6 shrink-0 rounded-full" />
      <span className="text-foreground max-w-32 truncate text-xs font-medium">{user?.name ?? user?.login}</span>
      <div className="bg-border mx-0.5 h-4 w-px shrink-0" />
      <Tooltip label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'} side="bottom">
        <button
          onClick={toggleTheme}
          className="text-foreground-subtle hover:bg-surface-hover hover:text-foreground shrink-0 rounded-full p-1 transition-colors"
          aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
        >
          {theme === 'dark' ? <Sun size={14} /> : <Moon size={14} />}
        </button>
      </Tooltip>
      <Tooltip label="Logout" side="bottom">
        <button
          onClick={logout}
          className="text-foreground-subtle hover:bg-surface-hover hover:text-foreground shrink-0 rounded-full p-1 transition-colors"
          aria-label="Logout"
        >
          <LogOut size={14} />
        </button>
      </Tooltip>
    </div>
  )
}
