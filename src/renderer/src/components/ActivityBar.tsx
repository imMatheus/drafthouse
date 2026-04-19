import type { LucideIcon } from 'lucide-react'
import { Settings } from 'lucide-react'
import { cn } from '../lib/cn'
import Tooltip from './Tooltip'

export interface ActivityBarItem {
  id: string
  label: string
  icon: LucideIcon
  active?: boolean
  badge?: number
  onClick: () => void
  shortcut?: string[]
}

interface ActivityBarProps {
  items: ActivityBarItem[]
  onSettingsClick: () => void
  settingsActive?: boolean
}

export default function ActivityBar({ items, onSettingsClick, settingsActive }: ActivityBarProps) {
  return (
    <div className="border-border bg-background flex w-12 shrink-0 flex-col items-center border-r py-2">
      <div className="flex w-full flex-col items-center gap-1">
        {items.map((item) => {
          const Icon = item.icon

          return (
            <Tooltip key={item.id} label={item.label} shortcut={item.shortcut} side="right">
              <button
                onClick={item.onClick}
                className={cn(
                  'relative flex h-10 w-10 items-center justify-center rounded-md transition-colors',
                  item.active
                    ? 'bg-surface-hover text-foreground'
                    : 'text-foreground-subtle hover:bg-surface-hover hover:text-foreground'
                )}
                aria-label={item.label}
              >
                <Icon size={18} strokeWidth={1.75} />
                {item.badge != null && item.badge > 0 && (
                  <span className="bg-accent absolute right-0.5 bottom-0.5 flex items-center justify-center rounded-full px-1 text-[7px] font-bold text-white">
                    {item.badge >= 1000 ? `${Math.floor(item.badge / 1000)}k+` : item.badge}
                  </span>
                )}
              </button>
            </Tooltip>
          )
        })}
      </div>

      <div className="mt-auto flex w-full justify-center">
        <Tooltip label="Settings" side="right">
          <button
            onClick={onSettingsClick}
            className={cn(
              'flex h-10 w-10 items-center justify-center rounded-md transition-colors',
              settingsActive
                ? 'bg-surface-hover text-foreground'
                : 'text-foreground-subtle hover:bg-surface-hover hover:text-foreground'
            )}
            aria-label="Settings"
          >
            <Settings size={16} />
          </button>
        </Tooltip>
      </div>
    </div>
  )
}
