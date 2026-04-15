import { useState } from 'react'
import { ChevronRight } from 'lucide-react'
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

export function UserBubble({ text }: { text: string }) {
  return (
    <div className="mb-3 mt-2 flex justify-end">
      <div className="max-w-[80%] rounded-2xl bg-interactive px-3 py-2 text-sm text-foreground whitespace-pre-wrap">
        {text}
      </div>
    </div>
  )
}

interface AgentMessageBlockProps {
  event: AgentStreamEvent
  inlineToolIds: Set<string>
}

export default function AgentMessageBlock({ event, inlineToolIds }: AgentMessageBlockProps) {
  switch (event.type) {
    case 'assistant':
      return <AssistantMessage event={event} />
    case 'user':
      return <UserMessage event={event} inlineToolIds={inlineToolIds} />
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

function UserMessage({ event, inlineToolIds }: { event: AgentStreamUser; inlineToolIds: Set<string> }) {
  const textBlocks = event.message.content.filter((b) => b.type === 'text')
  const nonTextBlocks = event.message.content.filter((b) => b.type !== 'text')

  return (
    <div className="mb-4">
      {textBlocks.map((block, i) =>
        block.type === 'text' && block.text ? <UserBubble key={i} text={block.text} /> : null
      )}
      {nonTextBlocks.map((block, i) => {
        if (block.type === 'tool_result' && inlineToolIds.has(block.tool_use_id)) {
          return null
        }
        return <ContentBlock key={i} block={block} />
      })}
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

function ContentBlock({ block }: { block: AgentContentBlock }) {
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
      if (block.name === 'Read' || block.name === 'Glob' || block.name === 'Grep') {
        return <InlineToolBlock name={block.name} input={block.input} />
      }
      return <ToolUseBlock name={block.name} input={block.input} />
    case 'tool_result':
      return <ToolResultBlock content={block.content} />
    default:
      return null
  }
}

function InlineToolBlock({ name, input }: { name: string; input: Record<string, unknown> }) {
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
