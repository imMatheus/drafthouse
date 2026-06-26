export function getPathBasename(path: string): string {
  const normalizedPath = path.replace(/[\\/]+$/, '')
  return normalizedPath.split(/[/\\]/).pop() ?? path
}

export function getPathDirname(path: string): string {
  const lastSep = path.lastIndexOf('/')
  return lastSep === -1 ? '' : path.substring(0, lastSep)
}

const IMAGE_EXTENSIONS = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp', 'ico'])

export function isImageFile(filePath: string): boolean {
  const ext = filePath.split('.').pop()?.toLowerCase() ?? ''
  return IMAGE_EXTENSIONS.has(ext)
}
