import { Fragment, useRef } from 'react'
import { useQuery } from '@tanstack/react-query'
import { ChevronRight } from 'lucide-react'
import Editor, { type OnMount } from '@monaco-editor/react'
import { cn } from '../../lib/cn'
import { useTheme } from '../../hooks/useTheme'
import { getMonacoTheme, getMonacoLanguage, BASE_EDITOR_OPTIONS } from '../../lib/monaco'

interface FilesViewProps {
  filePath: string
  folderPath: string
}

export default function FilesView({ filePath, folderPath }: FilesViewProps) {
  const { theme } = useTheme()
  const editorRef = useRef<Parameters<OnMount>[0] | null>(null)

  const {
    data: fileContents,
    isLoading,
    error
  } = useQuery<string, Error>({
    queryKey: ['read-file', filePath],
    queryFn: () => window.api.fs.readFile(filePath),
    retry: false
  })

  const relativePath = getRelativePath(filePath, folderPath)
  const segments = relativePath.split('/')

  const handleEditorMount: OnMount = (editor, monacoInstance) => {
    editorRef.current = editor
    editor.addCommand(monacoInstance.KeyMod.CtrlCmd | monacoInstance.KeyCode.KeyS, () => {
      window.api.fs.writeFile(filePath, editor.getValue())
    })
  }

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="flex items-center gap-1.5 border-b border-border bg-surface px-4 py-2">
        {segments.map((segment, i) => (
          <Fragment key={i}>
            {i > 0 && <ChevronRight size={12} className="shrink-0 text-foreground-subtle" />}
            <span className={cn('text-sm', i === segments.length - 1 ? 'text-foreground' : 'text-foreground-muted')}>
              {segment}
            </span>
          </Fragment>
        ))}
      </div>

      <div className="min-h-0 flex-1 overflow-hidden bg-background">
        {isLoading ? (
          <div className="px-4 py-6">
            <p className="text-sm text-foreground-muted">Loading file...</p>
          </div>
        ) : error ? (
          <div className="px-4 py-6">
            <p className="text-sm font-medium text-foreground">File unavailable</p>
            <p className="mt-1 text-sm text-foreground-muted">{error.message}</p>
          </div>
        ) : (
          <Editor
            value={fileContents ?? ''}
            language={getMonacoLanguage(filePath)}
            theme={getMonacoTheme(theme)}
            path={filePath}
            options={{
              ...BASE_EDITOR_OPTIONS,
              readOnly: false
            }}
            onMount={handleEditorMount}
            loading={
              <div className="px-4 py-6">
                <p className="text-sm text-foreground-muted">Loading editor...</p>
              </div>
            }
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
