import type { BaseCodeOptions, BaseDiffOptions, SupportedLanguages, ThemesType } from '@pierre/diffs'

const DIFFS_THEMES: ThemesType = {
  dark: 'github-dark-default',
  light: 'github-light-default'
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
  if (lower === '.gitignore' || lower === '.dockerignore') return 'gitignore'

  const ext = filename.includes('.') ? (filename.split('.').pop()?.toLowerCase() ?? '') : ''
  return EXTENSION_TO_LANG[ext] ?? 'text'
}

export function syntheticFilenameForLang(lang: string): string {
  const ext = LANG_EXTENSION[lang.toLowerCase()] ?? 'txt'
  return `snippet.${ext}`
}

export const BASE_DIFF_OPTIONS: Omit<BaseDiffOptions, 'hunkSeparators'> = {
  theme: DIFFS_THEMES,
  diffIndicators: 'classic',
  overflow: 'wrap',
  expandUnchanged: true,
  lineDiffType: 'word'
}

export const BASE_CODE_OPTIONS: BaseCodeOptions = {
  theme: DIFFS_THEMES,
  overflow: 'wrap'
}

/**
 * GitHub's REST API returns `file.patch` as bare hunks (no `diff --git` header).
 * `@pierre/diffs`'s `PatchDiff` expects a full git-style patch with filename
 * headers, so wrap the bare patch before passing it in.
 */
export function wrapGitPatch(filename: string, patch: string): string {
  return `diff --git a/${filename} b/${filename}\n--- a/${filename}\n+++ b/${filename}\n${patch}`
}
