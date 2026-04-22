import { MultiFileDiff, type FileContents } from '@pierre/diffs/react'
import { useTheme } from '../../hooks/useTheme'
import { BASE_DIFF_OPTIONS, getLanguageFromPath } from '../../lib/diffs'

interface AgentEditDiffBlockProps {
  filePath: string
  oldString: string
  newString: string
  /** Label shown in the header. Defaults to "Edit". */
  toolLabel?: string
}

export default function AgentEditDiffBlock({
  filePath,
  oldString,
  newString,
  toolLabel = 'Edit'
}: AgentEditDiffBlockProps) {
  const { theme } = useTheme()
  const fileName = filePath.split('/').pop() ?? filePath
  const lang = getLanguageFromPath(filePath)

  const oldFile: FileContents = { name: filePath, contents: oldString, lang }
  const newFile: FileContents = { name: filePath, contents: newString, lang }

  const { addedCount, removedCount } = countLineChanges(oldString, newString)

  return (
    <div className="border-border bg-surface my-2 overflow-hidden rounded-md border">
      <div className="border-border flex items-center gap-2 border-b px-3 py-2">
        <span className="bg-success size-2 rounded-full" />
        <span className="text-foreground text-xs font-medium">
          {toolLabel}(<span className="text-foreground-muted">{fileName}</span>)
        </span>
      </div>

      <div className="border-border text-foreground-subtle border-b px-3 py-1.5 text-[11px]">
        {addedCount > 0 && (
          <span>
            Added <strong className="text-foreground-muted font-medium">{addedCount}</strong> line
            {addedCount !== 1 ? 's' : ''}
          </span>
        )}
        {addedCount > 0 && removedCount > 0 && <span>, </span>}
        {removedCount > 0 && (
          <span>
            removed <strong className="text-foreground-muted font-medium">{removedCount}</strong> line
            {removedCount !== 1 ? 's' : ''}
          </span>
        )}
      </div>

      <MultiFileDiff
        oldFile={oldFile}
        newFile={newFile}
        options={{ ...BASE_DIFF_OPTIONS, themeType: theme, diffStyle: 'unified', disableFileHeader: true }}
      />
    </div>
  )
}

function countLineChanges(oldStr: string, newStr: string): { addedCount: number; removedCount: number } {
  const oldLines = oldStr.split('\n')
  const newLines = newStr.split('\n')

  let prefixLen = 0
  while (prefixLen < oldLines.length && prefixLen < newLines.length && oldLines[prefixLen] === newLines[prefixLen]) {
    prefixLen++
  }

  let suffixLen = 0
  while (
    suffixLen < oldLines.length - prefixLen &&
    suffixLen < newLines.length - prefixLen &&
    oldLines[oldLines.length - 1 - suffixLen] === newLines[newLines.length - 1 - suffixLen]
  ) {
    suffixLen++
  }

  return {
    removedCount: oldLines.length - prefixLen - suffixLen,
    addedCount: newLines.length - prefixLen - suffixLen
  }
}
