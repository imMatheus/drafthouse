export function getPathBasename(path: string): string {
  const normalizedPath = path.replace(/[\\/]+$/, '')
  return normalizedPath.split(/[/\\]/).pop() ?? path
}
