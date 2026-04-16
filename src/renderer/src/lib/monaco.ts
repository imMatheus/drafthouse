import * as monaco from 'monaco-editor'
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore — no type declarations for this ESM entry point
import { typescriptDefaults, javascriptDefaults, JsxEmit, ScriptTarget, ModuleResolutionKind } from 'monaco-editor/esm/vs/language/typescript/monaco.contribution'
import { loader } from '@monaco-editor/react'
import { getLanguageFromPath } from './shiki'

// Use locally installed monaco-editor instead of CDN (essential for Electron)
loader.config({ monaco })

// Configure web workers for Monaco language features
window.MonacoEnvironment = {
  getWorker(_workerId: string, label: string) {
    if (label === 'typescript' || label === 'javascript') {
      return new Worker(new URL('monaco-editor/esm/vs/language/typescript/ts.worker.js', import.meta.url), {
        type: 'module'
      })
    }
    if (label === 'json') {
      return new Worker(new URL('monaco-editor/esm/vs/language/json/json.worker.js', import.meta.url), {
        type: 'module'
      })
    }
    if (label === 'css' || label === 'scss' || label === 'less') {
      return new Worker(new URL('monaco-editor/esm/vs/language/css/css.worker.js', import.meta.url), { type: 'module' })
    }
    if (label === 'html' || label === 'handlebars' || label === 'razor') {
      return new Worker(new URL('monaco-editor/esm/vs/language/html/html.worker.js', import.meta.url), {
        type: 'module'
      })
    }
    return new Worker(new URL('monaco-editor/esm/vs/editor/editor.worker.js', import.meta.url), { type: 'module' })
  }
}

// Configure TypeScript/JavaScript to support JSX and disable diagnostics
// (we're a file viewer, not a full IDE — no tsconfig or node_modules available)
typescriptDefaults.setCompilerOptions({
  jsx: JsxEmit.ReactJSX,
  allowJs: true,
  allowNonTsExtensions: true,
  target: ScriptTarget.ESNext,
  moduleResolution: ModuleResolutionKind.NodeJs
})
typescriptDefaults.setDiagnosticsOptions({
  noSemanticValidation: true,
  noSyntaxValidation: true
})
javascriptDefaults.setCompilerOptions({
  jsx: JsxEmit.ReactJSX,
  allowJs: true,
  allowNonTsExtensions: true,
  target: ScriptTarget.ESNext
})
javascriptDefaults.setDiagnosticsOptions({
  noSemanticValidation: true,
  noSyntaxValidation: true
})

// GitHub Dark theme
monaco.editor.defineTheme('drafthouse-dark', {
  base: 'vs-dark',
  inherit: true,
  rules: [
    { token: '', foreground: 'e6edf3' },
    { token: 'comment', foreground: '8b949e', fontStyle: 'italic' },
    { token: 'keyword', foreground: 'ff7b72' },
    { token: 'keyword.control', foreground: 'ff7b72' },
    { token: 'storage', foreground: 'ff7b72' },
    { token: 'storage.type', foreground: 'ff7b72' },
    { token: 'type', foreground: 'ffa657' },
    { token: 'type.identifier', foreground: 'ffa657' },
    { token: 'string', foreground: 'a5d6ff' },
    { token: 'string.escape', foreground: '79c0ff' },
    { token: 'number', foreground: '79c0ff' },
    { token: 'constant', foreground: '79c0ff' },
    { token: 'constant.language', foreground: '79c0ff' },
    { token: 'variable', foreground: 'ffa657' },
    { token: 'variable.predefined', foreground: '79c0ff' },
    { token: 'entity.name.function', foreground: 'd2a8ff' },
    { token: 'support.function', foreground: 'd2a8ff' },
    { token: 'entity.name.tag', foreground: '7ee787' },
    { token: 'tag', foreground: '7ee787' },
    { token: 'metatag', foreground: '7ee787' },
    { token: 'attribute.name', foreground: '79c0ff' },
    { token: 'attribute.value', foreground: 'a5d6ff' },
    { token: 'delimiter', foreground: 'e6edf3' },
    { token: 'delimiter.bracket', foreground: 'e6edf3' },
    { token: 'operator', foreground: 'ff7b72' },
    { token: 'regexp', foreground: '7ee787' },
    { token: 'annotation', foreground: 'd2a8ff' },
    { token: 'identifier', foreground: 'e6edf3' }
  ],
  colors: {
    'editor.background': '#14120b',
    'editor.foreground': '#e6edf3',
    'editorLineNumber.foreground': '#6e6c64',
    'editorLineNumber.activeForeground': '#d7d6d5',
    'editor.lineHighlightBackground': '#1b191340',
    'editorGutter.background': '#14120b',
    'editor.selectionBackground': '#26241e',
    'scrollbarSlider.background': '#2b292380',
    'scrollbarSlider.hoverBackground': '#2b2923b0',
    'diffEditor.insertedTextBackground': '#2ea04333',
    'diffEditor.removedTextBackground': '#f8514933',
    'diffEditor.insertedLineBackground': '#2ea04326',
    'diffEditor.removedLineBackground': '#f8514926',
    'editorWidget.background': '#1b1913',
    'editorWidget.border': '#2b2923'
  }
})

// GitHub Light theme
monaco.editor.defineTheme('drafthouse-light', {
  base: 'vs',
  inherit: true,
  rules: [
    { token: '', foreground: '1f2328' },
    { token: 'comment', foreground: '6e7781', fontStyle: 'italic' },
    { token: 'keyword', foreground: 'cf222e' },
    { token: 'keyword.control', foreground: 'cf222e' },
    { token: 'storage', foreground: 'cf222e' },
    { token: 'storage.type', foreground: 'cf222e' },
    { token: 'type', foreground: '953800' },
    { token: 'type.identifier', foreground: '953800' },
    { token: 'string', foreground: '0a3069' },
    { token: 'string.escape', foreground: '0550ae' },
    { token: 'number', foreground: '0550ae' },
    { token: 'constant', foreground: '0550ae' },
    { token: 'constant.language', foreground: '0550ae' },
    { token: 'variable', foreground: '953800' },
    { token: 'variable.predefined', foreground: '0550ae' },
    { token: 'entity.name.function', foreground: '8250df' },
    { token: 'support.function', foreground: '8250df' },
    { token: 'entity.name.tag', foreground: '116329' },
    { token: 'tag', foreground: '116329' },
    { token: 'metatag', foreground: '116329' },
    { token: 'attribute.name', foreground: '0550ae' },
    { token: 'attribute.value', foreground: '0a3069' },
    { token: 'delimiter', foreground: '1f2328' },
    { token: 'delimiter.bracket', foreground: '1f2328' },
    { token: 'operator', foreground: 'cf222e' },
    { token: 'regexp', foreground: '116329' },
    { token: 'annotation', foreground: '8250df' },
    { token: 'identifier', foreground: '1f2328' }
  ],
  colors: {
    'editor.background': '#f7f7f4',
    'editor.foreground': '#1f2328',
    'editorLineNumber.foreground': '#a5a49e',
    'editorLineNumber.activeForeground': '#7a7970',
    'editor.lineHighlightBackground': '#f2f1ed40',
    'editorGutter.background': '#f7f7f4',
    'editor.selectionBackground': '#e6e5e0',
    'scrollbarSlider.background': '#e2e1dc80',
    'scrollbarSlider.hoverBackground': '#e2e1dcb0',
    'diffEditor.insertedTextBackground': '#2da44e33',
    'diffEditor.removedTextBackground': '#cf222e33',
    'diffEditor.insertedLineBackground': '#2da44e26',
    'diffEditor.removedLineBackground': '#cf222e26',
    'editorWidget.background': '#f2f1ed',
    'editorWidget.border': '#e2e1dc'
  }
})

export function getMonacoTheme(appTheme: 'dark' | 'light'): string {
  return appTheme === 'dark' ? 'drafthouse-dark' : 'drafthouse-light'
}

// Monaco uses different language IDs than Shiki for some languages.
// Map Shiki IDs to Monaco IDs where they differ.
const SHIKI_TO_MONACO: Record<string, string> = {
  tsx: 'typescript',
  jsx: 'javascript',
  bash: 'shell',
  zsh: 'shell',
  fish: 'shell',
  jsonc: 'json',
  sass: 'scss',
  proto: 'protobuf',
  makefile: 'shell',
  cmake: 'plaintext',
  gitignore: 'plaintext',
  dockerignore: 'plaintext',
  dotenv: 'ini',
  log: 'plaintext',
  nim: 'plaintext',
  zig: 'plaintext',
  prisma: 'plaintext',
  terraform: 'hcl',
  svelte: 'html',
  vue: 'html',
  ocaml: 'fsharp',
  haskell: 'plaintext',
  erlang: 'plaintext',
  toml: 'ini'
}

export function getMonacoLanguage(filePath: string): string {
  const shikiLang = getLanguageFromPath(filePath)
  return SHIKI_TO_MONACO[shikiLang] ?? shikiLang
}

export const BASE_EDITOR_OPTIONS: monaco.editor.IStandaloneEditorConstructionOptions = {
  minimap: { enabled: false },
  scrollBeyondLastLine: false,
  fontSize: 13,
  lineHeight: 24,
  fontFamily: 'ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace',
  automaticLayout: true,
  renderWhitespace: 'none' as const,
  padding: { top: 4 },
  overviewRulerLanes: 0,
  hideCursorInOverviewRuler: true,
  overviewRulerBorder: false,
  scrollbar: {
    verticalScrollbarSize: 8,
    horizontalScrollbarSize: 8
  }
}

export const BASE_DIFF_OPTIONS: monaco.editor.IDiffEditorConstructionOptions = {
  ...BASE_EDITOR_OPTIONS,
  enableSplitViewResizing: true,
  renderSideBySide: true,
  useInlineViewWhenSpaceIsLimited: false,
  originalEditable: false,
  readOnly: true
}
