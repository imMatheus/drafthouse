import { LogOut, Moon, Sun } from 'lucide-react'
import { cn } from '../../lib/cn'
import { useAuth } from '../../hooks/useAuth'
import { useTheme } from '../../hooks/useTheme'
import { useSettings, type DiffViewMode } from '../../hooks/useSettings'

export default function SettingsView() {
  const { user, logout } = useAuth()
  const { theme, toggleTheme } = useTheme()
  const { settings, updateSettings } = useSettings()

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="mx-auto max-w-lg px-6 py-10">
        <h1 className="text-lg font-semibold text-foreground">Settings</h1>

        {/* Account */}
        <section className="mt-8">
          <h2 className="text-xs font-medium uppercase tracking-wide text-foreground-muted">Account</h2>
          <div className="mt-3 rounded-lg border border-border bg-surface p-4">
            {user && (
              <div className="flex items-center gap-3">
                <img
                  src={user.avatar_url}
                  alt={user.login}
                  className="size-10 rounded-full"
                />
                <div className="min-w-0 flex-1">
                  {user.name && (
                    <p className="text-sm font-medium text-foreground">{user.name}</p>
                  )}
                  <p className="text-xs text-foreground-muted">{user.login}</p>
                </div>
                <button
                  onClick={logout}
                  className="flex items-center gap-1.5 rounded-md bg-interactive px-3 py-1.5 text-xs text-foreground transition-colors hover:bg-surface-hover"
                >
                  <LogOut size={12} />
                  Log out
                </button>
              </div>
            )}
          </div>
        </section>

        {/* Appearance */}
        <section className="mt-8">
          <h2 className="text-xs font-medium uppercase tracking-wide text-foreground-muted">Appearance</h2>
          <div className="mt-3 rounded-lg border border-border bg-surface">
            <div className="flex items-center justify-between px-4 py-3">
              <div>
                <p className="text-sm text-foreground">Theme</p>
                <p className="text-xs text-foreground-subtle">Switch between dark and light mode</p>
              </div>
              <button
                onClick={toggleTheme}
                className={cn(
                  'flex items-center gap-2 rounded-md px-3 py-1.5 text-xs transition-colors',
                  'bg-interactive text-foreground hover:bg-surface-hover'
                )}
              >
                {theme === 'dark' ? <Sun size={14} /> : <Moon size={14} />}
                {theme === 'dark' ? 'Light' : 'Dark'}
              </button>
            </div>
          </div>
        </section>

        {/* Editor */}
        <section className="mt-8">
          <h2 className="text-xs font-medium uppercase tracking-wide text-foreground-muted">Editor</h2>
          <div className="mt-3 rounded-lg border border-border bg-surface">
            <div className="flex items-center justify-between px-4 py-3">
              <div>
                <p className="text-sm text-foreground">Diff view</p>
                <p className="text-xs text-foreground-subtle">How file diffs are displayed</p>
              </div>
              <DiffViewToggle
                value={settings.diffViewMode}
                onChange={(mode) => updateSettings({ diffViewMode: mode })}
              />
            </div>
          </div>
        </section>
      </div>
    </div>
  )
}

function DiffViewToggle({
  value,
  onChange
}: {
  value: DiffViewMode
  onChange: (mode: DiffViewMode) => void
}) {
  return (
    <div className="flex rounded-md border border-border">
      <button
        onClick={() => onChange('unified')}
        className={cn(
          'px-3 py-1 text-xs transition-colors',
          value === 'unified'
            ? 'bg-surface-hover text-foreground'
            : 'text-foreground-muted hover:text-foreground'
        )}
      >
        Unified
      </button>
      <button
        onClick={() => onChange('split')}
        className={cn(
          'border-l border-border px-3 py-1 text-xs transition-colors',
          value === 'split'
            ? 'bg-surface-hover text-foreground'
            : 'text-foreground-muted hover:text-foreground'
        )}
      >
        Split
      </button>
    </div>
  )
}
