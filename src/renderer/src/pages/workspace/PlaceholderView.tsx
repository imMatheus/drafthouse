interface PlaceholderViewProps {
  title: string
  description: string
}

export default function PlaceholderView({ title, description }: PlaceholderViewProps) {
  return (
    <div className="flex h-full items-center justify-center">
      <div className="border-border bg-surface max-w-lg rounded-xl border border-dashed px-6 py-8 text-center">
        <h2 className="text-foreground text-base font-semibold">{title}</h2>
        <p className="text-foreground-muted mt-2 text-sm">{description}</p>
      </div>
    </div>
  )
}
