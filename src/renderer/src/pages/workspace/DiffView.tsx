import { useQuery } from '@tanstack/react-query'
import { ExternalLink } from 'lucide-react'
import { useSettings } from '../../hooks/useSettings'
import { useTheme } from '../../hooks/useTheme'
import { BASE_DIFF_OPTIONS, getLanguageFromPath } from '../../lib/diffs'
import { DiffContentsBlock } from '../../components/CodeViewBlock'
import { LoadingView } from '../../components/Loading'

interface DiffViewProps {
  filePath: string
  folderPath: string
  staged: boolean
  onOpenFile?: (path: string) => void
}

/**
 * Local source-control diff. Rendered from the two full file versions rather
 * than a `git diff` patch: full contents give the highlighter whole-file
 * context (patch hunks tokenize from a blank state and mis-highlight anything
 * that starts mid-construct), make unchanged regions expandable, and let the
 * working-tree view diff against the index rather than HEAD so partially
 * staged files show the right base.
 */
export default function DiffView({ filePath, folderPath, staged, onOpenFile }: DiffViewProps) {
  const { settings } = useSettings()
  const { theme } = useTheme()

  const absolutePath = `${folderPath}/${filePath}`

  // Working-tree view diffs INDEX → WORKTREE; staged view diffs HEAD → INDEX.
  // The git handlers return '' for missing sides (untracked, newly added), and
  // a deleted worktree file reads as '' — both degrade into add/delete diffs.
  const {
    data: originalContent,
    isLoading: isOriginalLoading,
    error: originalError
  } = useQuery<string, Error>({
    queryKey: staged ? ['git-show-file', folderPath, filePath] : ['git-show-staged-file', folderPath, filePath],
    queryFn: () =>
      staged ? window.api.git.showFile(folderPath, filePath) : window.api.git.showStagedFile(folderPath, filePath),
    retry: false
  })

  const {
    data: modifiedContent,
    isLoading: isModifiedLoading,
    error: modifiedError
  } = useQuery<string, Error>({
    queryKey: staged ? ['git-show-staged-file', folderPath, filePath] : ['read-file-diff', absolutePath],
    queryFn: () =>
      staged
        ? window.api.git.showStagedFile(folderPath, filePath)
        : window.api.fs.readFile(absolutePath).catch(() => ''),
    retry: false
  })

  const isLoading = isOriginalLoading || isModifiedLoading
  const error = originalError ?? modifiedError
  const original = originalContent ?? ''
  const modified = modifiedContent ?? ''
  const isBinary = looksBinary(original) || looksBinary(modified)
  const isUnchanged = !isLoading && !error && original === modified

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="border-border bg-surface flex items-center gap-2 border-b px-4 py-2">
        <span className="text-foreground text-xs font-medium">{filePath}</span>
        <span className="bg-interactive text-foreground-muted rounded px-1.5 py-0.5 text-[10px]">
          {staged ? 'Staged' : 'Working Tree'}
        </span>
        {isUnchanged && <span className="text-foreground-subtle text-[10px]">No changes</span>}
        {onOpenFile ? (
          <button
            onClick={() => onOpenFile(absolutePath)}
            className="text-foreground-muted hover:text-foreground ml-auto flex items-center gap-1 text-xs"
          >
            <ExternalLink size={12} />
            Open File
          </button>
        ) : null}
      </div>

      <div className="min-h-0 flex-1">
        {isLoading ? (
          <LoadingView label="Loading diff..." />
        ) : error ? (
          <div className="px-4 py-6">
            <p className="text-foreground text-sm font-medium">Diff unavailable</p>
            <p className="text-foreground-muted mt-1 text-sm">{error.message}</p>
          </div>
        ) : isBinary ? (
          <div className="px-4 py-6">
            <p className="text-foreground text-sm font-medium">Binary file</p>
            <p className="text-foreground-muted mt-1 text-sm">This file can't be shown as a text diff.</p>
          </div>
        ) : (
          <DiffContentsBlock
            filePath={filePath}
            oldContents={original}
            newContents={modified}
            lang={getLanguageFromPath(filePath)}
            options={{
              ...BASE_DIFF_OPTIONS,
              themeType: theme,
              diffStyle: settings.diffViewMode === 'split' ? 'split' : 'unified',
              disableFileHeader: true
            }}
            className="h-full min-h-0 w-full overflow-x-clip overflow-y-auto [overflow-anchor:none]"
          />
        )}
      </div>
    </div>
  )
}

function looksBinary(contents: string): boolean {
  return contents.includes('\0')
}
