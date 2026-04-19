import { useState, useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { ChevronLeft, Search, X, Sun, Moon, LogOut } from 'lucide-react'
import { useAuth } from '../hooks/useAuth'
import { cn } from '../lib/cn'
import { useTheme } from '../hooks/useTheme'
import Tooltip from './Tooltip'

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
    queryFn: () => window.api.github.repos.list(query)
  })

  return (
    <aside
      className={cn(
        'border-border bg-surface flex h-screen shrink-0 flex-col border-r transition-all duration-200',
        collapsed ? 'w-12' : 'w-64'
      )}
    >
      {/* Header */}
      <div className="flex items-center justify-end gap-1 px-3 pt-3 pb-2">
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="text-foreground-muted hover:bg-surface-hover hover:text-foreground shrink-0 rounded-md p-1"
        >
          <ChevronLeft size={14} className={cn('transition-transform duration-200', collapsed && 'rotate-180')} />
        </button>
      </div>
      <div className="flex items-center gap-1 px-3 pt-3 pb-2">
        {!collapsed && (
          <div className="flex min-w-0 flex-1 items-center">
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
                className="text-foreground placeholder-foreground-subtle w-full bg-transparent text-xs outline-none"
              />
            ) : (
              <span className="text-foreground-muted text-xs">Top repositories</span>
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
            className="text-foreground-muted hover:bg-surface-hover hover:text-foreground shrink-0 rounded-md p-1"
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
              <p className="text-foreground-subtle px-2 text-xs">Loading...</p>
            ) : !repos || repos.length === 0 ? (
              <p className="text-foreground-subtle px-2 text-xs">
                {query ? 'No results found' : 'No repositories found'}
              </p>
            ) : (
              <ul className="flex flex-col">
                {repos.map((repo) => (
                  <li key={repo.full_name}>
                    <button className="hover:bg-surface-hover flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left transition-colors">
                      <img
                        src={repo.owner.avatar_url}
                        alt={repo.owner.login}
                        className="h-4 w-4 shrink-0 rounded-full"
                      />
                      <span className="text-foreground-muted truncate text-xs">{repo.full_name}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </nav>

          {/* Footer */}
          <div className="border-border border-t p-2">
            <div className="flex items-center gap-2">
              <img src={user?.avatar_url} alt={user?.login} className="h-6 w-6 shrink-0 rounded-full" />
              <div className="flex-1 overflow-hidden">
                <p className="text-foreground truncate text-xs font-medium">{user?.name ?? user?.login}</p>
              </div>
              <Tooltip label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'} side="top">
                <button
                  onClick={toggleTheme}
                  className="text-foreground-subtle hover:bg-surface-hover hover:text-foreground shrink-0 rounded-md p-1"
                  aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
                >
                  {theme === 'dark' ? <Sun size={14} /> : <Moon size={14} />}
                </button>
              </Tooltip>
              <Tooltip label="Logout" side="top">
                <button
                  onClick={logout}
                  className="text-foreground-subtle hover:bg-surface-hover hover:text-foreground shrink-0 rounded-md p-1"
                  aria-label="Logout"
                >
                  <LogOut size={14} />
                </button>
              </Tooltip>
            </div>
          </div>
        </>
      )}

      {/* Collapsed footer */}
      {collapsed && (
        <div className="border-border mt-auto flex flex-col items-center gap-2 border-t p-2">
          <Tooltip label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'} side="right">
            <button
              onClick={toggleTheme}
              className="text-foreground-subtle hover:bg-surface-hover hover:text-foreground rounded-md p-1"
              aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
            >
              {theme === 'dark' ? <Sun size={14} /> : <Moon size={14} />}
            </button>
          </Tooltip>
          <img src={user?.avatar_url} alt={user?.login} className="h-6 w-6 rounded-full" />
        </div>
      )}
    </aside>
  )
}
