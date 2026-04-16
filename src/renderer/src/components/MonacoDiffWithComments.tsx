import { useEffect, useRef } from 'react'
import Editor from '@monaco-editor/react'
import { DiffEditor, type DiffOnMount } from '@monaco-editor/react'
import { createRoot, type Root } from 'react-dom/client'
import type * as monacoTypes from 'monaco-editor'
import type {
  AgentSession,
  AuthData,
  PullRequestReviewDraftComment,
  PullRequestReviewLineSide
} from '../../../shared/types'
import { useTheme } from '../hooks/useTheme'
import { getMonacoTheme, BASE_EDITOR_OPTIONS, BASE_DIFF_OPTIONS } from '../lib/monaco'
import type { PullRequestReviewThread } from '../pages/workspace/pullRequestShared'

interface ViewZoneEntry {
  zoneId: string
  root: Root
  domNode: HTMLDivElement
  observer: ResizeObserver
}

interface MonacoDiffWithCommentsProps {
  original: string
  modified: string
  language: string
  renderSideBySide: boolean
  filename: string
  // Comment/thread data
  threadsByKey: Map<string, PullRequestReviewThread[]>
  draftCommentsByKey: Map<string, Array<{ comment: PullRequestReviewDraftComment; index: number }>>
  openCommentKey: string | null
  fileAgentSessions: AgentSession[]
  // Callbacks
  onOpenComment: (key: string | null) => void
  onAddDraftComment: (comment: PullRequestReviewDraftComment) => void
  onRemoveDraftComment: (index: number) => void
  onInlineCommentPosted: () => Promise<void>
  onAskClaude?: (
    prompt: string,
    filePath: string,
    lineNumber: number,
    lineContent: string,
    side: PullRequestReviewLineSide
  ) => Promise<void>
  // Review infrastructure
  owner: string
  repo: string
  number: number
  commitId: string
  auth: AuthData | null | undefined
  onContinueAgent?: (sessionId: string, prompt: string, files?: string[]) => Promise<void>
  onStopAgent?: (sessionId: string) => Promise<void>
  onPromoteAgent?: (sessionId: string) => void
  replyTarget: { owner: string; repo: string; number: number }
  threadRef: (commentId: number, element: HTMLElement | null) => void
  // Render functions (passed from PRFilesTab to avoid circular imports)
  renderInlineThread: (
    thread: PullRequestReviewThread,
    replyTarget: { owner: string; repo: string; number: number }
  ) => React.ReactNode
  renderCommentComposer: (props: {
    owner: string
    repo: string
    number: number
    commitId: string
    path: string
    line: number
    lineContent: string
    side: PullRequestReviewLineSide
    onCancel: () => void
    onAddDraftComment: (comment: PullRequestReviewDraftComment) => void
    onInlineCommentPosted: () => Promise<void>
    onAskClaude?: (
      prompt: string,
      filePath: string,
      lineNumber: number,
      lineContent: string,
      side: PullRequestReviewLineSide
    ) => Promise<void>
  }) => React.ReactNode
  renderDraftComment: (props: {
    comment: PullRequestReviewDraftComment
    index: number
    auth: AuthData | null | undefined
    onRemove: (index: number) => void
  }) => React.ReactNode
  renderAgentCard: (props: {
    session: AgentSession
    onStop: () => void
    onContinue: (prompt: string) => void
    onOpenInChat: () => void
  }) => React.ReactNode
}

function getDiffThreadKey(path: string, side: PullRequestReviewLineSide, line: number): string {
  return `${path}::${side}::${line}`
}

export default function MonacoDiffWithComments({
  original,
  modified,
  language,
  renderSideBySide,
  filename,
  threadsByKey,
  draftCommentsByKey,
  openCommentKey,
  fileAgentSessions,
  onOpenComment,
  onAddDraftComment,
  onRemoveDraftComment,
  onInlineCommentPosted,
  onAskClaude,
  owner,
  repo,
  number,
  commitId,
  auth,
  onContinueAgent,
  onStopAgent,
  onPromoteAgent,
  replyTarget,
  threadRef,
  renderInlineThread,
  renderCommentComposer,
  renderDraftComment,
  renderAgentCard
}: MonacoDiffWithCommentsProps) {
  const { theme } = useTheme()
  const diffEditorRef = useRef<monacoTypes.editor.IStandaloneDiffEditor | null>(null)
  const monacoRef = useRef<typeof monacoTypes | null>(null)
  const viewZonesRef = useRef<ViewZoneEntry[]>([])

  // Store latest props in refs so view zone callbacks always see current values
  const propsRef = useRef({
    threadsByKey,
    draftCommentsByKey,
    openCommentKey,
    fileAgentSessions,
    onOpenComment,
    onAddDraftComment,
    onRemoveDraftComment,
    onInlineCommentPosted,
    onAskClaude,
    owner,
    repo,
    number,
    commitId,
    auth,
    onContinueAgent,
    onStopAgent,
    onPromoteAgent,
    replyTarget,
    threadRef,
    renderInlineThread,
    renderCommentComposer,
    renderDraftComment,
    renderAgentCard,
    filename,
    renderSideBySide
  })
  propsRef.current = {
    threadsByKey,
    draftCommentsByKey,
    openCommentKey,
    fileAgentSessions,
    onOpenComment,
    onAddDraftComment,
    onRemoveDraftComment,
    onInlineCommentPosted,
    onAskClaude,
    owner,
    repo,
    number,
    commitId,
    auth,
    onContinueAgent,
    onStopAgent,
    onPromoteAgent,
    replyTarget,
    threadRef,
    renderInlineThread,
    renderCommentComposer,
    renderDraftComment,
    renderAgentCard,
    filename,
    renderSideBySide
  }

  const handleMount: DiffOnMount = (editor, monaco) => {
    diffEditorRef.current = editor
    monacoRef.current = monaco

    // Add gutter click handler on the modified editor for adding comments
    const modifiedEditor = editor.getModifiedEditor()
    const originalEditor = editor.getOriginalEditor()

    modifiedEditor.onMouseDown((e) => {
      if (
        e.target.type === monacoRef.current!.editor.MouseTargetType.GUTTER_LINE_NUMBERS ||
        e.target.type === monacoRef.current!.editor.MouseTargetType.GUTTER_GLYPH_MARGIN
      ) {
        const lineNumber = e.target.position?.lineNumber
        if (lineNumber) {
          const key = getDiffThreadKey(propsRef.current.filename, 'RIGHT', lineNumber)
          propsRef.current.onOpenComment(propsRef.current.openCommentKey === key ? null : key)
        }
      }
    })

    originalEditor.onMouseDown((e) => {
      if (
        e.target.type === monacoRef.current!.editor.MouseTargetType.GUTTER_LINE_NUMBERS ||
        e.target.type === monacoRef.current!.editor.MouseTargetType.GUTTER_GLYPH_MARGIN
      ) {
        const lineNumber = e.target.position?.lineNumber
        if (lineNumber) {
          const key = getDiffThreadKey(propsRef.current.filename, 'LEFT', lineNumber)
          propsRef.current.onOpenComment(propsRef.current.openCommentKey === key ? null : key)
        }
      }
    })

    updateViewZones()
  }

  // Clean up view zones on unmount
  useEffect(() => {
    return () => {
      clearViewZones()
    }
  }, [])

  // Update view zones when relevant props change
  useEffect(() => {
    if (diffEditorRef.current) {
      updateViewZones()
    }
  }, [threadsByKey, draftCommentsByKey, openCommentKey, fileAgentSessions, renderSideBySide])

  function clearViewZones() {
    const editor = diffEditorRef.current
    if (!editor) return

    const modifiedEditor = editor.getModifiedEditor()
    const originalEditor = editor.getOriginalEditor()

    modifiedEditor.changeViewZones((acc) => {
      for (const entry of viewZonesRef.current.filter((e) => e.domNode.dataset.editor === 'modified')) {
        acc.removeZone(entry.zoneId)
      }
    })
    originalEditor.changeViewZones((acc) => {
      for (const entry of viewZonesRef.current.filter((e) => e.domNode.dataset.editor === 'original')) {
        acc.removeZone(entry.zoneId)
      }
    })

    for (const entry of viewZonesRef.current) {
      entry.observer.disconnect()
      entry.root.unmount()
    }
    viewZonesRef.current = []
  }

  function updateViewZones() {
    const editor = diffEditorRef.current
    if (!editor) return

    // Clear existing zones
    const modifiedEditor = editor.getModifiedEditor()
    const originalEditor = editor.getOriginalEditor()

    // Remove old zones
    modifiedEditor.changeViewZones((accessor) => {
      for (const entry of viewZonesRef.current.filter((e) => e.domNode.dataset.editor === 'modified')) {
        accessor.removeZone(entry.zoneId)
      }
    })
    originalEditor.changeViewZones((accessor) => {
      for (const entry of viewZonesRef.current.filter((e) => e.domNode.dataset.editor === 'original')) {
        accessor.removeZone(entry.zoneId)
      }
    })

    for (const entry of viewZonesRef.current) {
      entry.observer.disconnect()
      entry.root.unmount()
    }
    viewZonesRef.current = []

    const p = propsRef.current
    const newZones: ViewZoneEntry[] = []

    // Collect all lines that need view zones
    const modifiedLineCount = modified.split('\n').length
    const originalLineCount = original.split('\n').length

    // Process RIGHT side lines (modified editor)
    for (let lineNumber = 1; lineNumber <= modifiedLineCount; lineNumber++) {
      const key = getDiffThreadKey(p.filename, 'RIGHT', lineNumber)
      const threads = p.threadsByKey.get(key) ?? []
      const drafts = p.draftCommentsByKey.get(key) ?? []
      const isComposerOpen = p.openCommentKey === key
      const agentSessions = p.fileAgentSessions.filter((s) => s.context?.lineNumber === lineNumber)

      if (threads.length === 0 && drafts.length === 0 && !isComposerOpen && agentSessions.length === 0) continue

      const lineContent = modified.split('\n')[lineNumber - 1] ?? ''

      const zoneEntry = createViewZone(
        modifiedEditor,
        'modified',
        lineNumber,
        () => (
          <>
            {threads.map((thread) => (
              <div key={`thread-${thread.id}`} ref={(el) => p.threadRef(thread.id, el)}>
                {p.renderInlineThread(thread, p.replyTarget)}
              </div>
            ))}
            {drafts.map(({ comment, index }) => (
              <div key={`draft-${key}-${index}`}>
                {p.renderDraftComment({ comment, index, auth: p.auth, onRemove: p.onRemoveDraftComment })}
              </div>
            ))}
            {isComposerOpen
              ? p.renderCommentComposer({
                  owner: p.owner,
                  repo: p.repo,
                  number: p.number,
                  commitId: p.commitId,
                  path: p.filename,
                  line: lineNumber,
                  lineContent,
                  side: 'RIGHT',
                  onCancel: () => p.onOpenComment(null),
                  onAddDraftComment: p.onAddDraftComment,
                  onInlineCommentPosted: p.onInlineCommentPosted,
                  onAskClaude: p.onAskClaude
                })
              : null}
            {agentSessions.map((session) => (
              <div key={`agent-${session.id}`}>
                {p.renderAgentCard({
                  session,
                  onStop: () => p.onStopAgent?.(session.id),
                  onContinue: (prompt) => p.onContinueAgent?.(session.id, prompt),
                  onOpenInChat: () => p.onPromoteAgent?.(session.id)
                })}
              </div>
            ))}
          </>
        )
      )
      if (zoneEntry) newZones.push(zoneEntry)
    }

    // Process LEFT side lines (original editor) - only in split mode
    if (p.renderSideBySide) {
      for (let lineNumber = 1; lineNumber <= originalLineCount; lineNumber++) {
        const key = getDiffThreadKey(p.filename, 'LEFT', lineNumber)
        const threads = p.threadsByKey.get(key) ?? []
        const drafts = p.draftCommentsByKey.get(key) ?? []
        const isComposerOpen = p.openCommentKey === key

        if (threads.length === 0 && drafts.length === 0 && !isComposerOpen) continue

        const lineContent = original.split('\n')[lineNumber - 1] ?? ''

        const zoneEntry = createViewZone(
          originalEditor,
          'original',
          lineNumber,
          () => (
            <>
              {threads.map((thread) => (
                <div key={`thread-${thread.id}`} ref={(el) => p.threadRef(thread.id, el)}>
                  {p.renderInlineThread(thread, p.replyTarget)}
                </div>
              ))}
              {drafts.map(({ comment, index }) => (
                <div key={`draft-${key}-${index}`}>
                  {p.renderDraftComment({ comment, index, auth: p.auth, onRemove: p.onRemoveDraftComment })}
                </div>
              ))}
              {isComposerOpen
                ? p.renderCommentComposer({
                    owner: p.owner,
                    repo: p.repo,
                    number: p.number,
                    commitId: p.commitId,
                    path: p.filename,
                    line: lineNumber,
                    lineContent,
                    side: 'LEFT',
                    onCancel: () => p.onOpenComment(null),
                    onAddDraftComment: p.onAddDraftComment,
                    onInlineCommentPosted: p.onInlineCommentPosted,
                    onAskClaude: p.onAskClaude
                  })
                : null}
            </>
          )
        )
        if (zoneEntry) newZones.push(zoneEntry)
      }
    } else {
      // In unified mode, LEFT side threads also go on the modified editor
      for (let lineNumber = 1; lineNumber <= originalLineCount; lineNumber++) {
        const key = getDiffThreadKey(p.filename, 'LEFT', lineNumber)
        const threads = p.threadsByKey.get(key) ?? []
        const drafts = p.draftCommentsByKey.get(key) ?? []
        const isComposerOpen = p.openCommentKey === key

        if (threads.length === 0 && drafts.length === 0 && !isComposerOpen) continue

        const lineContent = original.split('\n')[lineNumber - 1] ?? ''

        // In unified mode, we approximate by placing LEFT comments at line 1 of modified
        // since Monaco's unified diff doesn't expose original line mapping easily
        const zoneEntry = createViewZone(modifiedEditor, 'modified', lineNumber, () => (
          <>
            {threads.map((thread) => (
              <div key={`thread-${thread.id}`} ref={(el) => p.threadRef(thread.id, el)}>
                {p.renderInlineThread(thread, p.replyTarget)}
              </div>
            ))}
            {drafts.map(({ comment, index }) => (
              <div key={`draft-${key}-${index}`}>
                {p.renderDraftComment({ comment, index, auth: p.auth, onRemove: p.onRemoveDraftComment })}
              </div>
            ))}
            {isComposerOpen
              ? p.renderCommentComposer({
                  owner: p.owner,
                  repo: p.repo,
                  number: p.number,
                  commitId: p.commitId,
                  path: p.filename,
                  line: lineNumber,
                  lineContent,
                  side: 'LEFT',
                  onCancel: () => p.onOpenComment(null),
                  onAddDraftComment: p.onAddDraftComment,
                  onInlineCommentPosted: p.onInlineCommentPosted,
                  onAskClaude: p.onAskClaude
                })
              : null}
          </>
        ))
        if (zoneEntry) newZones.push(zoneEntry)
      }
    }

    viewZonesRef.current = newZones
  }

  function createViewZone(
    editor: monacoTypes.editor.ICodeEditor,
    editorType: 'original' | 'modified',
    afterLineNumber: number,
    renderContent: () => React.ReactNode
  ): ViewZoneEntry | null {
    const domNode = document.createElement('div')
    domNode.dataset.editor = editorType
    domNode.style.zIndex = '10'

    const root = createRoot(domNode)
    root.render(
      <div className="px-3 py-2">{renderContent()}</div>
    )

    // Observe the domNode's size so we can update the view zone height dynamically
    const observer = new ResizeObserver((entries) => {
      const observed = entries[0]
      if (!observed) return
      const newHeight = observed.contentRect.height
      if (newHeight > 0 && resolvedZoneId) {
        editor.changeViewZones((acc) => {
          acc.layoutZone(resolvedZoneId)
        })
      }
    })
    observer.observe(domNode)

    let resolvedZoneId = ''

    editor.changeViewZones((accessor) => {
      resolvedZoneId = accessor.addZone({
        afterLineNumber,
        heightInPx: 200, // Initial estimate, will expand with content
        domNode,
        suppressMouseDown: false
      })
    })

    const zoneEntry: ViewZoneEntry = {
      zoneId: resolvedZoneId,
      root,
      domNode,
      observer
    }

    return zoneEntry
  }

  // Determine height based on content
  const content = modified || original
  const lineCount = Math.max(original.split('\n').length, modified.split('\n').length)
  const editorHeight = Math.min(Math.max(lineCount * 24 + 16, 200), 800)
  const isNewOrDeleted = !original || !modified

  // For entirely new or deleted files, use a regular Editor (DiffEditor doesn't
  // syntax-highlight properly when one side is empty)
  if (isNewOrDeleted) {
    return (
      <div style={{ height: editorHeight }}>
        <Editor
          value={content}
          language={language}
          theme={getMonacoTheme(theme)}
          options={{
            ...BASE_EDITOR_OPTIONS,
            readOnly: true
          }}
          loading={
            <div className="flex h-full items-center justify-center">
              <p className="text-sm text-foreground-muted">Loading file...</p>
            </div>
          }
        />
      </div>
    )
  }

  return (
    <div style={{ height: editorHeight }}>
      <DiffEditor
        key={renderSideBySide ? 'split' : 'unified'}
        original={original}
        modified={modified}
        language={language}
        theme={getMonacoTheme(theme)}
        options={{
          ...BASE_DIFF_OPTIONS,
          renderSideBySide,
          glyphMargin: true
        }}
        onMount={handleMount}
        loading={
          <div className="flex h-full items-center justify-center">
            <p className="text-sm text-foreground-muted">Loading diff...</p>
          </div>
        }
      />
    </div>
  )
}
