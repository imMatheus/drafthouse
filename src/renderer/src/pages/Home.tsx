import { useQuery } from '@tanstack/react-query'
import { useAuth } from '../hooks/useAuth'

export default function Home() {
  const { user, logout } = useAuth()

  const { data: repos, isLoading } = useQuery({
    queryKey: ['repos'],
    queryFn: () => window.api.auth.getRepos()
  })

  return (
    <div className="flex h-screen flex-col bg-neutral-900 p-8">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <img src={user!.avatar_url} alt={user!.login} className="h-10 w-10 rounded-full" />
          <span className="text-lg font-medium text-white">{user!.name ?? user!.login}</span>
        </div>
        <button
          onClick={logout}
          className="rounded-lg bg-white/10 px-4 py-2 text-sm text-white hover:bg-white/20"
        >
          Logout
        </button>
      </div>

      <h2 className="mt-8 mb-4 text-2xl font-bold text-white">Your Repositories</h2>

      {isLoading ? (
        <p className="text-neutral-400">Loading repos...</p>
      ) : (
        <div className="flex flex-col gap-2">
          {repos?.map((repo) => (
            <div key={repo.full_name} className="rounded-lg bg-white/5 p-4 hover:bg-white/10">
              <h3 className="font-semibold text-white">{repo.name}</h3>
              {repo.description && (
                <p className="mt-1 text-sm text-neutral-400">{repo.description}</p>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
