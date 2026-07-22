/**
 * Model ids arrive in several dressings — "claude-opus-4-8",
 * "claude-haiku-4-5-20251001", "claude-opus-4-8[1m]" — while the UI should
 * always talk about models the way the product does: "Opus 4.8".
 */

/** Strip context-size and date suffixes so variants of one model compare equal. */
export function normalizeModelId(id: string): string {
  return id.replace(/\[1m\]$/, '').replace(/-\d{8}$/, '')
}

/** "claude-opus-4-8[1m]" → "Opus 4.8"; "claude-fable-5" → "Fable 5". */
export function friendlyModelLabel(id: string): string {
  const parts = normalizeModelId(id)
    .replace(/^claude-/, '')
    .split('-')
  const words: string[] = []
  const version: string[] = []
  for (const part of parts) {
    if (/^\d+$/.test(part)) version.push(part)
    else if (part.length > 0) words.push(part.charAt(0).toUpperCase() + part.slice(1))
  }
  const name = words.join(' ')
  if (name.length === 0) return id
  return version.length > 0 ? `${name} ${version.join('.')}` : name
}
