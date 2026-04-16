import { useQuery } from '@tanstack/react-query'
import { ExternalLink } from 'lucide-react'
import { DiffEditor } from '@monaco-editor/react'
import { useTheme } from '../../hooks/useTheme'
import { useSettings } from '../../hooks/useSettings'
import { getMonacoTheme, getMonacoLanguage, BASE_DIFF_OPTIONS } from '../../lib/monaco'

interface DiffViewProps {
  filePath: string
  folderPath: string
  staged: boolean
  onOpenFile?: (path: string) => void
}

export default function DiffView({ filePath, folderPath, staged, onOpenFile }: DiffViewProps) {
  const { theme } = useTheme()
  const { settings } = useSettings()

  const absolutePath = `${folderPath}/${filePath}`

  // Original content: HEAD version
  const { data: originalContent, isLoading: isOriginalLoading } = useQuery<string, Error>({
    queryKey: ['git-show-file', folderPath, filePath],
    queryFn: () => window.api.git.showFile(folderPath, filePath),
    retry: false
  })

  // Modified content: working tree or staged version
  const { data: modifiedContent, isLoading: isModifiedLoading } = useQuery<string, Error>({
    queryKey: staged ? ['git-show-staged-file', folderPath, filePath] : ['read-file', absolutePath],
    queryFn: () =>
      staged ? window.api.git.showStagedFile(folderPath, filePath) : window.api.fs.readFile(absolutePath),
    retry: false
  })

  const isLoading = isOriginalLoading || isModifiedLoading

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <p className="text-sm text-foreground-muted">Loading diff...</p>
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-2 border-b border-border bg-surface px-4 py-2">
        <span className="text-xs font-medium text-foreground">{filePath}</span>
        <span className="rounded bg-interactive px-1.5 py-0.5 text-[10px] text-foreground-muted">
          {staged ? 'Staged' : 'Working Tree'}
        </span>
        {onOpenFile ? (
          <button
            onClick={() => onOpenFile(`${folderPath}/${filePath}`)}
            className="ml-auto flex items-center gap-1 text-xs text-foreground-muted hover:text-foreground"
          >
            <ExternalLink size={12} />
            Open File
          </button>
        ) : null}
      </div>

      <div className="min-h-0 flex-1 overflow-hidden">
        <DiffEditor
          key={settings.diffViewMode}
          original={originalContent ?? ''}
          modified={modifiedContent ?? ''}
          language={getMonacoLanguage(filePath)}
          theme={getMonacoTheme(theme)}
          options={{
            ...BASE_DIFF_OPTIONS,
            renderSideBySide: settings.diffViewMode === 'split',
            minimap: { enabled: true, side: 'right' }
          }}
        />
      </div>
    </div>
  )
}
