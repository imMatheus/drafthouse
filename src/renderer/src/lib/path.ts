export function getPathBasename(path: string): string {
  const normalizedPath = path.replace(/[\\/]+$/, '')
  return normalizedPath.split(/[/\\]/).pop() ?? path
}

export function getPathDirname(path: string): string {
  const lastSep = path.lastIndexOf('/')
  return lastSep === -1 ? '' : path.substring(0, lastSep)
}
