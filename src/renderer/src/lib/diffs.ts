import type { BaseCodeOptions, BaseDiffOptions, SupportedLanguages, ThemesType } from '@pierre/diffs'
import type { PullRequestFile } from '../../../shared/types'
import { codeLineHeight } from '../hooks/useSettings'

export const DIFFS_THEMES: ThemesType = {
  dark: 'pierre-dark',
  light: 'pierre-light'
}

const EXTENSION_TO_LANG: Record<string, SupportedLanguages> = {
  ts: 'typescript',
  tsx: 'tsx',
  js: 'javascript',
  jsx: 'jsx',
  mjs: 'javascript',
  mts: 'typescript',
  cjs: 'javascript',
  cts: 'typescript',
  json: 'json',
  jsonc: 'jsonc',
  css: 'css',
  html: 'html',
  htm: 'html',
  md: 'markdown',
  mdx: 'mdx',
  py: 'python',
  rb: 'ruby',
  rs: 'rust',
  go: 'go',
  java: 'java',
  c: 'c',
  cpp: 'cpp',
  cc: 'cpp',
  h: 'c',
  hpp: 'cpp',
  cs: 'csharp',
  swift: 'swift',
  kt: 'kotlin',
  kts: 'kotlin',
  yaml: 'yaml',
  yml: 'yaml',
  toml: 'toml',
  sh: 'bash',
  bash: 'bash',
  zsh: 'bash',
  fish: 'fish',
  sql: 'sql',
  graphql: 'graphql',
  gql: 'graphql',
  vue: 'vue',
  svelte: 'svelte',
  xml: 'xml',
  svg: 'xml',
  scss: 'scss',
  sass: 'sass',
  less: 'less',
  php: 'php',
  lua: 'lua',
  r: 'r',
  ex: 'elixir',
  exs: 'elixir',
  erl: 'erlang',
  hs: 'haskell',
  ml: 'ocaml',
  scala: 'scala',
  clj: 'clojure',
  dart: 'dart',
  zig: 'zig',
  nim: 'nim',
  tf: 'terraform',
  hcl: 'hcl',
  prisma: 'prisma',
  proto: 'proto',
  ini: 'ini',
  env: 'dotenv',
  diff: 'diff',
  log: 'text'
}

const LANG_EXTENSION: Record<string, string> = {
  typescript: 'ts',
  tsx: 'tsx',
  javascript: 'js',
  jsx: 'jsx',
  python: 'py',
  ruby: 'rb',
  rust: 'rs',
  go: 'go',
  java: 'java',
  csharp: 'cs',
  kotlin: 'kt',
  swift: 'swift',
  bash: 'sh',
  shell: 'sh',
  sh: 'sh',
  json: 'json',
  jsonc: 'jsonc',
  yaml: 'yml',
  toml: 'toml',
  css: 'css',
  scss: 'scss',
  html: 'html',
  markdown: 'md',
  sql: 'sql',
  graphql: 'graphql',
  php: 'php',
  lua: 'lua',
  scala: 'scala',
  dart: 'dart'
}

export function getLanguageFromPath(path: string): SupportedLanguages {
  const filename = path.split('/').pop() ?? ''
  const lower = filename.toLowerCase()

  if (lower === 'dockerfile' || lower.startsWith('dockerfile.')) return 'dockerfile'
  if (lower === 'makefile' || lower === 'gnumakefile') return 'makefile'
  if (lower === 'cmakelists.txt' || lower.endsWith('.cmake')) return 'cmake'

  const ext = filename.includes('.') ? (filename.split('.').pop()?.toLowerCase() ?? '') : ''
  return EXTENSION_TO_LANG[ext] ?? 'text'
}

export function syntheticFilenameForLang(lang: string): string {
  const ext = LANG_EXTENSION[lang.toLowerCase()] ?? 'txt'
  return `snippet.${ext}`
}

const DIFFS_UNSAFE_CSS = `
[data-utility-button] {
  background-color: var(--color-accent);
  color: var(--color-accent-foreground);
}
[data-utility-button]:hover {
  background-color: var(--color-accent-hover);
}
`

export const BASE_DIFF_OPTIONS: Omit<BaseDiffOptions, 'hunkSeparators'> = {
  theme: DIFFS_THEMES,
  diffIndicators: 'classic',
  overflow: 'wrap',
  expandUnchanged: true,
  lineDiffType: 'word',
  unsafeCSS: DIFFS_UNSAFE_CSS
}

export const BASE_CODE_OPTIONS: BaseCodeOptions = {
  theme: DIFFS_THEMES,
  overflow: 'wrap'
}

/**
 * Virtualizer metrics matching the rendered line height for a given code font
 * size. Every CodeView must pass this as `itemMetrics`: the font size arrives
 * via the `--diffs-line-height` CSS variable, but the virtualizer sizes and
 * places its render window from `itemMetrics.lineHeight` (default 20px). When
 * the real line height is smaller than the metric, the window's start line
 * lands past the viewport top and the first lines of a file never render.
 *
 * Returns a cached object per size — CodeView compares options shallowly, so
 * an inline `{ lineHeight }` literal would register as an options change on
 * every render and force needless re-renders.
 */
const ITEM_METRICS_BY_FONT_SIZE = new Map<number, { lineHeight: number }>()

export function codeViewItemMetrics(codeFontSize: number): { lineHeight: number } {
  let metrics = ITEM_METRICS_BY_FONT_SIZE.get(codeFontSize)
  if (!metrics) {
    metrics = { lineHeight: codeLineHeight(codeFontSize) }
    ITEM_METRICS_BY_FONT_SIZE.set(codeFontSize, metrics)
  }
  return metrics
}

/**
 * GitHub's REST API returns `file.patch` as bare hunks (no `diff --git` header).
 * `@pierre/diffs`'s patch parsing expects a full git-style patch with filename
 * headers, so wrap the bare patch before passing it in (e.g. to PatchCodeBlock).
 */
export function wrapGitPatch(filename: string, patch: string): string {
  return `diff --git a/${filename} b/${filename}\n--- a/${filename}\n+++ b/${filename}\n${patch}`
}

/**
 * Reconstructs a full git-style patch from a REST `listFiles` entry, preserving
 * the change type so `processFile` classifies it correctly. The REST API drops
 * the `rename from/to`, `new file`, and `deleted file` headers that the raw
 * `.diff` carries — without them every file looks "modified" and moves lose
 * their old path. Used by the diff-stream loader's large-PR fallback.
 *
 * Returns `null` when there is nothing renderable to show (e.g. a binary file
 * with no patch that wasn't renamed).
 */
export function buildGitPatchFromRestFile(file: PullRequestFile): string | null {
  const newPath = file.filename
  const isRename = file.previous_filename != null && file.previous_filename !== newPath
  const oldPath = isRename ? file.previous_filename! : newPath

  if (!file.patch && !isRename) return null

  const lines = [`diff --git a/${oldPath} b/${newPath}`]
  if (file.status === 'added') {
    lines.push('new file mode 100644')
  } else if (file.status === 'removed') {
    lines.push('deleted file mode 100644')
  } else if (isRename) {
    lines.push(`similarity index ${file.patch ? '90%' : '100%'}`, `rename from ${oldPath}`, `rename to ${newPath}`)
  }

  if (file.patch) {
    const fromLine = file.status === 'added' ? '--- /dev/null' : `--- a/${oldPath}`
    const toLine = file.status === 'removed' ? '+++ /dev/null' : `+++ b/${newPath}`
    lines.push(fromLine, toLine, file.patch)
  }

  // Header-only patches (pure renames) need a trailing newline to parse cleanly.
  return file.patch ? lines.join('\n') : `${lines.join('\n')}\n`
}
