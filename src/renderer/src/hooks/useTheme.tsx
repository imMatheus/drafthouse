import { createContext, useContext, useEffect, useState } from 'react'

/** The theme actually applied to the UI. */
type ResolvedTheme = 'dark' | 'light'
/** The user's saved choice — 'system' follows the OS. */
type ThemePreference = ResolvedTheme | 'system'

interface ThemeContextValue {
  /** Resolved theme applied to the UI ('system' resolves to one of these). */
  theme: ResolvedTheme
  /** The user's saved preference, including 'system'. */
  preference: ThemePreference
  /** The current OS-level theme, regardless of preference. */
  systemTheme: ResolvedTheme
  setPreference: (preference: ThemePreference) => void
  /** Cycles the preference: dark → light → system → dark. */
  cycleTheme: () => void
}

const THEME_STORAGE_KEY = 'theme'
const ThemeContext = createContext<ThemeContextValue | null>(null)

function getStoredPreference(): ThemePreference {
  const stored = window.localStorage.getItem(THEME_STORAGE_KEY)
  if (stored === 'light' || stored === 'dark' || stored === 'system') return stored
  return 'dark'
}

function getSystemTheme(): ResolvedTheme {
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

function resolveTheme(preference: ThemePreference): ResolvedTheme {
  return preference === 'system' ? getSystemTheme() : preference
}

function applyTheme(theme: ResolvedTheme): void {
  document.documentElement.classList.toggle('light', theme === 'light')
}

export function initializeTheme(): void {
  applyTheme(resolveTheme(getStoredPreference()))
}

export function ThemeProvider({ children }: { children: React.ReactNode }): React.JSX.Element {
  const [preference, setPreferenceState] = useState<ThemePreference>(getStoredPreference)
  const [systemTheme, setSystemTheme] = useState<ResolvedTheme>(getSystemTheme)

  const theme = preference === 'system' ? systemTheme : preference

  useEffect(() => {
    applyTheme(theme)
  }, [theme])

  useEffect(() => {
    window.localStorage.setItem(THEME_STORAGE_KEY, preference)
  }, [preference])

  // Keep 'system' in sync when the OS theme changes while the app is open.
  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: dark)')
    const onChange = (event: MediaQueryListEvent): void => setSystemTheme(event.matches ? 'dark' : 'light')
    media.addEventListener('change', onChange)
    return () => media.removeEventListener('change', onChange)
  }, [])

  const setPreference = (next: ThemePreference): void => setPreferenceState(next)

  const cycleTheme = (): void =>
    setPreferenceState((current) => (current === 'dark' ? 'light' : current === 'light' ? 'system' : 'dark'))

  return <ThemeContext value={{ theme, preference, systemTheme, setPreference, cycleTheme }}>{children}</ThemeContext>
}

export function useTheme(): ThemeContextValue {
  const context = useContext(ThemeContext)
  if (!context) throw new Error('useTheme must be used within ThemeProvider')
  return context
}
