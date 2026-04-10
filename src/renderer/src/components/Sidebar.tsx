import { useState, useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useAuth } from '../hooks/useAuth'
import { useTheme } from '../hooks/useTheme'

export default function Sidebar() {
  const { user, logout } = useAuth()
  const { theme, toggleTheme } = useTheme()
  const [collapsed, setCollapsed] = useState(false)
  const [searching, setSearching] = useState(false)
  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.metaKey && e.key === 'b') {
        e.preventDefault()
        setCollapsed((c) => !c)
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), 300)
    return () => clearTimeout(timer)
  }, [search])

  const query = debouncedSearch || undefined
  const { data: repos, isLoading } = useQuery({
    queryKey: ['repos', query],
    queryFn: () => window.api.auth.getRepos(query)
  })

  return (
    <aside
      className={`flex h-screen shrink-0 flex-col border-r border-border bg-surface transition-all duration-200 ${
        collapsed ? 'w-12' : 'w-64'
      }`}
    >
      {/* Header */}
      <div className="flex justify-end items-center gap-1 px-3 pt-3 pb-2">
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="shrink-0 rounded-md p-1 text-foreground-muted hover:bg-surface-hover hover:text-foreground"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className={`transition-transform duration-200 ${collapsed ? 'rotate-180' : ''}`}
          >
            <path d="m15 18-6-6 6-6" />
          </svg>
        </button>
      </div>
      <div className="flex items-center gap-1 px-3 pt-3 pb-2">
        {!collapsed && (
          <div className="flex flex-1 items-center min-w-0">
            {searching ? (
              <input
                autoFocus
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                onBlur={() => {
                  if (!search) setSearching(false)
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Escape') {
                    setSearch('')
                    setSearching(false)
                  }
                }}
                placeholder="Search repositories..."
                className="w-full bg-transparent text-xs text-foreground placeholder-foreground-subtle outline-none"
              />
            ) : (
              <span className="text-xs text-foreground-muted">Top repositories</span>
            )}
          </div>
        )}
        {!collapsed && (
          <button
            onClick={() => {
              if (searching) {
                setSearch('')
                setSearching(false)
              } else {
                setSearching(true)
              }
            }}
            className="shrink-0 rounded-md p-1 text-foreground-muted hover:bg-surface-hover hover:text-foreground"
          >
            {searching ? (
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M18 6 6 18" />
                <path d="m6 6 12 12" />
              </svg>
            ) : (
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <circle cx="11" cy="11" r="8" />
                <path d="m21 21-4.3-4.3" />
              </svg>
            )}
          </button>
        )}
      </div>

      {/* Repo list */}
      {!collapsed && (
        <>
          <nav className="flex-1 overflow-y-auto px-2">
            {isLoading ? (
              <p className="px-2 text-xs text-foreground-subtle">Loading...</p>
            ) : !repos || repos.length === 0 ? (
              <p className="px-2 text-xs text-foreground-subtle">
                {query ? 'No results found' : 'No repositories found'}
              </p>
            ) : (
              <ul className="flex flex-col">
                {repos.map((repo) => (
                  <li key={repo.full_name}>
                    <button className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left transition-colors hover:bg-surface-hover">
                      <img
                        src={repo.owner.avatar_url}
                        alt={repo.owner.login}
                        className="h-4 w-4 shrink-0 rounded-full"
                      />
                      <span className="truncate text-xs text-foreground-muted">{repo.full_name}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </nav>

          {/* Footer */}
          <div className="border-t border-border p-2">
            <div className="flex items-center gap-2">
              <img src={user!.avatar_url} alt={user!.login} className="h-6 w-6 shrink-0 rounded-full" />
              <div className="flex-1 overflow-hidden">
                <p className="truncate text-xs font-medium text-foreground">{user!.name ?? user!.login}</p>
              </div>
              <button
                onClick={toggleTheme}
                className="shrink-0 rounded-md p-1 text-foreground-subtle hover:bg-surface-hover hover:text-foreground"
                title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
              >
                {theme === 'dark' ? (
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    width="14"
                    height="14"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <circle cx="12" cy="12" r="4" />
                    <path d="M12 2v2" />
                    <path d="M12 20v2" />
                    <path d="m4.93 4.93 1.41 1.41" />
                    <path d="m17.66 17.66 1.41 1.41" />
                    <path d="M2 12h2" />
                    <path d="M20 12h2" />
                    <path d="m6.34 17.66-1.41 1.41" />
                    <path d="m19.07 4.93-1.41 1.41" />
                  </svg>
                ) : (
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    width="14"
                    height="14"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z" />
                  </svg>
                )}
              </button>
              <button
                onClick={logout}
                className="shrink-0 rounded-md p-1 text-foreground-subtle hover:bg-surface-hover hover:text-foreground"
                title="Logout"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                  <polyline points="16 17 21 12 16 7" />
                  <line x1="21" x2="9" y1="12" y2="12" />
                </svg>
              </button>
            </div>
          </div>
        </>
      )}

      {/* Collapsed footer */}
      {collapsed && (
        <div className="mt-auto border-t border-border p-2 flex flex-col items-center gap-2">
          <button
            onClick={toggleTheme}
            className="rounded-md p-1 text-foreground-subtle hover:bg-surface-hover hover:text-foreground"
            title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
          >
            {theme === 'dark' ? (
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <circle cx="12" cy="12" r="4" />
                <path d="M12 2v2" />
                <path d="M12 20v2" />
                <path d="m4.93 4.93 1.41 1.41" />
                <path d="m17.66 17.66 1.41 1.41" />
                <path d="M2 12h2" />
                <path d="M20 12h2" />
                <path d="m6.34 17.66-1.41 1.41" />
                <path d="m19.07 4.93-1.41 1.41" />
              </svg>
            ) : (
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z" />
              </svg>
            )}
          </button>
          <img src={user!.avatar_url} alt={user!.login} className="h-6 w-6 rounded-full" />
        </div>
      )}
    </aside>
  )
}
