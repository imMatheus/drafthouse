import type { ReactNode } from 'react'
import * as RadixTooltip from '@radix-ui/react-tooltip'

export type TooltipSide = 'top' | 'bottom' | 'left' | 'right'

interface TooltipProps {
  label: string
  shortcut?: string[]
  side?: TooltipSide
  delay?: number
  children: ReactNode
}

export default function Tooltip({ label, shortcut, side = 'top', delay, children }: TooltipProps) {
  return (
    <RadixTooltip.Root delayDuration={delay}>
      <RadixTooltip.Trigger asChild>{children}</RadixTooltip.Trigger>
      <RadixTooltip.Portal>
        <RadixTooltip.Content
          side={side}
          sideOffset={6}
          role="tooltip"
          className="border-border bg-surface text-foreground pointer-events-none z-50 flex items-center gap-1.5 rounded-md border px-2 py-1 text-xs whitespace-nowrap shadow-lg"
        >
          <span>{label}</span>
          {shortcut && shortcut.length > 0 ? (
            <span className="flex gap-0.5">
              {shortcut.map((k, i) => (
                <kbd
                  key={i}
                  className="border-border bg-background text-foreground-muted flex size-4 items-center justify-center rounded border text-[10px] font-medium"
                >
                  {k}
                </kbd>
              ))}
            </span>
          ) : null}
        </RadixTooltip.Content>
      </RadixTooltip.Portal>
    </RadixTooltip.Root>
  )
}
