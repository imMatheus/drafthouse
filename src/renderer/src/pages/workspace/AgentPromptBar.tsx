import { useEffect, useRef, useState, type DragEvent, type KeyboardEvent } from 'react'
import { ArrowUp, FileText, Plus, Square, X } from 'lucide-react'
import { cn } from '../../lib/cn'

const IMAGE_EXTENSIONS = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp', 'ico'])

function isImageFile(filePath: string): boolean {
  const ext = filePath.split('.').pop()?.toLowerCase() ?? ''
  return IMAGE_EXTENSIONS.has(ext)
}

function getFileName(filePath: string): string {
  return filePath.split('/').pop() ?? filePath
}

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

  const canSubmit = (text.trim().length > 0 || files.length > 0) && !isRunning && !isSubmitting

  const handleSubmit = async (): Promise<void> => {
    if (!canSubmit) return

    setIsSubmitting(true)
    try {
      await onSubmit(text.trim(), files.length > 0 ? files : undefined)
      setText('')
      setFiles([])
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
        {/* File previews */}
        {files.length > 0 && (
          <div className="flex flex-wrap gap-2 px-3 pt-3">
            {files.map((filePath) => (
              <FilePreview
                key={filePath}
                filePath={filePath}
                onRemove={() => handleRemoveFile(filePath)}
              />
            ))}
          </div>
        )}

        <div className="flex items-end gap-2 p-3">
          <button
            onClick={() => {
              void window.api.fs.pickFiles().then((paths) => {
                if (paths.length > 0) {
                  setFiles((prev) => [...prev, ...paths.filter((f) => !prev.includes(f))])
                }
              })
            }}
            disabled={isRunning}
            className="flex size-7 shrink-0 items-center justify-center rounded-lg text-foreground-subtle transition-colors hover:bg-surface-hover hover:text-foreground disabled:opacity-50"
            title="Attach files"
          >
            <Plus size={16} />
          </button>
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

function FilePreview({ filePath, onRemove }: { filePath: string; onRemove: () => void }) {
  const fileName = getFileName(filePath)
  const isImage = isImageFile(filePath)
  const [dataUrl, setDataUrl] = useState<string | null>(null)

  useEffect(() => {
    if (!isImage) return
    let cancelled = false
    window.api.fs.readFileDataUrl(filePath).then((url) => {
      if (!cancelled) setDataUrl(url)
    }).catch(() => {})
    return () => { cancelled = true }
  }, [filePath, isImage])

  if (isImage) {
    return (
      <div className="group relative size-20 overflow-hidden rounded-lg border border-border bg-interactive">
        {dataUrl && (
          <img src={dataUrl} alt={fileName} className="size-full object-cover" />
        )}
        <button
          onClick={onRemove}
          className="absolute right-1 top-1 flex size-5 items-center justify-center rounded-full bg-background/80 text-foreground-subtle opacity-0 transition-opacity hover:text-foreground group-hover:opacity-100"
        >
          <X size={12} />
        </button>
      </div>
    )
  }

  return (
    <div className="group relative flex items-center gap-2 rounded-lg border border-border bg-interactive px-3 py-2">
      <FileText size={14} className="shrink-0 text-foreground-subtle" />
      <span className="max-w-[120px] truncate text-xs text-foreground-muted" title={filePath}>
        {fileName}
      </span>
      <button
        onClick={onRemove}
        className="flex size-4 shrink-0 items-center justify-center rounded-full text-foreground-subtle opacity-0 transition-opacity hover:text-foreground group-hover:opacity-100"
      >
        <X size={12} />
      </button>
    </div>
  )
}
