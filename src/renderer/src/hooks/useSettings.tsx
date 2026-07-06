import { createContext, useContext, useLayoutEffect, useState } from 'react'

export type DiffViewMode = 'unified' | 'split'
export type DiffIndicatorStyle = 'bars' | 'classic' | 'none'

// Code font size bounds. 13px is @pierre/diffs' own default (paired with a 20px
// line height), so it's our default too.
export const MIN_CODE_FONT_SIZE = 10
export const MAX_CODE_FONT_SIZE = 24
export const DEFAULT_CODE_FONT_SIZE = 13

/**
 * Line height paired with a given code font size. Tracks @pierre/diffs' default
 * 13px→20px ratio (~1.5) so leading stays proportional at every size.
 */
export function codeLineHeight(fontSize: number): number {
  return Math.round(fontSize * 1.5)
}

function clampFontSize(value: unknown): number {
  if (typeof value !== 'number' || Number.isNaN(value)) return DEFAULT_CODE_FONT_SIZE
  return Math.min(MAX_CODE_FONT_SIZE, Math.max(MIN_CODE_FONT_SIZE, Math.round(value)))
}

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
  /** Font size (px) for rendered code in file views, diffs, and code blocks. */
  codeFontSize: number
  /**
   * When true (default) agent sessions run with every tool permission granted.
   * When false the agent asks for approval in the conversation before running tools.
   */
  agentFullAccess: boolean
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
  diffCollapsed: false,
  codeFontSize: DEFAULT_CODE_FONT_SIZE,
  agentFullAccess: true
}

function loadSettings(): UserSettings {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return DEFAULT_SETTINGS
    const parsed = JSON.parse(raw) as Partial<UserSettings>
    const merged = { ...DEFAULT_SETTINGS, ...parsed }
    return { ...merged, codeFontSize: clampFontSize(merged.codeFontSize) }
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

  // @pierre/diffs reads `--diffs-font-size` / `--diffs-line-height` from each
  // diff shadow root's `:host`, and custom properties inherit through the
  // shadow boundary. Setting them on the document root drives every code
  // surface (file views, diffs, PR/commit viewers, markdown code blocks) at
  // once. Layout effect so the size is set before diffs first paint.
  useLayoutEffect(() => {
    const root = document.documentElement
    root.style.setProperty('--diffs-font-size', `${settings.codeFontSize}px`)
    root.style.setProperty('--diffs-line-height', `${codeLineHeight(settings.codeFontSize)}px`)
  }, [settings.codeFontSize])

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
