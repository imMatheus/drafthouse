import { useEffect, useState } from 'react'
import { cn } from '../lib/cn'

const FRAMES = ['✶', '✸', '✹', '✺', '✹', '✷']

type LoadingSize = 'sm' | 'md' | 'lg'

interface LoadingProps {
  label?: string
  size?: LoadingSize
  className?: string
}

const INDICATOR_SIZE: Record<LoadingSize, string> = {
  sm: 'w-2.5 text-xs',
  md: 'w-3 text-sm',
  lg: 'w-10 text-5xl'
}

const LABEL_SIZE: Record<LoadingSize, string> = {
  sm: 'text-xs',
  md: 'text-sm',
  lg: 'text-sm'
}

const LAYOUT: Record<LoadingSize, string> = {
  sm: 'inline-flex items-center gap-2',
  md: 'inline-flex items-center gap-2',
  lg: 'flex flex-col items-center gap-3'
}

export function LoadingIndicator({ size = 'md' }: { size?: LoadingSize }) {
  const [frame, setFrame] = useState(0)

  useEffect(() => {
    const interval = setInterval(() => {
      setFrame((prev) => (prev + 1) % FRAMES.length)
    }, 150)
    return () => clearInterval(interval)
  }, [])

  return (
    <span
      aria-hidden
      className={cn('text-accent inline-flex shrink-0 justify-center leading-none', INDICATOR_SIZE[size])}
    >
      {FRAMES[frame]}
    </span>
  )
}

export default function Loading({ label, size = 'md', className }: LoadingProps) {
  return (
    <div
      role="status"
      aria-live="polite"
      className={cn('text-foreground-subtle', LAYOUT[size], LABEL_SIZE[size], className)}
    >
      <LoadingIndicator size={size} />
      {label ? <span>{label}</span> : null}
    </div>
  )
}

export function LoadingView({
  label,
  size = 'lg',
  className
}: {
  label?: string
  size?: LoadingSize
  className?: string
}) {
  return (
    <div className={cn('flex h-full flex-1 items-center justify-center p-6', className)}>
      <Loading label={label} size={size} />
    </div>
  )
}
