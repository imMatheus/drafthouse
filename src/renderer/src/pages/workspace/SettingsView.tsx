import { LogOut, Minus, Monitor, Moon, Plus, RotateCcw, Sun } from 'lucide-react'
import { cn } from '../../lib/cn'
import Tooltip from '../../components/Tooltip'
import { useAuth } from '../../hooks/useAuth'
import { useTheme } from '../../hooks/useTheme'
import {
  codeLineHeight,
  DEFAULT_CODE_FONT_SIZE,
  MAX_CODE_FONT_SIZE,
  MIN_CODE_FONT_SIZE,
  useSettings
} from '../../hooks/useSettings'

export default function SettingsView() {
  const { user, logout } = useAuth()
  const { preference, systemTheme, setPreference } = useTheme()
  const { settings, updateSettings } = useSettings()

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="mx-auto max-w-3xl px-6 py-10">
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
          <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
            <ThemeCard
              label="Light"
              icon={<Sun size={16} />}
              themeClass="light"
              active={preference === 'light'}
              onSelect={() => setPreference('light')}
            />
            <ThemeCard
              label="Dark"
              icon={<Moon size={16} />}
              themeClass="dark"
              active={preference === 'dark'}
              onSelect={() => setPreference('dark')}
            />
            <ThemeCard
              label="System"
              icon={<Monitor size={16} />}
              themeClass={systemTheme}
              active={preference === 'system'}
              onSelect={() => setPreference('system')}
            />
          </div>
        </section>

        {/* Agent */}
        <section className="mt-8">
          <h2 className="text-foreground-muted text-xs font-medium tracking-wide uppercase">Agent</h2>
          <p className="text-foreground-muted mt-3 text-xs">What Claude is allowed to do without asking.</p>
          <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2">
            <PermissionCardOption
              label="Full access"
              description="Claude runs commands, edits files and pushes without asking. Fastest, and how sessions ran before this setting existed."
              active={settings.agentFullAccess}
              onSelect={() => updateSettings({ agentFullAccess: true })}
            />
            <PermissionCardOption
              label="Ask for approval"
              description="Claude pauses and asks in the conversation before running tools. Plan mode always asks before leaving planning."
              active={!settings.agentFullAccess}
              onSelect={() => updateSettings({ agentFullAccess: false })}
            />
          </div>
          <p className="text-foreground-subtle mt-2 text-xs">
            Applies to new sessions. Existing sessions keep the mode they were started with.
          </p>
        </section>

        {/* Editor */}
        <section className="mt-8">
          <h2 className="text-foreground-muted text-xs font-medium tracking-wide uppercase">Editor</h2>
          <p className="text-foreground-muted mt-3 text-xs">How file diffs are displayed.</p>
          <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2">
            <DiffViewCard
              label="Unified"
              description="Changes shown in a single column with additions and deletions stacked inline."
              preview={<UnifiedDiffPreview />}
              active={settings.diffViewMode === 'unified'}
              onSelect={() => updateSettings({ diffViewMode: 'unified' })}
            />
            <DiffViewCard
              label="Split"
              description="Original and modified content shown side-by-side in two columns."
              preview={<SplitDiffPreview />}
              active={settings.diffViewMode === 'split'}
              onSelect={() => updateSettings({ diffViewMode: 'split' })}
            />
          </div>

          <CodeFontSizeSetting
            fontSize={settings.codeFontSize}
            onChange={(codeFontSize) => updateSettings({ codeFontSize })}
          />
        </section>
      </div>
    </div>
  )
}

function ThemeCard({
  label,
  icon,
  themeClass,
  active,
  onSelect
}: {
  label: string
  icon: React.ReactNode
  themeClass: 'light' | 'dark'
  active: boolean
  onSelect: () => void
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        'border-border bg-surface flex flex-col overflow-hidden rounded-xl border p-4 text-left outline-2 outline-transparent transition-colors',
        active ? 'outline-accent' : 'hover:bg-surface-hover'
      )}
    >
      <div className="flex items-center gap-2">
        <span className={cn('shrink-0', active ? 'text-accent' : 'text-foreground-muted')}>{icon}</span>
        <span className="text-foreground text-sm font-semibold">{label}</span>
        <span
          aria-hidden={!active}
          className={cn(
            'border-accent text-accent ml-auto rounded-full border px-2 py-0.5 text-[10px] font-medium',
            !active && 'invisible'
          )}
        >
          Active
        </span>
      </div>

      <div className={cn('mt-4', themeClass)}>
        <ThemePreview />
      </div>
    </button>
  )
}

/** A static mock of the app layout — left sidebar with item rows, right pane
 *  with a simplified PR view (title + meta + comment thread). Colors come from
 *  the parent's `.light` / `.dark` scope so the real token classes resolve to
 *  whichever palette this card is previewing. */
function ThemePreview() {
  return (
    <div className="border-border bg-background flex aspect-[16/10] w-full overflow-hidden rounded-md border">
      {/* Sidebar */}
      <div className="border-border bg-surface flex w-1/4 flex-col gap-1 border-r p-2">
        <div className="bg-foreground-muted/40 h-1.5 w-3/4 rounded-full" />
        {/* Active row */}
        <div className="bg-surface-hover mt-1 rounded px-1.5 py-1">
          <div className="bg-foreground-muted/70 h-1.5 w-full rounded-full" />
        </div>
        {/* Inactive rows */}
        {[85, 60, 90, 70].map((w, i) => (
          <div key={i} className="px-1.5 py-1">
            <div className="bg-foreground-muted/30 h-1.5 rounded-full" style={{ width: `${w}%` }} />
          </div>
        ))}
      </div>

      {/* Main: simplified PR view */}
      <div className="flex min-w-0 flex-1 flex-col gap-1.5 p-3">
        {/* PR title */}
        <div className="bg-foreground-muted/65 h-2 w-2/3 rounded-full" />
        {/* Meta pills (status + branch chips) */}
        <div className="mt-0.5 flex items-center gap-1">
          <div className="bg-success/35 h-1.5 w-8 rounded-full" />
          <div className="bg-foreground-muted/25 h-1.5 w-10 rounded-full" />
          <div className="bg-foreground-muted/25 h-1.5 w-6 rounded-full" />
        </div>

        {/* Comment thread */}
        <div className="mt-1.5 flex flex-1 flex-col gap-1.5">
          <CommentMock bodyWidths={['95%', '70%']} withReaction />
          <CommentMock bodyWidths={['85%']} />
        </div>
      </div>
    </div>
  )
}

function CommentMock({ bodyWidths, withReaction }: { bodyWidths: string[]; withReaction?: boolean }) {
  return (
    <div className="border-border bg-surface flex gap-1.5 rounded border p-1.5">
      {/* Avatar */}
      <div className="bg-foreground-muted/40 size-4 shrink-0 rounded-full" />
      <div className="min-w-0 flex-1 space-y-1">
        {/* Header: name + time */}
        <div className="flex items-center gap-1">
          <div className="bg-foreground-muted/60 h-1.5 w-10 rounded-full" />
          <div className="bg-foreground-muted/25 h-1.5 w-6 rounded-full" />
        </div>
        {/* Body */}
        <div className="space-y-0.5">
          {bodyWidths.map((w, i) => (
            <div key={i} className="bg-foreground-muted/30 h-1 rounded-full" style={{ width: w }} />
          ))}
        </div>
        {withReaction ? (
          <div className="flex gap-1 pt-0.5">
            <div className="border-border bg-accent/15 h-2.5 w-6 rounded-full border" />
          </div>
        ) : null}
      </div>
    </div>
  )
}

function PermissionCardOption({
  label,
  description,
  active,
  onSelect
}: {
  label: string
  description: string
  active: boolean
  onSelect: () => void
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        'border-border bg-surface flex items-start gap-3 rounded-xl border px-4 py-3 text-left outline-2 outline-transparent transition-colors',
        active ? 'outline-accent' : 'hover:bg-surface-hover'
      )}
    >
      <RadioDot active={active} />
      <div className="min-w-0 flex-1">
        <p className="text-foreground text-sm font-semibold">{label}</p>
        <p className="text-foreground-muted mt-0.5 text-xs">{description}</p>
      </div>
    </button>
  )
}

const PREVIEW_LINES: { indent: number; tokens: { text: string; className: string }[] }[] = [
  {
    indent: 0,
    tokens: [
      { text: 'export function ', className: 'text-purple' },
      { text: 'greet', className: 'text-accent' },
      { text: '(name) {', className: 'text-foreground-muted' }
    ]
  },
  {
    indent: 1,
    tokens: [
      { text: 'return ', className: 'text-purple' },
      { text: '`Hello, ${name}`', className: 'text-success' }
    ]
  },
  { indent: 0, tokens: [{ text: '}', className: 'text-foreground-muted' }] }
]

function CodeFontSizeSetting({ fontSize, onChange }: { fontSize: number; onChange: (fontSize: number) => void }) {
  const setClamped = (next: number): void => {
    const clamped = Math.min(MAX_CODE_FONT_SIZE, Math.max(MIN_CODE_FONT_SIZE, next))
    if (clamped !== fontSize) onChange(clamped)
  }

  return (
    <div className="border-border bg-surface mt-3 rounded-xl border p-4">
      <div className="flex items-center justify-between gap-4">
        <div className="min-w-0">
          <p className="text-foreground text-sm font-semibold">Code font size</p>
          <p className="text-foreground-muted mt-0.5 text-xs">
            Applies to file views, diffs, and code blocks across the app.
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          {fontSize !== DEFAULT_CODE_FONT_SIZE ? (
            <Tooltip label="Reset to default" side="top">
              <button
                type="button"
                onClick={() => setClamped(DEFAULT_CODE_FONT_SIZE)}
                className="text-foreground-subtle hover:bg-surface-hover hover:text-foreground mr-1 flex size-7 items-center justify-center rounded-md transition-colors"
                aria-label="Reset code font size to default"
              >
                <RotateCcw size={13} />
              </button>
            </Tooltip>
          ) : null}
          <div className="border-border bg-background flex items-center gap-1 rounded-lg border p-1">
            <button
              type="button"
              onClick={() => setClamped(fontSize - 1)}
              disabled={fontSize <= MIN_CODE_FONT_SIZE}
              className="text-foreground-muted hover:bg-surface-hover hover:text-foreground flex size-7 items-center justify-center rounded-md transition-colors disabled:opacity-30 disabled:hover:bg-transparent"
              aria-label="Decrease code font size"
            >
              <Minus size={14} />
            </button>
            <span className="text-foreground w-12 text-center text-sm font-medium tabular-nums">{fontSize}px</span>
            <button
              type="button"
              onClick={() => setClamped(fontSize + 1)}
              disabled={fontSize >= MAX_CODE_FONT_SIZE}
              className="text-foreground-muted hover:bg-surface-hover hover:text-foreground flex size-7 items-center justify-center rounded-md transition-colors disabled:opacity-30 disabled:hover:bg-transparent"
              aria-label="Increase code font size"
            >
              <Plus size={14} />
            </button>
          </div>
        </div>
      </div>

      <div className="border-border bg-background mt-3 overflow-hidden rounded-lg border">
        <pre
          className="overflow-x-auto p-3"
          style={{ fontSize: `${fontSize}px`, lineHeight: `${codeLineHeight(fontSize)}px` }}
        >
          {PREVIEW_LINES.map((line, i) => (
            <div key={i} style={{ paddingLeft: `${line.indent * 2}ch` }} className="font-mono">
              {line.tokens.map((token, j) => (
                <span key={j} className={token.className}>
                  {token.text}
                </span>
              ))}
            </div>
          ))}
        </pre>
      </div>
    </div>
  )
}

function DiffViewCard({
  label,
  description,
  preview,
  active,
  onSelect
}: {
  label: string
  description: string
  preview: React.ReactNode
  active: boolean
  onSelect: () => void
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        'border-border bg-surface flex flex-col overflow-hidden rounded-xl border text-left outline-2 outline-transparent transition-colors',
        active ? 'outline-accent' : 'hover:bg-surface-hover'
      )}
    >
      <div className="p-4">{preview}</div>
      <div className="border-border flex items-start gap-3 border-t px-4 py-3">
        <RadioDot active={active} />
        <div className="min-w-0 flex-1">
          <p className="text-foreground text-sm font-semibold">{label}</p>
          <p className="text-foreground-muted mt-0.5 text-xs">{description}</p>
        </div>
      </div>
    </button>
  )
}

function RadioDot({ active }: { active: boolean }) {
  return (
    <span
      aria-hidden
      className={cn(
        'mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-full border',
        active ? 'border-accent' : 'border-foreground-subtle'
      )}
    >
      {active ? <span className="bg-accent size-2 rounded-full" /> : null}
    </span>
  )
}

function UnifiedDiffPreview() {
  return (
    <div className="border-border bg-background aspect-[16/9] overflow-hidden rounded-md border p-2">
      <DiffRow kind="context" />
      <DiffRow kind="del" />
      <DiffRow kind="add" />
      <DiffRow kind="add" narrow />
      <DiffRow kind="context" />
    </div>
  )
}

function SplitDiffPreview() {
  return (
    <div className="border-border bg-background aspect-[16/9] overflow-hidden rounded-md border p-2">
      <div className="flex h-full gap-1.5">
        <div className="flex-1 space-y-1">
          <DiffRow kind="context" />
          <DiffRow kind="del" />
          <DiffRow kind="context" narrow />
          <DiffRow kind="context" />
        </div>
        <div className="bg-border w-px shrink-0" />
        <div className="flex-1 space-y-1">
          <DiffRow kind="context" />
          <DiffRow kind="add" />
          <DiffRow kind="add" narrow />
          <DiffRow kind="context" />
        </div>
      </div>
    </div>
  )
}

function DiffRow({ kind, narrow }: { kind: 'context' | 'add' | 'del'; narrow?: boolean }) {
  const bg = kind === 'add' ? 'bg-success/15' : kind === 'del' ? 'bg-danger/15' : ''
  const barColor = kind === 'add' ? 'bg-success/70' : kind === 'del' ? 'bg-danger/70' : 'bg-foreground-muted/30'
  return (
    <div className={cn('-mx-1 my-0.5 flex items-center gap-1.5 rounded px-1 py-0.5', bg)}>
      <span
        className={cn(
          'w-2 text-center text-[8px] leading-none',
          kind === 'add' ? 'text-success' : kind === 'del' ? 'text-danger' : 'text-foreground-subtle/50'
        )}
      >
        {kind === 'add' ? '+' : kind === 'del' ? '−' : ' '}
      </span>
      <div className={cn('h-1.5 rounded-full', barColor, narrow ? 'w-1/2' : 'w-full')} />
    </div>
  )
}
