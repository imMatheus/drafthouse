import { useQuery } from '@tanstack/react-query'
import { useAuth } from '../hooks/useAuth'

export default function Home() {
  const { user, logout } = useAuth()

  const { data: repos, isLoading } = useQuery({
    queryKey: ['repos'],
    queryFn: () => window.api.auth.getRepos()
  })

  return (
    <div className="flex h-screen flex-col bg-background p-8">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <img src={user!.avatar_url} alt={user!.login} className="h-10 w-10 rounded-full" />
          <span className="text-lg font-medium text-foreground">{user!.name ?? user!.login}</span>
        </div>
        <button
          onClick={logout}
          className="rounded-lg border border-border bg-interactive px-4 py-2 text-sm text-foreground-muted hover:bg-interactive-hover hover:text-foreground"
        >
          Logout
        </button>
      </div>

      <h2 className="mt-8 mb-4 text-2xl font-bold text-foreground">Your Repositories</h2>

      {isLoading ? (
        <p className="text-foreground-muted">Loading repos...</p>
      ) : (
        <div className="flex flex-col gap-2">
          {repos?.map((repo) => (
            <div
              key={repo.full_name}
              className="rounded-lg border border-border bg-surface p-4 hover:bg-surface-hover"
            >
              <h3 className="font-semibold text-foreground">{repo.name}</h3>
              {repo.description && (
                <p className="mt-1 text-sm text-foreground-muted">{repo.description}</p>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
