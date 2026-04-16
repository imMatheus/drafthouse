import { fileExtensionMap, fileNameMap, folderNameMap } from './fileIconMap'

const iconModules = import.meta.glob('../assets/icons/*.svg', {
  eager: true,
  query: '?url',
  import: 'default'
}) as Record<string, string>

const iconUrlMap: Record<string, string> = {}
for (const [path, url] of Object.entries(iconModules)) {
  const name = path.split('/').pop()!.replace('.svg', '')
  iconUrlMap[name] = url
}

const DEFAULT_FILE_ICON = iconUrlMap['document'] ?? ''
const DEFAULT_FOLDER_ICON = iconUrlMap['folder-other'] ?? ''
const DEFAULT_FOLDER_OPEN_ICON = iconUrlMap['folder-other-open'] ?? ''

/** Get the icon URL for a given file name */
export function getFileIconUrl(fileName: string): string {
  const lowerName = fileName.toLowerCase()

  // Try exact filename match
  const byName = fileNameMap[lowerName]
  if (byName && iconUrlMap[byName]) return iconUrlMap[byName]

  // Try extensions (compound first, e.g. 'config.js' before 'js')
  const dotIndex = lowerName.indexOf('.')
  if (dotIndex !== -1) {
    let extCandidate = lowerName.slice(dotIndex + 1)
    while (extCandidate.includes('.')) {
      const iconName = fileExtensionMap[extCandidate]
      if (iconName && iconUrlMap[iconName]) return iconUrlMap[iconName]
      extCandidate = extCandidate.slice(extCandidate.indexOf('.') + 1)
    }
    const iconName = fileExtensionMap[extCandidate]
    if (iconName && iconUrlMap[iconName]) return iconUrlMap[iconName]
  }

  return DEFAULT_FILE_ICON
}

/** Get the icon URL for a given folder name */
export function getFolderIconUrl(folderName: string, isOpen: boolean): string {
  const lowerName = folderName.toLowerCase()
  const iconName = folderNameMap[lowerName]

  if (iconName) {
    const key = isOpen ? `${iconName}-open` : iconName
    if (iconUrlMap[key]) return iconUrlMap[key]
    if (isOpen && iconUrlMap[iconName]) return iconUrlMap[iconName]
  }

  return isOpen ? DEFAULT_FOLDER_OPEN_ICON : DEFAULT_FOLDER_ICON
}
