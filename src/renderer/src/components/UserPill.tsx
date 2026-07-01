import { Sun, Moon, Monitor, LogOut } from 'lucide-react'
import { useAuth } from '../hooks/useAuth'
import { useTheme } from '../hooks/useTheme'
import Tooltip from './Tooltip'

const THEME_ICONS = { dark: Moon, light: Sun, system: Monitor } as const
const THEME_LABELS = { dark: 'Dark', light: 'Light', system: 'System' } as const

export default function UserPill() {
  const { user, logout } = useAuth()
  const { preference, cycleTheme } = useTheme()

  const ThemeIcon = THEME_ICONS[preference]
  const themeLabel = `Theme: ${THEME_LABELS[preference]}`

  return (
    <div className="border-border bg-surface absolute top-3 left-3 z-10 flex items-center gap-1.5 rounded-full border py-1 pr-1.5 pl-1 shadow-sm">
      <img src={user?.avatar_url} alt={user?.login} className="size-6 shrink-0 rounded-full" />
      <span className="text-foreground max-w-32 truncate text-xs font-medium">{user?.name ?? user?.login}</span>
      <div className="bg-border mx-0.5 h-4 w-px shrink-0" />
      <Tooltip label={themeLabel} side="bottom">
        <button
          onClick={cycleTheme}
          className="text-foreground-subtle hover:bg-surface-hover hover:text-foreground shrink-0 rounded-full p-1 transition-colors"
          aria-label={themeLabel}
        >
          <ThemeIcon size={14} />
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
