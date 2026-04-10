export default function Home() {
  return (
    <div className="flex flex-1 flex-col p-8">
      <h1 className="text-2xl font-bold text-foreground">Welcome to Drafthouse</h1>
      <p className="mt-2 text-foreground-muted">
        Select a repository from the sidebar to get started.
      </p>
    </div>
  )
}
