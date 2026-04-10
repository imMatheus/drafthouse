interface PlaceholderViewProps {
  title: string
  description: string
}

export default function PlaceholderView({ title, description }: PlaceholderViewProps) {
  return (
    <div className="flex h-full items-center justify-center">
      <div className="max-w-lg rounded-xl border border-dashed border-border bg-surface px-6 py-8 text-center">
        <h2 className="text-base font-semibold text-foreground">{title}</h2>
        <p className="mt-2 text-sm text-foreground-muted">{description}</p>
      </div>
    </div>
  )
}
