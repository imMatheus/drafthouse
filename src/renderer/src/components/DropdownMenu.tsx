import { forwardRef, type ComponentPropsWithoutRef, type ElementRef } from 'react'
import * as RadixDropdownMenu from '@radix-ui/react-dropdown-menu'
import { cn } from '../lib/cn'

export const Root = RadixDropdownMenu.Root
export const Trigger = RadixDropdownMenu.Trigger
export const Portal = RadixDropdownMenu.Portal

type ContentProps = ComponentPropsWithoutRef<typeof RadixDropdownMenu.Content>

export const Content = forwardRef<ElementRef<typeof RadixDropdownMenu.Content>, ContentProps>(
  ({ className, sideOffset = 4, align = 'end', ...props }, ref) => (
    <RadixDropdownMenu.Portal>
      <RadixDropdownMenu.Content
        ref={ref}
        sideOffset={sideOffset}
        align={align}
        className={cn(
          'border-border bg-surface z-30 min-w-[12rem] overflow-hidden rounded-lg border py-1 shadow-lg',
          className
        )}
        {...props}
      />
    </RadixDropdownMenu.Portal>
  )
)
Content.displayName = 'DropdownMenu.Content'

type ItemProps = ComponentPropsWithoutRef<typeof RadixDropdownMenu.Item> & {
  variant?: 'default' | 'danger'
}

export const Item = forwardRef<ElementRef<typeof RadixDropdownMenu.Item>, ItemProps>(
  ({ className, variant = 'default', ...props }, ref) => (
    <RadixDropdownMenu.Item
      ref={ref}
      className={cn(
        'flex w-full cursor-pointer items-center px-3 py-1.5 text-left text-xs outline-none transition-colors select-none',
        'data-[disabled]:cursor-not-allowed data-[disabled]:opacity-50',
        variant === 'danger'
          ? 'text-danger data-[highlighted]:bg-surface-hover'
          : 'text-foreground data-[highlighted]:bg-surface-hover',
        className
      )}
      {...props}
    />
  )
)
Item.displayName = 'DropdownMenu.Item'

type SeparatorProps = ComponentPropsWithoutRef<typeof RadixDropdownMenu.Separator>

export const Separator = forwardRef<ElementRef<typeof RadixDropdownMenu.Separator>, SeparatorProps>(
  ({ className, ...props }, ref) => (
    <RadixDropdownMenu.Separator ref={ref} className={cn('bg-border my-1 h-px', className)} {...props} />
  )
)
Separator.displayName = 'DropdownMenu.Separator'

type LabelProps = ComponentPropsWithoutRef<typeof RadixDropdownMenu.Label>

export const Label = forwardRef<ElementRef<typeof RadixDropdownMenu.Label>, LabelProps>(
  ({ className, ...props }, ref) => (
    <RadixDropdownMenu.Label
      ref={ref}
      className={cn('text-foreground-subtle px-3 py-1 text-[10px] font-semibold tracking-wider uppercase', className)}
      {...props}
    />
  )
)
Label.displayName = 'DropdownMenu.Label'
