import type { RefObject } from 'react'
import { Bold, Code, Heading, Italic, Link, List, ListOrdered, Quote } from 'lucide-react'
import Tooltip from './Tooltip'

const BTN_CLASS = 'rounded p-1.5 text-foreground-muted hover:bg-surface-hover hover:text-foreground transition-colors'

// Formatting button row shared by the PR description editor and comment box.
// Operates directly on the bound textarea's selection.
export default function MarkdownToolbar({
  textareaRef,
  value,
  onChange
}: {
  textareaRef: RefObject<HTMLTextAreaElement | null>
  value: string
  onChange: (next: string) => void
}) {
  const wrapSelection = (before: string, after: string, placeholder: string): void => {
    const textarea = textareaRef.current
    if (!textarea) return
    const start = textarea.selectionStart
    const end = textarea.selectionEnd
    const selected = value.substring(start, end)
    const content = selected || placeholder
    const newText = value.substring(0, start) + before + content + after + value.substring(end)
    onChange(newText)
    requestAnimationFrame(() => {
      textarea.focus()
      if (selected) {
        textarea.setSelectionRange(start + before.length, start + before.length + content.length)
      } else {
        textarea.setSelectionRange(start + before.length, start + before.length + placeholder.length)
      }
    })
  }

  const insertAtLineStart = (prefix: string): void => {
    const textarea = textareaRef.current
    if (!textarea) return
    const start = textarea.selectionStart
    const lineStart = value.lastIndexOf('\n', start - 1) + 1
    const newText = value.substring(0, lineStart) + prefix + value.substring(lineStart)
    onChange(newText)
    requestAnimationFrame(() => {
      textarea.focus()
      const pos = start + prefix.length
      textarea.setSelectionRange(pos, pos)
    })
  }

  return (
    <div className="flex items-center gap-0.5">
      <Tooltip label="Heading" side="top">
        <button type="button" className={BTN_CLASS} onClick={() => insertAtLineStart('### ')} aria-label="Heading">
          <Heading size={14} />
        </button>
      </Tooltip>
      <Tooltip label="Bold" side="top">
        <button
          type="button"
          className={BTN_CLASS}
          onClick={() => wrapSelection('**', '**', 'bold text')}
          aria-label="Bold"
        >
          <Bold size={14} />
        </button>
      </Tooltip>
      <Tooltip label="Italic" side="top">
        <button
          type="button"
          className={BTN_CLASS}
          onClick={() => wrapSelection('_', '_', 'italic text')}
          aria-label="Italic"
        >
          <Italic size={14} />
        </button>
      </Tooltip>
      <div className="bg-border mx-1 h-4 w-px" />
      <Tooltip label="Unordered list" side="top">
        <button type="button" className={BTN_CLASS} onClick={() => insertAtLineStart('- ')} aria-label="Unordered list">
          <List size={14} />
        </button>
      </Tooltip>
      <Tooltip label="Ordered list" side="top">
        <button type="button" className={BTN_CLASS} onClick={() => insertAtLineStart('1. ')} aria-label="Ordered list">
          <ListOrdered size={14} />
        </button>
      </Tooltip>
      <div className="bg-border mx-1 h-4 w-px" />
      <Tooltip label="Code" side="top">
        <button type="button" className={BTN_CLASS} onClick={() => wrapSelection('`', '`', 'code')} aria-label="Code">
          <Code size={14} />
        </button>
      </Tooltip>
      <Tooltip label="Link" side="top">
        <button
          type="button"
          className={BTN_CLASS}
          onClick={() => wrapSelection('[', '](url)', 'link text')}
          aria-label="Link"
        >
          <Link size={14} />
        </button>
      </Tooltip>
      <Tooltip label="Quote" side="top">
        <button type="button" className={BTN_CLASS} onClick={() => insertAtLineStart('> ')} aria-label="Quote">
          <Quote size={14} />
        </button>
      </Tooltip>
    </div>
  )
}
