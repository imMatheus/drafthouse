import type { LucideIcon } from 'lucide-react'
import { Moon, Sun } from 'lucide-react'
import { cn } from '../lib/cn'
import { useTheme } from '../hooks/useTheme'

export interface ActivityBarItem {
  id: string
  label: string
  icon: LucideIcon
  active?: boolean
  badge?: number
  onClick: () => void
}

interface ActivityBarProps {
  items: ActivityBarItem[]
}

export default function ActivityBar({ items }: ActivityBarProps) {
  const { theme, toggleTheme } = useTheme()

  return (
    <div className="flex h-screen w-12 shrink-0 flex-col items-center border-r border-border bg-background py-2">
      <div className="flex w-full flex-col items-center gap-1">
        {items.map((item) => {
          const Icon = item.icon

          return (
            <button
              key={item.id}
              onClick={item.onClick}
              className={cn(
                'relative flex h-10 w-10 items-center justify-center rounded-md transition-colors',
                item.active
                  ? 'bg-surface-hover text-foreground'
                  : 'text-foreground-subtle hover:bg-surface-hover hover:text-foreground'
              )}
              title={item.label}
            >
              <Icon size={18} strokeWidth={1.75} />
              {item.badge != null && item.badge > 0 && (
                <span className="absolute -right-0.5 -top-0.5 flex size-4 items-center justify-center rounded-full bg-accent text-[9px] font-bold text-white">
                  {item.badge}
                </span>
              )}
            </button>
          )
        })}
      </div>

      <div className="mt-auto flex w-full justify-center">
        <button
          onClick={toggleTheme}
          className="flex h-10 w-10 items-center justify-center rounded-md text-foreground-subtle transition-colors hover:bg-surface-hover hover:text-foreground"
          title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
        >
          {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
        </button>
      </div>
    </div>
  )
}
