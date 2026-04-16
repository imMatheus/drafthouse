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
        <h1 className="text-foreground text-lg font-semibold">Settings</h1>

        {/* Account */}
        <section className="mt-8">
          <h2 className="text-foreground-muted text-xs font-medium tracking-wide uppercase">Account</h2>
          <div className="border-border bg-surface mt-3 rounded-lg border p-4">
            {user && (
              <div className="flex items-center gap-3">
                <img src={user.avatar_url} alt={user.login} className="size-10 rounded-full" />
                <div className="min-w-0 flex-1">
                  {user.name && <p className="text-foreground text-sm font-medium">{user.name}</p>}
                  <p className="text-foreground-muted text-xs">{user.login}</p>
                </div>
                <button
                  onClick={logout}
                  className="bg-interactive text-foreground hover:bg-surface-hover flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs transition-colors"
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
          <h2 className="text-foreground-muted text-xs font-medium tracking-wide uppercase">Appearance</h2>
          <div className="border-border bg-surface mt-3 rounded-lg border">
            <div className="flex items-center justify-between px-4 py-3">
              <div>
                <p className="text-foreground text-sm">Theme</p>
                <p className="text-foreground-subtle text-xs">Switch between dark and light mode</p>
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
          <h2 className="text-foreground-muted text-xs font-medium tracking-wide uppercase">Editor</h2>
          <div className="border-border bg-surface mt-3 rounded-lg border">
            <div className="flex items-center justify-between px-4 py-3">
              <div>
                <p className="text-foreground text-sm">Diff view</p>
                <p className="text-foreground-subtle text-xs">How file diffs are displayed</p>
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

function DiffViewToggle({ value, onChange }: { value: DiffViewMode; onChange: (mode: DiffViewMode) => void }) {
  return (
    <div className="border-border flex rounded-md border">
      <button
        onClick={() => onChange('unified')}
        className={cn(
          'px-3 py-1 text-xs transition-colors',
          value === 'unified' ? 'bg-surface-hover text-foreground' : 'text-foreground-muted hover:text-foreground'
        )}
      >
        Unified
      </button>
      <button
        onClick={() => onChange('split')}
        className={cn(
          'border-border border-l px-3 py-1 text-xs transition-colors',
          value === 'split' ? 'bg-surface-hover text-foreground' : 'text-foreground-muted hover:text-foreground'
        )}
      >
        Split
      </button>
    </div>
  )
}
