import { useRef, useState, type DragEvent, type KeyboardEvent } from 'react'
import { ArrowUp, Square, X } from 'lucide-react'
import { cn } from '../../lib/cn'

interface AgentPromptBarProps {
  onSubmit: (prompt: string, files?: string[]) => Promise<void>
  onStop: () => void
  isRunning: boolean
}

export default function AgentPromptBar({ onSubmit, onStop, isRunning }: AgentPromptBarProps) {
  const [text, setText] = useState('')
  const [files, setFiles] = useState<string[]>([])
  const [isDragOver, setIsDragOver] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const canSubmit = text.trim().length > 0 && !isRunning && !isSubmitting

  const handleSubmit = async (): Promise<void> => {
    if (!canSubmit) return

    setIsSubmitting(true)
    try {
      await onSubmit(text.trim(), files.length > 0 ? files : undefined)
      setText('')
      setFiles([])
      // Reset textarea height
      if (textareaRef.current) {
        textareaRef.current.style.height = 'auto'
      }
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>): void => {
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

  return (
    <div className="px-6 pb-4 pt-2">
      <div
        className={cn(
          'mx-auto max-w-3xl rounded-xl border border-border bg-surface transition-colors',
          isDragOver && 'border-accent bg-surface-hover'
        )}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        {files.length > 0 && (
          <div className="flex flex-wrap gap-1.5 px-3 pt-3">
            {files.map((filePath) => {
              const fileName = filePath.split('/').pop() ?? filePath
              return (
                <span
                  key={filePath}
                  className="flex items-center gap-1 rounded bg-interactive px-2 py-0.5 text-xs text-foreground-muted"
                  title={filePath}
                >
                  {fileName}
                  <button
                    onClick={() => handleRemoveFile(filePath)}
                    className="text-foreground-subtle hover:text-foreground"
                  >
                    <X size={12} />
                  </button>
                </span>
              )
            })}
          </div>
        )}

        <div className="flex items-end gap-2 p-3">
          <textarea
            ref={textareaRef}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={handleKeyDown}
            onInput={handleInput}
            placeholder={isDragOver ? 'Drop files here...' : 'Reply...'}
            rows={1}
            disabled={isRunning}
            className="min-h-[24px] flex-1 resize-none bg-transparent text-sm text-foreground placeholder:text-foreground-subtle focus:outline-none disabled:opacity-50"
          />

          {isRunning ? (
            <button
              onClick={onStop}
              className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-danger text-white transition-colors hover:opacity-90"
              title="Stop agent"
            >
              <Square size={14} />
            </button>
          ) : (
            <button
              onClick={() => void handleSubmit()}
              disabled={!canSubmit}
              className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-foreground text-background transition-colors hover:opacity-80 disabled:opacity-30"
              title="Send"
            >
              <ArrowUp size={14} strokeWidth={2.5} />
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
