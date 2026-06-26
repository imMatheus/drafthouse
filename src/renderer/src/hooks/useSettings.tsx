import { createContext, useContext, useState } from 'react'

export type DiffViewMode = 'unified' | 'split'
export type DiffIndicatorStyle = 'bars' | 'classic' | 'none'

export interface UserSettings {
  diffViewMode: DiffViewMode
  /** Show gutter line numbers in diffs. */
  diffLineNumbers: boolean
  /** Wrap long lines instead of horizontal scroll. */
  diffWordWrap: boolean
  /** Change indicator style in the gutter. */
  diffIndicators: DiffIndicatorStyle
  /** Whether files default to collapsed when a diff loads. */
  diffCollapsed: boolean
}

interface SettingsContextValue {
  settings: UserSettings
  updateSettings: (patch: Partial<UserSettings>) => void
}

const STORAGE_KEY = 'drafthouse.settings'

const DEFAULT_SETTINGS: UserSettings = {
  diffViewMode: 'unified',
  diffLineNumbers: true,
  diffWordWrap: true,
  diffIndicators: 'classic',
  diffCollapsed: false
}

function loadSettings(): UserSettings {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return DEFAULT_SETTINGS
    const parsed = JSON.parse(raw) as Partial<UserSettings>
    return { ...DEFAULT_SETTINGS, ...parsed }
  } catch {
    return DEFAULT_SETTINGS
  }
}

function saveSettings(settings: UserSettings): void {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(settings))
}

const SettingsContext = createContext<SettingsContextValue | null>(null)

export function SettingsProvider({ children }: { children: React.ReactNode }): React.JSX.Element {
  const [settings, setSettings] = useState<UserSettings>(loadSettings)

  const updateSettings = (patch: Partial<UserSettings>): void => {
    setSettings((prev) => {
      const next = { ...prev, ...patch }
      saveSettings(next)
      return next
    })
  }

  return <SettingsContext value={{ settings, updateSettings }}>{children}</SettingsContext>
}

export function useSettings(): SettingsContextValue {
  const context = useContext(SettingsContext)
  if (!context) throw new Error('useSettings must be used within SettingsProvider')
  return context
}
