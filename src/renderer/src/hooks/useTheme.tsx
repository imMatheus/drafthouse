import { createContext, useContext, useEffect, useState } from 'react'

type Theme = 'dark' | 'light'

interface ThemeContextValue {
  theme: Theme
  toggleTheme: () => void
}

const THEME_STORAGE_KEY = 'theme'
const ThemeContext = createContext<ThemeContextValue | null>(null)

function getStoredTheme(): Theme {
  return window.localStorage.getItem(THEME_STORAGE_KEY) === 'light' ? 'light' : 'dark'
}

function applyTheme(theme: Theme): void {
  document.documentElement.classList.toggle('light', theme === 'light')
}

export function initializeTheme(): void {
  applyTheme(getStoredTheme())
}

export function ThemeProvider({ children }: { children: React.ReactNode }): React.JSX.Element {
  const [theme, setThemeState] = useState<Theme>(() => {
    const initialTheme = getStoredTheme()
    applyTheme(initialTheme)
    return initialTheme
  })

  useEffect(() => {
    applyTheme(theme)
    window.localStorage.setItem(THEME_STORAGE_KEY, theme)
  }, [theme])

  const toggleTheme = (): void => {
    setThemeState((currentTheme) => (currentTheme === 'dark' ? 'light' : 'dark'))
  }

  return <ThemeContext value={{ theme, toggleTheme }}>{children}</ThemeContext>
}

export function useTheme(): ThemeContextValue {
  const context = useContext(ThemeContext)
  if (!context) throw new Error('useTheme must be used within ThemeProvider')
  return context
}
