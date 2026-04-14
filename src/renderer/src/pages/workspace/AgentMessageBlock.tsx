import { useState, type KeyboardEvent } from 'react'
import { Check, ChevronRight, ShieldQuestion, X } from 'lucide-react'
import { cn } from '../../lib/cn'
import type {
  AgentContentBlock,
  AgentStreamAssistant,
  AgentStreamEvent,
  AgentStreamSystem,
  AgentStreamUser
} from '../../../../shared/types'
import AgentEditDiffBlock from './AgentEditDiffBlock'
import MarkdownBody from './MarkdownBody'

// Tools that render as a simple one-liner with no dropdown and no result content
const INLINE_TOOL_NAMES = new Set(['Read', 'Glob', 'Grep'])

// Track tool_use IDs for inline tools so we can suppress their tool_results
const INLINE_TOOL_IDS = new Set<string>()

export interface PermissionCallbacks {
  onAllowOnce: () => void
  onAlwaysAllow: () => void
  onRespondDifferently: (message: string) => void
}

interface AgentMessageBlockProps {
  event: AgentStreamEvent
  permissionCallbacks?: PermissionCallbacks
  isLastDenial?: boolean
}

export default function AgentMessageBlock({
  event,
  permissionCallbacks,
  isLastDenial
}: AgentMessageBlockProps) {
  switch (event.type) {
    case 'assistant':
      return <AssistantMessage event={event} />
    case 'user':
      return (
        <UserMessage
          event={event}
          permissionCallbacks={permissionCallbacks}
          isLastDenial={isLastDenial}
        />
      )
    case 'system':
      return <SystemMessage event={event as AgentStreamSystem} />
    case 'result':
      return null
    default:
      return null
  }
}

function AssistantMessage({ event }: { event: AgentStreamAssistant }) {
  return (
    <div className="mb-4">
      {event.message.content.map((block, i) => (
        <ContentBlock key={i} block={block} />
      ))}
    </div>
  )
}

function UserMessage({
  event,
  permissionCallbacks,
  isLastDenial
}: {
  event: AgentStreamUser
  permissionCallbacks?: PermissionCallbacks
  isLastDenial?: boolean
}) {
  const textBlocks = event.message.content.filter((b) => b.type === 'text')
  const nonTextBlocks = event.message.content.filter((b) => b.type !== 'text')

  return (
    <div className="mb-4">
      {/* User text as right-aligned bubble */}
      {textBlocks.length > 0 && (
        <div className="mb-3 mt-6 flex justify-end">
          <div className="max-w-[80%] rounded-2xl bg-surface px-4 py-2.5">
            {textBlocks.map((block, i) => (
              <p key={i} className="text-sm text-foreground whitespace-pre-wrap">
                {block.type === 'text' ? block.text : ''}
              </p>
            ))}
          </div>
        </div>
      )}
      {/* Tool results rendered normally */}
      {nonTextBlocks.map((block, i) => (
        <ContentBlock
          key={i}
          block={block}
          permissionCallbacks={permissionCallbacks}
          isLastDenial={isLastDenial}
        />
      ))}
    </div>
  )
}

function SystemMessage({ event }: { event: AgentStreamSystem }) {
  if (event.subtype === 'init') return null

  const message = event.message
  if (!message) return null

  return (
    <div className="mb-2 text-xs text-foreground-subtle italic">
      {message}
    </div>
  )
}

function ContentBlock({
  block,
  permissionCallbacks,
  isLastDenial
}: {
  block: AgentContentBlock
  permissionCallbacks?: PermissionCallbacks
  isLastDenial?: boolean
}) {
  switch (block.type) {
    case 'text':
      return <MarkdownBody>{block.text}</MarkdownBody>
    case 'tool_use':
      if (
        block.name === 'Edit' &&
        typeof block.input.file_path === 'string' &&
        typeof block.input.old_string === 'string' &&
        typeof block.input.new_string === 'string'
      ) {
        return (
          <AgentEditDiffBlock
            filePath={block.input.file_path}
            oldString={block.input.old_string}
            newString={block.input.new_string}
          />
        )
      }
      if (INLINE_TOOL_NAMES.has(block.name)) {
        return <InlineToolBlock name={block.name} input={block.input} toolUseId={block.id} />
      }
      return <ToolUseBlock name={block.name} input={block.input} />
    case 'tool_result': {
      // Hide results for inline tools (Read, Glob, Grep) — they just dump raw content
      if ('tool_use_id' in block && INLINE_TOOL_IDS.has(block.tool_use_id)) {
        return null
      }
      const isPermissionDenial =
        'is_error' in block &&
        typeof block.content === 'string' &&
        block.content.startsWith('Claude requested permissions to')
      if (isPermissionDenial) {
        return (
          <PermissionDenialBlock
            content={block.content}
            callbacks={isLastDenial ? permissionCallbacks : undefined}
          />
        )
      }
      return <ToolResultBlock content={block.content} />
    }
    default:
      return null
  }
}

function InlineToolBlock({
  name,
  input,
  toolUseId
}: {
  name: string
  input: Record<string, unknown>
  toolUseId: string
}) {
  // Register this ID so the matching tool_result gets hidden
  INLINE_TOOL_IDS.add(toolUseId)

  const summary = getToolUseSummary(name, input)

  return (
    <div className="my-1.5 flex items-center gap-2 text-xs text-foreground-muted">
      <span className="font-medium text-foreground-subtle">{name}</span>
      {summary && <span className="truncate">{summary}</span>}
    </div>
  )
}

function ToolUseBlock({ name, input }: { name: string; input: Record<string, unknown> }) {
  const [expanded, setExpanded] = useState(false)

  const summary = getToolUseSummary(name, input)

  return (
    <div className="my-2 rounded-md border border-border bg-surface">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs transition-colors hover:bg-surface-hover"
      >
        <ChevronRight
          size={12}
          className={cn('shrink-0 text-foreground-subtle transition-transform', expanded && 'rotate-90')}
        />
        <span className="font-medium text-foreground">{name}</span>
        {summary && (
          <span className="truncate text-foreground-subtle">{summary}</span>
        )}
      </button>

      {expanded && (
        <div className="border-t border-border px-3 py-2">
          <pre className="overflow-x-auto text-xs text-foreground-muted whitespace-pre-wrap break-all">
            {JSON.stringify(input, null, 2)}
          </pre>
        </div>
      )}
    </div>
  )
}

function ToolResultBlock({ content }: { content: string }) {
  const [expanded, setExpanded] = useState(false)
  const isLong = content.length > 300
  const displayContent = !expanded && isLong ? content.slice(0, 300) + '...' : content

  return (
    <div className="my-1 rounded-md border border-border bg-surface px-3 py-2">
      <pre className="overflow-x-auto text-xs text-foreground-subtle whitespace-pre-wrap break-all">
        {displayContent}
      </pre>
      {isLong && (
        <button
          onClick={() => setExpanded(!expanded)}
          className="mt-1 text-xs text-accent hover:text-accent-hover"
        >
          {expanded ? 'Show less' : 'Show more'}
        </button>
      )}
    </div>
  )
}

function PermissionDenialBlock({
  content,
  callbacks
}: {
  content: string
  callbacks?: PermissionCallbacks
}) {
  const [decision, setDecision] = useState<'pending' | 'allowed' | 'always-allowed' | 'denied' | 'redirected'>(
    callbacks ? 'pending' : 'allowed' // If no callbacks, this is an old resolved denial
  )
  const [showInput, setShowInput] = useState(false)
  const [inputText, setInputText] = useState('')

  const description = content
    .replace('Claude requested permissions to ', '')
    .replace(", but you haven't granted it yet.", '')

  const handleAllow = (): void => {
    setDecision('allowed')
    callbacks?.onAllowOnce()
  }

  const handleAlwaysAllow = (): void => {
    setDecision('always-allowed')
    callbacks?.onAlwaysAllow()
  }

  const handleSendMessage = (): void => {
    if (!inputText.trim() || !callbacks) return
    setDecision('redirected')
    callbacks.onRespondDifferently(inputText.trim())
    setInputText('')
    setShowInput(false)
  }

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>): void => {
    if (e.key === 'Enter') {
      e.preventDefault()
      handleSendMessage()
    }
    if (e.key === 'Escape') {
      setShowInput(false)
      setInputText('')
    }
  }

  // Resolved states
  if (decision === 'allowed' || decision === 'always-allowed') {
    return (
      <div className="my-1.5 flex items-center gap-2 text-xs text-foreground-muted">
        <Check size={12} className="shrink-0 text-success" />
        <span>Allowed: <span className="text-foreground-subtle">{description}</span></span>
      </div>
    )
  }

  if (decision === 'denied') {
    return (
      <div className="my-1.5 flex items-center gap-2 text-xs text-foreground-muted">
        <X size={12} className="shrink-0 text-danger" />
        <span>Denied: <span className="text-foreground-subtle">{description}</span></span>
      </div>
    )
  }

  if (decision === 'redirected') {
    return null
  }

  // Pending state — show action buttons
  return (
    <div className="my-2 rounded-md border border-border bg-surface">
      <div className="flex items-start gap-2.5 px-3 py-2.5">
        <ShieldQuestion size={14} className="mt-0.5 shrink-0 text-foreground-muted" />
        <div className="min-w-0 flex-1">
          <p className="text-xs text-foreground">
            Approve: <span className="text-foreground-muted">{description}</span>
          </p>

          <div className="mt-2.5">
            {showInput ? (
              <div className="flex items-center gap-2">
                <input
                  autoFocus
                  value={inputText}
                  onChange={(e) => setInputText(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="Tell the agent what to do instead..."
                  className="min-w-0 flex-1 rounded border border-border bg-background px-2 py-1 text-xs text-foreground placeholder:text-foreground-subtle focus:border-accent focus:outline-none"
                />
                <button
                  onClick={handleSendMessage}
                  disabled={!inputText.trim()}
                  className="shrink-0 rounded bg-accent px-2 py-1 text-xs text-white hover:bg-accent-hover disabled:opacity-40"
                >
                  Send
                </button>
                <button
                  onClick={() => { setShowInput(false); setInputText('') }}
                  className="shrink-0 text-xs text-foreground-subtle hover:text-foreground"
                >
                  Cancel
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <button
                  onClick={handleAllow}
                  className="rounded bg-interactive px-2 py-1 text-xs text-foreground transition-colors hover:bg-surface-hover"
                >
                  Allow once
                </button>
                <button
                  onClick={handleAlwaysAllow}
                  className="rounded bg-interactive px-2 py-1 text-xs text-foreground transition-colors hover:bg-surface-hover"
                >
                  Always allow
                </button>
                <button
                  onClick={() => setShowInput(true)}
                  className="rounded bg-interactive px-2 py-1 text-xs text-foreground transition-colors hover:bg-surface-hover"
                >
                  Do something else...
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

function getToolUseSummary(name: string, input: Record<string, unknown>): string | null {
  switch (name) {
    case 'Read':
      return typeof input.file_path === 'string' ? input.file_path : null
    case 'Write':
      return typeof input.file_path === 'string' ? input.file_path : null
    case 'Edit':
      return typeof input.file_path === 'string' ? input.file_path : null
    case 'Bash':
      return typeof input.command === 'string' ? input.command.slice(0, 80) : null
    case 'Glob':
      return typeof input.pattern === 'string' ? input.pattern : null
    case 'Grep':
      return typeof input.pattern === 'string' ? input.pattern : null
    default:
      return null
  }
}
