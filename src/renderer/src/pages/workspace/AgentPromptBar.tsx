import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
  type CSSProperties,
  type DragEvent,
  type KeyboardEvent
} from 'react'
import { useQueries } from '@tanstack/react-query'
import { ArrowUp, Check, ChevronDown, FileText, GitPullRequest, Plus, Square, X } from 'lucide-react'
import type {
  AgentEffortLevel,
  AgentPermissionMode,
  GitRepoInfo,
  PullRequest,
  PullRequestDetail
} from '../../../../shared/types'
import { cn } from '../../lib/cn'
import { friendlyModelLabel, normalizeModelId } from '../../lib/models'
import { useAgentSessionEvents } from '../../contexts/AgentSessionsContext'
import {
  extractMentionedPRNumbers,
  findActiveMention,
  prStateLabel,
  removePRMention,
  searchPRs,
  splitTextIntoMentionSegments
} from '../../lib/prMentions'
import { getPathBasename, isImageFile } from '../../lib/path'
import PRStateIcon from '../../components/PRStateIcon'
import { usePullRequestList } from '../../hooks/usePullRequests'
import Tooltip from '../../components/Tooltip'
import * as DropdownMenu from '../../components/DropdownMenu'
import QueuedPromptList from '../../components/QueuedPromptList'
import type { QueuedAgentPrompt } from '../../contexts/WorkspaceContext'

interface ModelOption {
  value: string
  label: string
}

/** Menu order mirrors Claude Code desktop; digits 1–5 select while the menu is open. */
const MODE_OPTIONS: { value: AgentPermissionMode; label: string }[] = [
  { value: 'default', label: 'Manual' },
  { value: 'acceptEdits', label: 'Accept edits' },
  { value: 'plan', label: 'Plan' },
  { value: 'auto', label: 'Auto' },
  { value: 'bypassPermissions', label: 'Bypass permissions' }
]

const EFFORT_OPTIONS: { value: AgentEffortLevel; label: string }[] = [
  { value: 'low', label: 'Low' },
  { value: 'medium', label: 'Medium' },
  { value: 'high', label: 'High' },
  { value: 'xhigh', label: 'Extra' },
  { value: 'max', label: 'Max' }
]

/** What the CLI runs at when no --effort is passed. */
const DEFAULT_EFFORT: AgentEffortLevel = 'high'

const PRIMARY_MODELS: ModelOption[] = [
  { value: 'claude-fable-5', label: 'Fable 5' },
  { value: 'claude-opus-4-8', label: 'Opus 4.8' },
  { value: 'claude-sonnet-5', label: 'Sonnet 5' },
  { value: 'claude-haiku-4-5-20251001', label: 'Haiku 4.5' }
]

const MORE_MODELS: ModelOption[] = [
  { value: 'claude-opus-4-7', label: 'Opus 4.7' },
  { value: 'claude-opus-4-6', label: 'Opus 4.6' },
  { value: 'claude-sonnet-4-6', label: 'Sonnet 4.6' }
]

const ALL_MODELS = [...PRIMARY_MODELS, ...MORE_MODELS]

function findModelOption(id: string | null | undefined): ModelOption | null {
  if (!id) return null
  const normalized = normalizeModelId(id)
  return ALL_MODELS.find((option) => normalizeModelId(option.value) === normalized) ?? null
}

interface AgentPromptBarProps {
  onSubmit: (prompt: string, files?: string[], mentionedPRs?: PullRequestDetail[]) => Promise<void>
  onStop: () => void
  isRunning: boolean
  gitInfo?: GitRepoInfo | null
  text: string
  onTextChange: (text: string) => void
  mode: AgentPermissionMode
  onModeChange: (mode: AgentPermissionMode) => void
  model: string | null
  onModelChange: (model: string | null) => void
  /** Model the CLI reported for the session; shown when no override is picked. */
  detectedModel?: string | null
  /** Reasoning effort override; null follows the CLI default. */
  effort?: AgentEffortLevel | null
  onEffortChange?: (effort: AgentEffortLevel) => void
  /** When set, a context-window meter for this session renders in the control row. */
  sessionId?: string
  /** Follow-ups waiting for the running turn to finish; shown above the bar. */
  queued?: QueuedAgentPrompt[]
  onCancelQueued?: (promptId: string) => void
}

export interface AgentPromptBarHandle {
  focus: () => void
}

const AgentPromptBar = forwardRef<AgentPromptBarHandle, AgentPromptBarProps>(function AgentPromptBar(
  {
    onSubmit,
    onStop,
    isRunning,
    gitInfo,
    text,
    onTextChange,
    mode,
    onModeChange,
    model,
    onModelChange,
    detectedModel,
    effort,
    onEffortChange,
    sessionId,
    queued,
    onCancelQueued
  },
  ref
) {
  const [files, setFiles] = useState<string[]>([])
  const [isDragOver, setIsDragOver] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [cursor, setCursor] = useState(0)
  const [selectedMentionIndex, setSelectedMentionIndex] = useState(0)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const overlayRef = useRef<HTMLDivElement>(null)

  useImperativeHandle(ref, () => ({
    focus: () => {
      const ta = textareaRef.current
      if (!ta) return
      ta.focus()
      const end = ta.value.length
      ta.setSelectionRange(end, end)
      setCursor(end)
    }
  }))

  // Resize the textarea when text changes from the outside (e.g. a suggestion click).
  useEffect(() => {
    const ta = textareaRef.current
    if (!ta) return
    ta.style.height = 'auto'
    ta.style.height = `${Math.min(ta.scrollHeight, 160)}px`
  }, [text])

  // Fetch all PRs (open/closed/merged) for the mention dropdown. Sorted by
  // updated_at desc on the backend so the most relevant ones surface first.
  const { data: allPRs } = usePullRequestList(gitInfo, { state: 'all', perPage: 100 })

  // Resolve full `PullRequestDetail` for every `@prN` in the draft so pills
  // and the on-submit context have body / additions / deletions / branches.
  // react-query dedupes + caches per number across renders.
  const mentionedNumbers = extractMentionedPRNumbers(text)
  const mentionQueries = useQueries({
    queries: mentionedNumbers.map((n) => ({
      queryKey: ['pull-request', gitInfo?.owner, gitInfo?.repo, n],
      queryFn: () => window.api.github.pulls.get(gitInfo!.owner, gitInfo!.repo, n),
      enabled: gitInfo != null,
      retry: false,
      staleTime: Infinity
    }))
  })

  // Prevent Electron's default drag-and-drop behavior (navigating to the file)
  useEffect(() => {
    const prevent = (e: globalThis.DragEvent): void => {
      e.preventDefault()
    }
    document.addEventListener('dragover', prevent)
    document.addEventListener('drop', prevent)
    return () => {
      document.removeEventListener('dragover', prevent)
      document.removeEventListener('drop', prevent)
    }
  }, [])

  const activeMention = gitInfo ? findActiveMention(text, cursor) : null
  const mentionSuggestions = activeMention && allPRs ? searchPRs(allPRs, activeMention.query, 8) : []
  const showMentionMenu = activeMention !== null && mentionSuggestions.length > 0

  useEffect(() => {
    if (selectedMentionIndex >= mentionSuggestions.length) {
      setSelectedMentionIndex(0)
    }
  }, [mentionSuggestions.length, selectedMentionIndex])

  const segments = splitTextIntoMentionSegments(text)
  const hasMentions = segments.some((s) => s.type === 'mention')

  // Submitting while a turn runs is allowed — the message steers the agent.
  const canSubmit = (text.trim().length > 0 || files.length > 0) && !isSubmitting

  const handleSubmit = async (): Promise<void> => {
    if (!canSubmit) return

    setIsSubmitting(true)
    try {
      const resolvedDetails = mentionQueries.map((q) => q.data).filter((d): d is PullRequestDetail => d != null)
      await onSubmit(
        text.trim(),
        files.length > 0 ? files : undefined,
        resolvedDetails.length > 0 ? resolvedDetails : undefined
      )
      onTextChange('')
      setFiles([])
      if (textareaRef.current) {
        textareaRef.current.style.height = 'auto'
      }
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleRemovePill = (prNumber: number): void => {
    onTextChange(removePRMention(text, prNumber))
  }

  const acceptMention = (pr: PullRequest): void => {
    if (!activeMention) return
    const before = text.slice(0, activeMention.startIndex)
    const after = text.slice(activeMention.endIndex)
    const insertion = `@pr${pr.number}`
    const needsSpace = after.length === 0 || !/^\s/.test(after)
    const newText = before + insertion + (needsSpace ? ' ' : '') + after
    const newCursor = before.length + insertion.length + (needsSpace ? 1 : 0)
    onTextChange(newText)
    requestAnimationFrame(() => {
      const ta = textareaRef.current
      if (!ta) return
      ta.focus()
      ta.setSelectionRange(newCursor, newCursor)
      setCursor(newCursor)
    })
  }

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>): void => {
    if (showMentionMenu) {
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setSelectedMentionIndex((i) => (i + 1) % mentionSuggestions.length)
        return
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault()
        setSelectedMentionIndex((i) => (i - 1 + mentionSuggestions.length) % mentionSuggestions.length)
        return
      }
      if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault()
        const chosen = mentionSuggestions[selectedMentionIndex] ?? mentionSuggestions[0]
        if (chosen) acceptMention(chosen)
        return
      }
      if (e.key === 'Escape') {
        e.preventDefault()
        setCursor(-1)
        return
      }
    }

    if (e.key === 'Escape' && isRunning) {
      e.preventDefault()
      onStop()
      return
    }

    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      void handleSubmit()
    }
  }

  const handleDragOver = (e: DragEvent): void => {
    e.preventDefault()
    setIsDragOver(true)
  }

  const handleDragLeave = (e: DragEvent): void => {
    e.preventDefault()
    setIsDragOver(false)
  }

  const handleDrop = (e: DragEvent): void => {
    e.preventDefault()
    setIsDragOver(false)

    const droppedFiles: string[] = []
    for (const file of e.dataTransfer.files) {
      const filePath = (file as File & { path: string }).path
      if (filePath) droppedFiles.push(filePath)
    }

    if (droppedFiles.length > 0) {
      setFiles((prev) => [...prev, ...droppedFiles.filter((f) => !prev.includes(f))])
    }
  }

  const handleRemoveFile = (filePath: string): void => {
    setFiles((prev) => prev.filter((f) => f !== filePath))
  }

  const handleInput = (): void => {
    const textarea = textareaRef.current
    if (!textarea) return
    textarea.style.height = 'auto'
    textarea.style.height = `${Math.min(textarea.scrollHeight, 160)}px`
  }

  const syncCursor = (): void => {
    const ta = textareaRef.current
    if (!ta) return
    setCursor(ta.selectionStart ?? 0)
  }

  // Keep the overlay's scroll position aligned with the textarea when the
  // content exceeds the max height and the user scrolls.
  const handleScroll = (): void => {
    const ta = textareaRef.current
    const overlay = overlayRef.current
    if (!ta || !overlay) return
    overlay.scrollTop = ta.scrollTop
  }

  return (
    <div className="px-6 pt-2 pb-4">
      {queued && queued.length > 0 && onCancelQueued && (
        <div className="mx-auto mb-2 max-w-3xl">
          <QueuedPromptList items={queued} onCancel={onCancelQueued} />
        </div>
      )}
      <div
        className={cn(
          'border-border bg-surface relative mx-auto max-w-3xl rounded-2xl border shadow-lg transition-colors',
          isDragOver && 'border-accent bg-surface-hover'
        )}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        {/* PR mention pills */}
        {mentionedNumbers.length > 0 && (
          <div className="flex flex-wrap gap-1.5 px-3 pt-3">
            {mentionedNumbers.map((n, i) => (
              <PRMentionPill
                key={n}
                prNumber={n}
                detail={mentionQueries[i]?.data}
                isLoading={mentionQueries[i]?.isLoading ?? false}
                isError={mentionQueries[i]?.isError ?? false}
                onRemove={() => handleRemovePill(n)}
              />
            ))}
          </div>
        )}

        {/* File previews */}
        {files.length > 0 && (
          <div className="flex flex-wrap gap-2 px-3 pt-3">
            {files.map((filePath) => (
              <FilePreview key={filePath} filePath={filePath} onRemove={() => handleRemoveFile(filePath)} />
            ))}
          </div>
        )}

        <div className="flex items-end gap-2 p-3 pb-1.5">
          <Tooltip label="Attach files" side="top">
            <button
              onClick={() => {
                void window.api.fs.pickFiles().then((paths) => {
                  if (paths.length > 0) {
                    setFiles((prev) => [...prev, ...paths.filter((f) => !prev.includes(f))])
                  }
                })
              }}
              className="text-foreground-subtle hover:bg-surface-hover hover:text-foreground flex size-7 shrink-0 items-center justify-center rounded-lg transition-colors"
              aria-label="Attach files"
            >
              <Plus size={16} />
            </button>
          </Tooltip>

          <div className="relative min-h-[24px] flex-1">
            {/* Paint-only overlay that highlights `@prN`. Uses the same font
                size / line-height / wrap behavior as the textarea so the
                caret stays perfectly aligned over the visible glyphs. */}
            {hasMentions && (
              <div
                ref={overlayRef}
                aria-hidden
                className="text-foreground pointer-events-none absolute inset-0 max-h-[160px] overflow-hidden text-sm leading-5 break-words whitespace-pre-wrap"
              >
                {segments.map((seg, i) =>
                  seg.type === 'mention' ? (
                    <span key={i} className="bg-accent/15 text-accent rounded-[3px] font-medium">
                      {seg.text}
                    </span>
                  ) : (
                    <span key={i}>{seg.text}</span>
                  )
                )}
              </div>
            )}
            <textarea
              ref={textareaRef}
              value={text}
              onChange={(e) => {
                onTextChange(e.target.value)
                setCursor(e.target.selectionStart ?? e.target.value.length)
              }}
              onKeyDown={handleKeyDown}
              onKeyUp={syncCursor}
              onClick={syncCursor}
              onSelect={syncCursor}
              onInput={handleInput}
              onScroll={handleScroll}
              placeholder={
                isDragOver
                  ? 'Drop files here...'
                  : isRunning
                    ? 'Queue a follow-up — sends when this turn finishes...'
                    : 'Reply to Claude...'
              }
              rows={1}
              className={cn(
                'placeholder:text-foreground-subtle relative block min-h-[24px] w-full resize-none border-0 bg-transparent p-0 text-sm leading-5 focus:ring-0 focus:outline-none',
                hasMentions ? 'caret-foreground text-transparent' : 'text-foreground'
              )}
            />
          </div>

          {/* claude.ai button behavior: while streaming the primary control is
              Stop; typing a queued follow-up brings the accent Send back and
              demotes Stop to a secondary bordered button. */}
          {isRunning && (
            <Tooltip label="Stop" shortcut={['Esc']} side="top">
              <button
                onClick={onStop}
                className={cn(
                  'flex size-7 shrink-0 items-center justify-center rounded-lg transition-[background-color,color,transform] active:scale-[0.96]',
                  canSubmit
                    ? 'border-border text-foreground-muted hover:bg-surface-hover hover:text-foreground border'
                    : 'bg-accent text-accent-foreground hover:bg-accent-hover'
                )}
                aria-label="Stop"
              >
                <Square size={11} fill="currentColor" />
              </button>
            </Tooltip>
          )}
          {(!isRunning || canSubmit) && (
            <Tooltip
              label={canSubmit ? (isRunning ? 'Queue message' : 'Send') : 'Type a message to send'}
              shortcut={canSubmit ? ['↵'] : undefined}
              side="top"
            >
              <button
                onClick={() => void handleSubmit()}
                disabled={!canSubmit}
                className="bg-accent text-accent-foreground hover:bg-accent-hover flex size-7 shrink-0 items-center justify-center rounded-lg transition-[background-color,color,transform,opacity] active:scale-[0.96] disabled:opacity-30"
                aria-label="Send"
              >
                <ArrowUp size={14} strokeWidth={2.5} />
              </button>
            </Tooltip>
          )}
        </div>

        {/* Control row: mode on the left; model, effort and context on the right */}
        <div className="flex items-center gap-1.5 px-3 pb-2">
          <ModeMenu mode={mode} onModeChange={onModeChange} />

          {mode === 'plan' && (
            <span className="text-foreground-subtle text-[11px]">Claude proposes a plan before making changes</span>
          )}

          <div className="ml-auto flex items-center gap-1">
            <ModelMenu model={model} detectedModel={detectedModel} onModelChange={onModelChange} />
            {onEffortChange && <EffortMenu effort={effort ?? null} onEffortChange={onEffortChange} />}
            {sessionId && <ContextMeter sessionId={sessionId} modelId={model ?? detectedModel ?? null} />}
          </div>
        </div>

        {showMentionMenu && (
          <div className="border-border bg-surface absolute bottom-full left-0 z-20 mb-1 w-full max-w-md overflow-hidden rounded-lg border shadow-lg">
            <div className="text-foreground-subtle border-border border-b px-3 py-1.5 text-xs">
              Mention a pull request
            </div>
            <div className="max-h-64 overflow-y-auto">
              {mentionSuggestions.map((pr, index) => (
                <PRSuggestionRow
                  key={pr.number}
                  pr={pr}
                  selected={index === selectedMentionIndex}
                  onSelect={() => acceptMention(pr)}
                  onHover={() => setSelectedMentionIndex(index)}
                />
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
})

export default AgentPromptBar

/** Shared chip styling for the control-row triggers (mode / model / effort). */
const CONTROL_CHIP_CLASS =
  'text-foreground-subtle hover:bg-surface-hover hover:text-foreground flex items-center gap-1 rounded-md px-1.5 py-1 text-[11px] transition-colors'

/** Right-hand slot of a menu row: a checkmark when selected, a digit hint otherwise. */
function MenuItemHint({ selected, hint }: { selected: boolean; hint?: number }) {
  if (selected) return <Check size={12} className="text-foreground shrink-0" />
  if (hint === undefined) return null
  return <span className="text-foreground-subtle shrink-0 text-[10px] tabular-nums">{hint}</span>
}

function ModeMenu({
  mode,
  onModeChange
}: {
  mode: AgentPermissionMode
  onModeChange: (mode: AgentPermissionMode) => void
}) {
  const [open, setOpen] = useState(false)
  const selected = MODE_OPTIONS.find((option) => option.value === mode)

  return (
    <DropdownMenu.Root open={open} onOpenChange={setOpen}>
      <DropdownMenu.Trigger asChild>
        <button
          className={cn(
            'bg-interactive flex items-center rounded-md px-2 py-1 text-[11px] font-medium transition-colors',
            mode === 'plan' ? 'text-accent' : 'text-foreground-muted hover:text-foreground'
          )}
        >
          {selected?.label ?? mode}
        </button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Content
        align="start"
        className="min-w-[13rem]"
        onKeyDown={(e) => {
          if (!/^[1-5]$/.test(e.key)) return
          e.preventDefault()
          onModeChange(MODE_OPTIONS[Number(e.key) - 1].value)
          setOpen(false)
        }}
      >
        <DropdownMenu.Label>Mode</DropdownMenu.Label>
        {MODE_OPTIONS.map((option, index) => (
          <DropdownMenu.Item key={option.value} onSelect={() => onModeChange(option.value)} className="gap-2">
            <span className="min-w-0 flex-1 truncate">{option.label}</span>
            <MenuItemHint selected={option.value === mode} hint={index + 1} />
          </DropdownMenu.Item>
        ))}
      </DropdownMenu.Content>
    </DropdownMenu.Root>
  )
}

function ModelMenu({
  model,
  detectedModel,
  onModelChange
}: {
  model: string | null
  detectedModel?: string | null
  onModelChange: (model: string | null) => void
}) {
  const [open, setOpen] = useState(false)
  const selectedId = model ?? detectedModel ?? null
  const selectedOption = findModelOption(selectedId)

  return (
    <DropdownMenu.Root open={open} onOpenChange={setOpen}>
      <DropdownMenu.Trigger asChild>
        <button className={CONTROL_CHIP_CLASS}>
          <span className="max-w-[160px] truncate">
            {selectedOption?.label ?? (selectedId ? friendlyModelLabel(selectedId) : 'Model')}
          </span>
          <ChevronDown size={10} className="shrink-0" />
        </button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Content
        align="end"
        className="min-w-[11rem]"
        onKeyDown={(e) => {
          if (!/^[1-9]$/.test(e.key)) return
          const option = PRIMARY_MODELS[Number(e.key) - 1]
          if (!option) return
          e.preventDefault()
          onModelChange(option.value)
          setOpen(false)
        }}
      >
        <DropdownMenu.Label>Models</DropdownMenu.Label>
        {PRIMARY_MODELS.map((option, index) => (
          <ModelMenuItem
            key={option.value}
            option={option}
            selected={selectedOption?.value === option.value}
            hint={index + 1}
            onSelect={() => onModelChange(option.value)}
          />
        ))}
        <DropdownMenu.Separator />
        <DropdownMenu.Sub>
          <DropdownMenu.SubTrigger>More models</DropdownMenu.SubTrigger>
          <DropdownMenu.SubContent>
            {MORE_MODELS.map((option) => (
              <ModelMenuItem
                key={option.value}
                option={option}
                selected={selectedOption?.value === option.value}
                onSelect={() => onModelChange(option.value)}
              />
            ))}
          </DropdownMenu.SubContent>
        </DropdownMenu.Sub>
      </DropdownMenu.Content>
    </DropdownMenu.Root>
  )
}

function ModelMenuItem({
  option,
  selected,
  hint,
  onSelect
}: {
  option: ModelOption
  selected: boolean
  hint?: number
  onSelect: () => void
}) {
  return (
    <DropdownMenu.Item onSelect={onSelect} className="gap-2">
      <span className="min-w-0 flex-1 truncate">{option.label}</span>
      <MenuItemHint selected={selected} hint={hint} />
    </DropdownMenu.Item>
  )
}

function EffortMenu({
  effort,
  onEffortChange
}: {
  effort: AgentEffortLevel | null
  onEffortChange: (effort: AgentEffortLevel) => void
}) {
  const current = effort ?? DEFAULT_EFFORT
  const currentOption = EFFORT_OPTIONS.find((option) => option.value === current)

  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <button className={CONTROL_CHIP_CLASS} aria-label="Reasoning effort">
          {currentOption?.label ?? 'Effort'}
        </button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Content align="end" className="w-60 px-3 py-2.5">
        <div className="text-foreground text-xs">
          <span className="text-foreground-muted">Effort</span>{' '}
          <span className="font-medium">{currentOption?.label}</span>
          {effort === null && <span className="text-foreground-subtle"> · default</span>}
        </div>
        <div className="text-foreground-subtle mt-2 flex items-center justify-between text-[11px]">
          <span>Faster</span>
          <span>Smarter</span>
        </div>
        <div className="bg-interactive mt-1.5 mb-0.5 flex items-center justify-between rounded-full px-1 py-0.5">
          {EFFORT_OPTIONS.map((option) => {
            const active = option.value === current
            return (
              <button
                key={option.value}
                onClick={() => onEffortChange(option.value)}
                aria-label={`Effort: ${option.label}`}
                title={option.label}
                className="group flex h-6 w-8 items-center justify-center"
              >
                <span
                  className={cn(
                    'rounded-full transition-[width,height,background-color] duration-150',
                    active
                      ? 'bg-foreground size-4 shadow-sm'
                      : cn(
                          'size-1.5 group-hover:size-2.5',
                          option.value === 'max' ? 'bg-purple/80' : 'bg-foreground-subtle/60'
                        )
                  )}
                />
              </button>
            )
          })}
        </div>
      </DropdownMenu.Content>
    </DropdownMenu.Root>
  )
}

// ============================================================
// Context window meter
// ============================================================

/** 1M-context model ids carry a "[1m]" suffix; everything else is 200k. */
function contextLimitForModel(modelId: string | null): number {
  return modelId?.includes('[1m]') ? 1_000_000 : 200_000
}

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`
  return `${n}`
}

/**
 * Live context-window usage for the session: the prompt size of the latest
 * main-thread assistant message (input + cache reads/writes + output). Only
 * this component subscribes to the event stream, so per-token updates
 * re-render the meter alone, not the whole prompt bar.
 */
function ContextMeter({ sessionId, modelId }: { sessionId: string; modelId: string | null }) {
  const events = useAgentSessionEvents(sessionId)

  let tokens = 0
  for (let i = events.length - 1; i >= 0; i--) {
    const event = events[i]
    if (event.type !== 'assistant' || (event.parent_tool_use_id ?? null) !== null) continue
    const usage = event.message.usage
    if (!usage) continue
    tokens =
      usage.input_tokens +
      (usage.cache_read_input_tokens ?? 0) +
      (usage.cache_creation_input_tokens ?? 0) +
      usage.output_tokens
    break
  }

  const limit = contextLimitForModel(modelId)
  const pct = Math.min(100, Math.round((tokens / limit) * 100))

  return (
    <DropdownMenu.Root>
      <Tooltip label="Context window" side="top">
        <DropdownMenu.Trigger asChild>
          <button
            className="hover:bg-surface-hover flex size-6 items-center justify-center rounded-md transition-colors"
            aria-label="Context window usage"
          >
            <span
              className="viewed-progress-ring relative size-3.5 rounded-full"
              style={
                {
                  '--viewed-progress': `${pct}%`,
                  '--viewed-progress-fill': 'var(--color-accent)'
                } as CSSProperties
              }
            >
              <span className="bg-surface absolute inset-[2.5px] rounded-full" />
            </span>
          </button>
        </DropdownMenu.Trigger>
      </Tooltip>
      <DropdownMenu.Content align="end" className="w-64 px-3 py-2.5">
        <div className="flex items-baseline justify-between gap-3">
          <span className="text-foreground-muted text-xs">Context window</span>
          <span className="text-foreground text-xs tabular-nums">
            {formatTokens(tokens)} / {formatTokens(limit)} ({pct}%)
          </span>
        </div>
        <div className="bg-interactive mt-2 h-1 overflow-hidden rounded-full">
          <div className="bg-accent h-full rounded-full transition-[width]" style={{ width: `${pct}%` }} />
        </div>
      </DropdownMenu.Content>
    </DropdownMenu.Root>
  )
}

function PRMentionPill({
  prNumber,
  detail,
  isLoading,
  isError,
  onRemove
}: {
  prNumber: number
  detail: PullRequestDetail | undefined
  isLoading: boolean
  isError: boolean
  onRemove: () => void
}) {
  const state = detail ? prStateLabel(detail) : null

  return (
    <div className="border-border bg-interactive hover:bg-surface-hover group inline-flex max-w-full items-center gap-1.5 rounded-md border py-1 pr-1 pl-2 text-xs transition-colors">
      {state ? (
        <PRStateIcon state={state} size={13} />
      ) : (
        <GitPullRequest size={13} className="text-foreground-subtle shrink-0" />
      )}
      <span className="text-foreground-muted font-mono text-[11px]">#{prNumber}</span>
      <span className="text-foreground max-w-[260px] truncate font-medium">
        {detail ? detail.title : isError ? 'Not found' : isLoading ? 'Loading…' : '—'}
      </span>
      <Tooltip label="Remove reference" side="top">
        <button
          type="button"
          onClick={onRemove}
          className="text-foreground-subtle hover:text-foreground hover:bg-surface ml-0.5 flex size-4 shrink-0 items-center justify-center rounded transition-colors"
          aria-label="Remove reference"
        >
          <X size={11} />
        </button>
      </Tooltip>
    </div>
  )
}

function PRSuggestionRow({
  pr,
  selected,
  onSelect,
  onHover
}: {
  pr: PullRequest
  selected: boolean
  onSelect: () => void
  onHover: () => void
}) {
  const state = prStateLabel(pr)
  return (
    <button
      type="button"
      onMouseDown={(e) => {
        e.preventDefault()
        onSelect()
      }}
      onMouseEnter={onHover}
      className={cn(
        'flex w-full items-center gap-2.5 px-3 py-2 text-left transition-colors',
        selected ? 'bg-surface-hover' : 'hover:bg-surface-hover'
      )}
    >
      <PRStateIcon state={state} />
      <div className="min-w-0 flex-1">
        <p className="text-foreground truncate text-sm font-medium">
          <span className="text-foreground-muted font-normal">#{pr.number}</span> {pr.title}
        </p>
        <p className="text-foreground-muted truncate text-xs">
          {state} · {pr.user.login}
        </p>
      </div>
    </button>
  )
}

function FilePreview({ filePath, onRemove }: { filePath: string; onRemove: () => void }) {
  const fileName = getPathBasename(filePath)
  const isImage = isImageFile(filePath)
  const [dataUrl, setDataUrl] = useState<string | null>(null)

  useEffect(() => {
    if (!isImage) return
    let cancelled = false
    window.api.fs
      .readFileDataUrl(filePath)
      .then((url) => {
        if (!cancelled) setDataUrl(url)
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [filePath, isImage])

  if (isImage) {
    return (
      <div className="group border-border bg-interactive relative size-20 overflow-hidden rounded-lg border">
        {dataUrl && <img src={dataUrl} alt={fileName} className="size-full object-cover" />}
        <button
          onClick={onRemove}
          className="bg-background/80 text-foreground-subtle hover:text-foreground absolute top-1 right-1 flex size-5 items-center justify-center rounded-full opacity-0 transition-opacity group-hover:opacity-100"
        >
          <X size={12} />
        </button>
      </div>
    )
  }

  return (
    <div className="group border-border bg-interactive relative flex items-center gap-2 rounded-lg border px-3 py-2">
      <FileText size={14} className="text-foreground-subtle shrink-0" />
      <span className="text-foreground-muted max-w-[120px] truncate text-xs" title={filePath}>
        {fileName}
      </span>
      <button
        onClick={onRemove}
        className="text-foreground-subtle hover:text-foreground flex size-4 shrink-0 items-center justify-center rounded-full opacity-0 transition-opacity group-hover:opacity-100"
      >
        <X size={12} />
      </button>
    </div>
  )
}
