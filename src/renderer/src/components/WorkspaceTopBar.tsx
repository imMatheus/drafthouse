import { ChevronLeft, ChevronRight, PanelLeft } from 'lucide-react'
import { cn } from '../lib/cn'

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
        <TopBarButton onClick={onToggleSidebar} title="Toggle sidebar (⌘B)">
          <PanelLeft size={14} strokeWidth={1.75} />
        </TopBarButton>
        <TopBarButton onClick={onGoBack} disabled={!canGoBack} title="Go back">
          <ChevronLeft size={16} strokeWidth={1.75} />
        </TopBarButton>
        <TopBarButton onClick={onGoForward} disabled={!canGoForward} title="Go forward">
          <ChevronRight size={16} strokeWidth={1.75} />
        </TopBarButton>
      </div>

      <div className="text-foreground-muted pointer-events-none absolute inset-0 flex items-center justify-center text-xs font-medium">
        {projectName}
      </div>
    </div>
  )
}

function TopBarButton({
  children,
  onClick,
  disabled,
  title
}: {
  children: React.ReactNode
  onClick: () => void
  disabled?: boolean
  title: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={cn(
        'flex size-6 items-center justify-center rounded-md transition-colors',
        disabled
          ? 'text-foreground-subtle/40 cursor-not-allowed'
          : 'text-foreground-subtle hover:bg-surface-hover hover:text-foreground'
      )}
    >
      {children}
    </button>
  )
}
