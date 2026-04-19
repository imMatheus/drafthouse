import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react'
import { ChevronLeft, ChevronRight, PanelLeft } from 'lucide-react'
import { cn } from '../lib/cn'
import Tooltip from './Tooltip'

interface WorkspaceTopBarProps {
  projectName: string
  onToggleSidebar: () => void
  canGoBack: boolean
  canGoForward: boolean
  onGoBack: () => void
  onGoForward: () => void
}

export default function WorkspaceTopBar({
  projectName,
  onToggleSidebar,
  canGoBack,
  canGoForward,
  onGoBack,
  onGoForward
}: WorkspaceTopBarProps) {
  return (
    <div className="border-border bg-background relative flex h-9 shrink-0 items-center border-b px-2">
      <div className="flex items-center gap-0.5">
        <Tooltip label="Toggle sidebar" shortcut={['⌘', 'B']} side="bottom">
          <TopBarButton onClick={onToggleSidebar} aria-label="Toggle sidebar">
            <PanelLeft size={14} strokeWidth={1.75} />
          </TopBarButton>
        </Tooltip>
        <Tooltip label="Go back" side="bottom">
          <TopBarButton onClick={onGoBack} disabled={!canGoBack} aria-label="Go back">
            <ChevronLeft size={16} strokeWidth={1.75} />
          </TopBarButton>
        </Tooltip>
        <Tooltip label="Go forward" side="bottom">
          <TopBarButton onClick={onGoForward} disabled={!canGoForward} aria-label="Go forward">
            <ChevronRight size={16} strokeWidth={1.75} />
          </TopBarButton>
        </Tooltip>
      </div>

      <div className="text-foreground-muted pointer-events-none absolute inset-0 flex items-center justify-center text-xs font-medium">
        {projectName}
      </div>
    </div>
  )
}

interface TopBarButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  children: ReactNode
}

// forwardRef + prop spread so the Radix Tooltip `asChild` trigger can wire up
// its pointer handlers and ref on this wrapper component.
const TopBarButton = forwardRef<HTMLButtonElement, TopBarButtonProps>(function TopBarButton(
  { children, className, disabled, ...rest },
  ref
) {
  return (
    <button
      ref={ref}
      type="button"
      disabled={disabled}
      className={cn(
        'flex size-6 items-center justify-center rounded-md transition-colors',
        disabled
          ? 'text-foreground-subtle/40 cursor-not-allowed'
          : 'text-foreground-subtle hover:bg-surface-hover hover:text-foreground',
        className
      )}
      {...rest}
    >
      {children}
    </button>
  )
})
