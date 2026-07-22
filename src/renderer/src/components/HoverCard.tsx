import { forwardRef, type ComponentPropsWithoutRef, type ElementRef } from 'react'
import * as RadixHoverCard from '@radix-ui/react-hover-card'
import { cn } from '../lib/cn'

export const Root = RadixHoverCard.Root
export const Trigger = RadixHoverCard.Trigger

type ContentProps = ComponentPropsWithoutRef<typeof RadixHoverCard.Content>

export const Content = forwardRef<ElementRef<typeof RadixHoverCard.Content>, ContentProps>(
  ({ className, align = 'start', sideOffset = 8, ...props }, ref) => (
    <RadixHoverCard.Portal>
      <RadixHoverCard.Content
        ref={ref}
        align={align}
        sideOffset={sideOffset}
        className={cn(
          'border-border bg-surface text-foreground z-50 w-72 rounded-lg border p-4 shadow-lg outline-none',
          'data-[state=open]:animate-card-in',
          className
        )}
        {...props}
      />
    </RadixHoverCard.Portal>
  )
)
Content.displayName = 'HoverCard.Content'
