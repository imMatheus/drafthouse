import { createHighlighterCore, type HighlighterCore, type ThemedToken } from '@shikijs/core'
import { createJavaScriptRegexEngine } from '@shikijs/engine-javascript'
import type { BundledLanguage } from 'shiki'
import { bundledLanguages } from 'shiki/langs'
import githubDark from 'shiki/themes/github-dark.mjs'
import githubLight from 'shiki/themes/github-light.mjs'
import type { ParsedDiffHunk } from '../pages/workspace/pullRequestDiff'

const DARK_THEME = 'github-dark' as const
const LIGHT_THEME = 'github-light' as const

let instance: HighlighterCore | null = null
let loading: Promise<HighlighterCore> | null = null

export type AppTheme = 'dark' | 'light'

function getShikiThemeName(theme: AppTheme): typeof DARK_THEME | typeof LIGHT_THEME {
  return theme === 'dark' ? DARK_THEME : LIGHT_THEME
}

async function getHighlighter(): Promise<HighlighterCore> {
  if (instance) return instance
  if (!loading) {
    loading = createHighlighterCore({
      themes: [githubDark, githubLight],
      langs: [],
      engine: createJavaScriptRegexEngine()
    }).then((h) => {
      instance = h
      return h
    })
  }
  return loading
}

const languageLoading = new Map<string, Promise<string>>()

async function ensureLanguage(highlighter: HighlighterCore, lang: string): Promise<string> {
  if (lang === 'plaintext' || lang === 'text') return 'plaintext'

  const loaded = highlighter.getLoadedLanguages()
  if (loaded.includes(lang)) return lang

  // If this language is already being loaded by another caller, reuse that promise
  const inflight = languageLoading.get(lang)
  if (inflight) return inflight

  const loader = bundledLanguages[lang as BundledLanguage]
  if (!loader) return 'plaintext'

  const promise = highlighter
    .loadLanguage(loader)
    .then(() => lang)
    .catch(() => 'plaintext')
    .finally(() => languageLoading.delete(lang))

  languageLoading.set(lang, promise)
  return promise
}

const EXTENSION_TO_LANG: Record<string, string> = {
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
  log: 'log'
}

export function getLanguageFromPath(path: string): string {
  const filename = path.split('/').pop() ?? ''
  const lower = filename.toLowerCase()

  if (lower === 'dockerfile' || lower.startsWith('dockerfile.')) return 'dockerfile'
  if (lower === 'makefile' || lower === 'gnumakefile') return 'makefile'
  if (lower === 'cmakelists.txt' || lower.endsWith('.cmake')) return 'cmake'
  if (lower === '.gitignore' || lower === '.dockerignore') return 'gitignore'

  const ext = filename.includes('.') ? (filename.split('.').pop()?.toLowerCase() ?? '') : ''
  return EXTENSION_TO_LANG[ext] ?? 'plaintext'
}

export interface HighlightedToken {
  content: string
  color: string | undefined
}

function mapTokens(tokens: ThemedToken[]): HighlightedToken[] {
  return tokens.map((t) => ({ content: t.content, color: t.color }))
}

export async function tokenizeCode(code: string, langHint: string, theme: AppTheme): Promise<HighlightedToken[][]> {
  const highlighter = await getHighlighter()
  const lang = await ensureLanguage(highlighter, langHint)

  const { tokens } = highlighter.codeToTokens(code, {
    lang,
    theme: getShikiThemeName(theme)
  })

  return tokens.map(mapTokens)
}

export async function tokenizeDiffHunks(
  hunks: ParsedDiffHunk[],
  langHint: string,
  theme: AppTheme
): Promise<Map<string, HighlightedToken[]>> {
  const highlighter = await getHighlighter()
  const lang = await ensureLanguage(highlighter, langHint)

  const themeName = getShikiThemeName(theme)
  const tokenMap = new Map<string, HighlightedToken[]>()

  for (const hunk of hunks) {
    const oldEntries: { id: string; content: string }[] = []
    const newEntries: { id: string; content: string }[] = []

    for (const line of hunk.lines) {
      if (line.kind === 'context') {
        oldEntries.push({ id: line.id, content: line.content })
        newEntries.push({ id: line.id, content: line.content })
      } else if (line.kind === 'deletion') {
        oldEntries.push({ id: line.id, content: line.content })
      } else if (line.kind === 'addition') {
        newEntries.push({ id: line.id, content: line.content })
      }
    }

    if (oldEntries.length > 0) {
      const oldCode = oldEntries.map((e) => e.content).join('\n')
      const { tokens } = highlighter.codeToTokens(oldCode, { lang, theme: themeName })
      oldEntries.forEach((entry, i) => {
        tokenMap.set(entry.id, mapTokens(tokens[i] ?? []))
      })
    }

    if (newEntries.length > 0) {
      const newCode = newEntries.map((e) => e.content).join('\n')
      const { tokens } = highlighter.codeToTokens(newCode, { lang, theme: themeName })
      newEntries.forEach((entry, i) => {
        tokenMap.set(entry.id, mapTokens(tokens[i] ?? []))
      })
    }
  }

  return tokenMap
}

export interface ReviewPreviewLine {
  kind: 'header' | 'addition' | 'deletion' | 'context'
  content: string
}

export async function tokenizeReviewPreviewLines(
  lines: ReviewPreviewLine[],
  langHint: string,
  theme: AppTheme
): Promise<Map<number, HighlightedToken[]>> {
  const highlighter = await getHighlighter()
  const lang = await ensureLanguage(highlighter, langHint)

  const themeName = getShikiThemeName(theme)
  const tokenMap = new Map<number, HighlightedToken[]>()

  const oldEntries: { index: number; content: string }[] = []
  const newEntries: { index: number; content: string }[] = []

  lines.forEach((line, index) => {
    if (line.kind === 'context') {
      oldEntries.push({ index, content: line.content })
      newEntries.push({ index, content: line.content })
    } else if (line.kind === 'deletion') {
      oldEntries.push({ index, content: line.content })
    } else if (line.kind === 'addition') {
      newEntries.push({ index, content: line.content })
    }
  })

  if (oldEntries.length > 0) {
    const oldCode = oldEntries.map((e) => e.content).join('\n')
    const { tokens } = highlighter.codeToTokens(oldCode, { lang, theme: themeName })
    oldEntries.forEach((entry, i) => {
      tokenMap.set(entry.index, mapTokens(tokens[i] ?? []))
    })
  }

  if (newEntries.length > 0) {
    const newCode = newEntries.map((e) => e.content).join('\n')
    const { tokens } = highlighter.codeToTokens(newCode, { lang, theme: themeName })
    newEntries.forEach((entry, i) => {
      tokenMap.set(entry.index, mapTokens(tokens[i] ?? []))
    })
  }

  return tokenMap
}
