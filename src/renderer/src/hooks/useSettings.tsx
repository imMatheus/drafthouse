import { createContext, useContext, useState } from 'react'

export type DiffViewMode = 'unified' | 'split'

export interface UserSettings {
  diffViewMode: DiffViewMode
}

interface SettingsContextValue {
  settings: UserSettings
  updateSettings: (patch: Partial<UserSettings>) => void
}

const STORAGE_KEY = 'drafthouse.settings'

const DEFAULT_SETTINGS: UserSettings = {
  diffViewMode: 'unified'
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
