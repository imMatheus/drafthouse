import { useEffect, useRef, useState } from 'react'
import { FileText } from 'lucide-react'
import AgentSpinner from './AgentSpinner'
import type { AgentSession, AgentStreamResult } from '../../../../shared/types'
import AgentMessageBlock from './AgentMessageBlock'

const IMAGE_EXTENSIONS = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp', 'ico'])

interface AgentConversationProps {
  session: AgentSession
}

export default function AgentConversation({ session }: AgentConversationProps) {
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [session.events.length])

  // Collect inline tool IDs (Read, Glob, Grep) to hide their results
  const inlineToolIds = new Set<string>()
  for (const event of session.events) {
    if (event.type === 'assistant') {
      for (const b of event.message.content) {
        if (b.type === 'tool_use' && (b.name === 'Read' || b.name === 'Glob' || b.name === 'Grep')) {
          inlineToolIds.add(b.id)
        }
      }
    }
  }

  let lastResultEvent: AgentStreamResult | null = null
  for (let i = session.events.length - 1; i >= 0; i--) {
    const e = session.events[i]
    if (e.type === 'result') {
      lastResultEvent = e
      break
    }
  }

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="mx-auto max-w-3xl px-6 py-6">
        {/* Initial user prompt */}
        <div className="mb-6 flex justify-end">
          <div className="max-w-[80%] rounded-2xl bg-surface px-4 py-2.5">
            {session.files.length > 0 && (
              <div className="mb-2 flex flex-wrap gap-1.5">
                {session.files.map((filePath) => (
                  <FileAttachment key={filePath} filePath={filePath} />
                ))}
              </div>
            )}
            {session.prompt && (
              <p className="text-sm text-foreground whitespace-pre-wrap">{session.prompt}</p>
            )}
          </div>
        </div>

        {/* Events */}
        {session.events.map((event, i) => (
          <AgentMessageBlock key={i} event={event} inlineToolIds={inlineToolIds} />
        ))}

        {/* Running indicator */}
        {session.status === 'running' && (
          <div className="flex items-center gap-2 py-2 text-accent">
            <AgentSpinner />
            <span className="text-xs">Drafting...</span>
          </div>
        )}

        {/* Result summary */}
        {lastResultEvent && session.status !== 'running' && (
          <div className="mt-4 rounded-md border border-border bg-surface px-3 py-2">
            <div className="flex items-center gap-3 text-xs text-foreground-subtle">
              <span>
                {lastResultEvent.num_turns} turn{lastResultEvent.num_turns !== 1 ? 's' : ''}
              </span>
              <span>{(lastResultEvent.duration_ms / 1000).toFixed(1)}s</span>
              <span>${lastResultEvent.total_cost_usd.toFixed(4)}</span>
            </div>
          </div>
        )}

        {/* Error state */}
        {session.status === 'error' && !lastResultEvent && (
          <div className="mt-4 rounded-md border border-danger/30 bg-danger/5 px-3 py-2">
            <p className="text-xs text-danger">Agent encountered an error</p>
          </div>
        )}

        <div ref={bottomRef} />
      </div>
    </div>
  )
}

function FileAttachment({ filePath }: { filePath: string }) {
  const fileName = filePath.split('/').pop() ?? filePath
  const ext = filePath.split('.').pop()?.toLowerCase() ?? ''
  const isImage = IMAGE_EXTENSIONS.has(ext)
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
      <div className="size-16 overflow-hidden rounded-md border border-border">
        {dataUrl && <img src={dataUrl} alt={fileName} className="size-full object-cover" />}
      </div>
    )
  }

  return (
    <div className="flex items-center gap-1.5 rounded-md border border-border bg-interactive px-2 py-1">
      <FileText size={12} className="shrink-0 text-foreground-subtle" />
      <span className="max-w-[100px] truncate text-xs text-foreground-muted">{fileName}</span>
    </div>
  )
}
