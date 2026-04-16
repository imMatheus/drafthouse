import type { LucideIcon } from 'lucide-react'
import { Settings } from 'lucide-react'
import { cn } from '../lib/cn'

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
  onSettingsClick: () => void
  settingsActive?: boolean
}

export default function ActivityBar({ items, onSettingsClick, settingsActive }: ActivityBarProps) {
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
                <span className="absolute bottom-0.5 right-0.5 flex px-0.5 items-center justify-center rounded-full bg-accent text-[7px] font-bold text-white">
                  {item.badge >= 1000 ? `${Math.floor(item.badge / 1000)}k+` : item.badge}
                </span>
              )}
            </button>
          )
        })}
      </div>

      <div className="mt-auto flex w-full justify-center">
        <button
          onClick={onSettingsClick}
          className={cn(
            'flex h-10 w-10 items-center justify-center rounded-md transition-colors',
            settingsActive
              ? 'bg-surface-hover text-foreground'
              : 'text-foreground-subtle hover:bg-surface-hover hover:text-foreground'
          )}
          title="Settings"
        >
          <Settings size={16} />
        </button>
      </div>
    </div>
  )
}
