import { useQuery } from '@tanstack/react-query'
import { ExternalLink } from 'lucide-react'
import { MultiFileDiff, PatchDiff, type FileContents } from '@pierre/diffs/react'
import { useSettings } from '../../hooks/useSettings'
import { useTheme } from '../../hooks/useTheme'
import { BASE_DIFF_OPTIONS, getLanguageFromPath } from '../../lib/diffs'
import { LoadingView } from '../../components/Loading'

interface DiffViewProps {
  filePath: string
  folderPath: string
  staged: boolean
  onOpenFile?: (path: string) => void
}

export default function DiffView({ filePath, folderPath, staged, onOpenFile }: DiffViewProps) {
  const { settings } = useSettings()
  const { theme } = useTheme()

  const absolutePath = `${folderPath}/${filePath}`

  const {
    data: patch,
    isLoading: isPatchLoading,
    error: patchError
  } = useQuery<string, Error>({
    queryKey: ['git-diff', folderPath, filePath, staged],
    queryFn: () => window.api.git.diff(folderPath, filePath, staged),
    retry: false
  })

  const hasPatch = typeof patch === 'string' && patch.trim().length > 0
  const shouldLoadContentFallback = patch != null && !hasPatch && !patchError

  const { data: originalContent, isLoading: isOriginalLoading } = useQuery<string, Error>({
    queryKey: ['git-show-file', folderPath, filePath],
    queryFn: () => window.api.git.showFile(folderPath, filePath),
    enabled: shouldLoadContentFallback,
    retry: false
  })

  const {
    data: modifiedContent,
    isLoading: isModifiedLoading,
    error: modifiedError
  } = useQuery<string, Error>({
    queryKey: staged ? ['git-show-staged-file', folderPath, filePath] : ['read-file', absolutePath],
    queryFn: () =>
      staged ? window.api.git.showStagedFile(folderPath, filePath) : window.api.fs.readFile(absolutePath),
    enabled: shouldLoadContentFallback,
    retry: false
  })

  const lang = getLanguageFromPath(filePath)
  const oldFile: FileContents = { name: filePath, contents: originalContent ?? '', lang }
  const newFile: FileContents = { name: filePath, contents: modifiedContent ?? '', lang }
  const diffOptions = {
    ...BASE_DIFF_OPTIONS,
    themeType: theme,
    diffStyle: settings.diffViewMode === 'split' ? 'split' : 'unified',
    disableFileHeader: true
  } as const

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="border-border bg-surface flex items-center gap-2 border-b px-4 py-2">
        <span className="text-foreground text-xs font-medium">{filePath}</span>
        <span className="bg-interactive text-foreground-muted rounded px-1.5 py-0.5 text-[10px]">
          {staged ? 'Staged' : 'Working Tree'}
        </span>
        {onOpenFile ? (
          <button
            onClick={() => onOpenFile(`${folderPath}/${filePath}`)}
            className="text-foreground-muted hover:text-foreground ml-auto flex items-center gap-1 text-xs"
          >
            <ExternalLink size={12} />
            Open File
          </button>
        ) : null}
      </div>

      <div className="min-h-0 flex-1 overflow-auto">
        {isPatchLoading || (shouldLoadContentFallback && (isOriginalLoading || isModifiedLoading)) ? (
          <LoadingView label="Loading diff..." />
        ) : patchError ? (
          <div className="px-4 py-6">
            <p className="text-foreground text-sm font-medium">Diff unavailable</p>
            <p className="text-foreground-muted mt-1 text-sm">{patchError.message}</p>
          </div>
        ) : modifiedError ? (
          <div className="px-4 py-6">
            <p className="text-foreground text-sm font-medium">Diff unavailable</p>
            <p className="text-foreground-muted mt-1 text-sm">{modifiedError.message}</p>
          </div>
        ) : hasPatch ? (
          <PatchDiff patch={patch} options={diffOptions} />
        ) : shouldLoadContentFallback ? (
          <MultiFileDiff oldFile={oldFile} newFile={newFile} options={diffOptions} />
        ) : null}
      </div>
    </div>
  )
}
