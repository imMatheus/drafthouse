import { useState, useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { ChevronLeft, Search, X, Sun, Moon, LogOut } from 'lucide-react'
import { useAuth } from '../hooks/useAuth'
import { useTheme } from '../hooks/useTheme'

export default function RepoSidebar() {
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
          <ChevronLeft
            size={14}
            className={`transition-transform duration-200 ${collapsed ? 'rotate-180' : ''}`}
          />
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
            {searching ? <X size={14} /> : <Search size={14} />}
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
              <img src={user?.avatar_url} alt={user?.login} className="h-6 w-6 shrink-0 rounded-full" />
              <div className="flex-1 overflow-hidden">
                <p className="truncate text-xs font-medium text-foreground">{user?.name ?? user?.login}</p>
              </div>
              <button
                onClick={toggleTheme}
                className="shrink-0 rounded-md p-1 text-foreground-subtle hover:bg-surface-hover hover:text-foreground"
                title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
              >
                {theme === 'dark' ? <Sun size={14} /> : <Moon size={14} />}
              </button>
              <button
                onClick={logout}
                className="shrink-0 rounded-md p-1 text-foreground-subtle hover:bg-surface-hover hover:text-foreground"
                title="Logout"
              >
                <LogOut size={14} />
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
            {theme === 'dark' ? <Sun size={14} /> : <Moon size={14} />}
          </button>
          <img src={user?.avatar_url} alt={user?.login} className="h-6 w-6 rounded-full" />
        </div>
      )}
    </aside>
  )
}
