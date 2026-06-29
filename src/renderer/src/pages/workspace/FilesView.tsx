import { Fragment, useEffect, useRef } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { ChevronRight } from 'lucide-react'
import { CodeView, type CodeViewFileItem, type CodeViewHandle } from '@pierre/diffs/react'
import { cn } from '../../lib/cn'
import { useTheme } from '../../hooks/useTheme'
import { BASE_CODE_OPTIONS, getLanguageFromPath } from '../../lib/diffs'
import { LoadingView } from '../../components/Loading'

/** A request to scroll to (and highlight) a 1-based line, e.g. from a search hit. */
export interface FileReveal {
  line: number
  /** Bumped per request so re-clicking the same line re-triggers the scroll. */
  nonce: number
}

interface FilesViewProps {
  filePath: string
  folderPath: string
  reveal?: FileReveal
}

// The CodeView holds exactly one item; its id is local to this viewer instance.
const FILE_ITEM_ID = 'file'

export default function FilesView({ filePath, folderPath, reveal }: FilesViewProps) {
  const { theme } = useTheme()
  const queryClient = useQueryClient()
  const viewerRef = useRef<CodeViewHandle<undefined> | null>(null)
  // Track the last reveal we acted on so disk-edit re-renders (which change the
  // content but not the nonce) don't re-scroll the user away from where they are.
  const handledRevealNonce = useRef<number | null>(null)
  const {
    data: fileContents,
    isLoading,
    error,
    dataUpdatedAt
  } = useQuery<string, Error>({
    queryKey: ['read-file', filePath],
    queryFn: () => window.api.fs.readFile(filePath),
    retry: false
  })

  // Watch the open file on disk and invalidate the query when it changes,
  // so any external edit (Claude, the user's terminal editor, git checkout)
  // is reflected immediately. The watcher is the source of truth: we don't
  // have to enumerate change sources or pile on speculative invalidations.
  useEffect(() => {
    void window.api.fs.watchFile(filePath)
    const unsubscribe = window.api.fs.onFileChanged((changedPath) => {
      if (changedPath === filePath) {
        void queryClient.invalidateQueries({ queryKey: ['read-file', filePath] })
      }
    })
    return () => {
      unsubscribe()
      void window.api.fs.unwatchFile(filePath)
    }
  }, [filePath, queryClient])

  // CodeView reconciles controlled `items` by reference, so rebuild the array
  // only when the file or its contents actually change — otherwise every
  // unrelated re-render (theme, reveal, hover) would force a re-tokenize.
  const itemsKey = `${filePath}|${dataUpdatedAt}`
  const itemsRef = useRef<{ key: string; items: CodeViewFileItem[] } | null>(null)
  if (!itemsRef.current || itemsRef.current.key !== itemsKey) {
    itemsRef.current = {
      key: itemsKey,
      items: [
        {
          id: FILE_ITEM_ID,
          type: 'file',
          file: { name: filePath, contents: fileContents ?? '', lang: getLanguageFromPath(filePath) }
        }
      ]
    }
  }

  // Highlight the revealed line (and clear it when navigating to a file with no
  // pending reveal, since the CodeView instance is reused across cached files).
  const selectedLines = reveal ? { id: FILE_ITEM_ID, range: { start: reveal.line, end: reveal.line } } : null

  // Scroll the revealed line into view once the content is loaded and rendered.
  useEffect(() => {
    if (!reveal || fileContents == null) return
    if (handledRevealNonce.current === reveal.nonce) return
    handledRevealNonce.current = reveal.nonce
    // Double rAF so the virtualizer has mounted and measured the item before we
    // ask it to scroll — mirrors the PR diff viewer's jump-to-line handling.
    let inner = 0
    const outer = requestAnimationFrame(() => {
      inner = requestAnimationFrame(() => {
        viewerRef.current?.scrollTo({ type: 'line', id: FILE_ITEM_ID, lineNumber: reveal.line, align: 'center' })
      })
    })
    return () => {
      cancelAnimationFrame(outer)
      cancelAnimationFrame(inner)
    }
  }, [reveal, fileContents])

  const relativePath = getRelativePath(filePath, folderPath)
  const segments = relativePath.split('/')

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="border-border bg-surface flex items-center gap-1.5 border-b px-4 py-2">
        {segments.map((segment, i) => (
          <Fragment key={i}>
            {i > 0 && <ChevronRight size={12} className="text-foreground-subtle shrink-0" />}
            <span className={cn('text-sm', i === segments.length - 1 ? 'text-foreground' : 'text-foreground-muted')}>
              {segment}
            </span>
          </Fragment>
        ))}
      </div>

      <div className="bg-background relative min-h-0 flex-1">
        {isLoading ? (
          <LoadingView label="Loading file..." />
        ) : error ? (
          <div className="px-4 py-6">
            <p className="text-foreground text-sm font-medium">File unavailable</p>
            <p className="text-foreground-muted mt-1 text-sm">{error.message}</p>
          </div>
        ) : (
          // Highlight on the main thread: the shared worker pool (added for the
          // PR diff viewer) only applies highlights on its diff path, so routing
          // single-file views through it leaves them as plain text. One file at a
          // time is cheap to tokenize on the main thread.
          <CodeView
            ref={viewerRef}
            items={itemsRef.current.items}
            selectedLines={selectedLines}
            options={{ ...BASE_CODE_OPTIONS, themeType: theme, disableFileHeader: true }}
            disableWorkerPool
            className="h-full min-h-0 w-full overflow-x-clip overflow-y-auto [overflow-anchor:none]"
          />
        )}
      </div>
    </div>
  )
}

function getRelativePath(filePath: string, folderPath: string): string {
  if (filePath.startsWith(folderPath)) {
    const relative = filePath.slice(folderPath.length)
    return relative.startsWith('/') ? relative.slice(1) : relative
  }
  return filePath
}
