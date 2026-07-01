import { memo, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  AlignJustify,
  ArrowRight,
  Check,
  ChevronDown,
  ChevronRight,
  ChevronsDownUp,
  ChevronsUpDown,
  CircleCheck,
  Columns2,
  Copy,
  ExternalLink,
  EyeOff,
  FileDiff,
  FileMinus,
  FilePen,
  FilePlus,
  FileSymlink,
  FileText,
  GitCompare,
  Hash,
  ListTree,
  MessageSquare,
  Rows3,
  Search,
  Settings2,
  TriangleAlert,
  WrapText,
  X
} from 'lucide-react'
import { CodeView, PatchDiff, useWorkerPool, type CodeViewHandle, type DiffLineAnnotation } from '@pierre/diffs/react'
import { processFile, type CodeViewDiffItem } from '@pierre/diffs'
import * as DropdownMenu from '../../components/DropdownMenu'
import type {
  AgentSessionMeta,
  AuthData,
  PullRequestDetail,
  PullRequestFile,
  PullRequestReviewComment,
  PullRequestReviewDraftComment,
  PullRequestReviewEvent,
  PullRequestReviewLineSide,
  PullRequestReviewThreadSummary
} from '../../../../shared/types'
import ClaudeMentionTextarea, { extractClaudePrompt, isClaudeMention } from '../../components/ClaudeMentionTextarea'
import { useCopyToClipboard } from '../../hooks/useCopyToClipboard'
import { FolderIcon } from '../../components/FileIcon'
import { LoadingIndicator } from '../../components/Loading'
import InlineAgentResponseCard from '../../components/InlineAgentResponseCard'
import ReactionBar from '../../components/ReactionBar'
import CommentActionsMenu from '../../components/CommentActionsMenu'
import CommentBodyEditor from '../../components/CommentBodyEditor'
import FixWithClaudeButton from '../../components/FixWithClaudeButton'
import ResolveThreadButton from '../../components/ResolveThreadButton'
import type { FixWithClaudeInput } from '../../lib/agentContext'
import type { PullRequestFileTabInput } from '../../lib/workspaceTabs'
import Tooltip from '../../components/Tooltip'
import { cn } from '../../lib/cn'
import { useSettings, type DiffIndicatorStyle, type UserSettings } from '../../hooks/useSettings'
import { useTheme } from '../../hooks/useTheme'
import { BASE_DIFF_OPTIONS, wrapGitPatch } from '../../lib/diffs'
import type { PrDiffDiffStats, PrDiffFileMeta } from '../../lib/prDiffAccumulator'
import { usePullRequestDiffStream, type PrDiffLoadState } from './usePullRequestDiffStream'
import MarkdownBody from './MarkdownBody'
import {
  buildPullRequestReviewThreads,
  DiffStat,
  formatRelativeTime,
  type PullRequestReviewThread
} from './pullRequestShared'

interface PreparedDraftEntry {
  comment: PullRequestReviewDraftComment
  /** Index in the top-level `draftReviewComments` array — needed for removal. */
  index: number
}

// @pierre/diffs renders annotations inside its shadow DOM, where font-family
// and font-size inherit from Pierre's monospace <pre>. Reset both at the
// annotation wrapper so our comment cards pick up the app's sans-serif stack.
const ANNOTATION_WRAPPER_STYLE: React.CSSProperties = {
  fontFamily:
    "'Inter', ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
  fontSize: '14px',
  lineHeight: '1.5'
}

// Shared shell for every inline annotation card (thread, draft, composer),
// mirroring @pierre/diffs' diffshub `annotationCardBase`: a self-contained card
// that floats on the annotation row's context background, capped in width so it
// stays readable in wide/unified columns, and lifted with a soft layered shadow
// rather than a heavy border. Per-card border color is layered on after this.
const ANNOTATION_CARD =
  'bg-surface border-border w-full max-w-[600px] overflow-hidden rounded-xl border bg-clip-padding shadow-[0_1px_2px_rgb(0_0_0_/_0.05),0_4px_12px_rgb(0_0_0_/_0.07)]'

// Must match @pierre/diffs' DEFAULT_VIRTUAL_FILE_METRICS.diffHeaderHeight so the
// virtualizer reserves the right amount of space for our custom file header.
const DIFF_HEADER_HEIGHT = 44

// Remembers the read position per PR so switching editor tabs and coming back
// lands you where you left off. Module-level so it survives the tab's unmount
// (only the active editor tab is mounted at a time). Anchored to the topmost
// visible file plus an intra-file pixel offset, which stays accurate even as
// the streamed diff's heights change when files lazily expand.
interface PrScrollAnchor {
  path: string
  offset: number
}
const prScrollMemory = new Map<string, PrScrollAnchor>()
const prScrollKey = (owner: string, repo: string, number: number): string => `${owner}/${repo}/${number}`

// Floats the annotation card inside the row the package gives us. The package
// already paints the row with its own context background (`--diffs-bg-context`),
// so — like diffshub — we keep this wrapper transparent and just add breathing
// room; the card carries its own border + shadow. `data-annotation-side` records
// the diff side without tinting, matching diffshub's neutral inline card.
function AnnotationWrapper({
  side,
  elementRef,
  children
}: {
  side: 'deletions' | 'additions'
  elementRef?: (element: HTMLDivElement | null) => void
  children: ReactNode
}) {
  return (
    <div ref={elementRef} data-annotation-side={side} style={ANNOTATION_WRAPPER_STYLE} className="p-2">
      {children}
    </div>
  )
}

type InlineAnnotationMeta =
  | { kind: 'thread'; thread: PullRequestReviewThread }
  | { kind: 'draft'; draft: PreparedDraftEntry }
  | { kind: 'agent'; session: AgentSessionMeta }
  | { kind: 'composer'; line: number; side: PullRequestReviewLineSide; lineContent: string }

type DiffItem = CodeViewDiffItem<InlineAnnotationMeta>

const EMPTY_FILE_METAS: PrDiffFileMeta[] = []

interface AnnotationInputs {
  threadsByFile: Map<string, PullRequestReviewThread[]>
  draftsByFile: Map<string, PreparedDraftEntry[]>
  inlineSessionsByFile: Map<string, AgentSessionMeta[]>
  openCommentKey: string | null
}

// Flatten a file's threads, drafts, inline agent sessions, and the open comment
// composer into Pierre's annotation format. Threads that can't be anchored
// (outdated or missing side/line) are dropped — they have nowhere to render.
function buildFileAnnotations(filename: string, inputs: AnnotationInputs): DiffLineAnnotation<InlineAnnotationMeta>[] {
  const annotations: DiffLineAnnotation<InlineAnnotationMeta>[] = []

  for (const thread of inputs.threadsByFile.get(filename) ?? []) {
    if (thread.side == null || thread.line == null || thread.isOutdated) continue
    annotations.push({
      side: thread.side === 'LEFT' ? 'deletions' : 'additions',
      lineNumber: thread.line,
      metadata: { kind: 'thread', thread }
    })
  }

  for (const draft of inputs.draftsByFile.get(filename) ?? []) {
    annotations.push({
      side: draft.comment.side === 'LEFT' ? 'deletions' : 'additions',
      lineNumber: draft.comment.line,
      metadata: { kind: 'draft', draft }
    })
  }

  for (const session of inputs.inlineSessionsByFile.get(filename) ?? []) {
    const ctx = session.context
    if (!ctx || !ctx.inline || typeof ctx.lineNumber !== 'number') continue
    annotations.push({
      side: ctx.side === 'LEFT' ? 'deletions' : 'additions',
      lineNumber: ctx.lineNumber,
      metadata: { kind: 'agent', session }
    })
  }

  const openKey = inputs.openCommentKey
  if (openKey && openKey.startsWith(`${filename}::`)) {
    const [, sideStr, lineStr] = openKey.split('::')
    const line = Number(lineStr)
    if (!Number.isNaN(line)) {
      const side: PullRequestReviewLineSide = sideStr === 'LEFT' ? 'LEFT' : 'RIGHT'
      annotations.push({
        side: side === 'LEFT' ? 'deletions' : 'additions',
        lineNumber: line,
        metadata: { kind: 'composer', line, side, lineContent: '' }
      })
    }
  }

  return annotations
}

// Cheap content signature so the annotation effect only calls updateItem when a
// file's annotations actually changed (resolve toggles, replies, agent status,
// draft removal, composer open/close all move the signature).
function annotationsSignature(annotations: DiffLineAnnotation<InlineAnnotationMeta>[]): string {
  return annotations
    .map((annotation) => {
      const meta = annotation.metadata
      const base = `${annotation.side}:${annotation.lineNumber}:${meta?.kind}`
      if (meta?.kind === 'thread') {
        const replies = meta.thread.replies.map((reply) => `${reply.id}@${reply.updated_at}`).join(',')
        return `${base}:${meta.thread.id}:${meta.thread.isResolved}:${meta.thread.topLevelComment.updated_at}:${replies}`
      }
      if (meta?.kind === 'draft') return `${base}:${meta.draft.index}:${meta.draft.comment.body.length}`
      if (meta?.kind === 'agent') return `${base}:${meta.session.id}:${meta.session.status}`
      return base
    })
    .join('|')
}

interface GroupingsCache {
  deps: {
    reviewComments: unknown
    reviewThreadSummaries: unknown
    draftReviewComments: unknown
    agentSessions: unknown
  }
  reviewThreads: PullRequestReviewThread[]
  threadsByFile: Map<string, PullRequestReviewThread[]>
  commentCountsByFile: Map<string, number>
  threadsByCommentId: Map<number, PullRequestReviewThread>
  draftsByFile: Map<string, PreparedDraftEntry[]>
  inlineSessionsByFile: Map<string, AgentSessionMeta[]>
}

const EMPTY_GROUPINGS_CACHE: GroupingsCache = {
  deps: {
    reviewComments: undefined,
    reviewThreadSummaries: undefined,
    draftReviewComments: undefined,
    agentSessions: undefined
  },
  reviewThreads: [],
  threadsByFile: new Map(),
  commentCountsByFile: new Map(),
  threadsByCommentId: new Map(),
  draftsByFile: new Map(),
  inlineSessionsByFile: new Map()
}

function getStableGroupings(
  ref: React.MutableRefObject<GroupingsCache>,
  inputs: {
    reviewComments: PullRequestReviewComment[] | undefined
    reviewThreadSummaries: PullRequestReviewThreadSummary[] | undefined
    draftReviewComments: PullRequestReviewDraftComment[]
    agentSessions: AgentSessionMeta[] | undefined
  }
): GroupingsCache {
  const { deps } = ref.current
  if (
    deps.reviewComments === inputs.reviewComments &&
    deps.reviewThreadSummaries === inputs.reviewThreadSummaries &&
    deps.draftReviewComments === inputs.draftReviewComments &&
    deps.agentSessions === inputs.agentSessions
  ) {
    return ref.current
  }

  const reviewThreads = buildPullRequestReviewThreads(inputs.reviewComments ?? [], inputs.reviewThreadSummaries)
  const threadsByFile = new Map<string, PullRequestReviewThread[]>()
  for (const thread of reviewThreads) {
    const bucket = threadsByFile.get(thread.path)
    if (bucket) bucket.push(thread)
    else threadsByFile.set(thread.path, [thread])
  }
  const commentCountsByFile = new Map<string, number>()
  for (const thread of reviewThreads) {
    if (thread.isOutdated) continue
    const count = 1 + thread.replies.length
    commentCountsByFile.set(thread.path, (commentCountsByFile.get(thread.path) ?? 0) + count)
  }
  const threadsByCommentId = new Map(reviewThreads.map((thread) => [thread.topLevelComment.id, thread]))
  const draftsByFile = new Map<string, PreparedDraftEntry[]>()
  inputs.draftReviewComments.forEach((comment, index) => {
    const bucket = draftsByFile.get(comment.path)
    const entry: PreparedDraftEntry = { comment, index }
    if (bucket) bucket.push(entry)
    else draftsByFile.set(comment.path, [entry])
  })
  const inlineSessionsByFile = new Map<string, AgentSessionMeta[]>()
  for (const session of inputs.agentSessions ?? []) {
    const ctx = session.context
    if (!ctx || !ctx.inline || !ctx.filePath) continue
    const bucket = inlineSessionsByFile.get(ctx.filePath)
    if (bucket) bucket.push(session)
    else inlineSessionsByFile.set(ctx.filePath, [session])
  }

  ref.current = {
    deps: {
      reviewComments: inputs.reviewComments,
      reviewThreadSummaries: inputs.reviewThreadSummaries,
      draftReviewComments: inputs.draftReviewComments,
      agentSessions: inputs.agentSessions
    },
    reviewThreads,
    threadsByFile,
    commentCountsByFile,
    threadsByCommentId,
    draftsByFile,
    inlineSessionsByFile
  }
  return ref.current
}

interface FileTreeCache {
  input: unknown
  tree: FileTreeNode[]
}

const EMPTY_FILE_TREE_CACHE: FileTreeCache = { input: undefined, tree: [] }

function getStableFileTree(ref: React.MutableRefObject<FileTreeCache>, files: PrDiffFileMeta[]): FileTreeNode[] {
  if (ref.current.input === files) return ref.current.tree
  ref.current = { input: files, tree: buildFileTree(files) }
  return ref.current.tree
}

export default function PRFilesTab({
  pr,
  owner,
  repo,
  draftReviewComments,
  onDraftReviewCommentsChange,
  threadJumpTarget,
  agentSessions,
  onOpenPullRequestFile,
  onAskClaude,
  onFixWithClaude,
  onContinueAgent,
  onStopAgent,
  onPromoteAgent
}: {
  pr: PullRequestDetail
  owner: string
  repo: string
  draftReviewComments: PullRequestReviewDraftComment[]
  onDraftReviewCommentsChange: (comments: PullRequestReviewDraftComment[]) => void
  threadJumpTarget: { path: string; commentId: number; nonce: number } | null
  agentSessions?: AgentSessionMeta[]
  onOpenPullRequestFile: (input: PullRequestFileTabInput) => void
  onAskClaude?: (
    prompt: string,
    filePath: string,
    lineNumber: number,
    lineContent: string,
    side: PullRequestReviewLineSide
  ) => Promise<void>
  onFixWithClaude?: (input: FixWithClaudeInput) => Promise<void>
  onContinueAgent?: (sessionId: string, prompt: string, files?: string[]) => Promise<void>
  onStopAgent?: (sessionId: string) => Promise<void>
  onPromoteAgent?: (sessionId: string) => void
}) {
  const { theme } = useTheme()
  const { settings, updateSettings } = useSettings()
  const workerReady = useWorkerReady()
  const [filterValue, setFilterValue] = useState('')
  const [sidebarTab, setSidebarTab] = useState<'files' | 'comments'>('files')
  const [activeFilePath, setActiveFilePath] = useState<string | null>(null)
  const [openCommentKey, setOpenCommentKey] = useState<string | null>(null)
  const [isSubmitReviewOpen, setIsSubmitReviewOpen] = useState(false)
  const [collapsedFolders, setCollapsedFolders] = useState<Set<string>>(() => new Set())
  // "Viewed" is tracked separately from a file's collapsed state (keyed by
  // filename): marking a file viewed also collapses it, but a viewed file can
  // still be expanded again without losing its viewed mark. The ref mirrors the
  // set so the stable header/toggle closures read the latest value.
  const [viewedFiles, setViewedFiles] = useState<Set<string>>(() => new Set())
  const viewedFilesRef = useRef(viewedFiles)
  viewedFilesRef.current = viewedFiles
  const threadRefs = useRef(new Map<number, HTMLElement>())
  // Latest settings for the stable prepareItems closure (new files inherit the
  // current expand/collapse default).
  const settingsRef = useRef(settings)
  settingsRef.current = settings
  const handledJumpNonceRef = useRef<number | null>(null)
  const groupingsRef = useRef<GroupingsCache>(EMPTY_GROUPINGS_CACHE)
  const fileTreeRef = useRef<FileTreeCache>(EMPTY_FILE_TREE_CACHE)
  const queryClient = useQueryClient()

  const viewerRef = useRef<CodeViewHandle<InlineAnnotationMeta> | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  // Key under which this PR's scroll position is remembered. Kept in a ref so
  // the stable scroll closure always reads the current PR.
  const scrollKeyRef = useRef('')
  scrollKeyRef.current = prScrollKey(owner, repo, pr.number)
  // Guards the one-shot scroll restore so it runs once per (re)mount, not on
  // every render after the diff becomes ready.
  const didRestoreScrollRef = useRef(false)
  // itemId -> last applied annotation signature, so the reconcile effect can
  // skip files whose annotations are unchanged.
  const annotationSigRef = useRef(new Map<string, string>())

  const { data: reviewComments } = useQuery<PullRequestReviewComment[], Error>({
    queryKey: ['pull-request-review-comments', owner, repo, pr.number],
    queryFn: () => window.api.github.pullComments.listForPull(owner, repo, pr.number),
    retry: false
  })
  const { data: auth } = useQuery<AuthData | null, Error>({
    queryKey: ['auth-user'],
    queryFn: () => window.api.auth.getUser(),
    retry: false
  })
  const { data: reviewThreadSummaries } = useQuery<PullRequestReviewThreadSummary[], Error>({
    queryKey: ['pull-request-review-threads', owner, repo, pr.number],
    queryFn: () => window.api.github.pullComments.listReviewThreads(owner, repo, pr.number),
    retry: false
  })

  const groupings = getStableGroupings(groupingsRef, {
    reviewComments,
    reviewThreadSummaries,
    draftReviewComments,
    agentSessions
  })
  const { threadsByFile, commentCountsByFile, threadsByCommentId, draftsByFile, inlineSessionsByFile } = groupings

  // Latest annotation inputs, read by the (stable) prepareItems closure the
  // loader calls for freshly streamed files.
  const annotationInputsRef = useRef<AnnotationInputs>({
    threadsByFile,
    draftsByFile,
    inlineSessionsByFile,
    openCommentKey
  })
  annotationInputsRef.current = { threadsByFile, draftsByFile, inlineSessionsByFile, openCommentKey }

  // Latest values needed by the stable renderAnnotation / gutter closures.
  const renderCtxRef = useRef({
    owner,
    repo,
    number: pr.number,
    commitId: pr.head.sha,
    auth,
    agentSessions,
    onAskClaude,
    onFixWithClaude,
    onContinueAgent,
    onStopAgent,
    onPromoteAgent,
    onDraftReviewCommentsChange,
    draftReviewComments
  })
  renderCtxRef.current = {
    owner,
    repo,
    number: pr.number,
    commitId: pr.head.sha,
    auth,
    agentSessions,
    onAskClaude,
    onFixWithClaude,
    onContinueAgent,
    onStopAgent,
    onPromoteAgent,
    onDraftReviewCommentsChange,
    draftReviewComments
  }

  const fileOpenCtxRef = useRef({
    owner,
    repo,
    number: pr.number,
    headSha: pr.head.sha,
    onOpenPullRequestFile
  })
  fileOpenCtxRef.current = {
    owner,
    repo,
    number: pr.number,
    headSha: pr.head.sha,
    onOpenPullRequestFile
  }

  // Stable item-annotator handed to the loader: brand-new streamed items pick
  // up the current annotations (and record their signature) before they're
  // added to the viewer.
  const [prepareItems] = useState(() => (items: DiffItem[]): void => {
    const collapsed = settingsRef.current.diffCollapsed
    for (const item of items) {
      item.collapsed = collapsed
      const annotations = buildFileAnnotations(item.id, annotationInputsRef.current)
      item.annotations = annotations
      annotationSigRef.current.set(item.id, annotationsSignature(annotations))
    }
  })

  const { viewerKey, initialItems, fileMetas, diffStats, loadState, errorMessage, retry } =
    usePullRequestDiffStream<InlineAnnotationMeta>({
      owner,
      repo,
      number: pr.number,
      headSha: pr.head.sha,
      viewerRef,
      prepareItems
    })

  const allFileMetas = fileMetas.length > 0 ? fileMetas : EMPTY_FILE_METAS
  const trimmedFilter = filterValue.trim().toLowerCase()
  const filteredFiles =
    trimmedFilter === ''
      ? allFileMetas
      : allFileMetas.filter((file) => file.filename.toLowerCase().includes(trimmedFilter))
  const fileTree = getStableFileTree(fileTreeRef, filteredFiles)

  // itemId <-> filename lookups for the render callbacks and tree navigation.
  const itemIdByFilename = useRef(new Map<string, string>())
  const fileMetaByItemId = useRef(new Map<string, PrDiffFileMeta>())
  itemIdByFilename.current = new Map(fileMetas.map((file) => [file.filename, file.itemId]))
  fileMetaByItemId.current = new Map(fileMetas.map((file) => [file.itemId, file]))

  // Reconcile annotations on already-mounted items when comment data, drafts,
  // sessions, or the open composer change.
  useEffect(() => {
    const viewer = viewerRef.current
    if (!viewer) return
    const inputs: AnnotationInputs = { threadsByFile, draftsByFile, inlineSessionsByFile, openCommentKey }
    for (const file of fileMetas) {
      const annotations = buildFileAnnotations(file.filename, inputs)
      const signature = annotationsSignature(annotations)
      if (annotationSigRef.current.get(file.itemId) === signature) continue
      const item = viewer.getItem(file.itemId)
      if (!item || item.type !== 'diff') continue
      item.annotations = annotations
      item.version = typeof item.version === 'number' ? item.version + 1 : 1
      viewer.updateItem(item)
      annotationSigRef.current.set(file.itemId, signature)
    }
  }, [threadsByFile, draftsByFile, inlineSessionsByFile, openCommentKey, fileMetas])

  // Drop viewed marks when switching to a different PR — filenames can collide
  // across PRs, so a stale mark would otherwise carry over.
  useEffect(() => {
    setViewedFiles(new Set())
  }, [owner, repo, pr.number])

  // Default the active file to the first one once files arrive.
  useEffect(() => {
    if (filteredFiles.length === 0) {
      setActiveFilePath(null)
      return
    }
    if (!activeFilePath || !filteredFiles.some((file) => file.filename === activeFilePath)) {
      setActiveFilePath(filteredFiles[0]?.filename ?? null)
    }
  }, [activeFilePath, filteredFiles])

  // Lazily upgrade each file to a non-partial diff as it scrolls into view, so
  // the package's "N unmodified lines" separators become clickable to expand.
  // GitHub's streamed `.diff` only carries changed regions (isPartial: true), so
  // the bars can't expand until we re-parse the patch with the full old/new file
  // contents. Contents and per-file upgrade state are cached so each file is
  // fetched and re-parsed at most once.
  const expansionContentRef = useRef(new Map<string, Promise<string | null>>())
  const expansionStateRef = useRef(new Map<string, 'loading' | 'done' | 'error'>())

  useEffect(() => {
    // Switching PRs remounts the viewer; drop stale upgrade caches.
    expansionContentRef.current.clear()
    expansionStateRef.current.clear()
  }, [owner, repo, pr.number, pr.head.sha])

  useEffect(() => {
    if (!activeFilePath) return
    const activeIndex = fileMetas.findIndex((file) => file.filename === activeFilePath)
    if (activeIndex < 0) return

    const fetchContents = (path: string, ref: string): Promise<string | null> => {
      const key = `${ref}::${path}`
      const cached = expansionContentRef.current.get(key)
      if (cached) return cached
      const request = window.api.github.repos.getContent(owner, repo, path, ref).catch(() => null)
      expansionContentRef.current.set(key, request)
      return request
    }

    const upgrade = async (meta: PrDiffFileMeta): Promise<void> => {
      const itemId = meta.itemId
      if (expansionStateRef.current.has(itemId)) return
      const viewer = viewerRef.current
      const item = viewer?.getItem(itemId)
      if (!viewer || !item || item.type !== 'diff') return
      // Skip files with no collapsed gaps to expand, or no patch to re-parse.
      if (!meta.patchText || !item.fileDiff.hunks.some((hunk) => hunk.collapsedBefore > 0)) {
        expansionStateRef.current.set(itemId, 'done')
        return
      }
      expansionStateRef.current.set(itemId, 'loading')
      const newPath = meta.filename
      const oldPath = meta.previousFilename ?? meta.filename
      const [oldContents, newContents] = await Promise.all([
        meta.status === 'added' ? Promise.resolve('') : fetchContents(oldPath, pr.base.sha),
        meta.status === 'removed' ? Promise.resolve('') : fetchContents(newPath, pr.head.sha)
      ])
      // A failed fetch (file too large / 404) leaves the file partial rather than
      // re-parsing against empty contents, which would render a bogus diff.
      if (oldContents === null || newContents === null) {
        expansionStateRef.current.set(itemId, 'error')
        return
      }
      const fileDiff = processFile(meta.patchText, {
        cacheKey: `${owner}/${repo}/${pr.number}/${pr.head.sha}/${itemId}/full`,
        isGitDiff: true,
        oldFile: { name: oldPath, contents: oldContents },
        newFile: { name: newPath, contents: newContents }
      })
      if (!fileDiff || fileDiff.isPartial) {
        expansionStateRef.current.set(itemId, 'error')
        return
      }
      const live = viewer.getItem(itemId)
      if (!live || live.type !== 'diff') {
        expansionStateRef.current.set(itemId, 'error')
        return
      }
      live.fileDiff = fileDiff
      live.annotations = buildFileAnnotations(meta.filename, annotationInputsRef.current)
      live.version = typeof live.version === 'number' ? live.version + 1 : 1
      viewer.updateItem(live)
      annotationSigRef.current.set(itemId, annotationsSignature(live.annotations))
      expansionStateRef.current.set(itemId, 'done')
    }

    // Upgrade the file in view plus a small look-ahead, so bars are ready before
    // you reach them and short, fully-visible diffs light up without scrolling.
    for (let i = activeIndex; i < Math.min(activeIndex + 3, fileMetas.length); i++) {
      void upgrade(fileMetas[i])
    }
  }, [activeFilePath, fileMetas, owner, repo, pr.number, pr.base.sha, pr.head.sha])

  // Track the topmost visible file for the sidebar highlight. Throttled to one
  // computation per animation frame.
  const scrollRafRef = useRef<number | null>(null)
  const [handleViewerScroll] = useState(
    () =>
      (scrollTop: number, viewer: { getTopForItem(id: string): number | undefined }): void => {
        if (scrollRafRef.current != null) return
        scrollRafRef.current = window.requestAnimationFrame(() => {
          scrollRafRef.current = null
          const metas = fileMetaByItemId.current
          let current: string | null = null
          let currentTop = 0
          for (const [itemId, file] of metas) {
            const top = viewer.getTopForItem(itemId)
            if (top == null) continue
            if (top <= scrollTop + DIFF_HEADER_HEIGHT + 1) {
              current = file.filename
              currentTop = top
            } else break
          }
          if (current) {
            setActiveFilePath(current)
            // Remember the position relative to the topmost file's top, so the
            // restore survives the diff's heights changing as files expand.
            prScrollMemory.set(scrollKeyRef.current, { path: current, offset: scrollTop - currentTop })
          }
        })
      }
  )
  useEffect(
    () => () => {
      if (scrollRafRef.current != null) window.cancelAnimationFrame(scrollRafRef.current)
    },
    []
  )

  // A fresh request (new PR, new head SHA, retry) re-arms the one-shot restore.
  useEffect(() => {
    didRestoreScrollRef.current = false
  }, [viewerKey])

  // Restore the remembered scroll position once the diff is fully ready (a cache
  // hit makes this immediate). Only when still at the top, so we never yank a
  // reader who already started scrolling while the diff was still streaming.
  useEffect(() => {
    if (loadState !== 'ready' || didRestoreScrollRef.current) return
    didRestoreScrollRef.current = true
    const saved = prScrollMemory.get(scrollKeyRef.current)
    if (!saved) return
    if (scrollRef.current && scrollRef.current.scrollTop > 0) return
    const raf = window.requestAnimationFrame(() => {
      const viewer = viewerRef.current
      const itemId = itemIdByFilename.current.get(saved.path)
      if (!viewer || itemId == null) return
      viewer.scrollTo({ type: 'item', id: itemId, align: 'start' })
      if (saved.offset) {
        // Second frame: the item is now at the top, so nudge into it by the
        // remembered intra-file offset.
        window.requestAnimationFrame(() => {
          const el = scrollRef.current
          if (el) el.scrollTop = Math.max(0, el.scrollTop + saved.offset)
        })
      }
    })
    return () => window.cancelAnimationFrame(raf)
  }, [loadState, viewerKey])

  // Jump to a thread requested from the conversation tab. Self-heals through
  // the filter: if the file isn't in the current filter we clear it (the tree
  // narrows but the diff is always present in the viewer).
  useEffect(() => {
    if (!threadJumpTarget) return
    if (handledJumpNonceRef.current === threadJumpTarget.nonce) return
    const thread = threadsByCommentId.get(threadJumpTarget.commentId)
    const nextPath = thread?.path ?? threadJumpTarget.path
    handledJumpNonceRef.current = threadJumpTarget.nonce
    setActiveFilePath(nextPath)
    const itemId = itemIdByFilename.current.get(nextPath)
    const viewer = viewerRef.current
    if (itemId && viewer) {
      const item = viewer.getItem(itemId)
      if (item && item.type === 'diff' && item.collapsed) {
        item.collapsed = false
        item.version = typeof item.version === 'number' ? item.version + 1 : 1
        viewer.updateItem(item)
      }
      // Scroll to the commented line so the virtualizer mounts the annotation
      // card; the double-rAF below then centers the card itself.
      if (thread?.line != null && thread.side != null) {
        viewer.scrollTo({
          type: 'line',
          id: itemId,
          lineNumber: thread.line,
          side: thread.side === 'LEFT' ? 'deletions' : 'additions',
          align: 'center'
        })
      } else {
        viewer.scrollTo({ type: 'item', id: itemId, align: 'start' })
      }
    }
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        const threadElement = threadRefs.current.get(threadJumpTarget.commentId)
        threadElement?.scrollIntoView({ behavior: 'smooth', block: 'center' })
      })
    })
  }, [threadJumpTarget, threadsByCommentId])

  const [stableThreadRef] = useState(() => (commentId: number, element: HTMLElement | null): void => {
    if (element) threadRefs.current.set(commentId, element)
    else threadRefs.current.delete(commentId)
  })

  const [handleScrollToFile] = useState(() => (path: string): void => {
    setActiveFilePath(path)
    const itemId = itemIdByFilename.current.get(path)
    if (itemId) viewerRef.current?.scrollTo({ type: 'item', id: itemId, align: 'start' })
  })

  const [handleToggleFolder] = useState(() => (path: string): void => {
    setCollapsedFolders((prev) => {
      const next = new Set(prev)
      if (next.has(path)) next.delete(path)
      else next.add(path)
      return next
    })
  })

  const [handleToggleCollapse] = useState(() => (itemId: string): void => {
    const viewer = viewerRef.current
    const instance = viewer?.getInstance()
    const item = viewer?.getItem(itemId)
    if (!viewer || !instance || !item || item.type !== 'diff') return
    const itemTop = instance.getTopForItem(itemId)
    item.collapsed = item.collapsed !== true
    item.version = typeof item.version === 'number' ? item.version + 1 : 1
    if (!viewer.updateItem(item)) return
    // Keep a collapsing file anchored if its top scrolled above the viewport.
    if (itemTop != null && itemTop < instance.getScrollTop()) {
      viewer.scrollTo({ type: 'item', id: itemId, align: 'start' })
    }
  })

  // Toggle a file's "viewed" mark. Marking viewed collapses the diff (and keeps
  // a file anchored if it collapsed above the viewport); unmarking expands it.
  const [handleToggleViewed] = useState(() => (itemId: string, filename: string): void => {
    const willView = !viewedFilesRef.current.has(filename)
    const next = new Set(viewedFilesRef.current)
    if (willView) next.add(filename)
    else next.delete(filename)
    // Update the ref synchronously so the header Pierre re-renders below (via
    // updateItem) reads the fresh viewed state; setViewedFiles re-renders the
    // sidebar progress.
    viewedFilesRef.current = next
    setViewedFiles(next)
    const viewer = viewerRef.current
    const instance = viewer?.getInstance()
    const item = viewer?.getItem(itemId)
    if (!viewer || !instance || !item || item.type !== 'diff') return
    const itemTop = instance.getTopForItem(itemId)
    item.collapsed = willView
    item.version = typeof item.version === 'number' ? item.version + 1 : 1
    if (!viewer.updateItem(item)) return
    if (willView && itemTop != null && itemTop < instance.getScrollTop()) {
      viewer.scrollTo({ type: 'item', id: itemId, align: 'start' })
    }
  })

  const [handleOpenPrFile] = useState(() => (file: PrDiffFileMeta): void => {
    const ctx = fileOpenCtxRef.current
    ctx.onOpenPullRequestFile({
      owner: ctx.owner,
      repo: ctx.repo,
      number: ctx.number,
      path: file.filename,
      ref: ctx.headSha
    })
  })

  const [stableGutterClick] = useState(
    () =>
      (range: { start: number; side?: 'deletions' | 'additions' }, context: { item: { id: string } }): void => {
        const side: PullRequestReviewLineSide = range.side === 'deletions' ? 'LEFT' : 'RIGHT'
        const filename = fileMetaByItemId.current.get(context.item.id)?.filename ?? context.item.id
        const rowKey = `${filename}::${side}::${range.start}`
        setOpenCommentKey((prev) => (prev === rowKey ? null : rowKey))
      }
  )

  // Identity-stable handlers so the render callbacks never go stale while
  // staying referentially constant for the CodeView options object.
  const [stableHandlers] = useState(() => ({
    onAskClaude: async (
      prompt: string,
      filePath: string,
      lineNumber: number,
      lineContent: string,
      side: PullRequestReviewLineSide
    ) => {
      await renderCtxRef.current.onAskClaude?.(prompt, filePath, lineNumber, lineContent, side)
    },
    onFixWithClaude: async (input: FixWithClaudeInput) => {
      await renderCtxRef.current.onFixWithClaude?.(input)
    },
    onContinueAgent: async (sessionId: string, prompt: string, files?: string[]) => {
      await renderCtxRef.current.onContinueAgent?.(sessionId, prompt, files)
    },
    onStopAgent: async (sessionId: string) => {
      await renderCtxRef.current.onStopAgent?.(sessionId)
    },
    onPromoteAgent: (sessionId: string) => {
      renderCtxRef.current.onPromoteAgent?.(sessionId)
    },
    onAddDraftComment: (comment: PullRequestReviewDraftComment) => {
      const ctx = renderCtxRef.current
      ctx.onDraftReviewCommentsChange([...ctx.draftReviewComments, comment])
      setOpenCommentKey(null)
    },
    onRemoveDraftComment: (index: number) => {
      const ctx = renderCtxRef.current
      ctx.onDraftReviewCommentsChange(ctx.draftReviewComments.filter((_comment, i) => i !== index))
    },
    onInlineCommentPosted: async () => {
      const ctx = renderCtxRef.current
      setOpenCommentKey(null)
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: ['pull-request-review-comments', ctx.owner, ctx.repo, ctx.number]
        }),
        queryClient.invalidateQueries({
          queryKey: ['pull-request-reviews', ctx.owner, ctx.repo, ctx.number]
        })
      ])
    }
  }))

  // renderAnnotation: stable closure reading the latest context via refs.
  const [renderAnnotation] = useState(
    () =>
      (annotation: DiffLineAnnotation<InlineAnnotationMeta>, item: DiffItem): ReactNode => {
        const meta = annotation.metadata
        if (!meta) return null
        const ctx = renderCtxRef.current
        const filename = fileMetaByItemId.current.get(item.id)?.filename ?? item.id
        const replyTarget = { owner: ctx.owner, repo: ctx.repo, number: ctx.number }

        if (meta.kind === 'thread') {
          return (
            <AnnotationWrapper side={annotation.side} elementRef={(el) => stableThreadRef(meta.thread.id, el)}>
              <InlineDiffThread
                thread={meta.thread}
                replyTarget={replyTarget}
                onFixWithClaude={stableHandlers.onFixWithClaude}
                agentSessions={ctx.agentSessions}
                onStopAgent={stableHandlers.onStopAgent}
                onContinueAgent={stableHandlers.onContinueAgent}
                onPromoteAgent={stableHandlers.onPromoteAgent}
              />
            </AnnotationWrapper>
          )
        }
        if (meta.kind === 'draft') {
          return (
            <AnnotationWrapper side={annotation.side}>
              <DraftCommentCard
                comment={meta.draft.comment}
                auth={ctx.auth}
                onRemove={() => stableHandlers.onRemoveDraftComment(meta.draft.index)}
              />
            </AnnotationWrapper>
          )
        }
        if (meta.kind === 'agent') {
          return (
            <AnnotationWrapper side={annotation.side}>
              <InlineAgentResponseCard
                session={meta.session}
                onStop={() => stableHandlers.onStopAgent(meta.session.id)}
                onContinue={(prompt) => stableHandlers.onContinueAgent(meta.session.id, prompt)}
                onOpenInChat={() => stableHandlers.onPromoteAgent(meta.session.id)}
                compact
              />
            </AnnotationWrapper>
          )
        }
        return (
          <AnnotationWrapper side={annotation.side}>
            <InlineDiffCommentComposer
              owner={ctx.owner}
              repo={ctx.repo}
              number={ctx.number}
              commitId={ctx.commitId}
              path={filename}
              line={meta.line}
              lineContent={meta.lineContent}
              side={meta.side}
              onCancel={() => setOpenCommentKey(null)}
              onAddDraftComment={stableHandlers.onAddDraftComment}
              onInlineCommentPosted={stableHandlers.onInlineCommentPosted}
              onAskClaude={stableHandlers.onAskClaude}
            />
          </AnnotationWrapper>
        )
      }
  )

  const [renderFileHeader] = useState(() => (item: DiffItem): ReactNode => {
    const file = fileMetaByItemId.current.get(item.id)
    if (!file) return null
    return (
      <FileDiffHeader
        file={file}
        collapsed={item.collapsed === true}
        viewed={viewedFilesRef.current.has(file.filename)}
        onToggleCollapse={() => handleToggleCollapse(item.id)}
        onToggleViewed={() => handleToggleViewed(item.id, file.filename)}
        onOpenFile={() => handleOpenPrFile(file)}
      />
    )
  })

  const diffStyle = settings.diffViewMode === 'split' ? 'split' : 'unified'
  const overflow = settings.diffWordWrap ? 'wrap' : 'scroll'
  const collapseMode = settings.diffCollapsed ? 'collapsed' : 'expanded'

  // Count only viewed files that still exist in the diff (intersect with the
  // loaded files) so the progress denominator stays honest.
  let viewedCount = 0
  for (const file of fileMetas) if (viewedFiles.has(file.filename)) viewedCount++

  // Expand/collapse every loaded file and persist the new default.
  const handleToggleCollapseMode = (): void => {
    const collapsed = !settings.diffCollapsed
    updateSettings({ diffCollapsed: collapsed })
    const viewer = viewerRef.current
    if (!viewer) return
    for (const file of fileMetas) {
      const item = viewer.getItem(file.itemId)
      if (!item || item.type !== 'diff' || (item.collapsed === true) === collapsed) continue
      item.collapsed = collapsed
      item.version = typeof item.version === 'number' ? item.version + 1 : 1
      viewer.updateItem(item)
    }
  }

  // Jump from the Comments tab to a thread's anchor in the viewer. Scroll to the
  // commented line first (not just the file top) so the virtualizer renders that
  // region and mounts the annotation card; the double-rAF below then centers the
  // card itself, which sits below the anchored line.
  const handleSelectThread = (thread: PullRequestReviewThread): void => {
    setActiveFilePath(thread.path)
    const itemId = itemIdByFilename.current.get(thread.path)
    const viewer = viewerRef.current
    if (itemId && viewer) {
      const item = viewer.getItem(itemId)
      if (item && item.type === 'diff' && item.collapsed) {
        item.collapsed = false
        item.version = typeof item.version === 'number' ? item.version + 1 : 1
        viewer.updateItem(item)
      }
      if (thread.line != null && thread.side != null) {
        viewer.scrollTo({
          type: 'line',
          id: itemId,
          lineNumber: thread.line,
          side: thread.side === 'LEFT' ? 'deletions' : 'additions',
          align: 'center'
        })
      } else {
        viewer.scrollTo({ type: 'item', id: itemId, align: 'start' })
      }
    }
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        threadRefs.current.get(thread.topLevelComment.id)?.scrollIntoView({ behavior: 'smooth', block: 'center' })
      })
    })
  }

  // Options identity is only refreshed when values Pierre actually reads change,
  // so unrelated re-renders don't invalidate the viewer's shadow-DOM hydration.
  const optionsRef = useRef<{
    key: string
    value: React.ComponentProps<typeof CodeView<InlineAnnotationMeta>>['options']
  } | null>(null)
  const optionsKey = `${theme}|${diffStyle}|${overflow}|${settings.diffIndicators}|${settings.diffLineNumbers ? '1' : '0'}`
  if (!optionsRef.current || optionsRef.current.key !== optionsKey) {
    optionsRef.current = {
      key: optionsKey,
      value: {
        ...BASE_DIFF_OPTIONS,
        themeType: theme,
        diffStyle,
        overflow,
        diffIndicators: settings.diffIndicators,
        disableLineNumbers: !settings.diffLineNumbers,
        stickyHeaders: true,
        // Collapse unchanged runs into expandable "N unmodified lines" bars
        // (keeping GitHub's 3 lines of context around each change) rather than
        // dumping the whole file. The bars only become *clickable* once a file
        // is upgraded to a non-partial diff — see useExpandableDiffOnView.
        expandUnchanged: false,
        collapsedContextThreshold: 3,
        enableGutterUtility: true,
        onGutterUtilityClick: stableGutterClick
      }
    }
  }

  // Gate the viewer on the worker pool being ready AND the first streamed batch
  // existing (the CodeView's initialItems only seed at mount). Until then the
  // status panel covers the whole content area. Mirrors diffshub's ReviewUI.
  const showViewer = workerReady && (loadState === 'ready' || (loadState === 'streaming' && initialItems.length > 0))

  // The grid lives inside the page's scrolling <main> (p-5), below a
  // variable-height PR header, so a hardcoded viewport calc is always slightly
  // off. Measure the grid's top instead and fill to the viewport bottom so the
  // sidebar footer pins correctly regardless of the header height.
  const gridRef = useRef<HTMLDivElement>(null)
  const [gridHeight, setGridHeight] = useState<number | null>(null)
  useLayoutEffect(() => {
    const element = gridRef.current
    if (!element) return
    const measure = (): void => {
      const top = element.getBoundingClientRect().top
      // 20px = the <main> scroll container's bottom padding (p-5).
      setGridHeight(Math.max(240, Math.round(window.innerHeight - top - 20)))
    }
    measure()
    window.addEventListener('resize', measure)
    return () => window.removeEventListener('resize', measure)
  }, [])

  return (
    <>
      <div
        ref={gridRef}
        style={gridHeight != null ? { height: gridHeight } : undefined}
        className="flex h-[calc(100vh-12rem)] min-h-0 overflow-hidden"
      >
        {showViewer ? (
          <>
            <DiffSidebar
              className="flex w-[280px] shrink-0"
              sidebarTab={sidebarTab}
              onSidebarTabChange={setSidebarTab}
              filterValue={filterValue}
              onFilterChange={setFilterValue}
              fileTree={fileTree}
              activeFilePath={activeFilePath}
              commentCountsByFile={commentCountsByFile}
              collapsedFolders={collapsedFolders}
              onToggleFolder={handleToggleFolder}
              onSelectFile={handleScrollToFile}
              threads={groupings.reviewThreads}
              onSelectThread={handleSelectThread}
              diffStats={diffStats}
              streaming={loadState === 'streaming'}
              viewedCount={viewedCount}
              totalCount={fileMetas.length}
              draftCount={draftReviewComments.length}
              onSubmitReview={() => setIsSubmitReviewOpen(true)}
              hasFiles={filteredFiles.length > 0}
              trimmedFilter={trimmedFilter}
              diffStyle={diffStyle}
              collapseMode={collapseMode}
              settings={settings}
              updateSettings={updateSettings}
              onToggleCollapseMode={handleToggleCollapseMode}
            />
            <CodeView<InlineAnnotationMeta>
              key={viewerKey}
              ref={viewerRef}
              containerRef={scrollRef}
              initialItems={initialItems}
              options={optionsRef.current.value}
              renderAnnotation={renderAnnotation}
              renderCustomHeader={renderFileHeader}
              onScroll={handleViewerScroll}
              className="bg-background relative h-full min-h-0 w-full flex-1 overflow-x-clip overflow-y-auto [overflow-anchor:none]"
            />
          </>
        ) : (
          <DiffStatusPanel
            className="flex-1"
            state={loadState}
            workerReady={workerReady}
            errorMessage={errorMessage}
            onRetry={retry}
          />
        )}
      </div>

      <SubmitReviewDialog
        open={isSubmitReviewOpen}
        draftReviewComments={draftReviewComments}
        owner={owner}
        repo={repo}
        number={pr.number}
        commitId={pr.head.sha}
        onClose={() => setIsSubmitReviewOpen(false)}
        onSubmitted={async () => {
          onDraftReviewCommentsChange([])
          setIsSubmitReviewOpen(false)
          await Promise.all([
            queryClient.invalidateQueries({ queryKey: ['pull-request-review-comments', owner, repo, pr.number] }),
            queryClient.invalidateQueries({ queryKey: ['pull-request-reviews', owner, repo, pr.number] })
          ])
        }}
      />
    </>
  )
}

// ============================================================
// ReviewUI chrome — grid, toolbar, sidebar, status panel.
// Adapted from pierre's diffshub ReviewUI / DiffsHubHeader / DiffsHubSidebar
// using our stack (lucide icons, our file tree, global theme, GitHub threads).
// ============================================================

// Gate the viewer on the diffs worker pool being initialized so the first files
// don't render before highlighting is ready. Ported from diffshub's
// useIsWorkerPoolReadyOrDisabled — returns true when there is no pool.
const WORKER_READY_TIMEOUT_MS = 4000

function useWorkerReady(): boolean {
  const workerPool = useWorkerPool()
  const [isReady, setIsReady] = useState(() => workerPool?.isInitialized() ?? true)
  const isReadyRef = useRef(isReady)
  const markReady = (ready: boolean): void => {
    if (ready !== isReadyRef.current) {
      setIsReady(ready)
      isReadyRef.current = ready
    }
  }
  useEffect(() => {
    if (workerPool == null) return
    // Don't trap the viewer behind a pool that never initializes (e.g. a worker
    // that failed to load) — proceed after a short grace period regardless.
    const timeout = window.setTimeout(() => markReady(true), WORKER_READY_TIMEOUT_MS)
    const unsubscribe = workerPool.subscribeToStatChanges((stats) => {
      if (stats.managerState === 'initialized') markReady(true)
    })
    return () => {
      window.clearTimeout(timeout)
      unsubscribe()
    }
  }, [workerPool])
  return isReady
}

function ToolbarButton({
  active,
  title,
  onClick,
  children
}: {
  active?: boolean
  title: string
  onClick: () => void
  children: ReactNode
}) {
  return (
    <Tooltip label={title} side="bottom">
      <button
        type="button"
        aria-pressed={active}
        onClick={onClick}
        className={cn(
          'flex size-7 items-center justify-center rounded-md transition-colors',
          active
            ? 'bg-interactive text-foreground'
            : 'text-foreground-subtle hover:bg-surface-hover hover:text-foreground'
        )}
      >
        {children}
      </button>
    </Tooltip>
  )
}

const INDICATOR_OPTIONS: { value: DiffIndicatorStyle; label: string; icon: ReactNode }[] = [
  { value: 'bars', label: 'Bars', icon: <AlignJustify size={13} /> },
  { value: 'classic', label: 'Classic', icon: <GitCompare size={13} /> },
  { value: 'none', label: 'None', icon: <EyeOff size={13} /> }
]

function DisplaySettingsMenu({
  settings,
  updateSettings
}: {
  settings: UserSettings
  updateSettings: (patch: Partial<UserSettings>) => void
}) {
  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <button
          type="button"
          aria-label="Display settings"
          className="text-foreground-subtle hover:bg-surface-hover hover:text-foreground flex size-7 items-center justify-center rounded-md transition-colors"
        >
          <Settings2 size={15} />
        </button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Content align="end" className="w-56 p-1">
        <SettingToggleRow
          icon={<Hash size={14} />}
          label="Line numbers"
          checked={settings.diffLineNumbers}
          onToggle={() => updateSettings({ diffLineNumbers: !settings.diffLineNumbers })}
        />
        <SettingToggleRow
          icon={<WrapText size={14} />}
          label="Word wrap"
          checked={settings.diffWordWrap}
          onToggle={() => updateSettings({ diffWordWrap: !settings.diffWordWrap })}
        />
        <DropdownMenu.Separator />
        <DropdownMenu.Label>Indicators</DropdownMenu.Label>
        <div className="flex gap-1 px-2 pt-0.5 pb-1">
          {INDICATOR_OPTIONS.map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => updateSettings({ diffIndicators: option.value })}
              className={cn(
                'flex flex-1 items-center justify-center gap-1 rounded-md border px-2 py-1 text-[11px] font-medium transition-colors',
                settings.diffIndicators === option.value
                  ? 'border-accent bg-accent/10 text-foreground'
                  : 'border-border text-foreground-muted hover:bg-surface-hover'
              )}
            >
              {option.icon}
              {option.label}
            </button>
          ))}
        </div>
      </DropdownMenu.Content>
    </DropdownMenu.Root>
  )
}

function SettingToggleRow({
  icon,
  label,
  checked,
  onToggle
}: {
  icon: ReactNode
  label: string
  checked: boolean
  onToggle: () => void
}) {
  return (
    <DropdownMenu.Item
      className="justify-between gap-4"
      onSelect={(event) => {
        event.preventDefault()
        onToggle()
      }}
    >
      <span className="flex items-center gap-2">
        {icon}
        {label}
      </span>
      <span
        className={cn(
          'flex size-4 items-center justify-center rounded border',
          checked ? 'border-accent bg-accent text-accent-foreground' : 'border-border'
        )}
      >
        {checked ? <Check size={11} /> : null}
      </span>
    </DropdownMenu.Item>
  )
}

interface DiffSidebarProps {
  className?: string
  sidebarTab: 'files' | 'comments'
  onSidebarTabChange: (tab: 'files' | 'comments') => void
  filterValue: string
  onFilterChange: (value: string) => void
  fileTree: FileTreeNode[]
  activeFilePath: string | null
  commentCountsByFile: Map<string, number>
  collapsedFolders: Set<string>
  onToggleFolder: (path: string) => void
  onSelectFile: (path: string) => void
  threads: PullRequestReviewThread[]
  onSelectThread: (thread: PullRequestReviewThread) => void
  diffStats: PrDiffDiffStats | null
  streaming: boolean
  viewedCount: number
  totalCount: number
  draftCount: number
  onSubmitReview: () => void
  hasFiles: boolean
  trimmedFilter: string
  diffStyle: 'split' | 'unified'
  collapseMode: 'expanded' | 'collapsed'
  settings: UserSettings
  updateSettings: (patch: Partial<UserSettings>) => void
  onToggleCollapseMode: () => void
}

function DiffSidebar({
  className,
  sidebarTab,
  onSidebarTabChange,
  filterValue,
  onFilterChange,
  fileTree,
  activeFilePath,
  commentCountsByFile,
  collapsedFolders,
  onToggleFolder,
  onSelectFile,
  threads,
  onSelectThread,
  diffStats,
  streaming,
  viewedCount,
  totalCount,
  draftCount,
  onSubmitReview,
  hasFiles,
  trimmedFilter,
  diffStyle,
  collapseMode,
  settings,
  updateSettings,
  onToggleCollapseMode
}: DiffSidebarProps) {
  const visibleThreads = threads.filter((thread) => !thread.isOutdated)
  let totalComments = 0
  for (const thread of visibleThreads) totalComments += 1 + thread.replies.length

  return (
    <aside className={cn(className, 'border-border bg-surface h-full min-h-0 flex-col border-r')}>
      <div className="flex items-center gap-0.5 px-2 py-1.5">
        <SidebarTabButton active={sidebarTab === 'files'} label="Files" onClick={() => onSidebarTabChange('files')}>
          <ListTree size={15} />
        </SidebarTabButton>
        <SidebarTabButton
          active={sidebarTab === 'comments'}
          label="Comments"
          onClick={() => onSidebarTabChange('comments')}
        >
          <MessageSquare size={15} />
          {totalComments > 0 ? (
            <span className="bg-interactive text-foreground-muted inline-flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[10px] font-medium tabular-nums">
              {totalComments}
            </span>
          ) : null}
        </SidebarTabButton>
        <div className="ml-auto flex items-center gap-0.5">
          <ToolbarButton
            title={diffStyle === 'split' ? 'Unified view' : 'Split view'}
            onClick={() => updateSettings({ diffViewMode: diffStyle === 'split' ? 'unified' : 'split' })}
          >
            {diffStyle === 'split' ? <Columns2 size={15} /> : <Rows3 size={15} />}
          </ToolbarButton>
          <ToolbarButton
            title={collapseMode === 'expanded' ? 'Collapse all files' : 'Expand all files'}
            active={collapseMode === 'collapsed'}
            onClick={onToggleCollapseMode}
          >
            {collapseMode === 'expanded' ? <ChevronsDownUp size={15} /> : <ChevronsUpDown size={15} />}
          </ToolbarButton>
          <DisplaySettingsMenu settings={settings} updateSettings={updateSettings} />
        </div>
      </div>

      {sidebarTab === 'files' ? (
        <div className="flex items-center gap-2 px-2 pb-1.5">
          <Search size={14} className="text-foreground-subtle shrink-0" />
          <input
            value={filterValue}
            onChange={(event) => onFilterChange(event.target.value)}
            placeholder="Filter files..."
            className="text-foreground placeholder:text-foreground-subtle w-full bg-transparent text-sm focus:outline-none"
          />
          {filterValue ? (
            <button
              type="button"
              onClick={() => onFilterChange('')}
              className="text-foreground-subtle hover:text-foreground shrink-0"
              aria-label="Clear filter"
            >
              <X size={14} />
            </button>
          ) : null}
        </div>
      ) : null}

      <div className="min-h-0 flex-1 overflow-y-auto">
        {sidebarTab === 'files' ? (
          !hasFiles ? (
            <div className="text-foreground-muted px-3 py-4 text-xs">
              {trimmedFilter ? 'No files match this filter.' : 'No changed files.'}
            </div>
          ) : (
            <FileTree
              tree={fileTree}
              activeFilePath={activeFilePath}
              commentCountsByFile={commentCountsByFile}
              collapsedFolders={collapsedFolders}
              onToggleFolder={onToggleFolder}
              onSelectFile={onSelectFile}
            />
          )
        ) : (
          <ThreadsList threads={visibleThreads} onSelect={onSelectThread} />
        )}
      </div>

      <DiffStatsPanel stats={diffStats} streaming={streaming} viewedCount={viewedCount} totalCount={totalCount} />

      {draftCount > 0 ? (
        <div className="border-border border-t p-2">
          <button
            type="button"
            onClick={onSubmitReview}
            className="bg-accent text-accent-foreground hover:bg-accent-hover w-full rounded-md px-3 py-1.5 text-xs font-medium tabular-nums transition-[background-color,color,transform] active:scale-[0.96]"
          >
            Submit review ({draftCount})
          </button>
        </div>
      ) : null}
    </aside>
  )
}

function SidebarTabButton({
  active,
  label,
  onClick,
  children
}: {
  active: boolean
  label: string
  onClick: () => void
  children: ReactNode
}) {
  return (
    <Tooltip label={label} side="bottom">
      <button
        type="button"
        onClick={onClick}
        aria-pressed={active}
        aria-label={label}
        className={cn(
          'flex h-7 items-center gap-1 rounded-md px-1.5 transition-colors',
          active
            ? 'bg-interactive text-foreground'
            : 'text-foreground-muted hover:bg-surface-hover hover:text-foreground'
        )}
      >
        {children}
      </button>
    </Tooltip>
  )
}

function ThreadsList({
  threads,
  onSelect
}: {
  threads: PullRequestReviewThread[]
  onSelect: (thread: PullRequestReviewThread) => void
}) {
  if (threads.length === 0) {
    return <div className="text-foreground-muted px-3 py-4 text-xs">No review comments yet.</div>
  }
  return (
    <ul className="flex flex-col py-1">
      {threads.map((thread) => {
        const name = thread.path.split('/').pop() ?? thread.path
        return (
          <li key={thread.topLevelComment.id}>
            <button
              type="button"
              onClick={() => onSelect(thread)}
              className="hover:bg-surface-hover flex w-full flex-col gap-1 px-3 py-2 text-left transition-colors"
            >
              <div className="flex items-center gap-2">
                <img src={thread.topLevelComment.user.avatar_url} alt="" className="size-4 shrink-0 rounded-full" />
                <span className="text-foreground min-w-0 flex-1 truncate text-xs font-medium">
                  {thread.topLevelComment.user.login}
                </span>
                {thread.isResolved ? (
                  <span className="text-success bg-success/10 rounded px-1 text-[10px] font-medium">Resolved</span>
                ) : null}
              </div>
              <span className="text-foreground-muted line-clamp-2 text-xs">{thread.topLevelComment.body}</span>
              <span className="text-foreground-subtle flex items-center gap-1 text-[11px]">
                <span className="min-w-0 truncate">
                  {name}
                  {thread.line != null ? `:${thread.line}` : ''}
                </span>
                {thread.replies.length > 0 ? (
                  <span className="ml-auto flex shrink-0 items-center gap-0.5">
                    <MessageSquare size={11} />
                    {thread.replies.length}
                  </span>
                ) : null}
              </span>
            </button>
          </li>
        )
      })}
    </ul>
  )
}

function DiffStatsPanel({
  stats,
  streaming,
  viewedCount,
  totalCount
}: {
  stats: PrDiffDiffStats | null
  streaming: boolean
  viewedCount: number
  totalCount: number
}) {
  if (!stats) return null
  return (
    <div className="border-border text-foreground-muted flex items-center gap-3 border-t px-3 py-2 text-xs tabular-nums">
      <span className="inline-flex items-center gap-1">
        <FileDiff size={13} className="text-foreground-subtle" />
        {stats.fileCount}
      </span>
      <span className="text-success">+{stats.additions}</span>
      <span className="text-danger">-{stats.deletions}</span>
      {streaming ? (
        <span className="border-border text-foreground-subtle ml-auto rounded-full border px-1.5 py-0.5 text-[10px] tracking-wide uppercase">
          streaming
        </span>
      ) : totalCount > 0 ? (
        <ViewedProgress viewedCount={viewedCount} totalCount={totalCount} />
      ) : null}
    </div>
  )
}

// Compact "N / M viewed" readout. The ring fill is animated as files are marked
// viewed (the conic stop transitions via the registered --viewed-progress
// property); once everything's reviewed the fill turns success-green and a check
// crossfades into the center.
function ViewedProgress({ viewedCount, totalCount }: { viewedCount: number; totalCount: number }) {
  const complete = viewedCount === totalCount
  const pct = totalCount > 0 ? Math.round((viewedCount / totalCount) * 100) : 0
  return (
    <Tooltip label={complete ? 'All files viewed' : `${viewedCount} of ${totalCount} files viewed`} side="top">
      <span className="ml-auto inline-flex items-center gap-1.5">
        <span
          className="viewed-progress-ring relative size-3.5 shrink-0 rounded-full"
          style={
            {
              '--viewed-progress': `${pct}%`,
              '--viewed-progress-fill': complete ? 'var(--color-success)' : 'var(--color-accent)'
            } as React.CSSProperties
          }
        >
          <span className="bg-surface absolute inset-[2.5px] rounded-full" />
          <Check
            size={9}
            strokeWidth={3}
            className={cn(
              'text-success absolute inset-0 m-auto transition-[opacity,scale,filter] duration-300 ease-[cubic-bezier(0.2,0,0,1)]',
              complete ? 'blur-0 scale-100 opacity-100' : 'scale-[0.25] opacity-0 blur-[4px]'
            )}
          />
        </span>
        <span className={cn(complete ? 'text-success' : 'text-foreground-subtle')}>
          <span className={cn('font-medium', complete ? 'text-success' : 'text-foreground')}>{viewedCount}</span> /{' '}
          {totalCount} viewed
        </span>
      </span>
    </Tooltip>
  )
}

function DiffStatusPanel({
  className,
  state,
  workerReady,
  errorMessage,
  onRetry
}: {
  className?: string
  state: PrDiffLoadState
  workerReady: boolean
  errorMessage: string | null
  onRetry: () => void
}) {
  const isError = state === 'error'
  const title = isError ? 'Couldn’t load diff' : !workerReady ? 'Preparing highlighter' : 'Loading diff'
  const message = isError
    ? (errorMessage ?? 'Failed to fetch the diff. Try again.')
    : !workerReady
      ? 'Starting the syntax highlighter…'
      : 'Reading the patch and showing files as they arrive…'
  return (
    <div className={cn('bg-background flex min-h-0 items-center justify-center p-6', className)}>
      <div role={isError ? 'alert' : 'status'} aria-live="polite" className="w-full max-w-md text-center">
        {isError ? (
          <TriangleAlert aria-hidden className="text-foreground-subtle mx-auto mb-3 size-5" />
        ) : (
          <div className="mb-3 flex justify-center">
            <LoadingIndicator size="lg" />
          </div>
        )}
        <h2 className="text-foreground text-sm font-medium">{title}</h2>
        <p className="text-foreground-muted mt-1 text-sm text-pretty">{message}</p>
        {isError ? (
          <button
            type="button"
            onClick={onRetry}
            className="border-border bg-interactive text-foreground hover:bg-interactive-hover mt-4 rounded-md border px-3 py-1.5 text-xs font-medium transition-colors"
          >
            Try again
          </button>
        ) : null}
      </div>
    </div>
  )
}

function FileDiffHeader({
  file,
  collapsed,
  viewed,
  onToggleCollapse,
  onToggleViewed,
  onOpenFile
}: {
  file: PrDiffFileMeta
  collapsed: boolean
  viewed: boolean
  onToggleCollapse: () => void
  onToggleViewed: () => void
  onOpenFile: () => void
}) {
  const { copied: pathCopied, copy: copyPath } = useCopyToClipboard()
  const handleCopyPath = (): void => copyPath(file.filename)

  return (
    <div className="bg-surface flex h-11 items-center gap-2 px-3">
      <button
        type="button"
        onClick={onToggleCollapse}
        className="text-foreground-subtle hover:bg-interactive hover:text-foreground flex size-5 shrink-0 items-center justify-center rounded transition-colors"
        aria-label={collapsed ? 'Expand file' : 'Collapse file'}
      >
        {collapsed ? <ChevronRight size={14} /> : <ChevronDown size={14} />}
      </button>
      <FileStatusIcon status={file.status} />
      <FileHeaderName name={file.filename} previousName={file.previousFilename} />
      <Tooltip label={pathCopied ? 'Copied' : 'Copy file path'} side="top">
        <button
          type="button"
          onClick={handleCopyPath}
          className="text-foreground-subtle hover:bg-interactive hover:text-foreground flex size-5 shrink-0 items-center justify-center rounded transition-colors"
          aria-label="Copy file path"
        >
          {pathCopied ? <Check size={13} className="text-success" /> : <Copy size={13} />}
        </button>
      </Tooltip>
      <div className="ml-auto flex shrink-0 items-center gap-2">
        <DiffStat additions={file.additions} deletions={file.deletions} />
        <button
          type="button"
          onClick={onToggleViewed}
          aria-pressed={viewed}
          className={cn(
            'inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-xs font-medium transition-[background-color,color,border-color,transform] active:scale-[0.96]',
            viewed
              ? 'border-accent/40 bg-accent/10 text-foreground'
              : 'border-border bg-interactive text-foreground-muted hover:bg-interactive-hover hover:text-foreground'
          )}
        >
          <span
            className={cn(
              'flex size-3.5 items-center justify-center rounded border transition-colors',
              viewed ? 'border-accent bg-accent text-accent-foreground' : 'border-border'
            )}
          >
            {viewed ? <Check size={10} strokeWidth={3} className="animate-check-in" /> : null}
          </span>
          Viewed
        </button>
        <button
          type="button"
          onClick={onOpenFile}
          className="border-border bg-interactive text-foreground hover:bg-interactive-hover inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs font-medium transition-[background-color,color,transform] active:scale-[0.96]"
        >
          <FileText size={12} />
          View
        </button>
      </div>
    </div>
  )
}

function DraftCommentCard({
  comment,
  auth,
  onRemove
}: {
  comment: PullRequestReviewDraftComment
  auth: AuthData | null | undefined
  onRemove: () => void
}) {
  const body = comment.body.trim()
  return (
    <div className={cn(ANNOTATION_CARD, 'border-accent/30')}>
      <div className="border-border flex items-center gap-2 border-b px-3 py-2">
        {auth?.user.avatar_url ? (
          <img
            src={auth.user.avatar_url}
            alt={auth.user.login}
            className="size-6 shrink-0 rounded-full outline outline-black/10 dark:outline-white/10"
          />
        ) : null}
        <span className="text-foreground truncate text-xs font-semibold">{auth?.user.login ?? 'You'}</span>
        <span className="bg-accent-bg text-accent shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium">
          Pending
        </span>
        <button
          type="button"
          onClick={onRemove}
          className="text-foreground-subtle hover:bg-interactive hover:text-foreground ml-auto inline-flex size-7 shrink-0 items-center justify-center rounded-md transition active:scale-[0.96]"
          aria-label="Remove draft comment"
        >
          <X size={14} />
        </button>
      </div>
      <div className="px-3 py-3">
        {body ? (
          <MarkdownBody compact>{comment.body}</MarkdownBody>
        ) : (
          <p className="text-foreground-subtle text-xs italic">No comment body.</p>
        )}
      </div>
    </div>
  )
}

// First non-empty line of a comment body, lightly de-marked, for collapsed
// thread previews.
function firstCommentLine(text: string): string {
  const line = text.split('\n').find((entry) => entry.trim().length > 0) ?? ''
  return line
    .replace(/^#+\s*/, '')
    .replace(/[*_`>#~]/g, '')
    .trim()
}

// A single comment within a thread. The top-level comment and replies share
// this body but differ in chrome (avatar size / density) so the hierarchy reads
// clearly; replies are additionally nested under a connector rail by the parent.
function ThreadComment({
  comment,
  thread,
  replyTarget,
  isReply,
  editingId,
  setEditingId,
  onQuoteReply,
  onFixWithClaude,
  sessions,
  onStopAgent,
  onContinueAgent,
  onPromoteAgent
}: {
  comment: PullRequestReviewComment
  thread: PullRequestReviewThread
  replyTarget: { owner: string; repo: string; number: number }
  isReply: boolean
  editingId: number | null
  setEditingId: (id: number | null) => void
  onQuoteReply: (quoted: string) => void
  onFixWithClaude?: (input: FixWithClaudeInput) => Promise<void>
  sessions: AgentSessionMeta[]
  onStopAgent?: (sessionId: string) => Promise<void>
  onContinueAgent?: (sessionId: string, prompt: string, files?: string[]) => Promise<void>
  onPromoteAgent?: (sessionId: string) => void
}) {
  const isTopLevel = comment.id === thread.topLevelComment.id
  const wasEdited = comment.updated_at !== comment.created_at
  const body = comment.body.trim()

  return (
    <div className={cn('px-3', isReply ? 'py-2.5' : 'py-3')}>
      <div className="flex items-center gap-2">
        <img
          src={comment.user.avatar_url}
          alt={comment.user.login}
          className={cn(
            'shrink-0 rounded-full outline outline-black/10 dark:outline-white/10',
            isReply ? 'size-5' : 'size-6'
          )}
        />
        <span className="text-foreground truncate text-xs font-semibold">{comment.user.login}</span>
        <span className="text-foreground-subtle shrink-0 text-xs tabular-nums">
          {formatRelativeTime(comment.created_at)}
        </span>
        {wasEdited ? <span className="text-foreground-subtle shrink-0 text-xs">· edited</span> : null}
        <div className="ml-auto shrink-0">
          <CommentActionsMenu
            owner={replyTarget.owner}
            repo={replyTarget.repo}
            number={replyTarget.number}
            commentType="pull-comment"
            commentId={comment.id}
            nodeId={comment.node_id}
            htmlUrl={comment.html_url}
            body={comment.body}
            authorLogin={comment.user.login}
            onStartEdit={() => setEditingId(comment.id)}
            onQuoteReply={onQuoteReply}
          />
        </div>
      </div>
      <div className="mt-1.5">
        {editingId === comment.id ? (
          <CommentBodyEditor
            owner={replyTarget.owner}
            repo={replyTarget.repo}
            number={replyTarget.number}
            commentType="pull-comment"
            commentId={comment.id}
            initialBody={comment.body}
            onCancel={() => setEditingId(null)}
            onSaved={() => setEditingId(null)}
          />
        ) : body ? (
          <MarkdownBody compact>{comment.body}</MarkdownBody>
        ) : (
          <p className="text-foreground-subtle text-xs italic">No comment body.</p>
        )}
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        <ReactionBar
          owner={replyTarget.owner}
          repo={replyTarget.repo}
          commentId={comment.id}
          commentType="pull-comment"
        />
        {onFixWithClaude ? (
          <FixWithClaudeButton
            onClick={() =>
              onFixWithClaude({
                commentId: comment.id,
                body: comment.body,
                author: comment.user.login,
                filePath: thread.path,
                line: thread.line,
                diffHunk: comment.diff_hunk
              })
            }
          />
        ) : null}
        {isTopLevel ? (
          <ResolveThreadButton
            threadId={thread.graphqlId}
            isResolved={thread.isResolved}
            owner={replyTarget.owner}
            repo={replyTarget.repo}
            number={replyTarget.number}
          />
        ) : null}
      </div>
      {sessions.map((session) => (
        <div key={session.id} className="border-border mt-2 border-t pt-2">
          <InlineAgentResponseCard
            session={session}
            variant="nested"
            onStop={() => onStopAgent?.(session.id)}
            onContinue={(prompt) => onContinueAgent?.(session.id, prompt)}
            onOpenInChat={() => onPromoteAgent?.(session.id)}
            compact
          />
          {session.status === 'completed' && isTopLevel && thread.graphqlId && !thread.isResolved ? (
            <div className="border-border bg-background mt-2 flex items-center justify-between gap-3 rounded-lg border px-3 py-2">
              <span className="text-foreground-muted text-xs">Claude is done. Mark resolved?</span>
              <ResolveThreadButton
                threadId={thread.graphqlId}
                isResolved={thread.isResolved}
                owner={replyTarget.owner}
                repo={replyTarget.repo}
                number={replyTarget.number}
                variant="solid"
              />
            </div>
          ) : null}
        </div>
      ))}
    </div>
  )
}

function InlineDiffThread({
  thread,
  replyTarget,
  onFixWithClaude,
  agentSessions,
  onStopAgent,
  onContinueAgent,
  onPromoteAgent
}: {
  thread: PullRequestReviewThread
  replyTarget: { owner: string; repo: string; number: number }
  onFixWithClaude?: (input: FixWithClaudeInput) => Promise<void>
  agentSessions?: AgentSessionMeta[]
  onStopAgent?: (sessionId: string) => Promise<void>
  onContinueAgent?: (sessionId: string, prompt: string, files?: string[]) => Promise<void>
  onPromoteAgent?: (sessionId: string) => void
}) {
  const [replyBody, setReplyBody] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [editingId, setEditingId] = useState<number | null>(null)
  // Resolved threads start collapsed to a one-line summary, expandable on click.
  const [collapsed, setCollapsed] = useState(thread.isResolved)
  const queryClient = useQueryClient()

  const handleReply = async (): Promise<void> => {
    if (!replyBody.trim() || isSubmitting) return
    setIsSubmitting(true)
    setErrorMessage(null)
    try {
      await window.api.github.pullComments.createReply(
        replyTarget.owner,
        replyTarget.repo,
        replyTarget.number,
        thread.topLevelComment.id,
        replyBody
      )
      setReplyBody('')
      await queryClient.invalidateQueries({
        queryKey: ['pull-request-review-comments', replyTarget.owner, replyTarget.repo, replyTarget.number]
      })
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Unable to reply.')
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleQuoteReply = (quoted: string): void => {
    setReplyBody((prev) => (prev ? `${prev}\n${quoted}` : quoted))
  }

  const sessionsByCommentId = (agentSessions ?? []).reduce<Map<number, AgentSessionMeta[]>>((acc, s) => {
    const id = s.context?.commentId
    if (id === undefined) return acc
    const existing = acc.get(id) ?? []
    existing.push(s)
    acc.set(id, existing)
    return acc
  }, new Map())

  const replyCount = thread.replies.length
  const commentCount = replyCount + 1

  if (collapsed) {
    const preview = firstCommentLine(thread.topLevelComment.body)
    return (
      <button
        type="button"
        onClick={() => setCollapsed(false)}
        className={cn(
          ANNOTATION_CARD,
          'hover:bg-surface-hover flex items-center gap-2 px-3 py-2.5 text-left transition-colors'
        )}
      >
        <CircleCheck size={15} className="text-success shrink-0" />
        <img
          src={thread.topLevelComment.user.avatar_url}
          alt={thread.topLevelComment.user.login}
          className="size-5 shrink-0 rounded-full outline outline-black/10 dark:outline-white/10"
        />
        <span className="text-foreground shrink-0 text-xs font-semibold">{thread.topLevelComment.user.login}</span>
        <span className="text-foreground-muted min-w-0 flex-1 truncate text-xs">
          {preview || 'Resolved conversation'}
        </span>
        <span className="text-foreground-subtle flex shrink-0 items-center gap-1 text-xs tabular-nums">
          <MessageSquare size={12} />
          {commentCount}
        </span>
        <ChevronDown size={14} className="text-foreground-subtle shrink-0" />
      </button>
    )
  }

  return (
    <div className={cn(ANNOTATION_CARD, thread.isResolved && 'border-success/40')}>
      <div className="border-border flex items-center gap-2 border-b px-3 py-2">
        {thread.isResolved ? (
          <span className="text-success inline-flex shrink-0 items-center gap-1 text-xs font-semibold">
            <CircleCheck size={13} /> Resolved
          </span>
        ) : (
          <span className="text-foreground-muted inline-flex shrink-0 items-center gap-1 text-xs font-medium">
            <MessageSquare size={13} /> Conversation
          </span>
        )}
        <span className="text-foreground-subtle shrink-0 text-xs tabular-nums">
          {commentCount} {commentCount === 1 ? 'comment' : 'comments'}
        </span>
        {thread.isResolved ? (
          <button
            type="button"
            onClick={() => setCollapsed(true)}
            className="text-foreground-subtle hover:text-foreground ml-auto inline-flex shrink-0 items-center gap-1 text-xs transition-colors"
          >
            Hide <ChevronsDownUp size={13} />
          </button>
        ) : null}
      </div>

      <ThreadComment
        comment={thread.topLevelComment}
        thread={thread}
        replyTarget={replyTarget}
        isReply={false}
        editingId={editingId}
        setEditingId={setEditingId}
        onQuoteReply={handleQuoteReply}
        onFixWithClaude={onFixWithClaude}
        sessions={sessionsByCommentId.get(thread.topLevelComment.id) ?? []}
        onStopAgent={onStopAgent}
        onContinueAgent={onContinueAgent}
        onPromoteAgent={onPromoteAgent}
      />

      {replyCount > 0 ? (
        <div className="border-border bg-background border-t">
          <div className="border-border/60 ml-5 border-l">
            {thread.replies.map((reply, index) => (
              <div key={reply.id} className={cn(index > 0 && 'border-border/50 border-t')}>
                <ThreadComment
                  comment={reply}
                  thread={thread}
                  replyTarget={replyTarget}
                  isReply
                  editingId={editingId}
                  setEditingId={setEditingId}
                  onQuoteReply={handleQuoteReply}
                  onFixWithClaude={onFixWithClaude}
                  sessions={sessionsByCommentId.get(reply.id) ?? []}
                  onStopAgent={onStopAgent}
                  onContinueAgent={onContinueAgent}
                  onPromoteAgent={onPromoteAgent}
                />
              </div>
            ))}
          </div>
        </div>
      ) : null}

      <div className="border-border bg-surface border-t p-3">
        <textarea
          value={replyBody}
          onChange={(e) => setReplyBody(e.target.value)}
          placeholder="Write a reply…"
          className="border-border bg-background text-foreground placeholder:text-foreground-subtle focus:border-accent w-full resize-none rounded-lg border px-3 py-2 text-xs transition-colors focus:outline-none"
          rows={replyBody.trim() ? 3 : 1}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
              e.preventDefault()
              handleReply()
            }
          }}
        />
        {errorMessage ? <p className="text-danger mt-1 text-xs">{errorMessage}</p> : null}
        {replyBody.trim() ? (
          <div className="mt-2 flex items-center justify-end gap-2">
            <span className="text-foreground-subtle mr-auto text-[11px]">⌘↵ to reply</span>
            <button
              type="button"
              onClick={handleReply}
              disabled={isSubmitting}
              className="bg-accent text-accent-foreground hover:bg-accent-hover rounded-md px-3 py-1.5 text-xs font-medium transition active:scale-[0.96] disabled:opacity-40"
            >
              {isSubmitting ? 'Replying…' : 'Reply'}
            </button>
          </div>
        ) : null}
      </div>
    </div>
  )
}

function InlineDiffCommentComposer({
  owner,
  repo,
  number,
  commitId,
  path,
  line,
  lineContent,
  side,
  onCancel,
  onAddDraftComment,
  onInlineCommentPosted,
  onAskClaude
}: {
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
}) {
  const [body, setBody] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const claudeMention = isClaudeMention(body)

  const handleAddSingleComment = async (): Promise<void> => {
    if (!body.trim() || isSubmitting) return
    if (claudeMention && onAskClaude) {
      const prompt = extractClaudePrompt(body)
      if (!prompt) return
      await onAskClaude(prompt, path, line, lineContent, side)
      setBody('')
      onCancel()
      return
    }
    setIsSubmitting(true)
    setErrorMessage(null)
    try {
      await window.api.github.pullComments.create(owner, repo, number, { body, commitId, path, line, side })
      setBody('')
      await onInlineCommentPosted()
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Unable to add review comment.')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className={ANNOTATION_CARD}>
      <div className="border-border text-foreground flex items-center gap-2 border-b px-4 py-2.5 text-sm font-medium">
        <MessageSquare size={14} className="text-foreground-subtle shrink-0" />
        <span className="truncate">
          Comment on {path}:<span className="tabular-nums">{line}</span>
        </span>
      </div>
      <ClaudeMentionTextarea
        value={body}
        onChange={setBody}
        placeholder="Leave a comment"
        className="min-h-28"
        menuLabel="Ask about this line"
        enabled={!!onAskClaude}
        onSubmit={() => void handleAddSingleComment()}
      />
      {errorMessage ? <p className="text-danger px-4 text-sm">{errorMessage}</p> : null}
      <div className="border-border flex flex-wrap items-center justify-between gap-3 border-t px-4 py-3">
        <p className="text-foreground-subtle text-xs">
          {claudeMention
            ? 'Claude will respond in the conversation tab with line context'
            : side === 'LEFT'
              ? 'Commenting on the deleted side'
              : 'Commenting on the updated side'}
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="border-border bg-interactive text-foreground hover:bg-interactive-hover rounded-md border px-3 py-1.5 text-xs font-medium transition active:scale-[0.96]"
          >
            Cancel
          </button>
          {!claudeMention && (
            <button
              type="button"
              onClick={() => {
                if (!body.trim()) return
                onAddDraftComment({ body, path, line, side })
                setBody('')
              }}
              disabled={!body.trim() || isSubmitting}
              className="border-border bg-interactive text-foreground hover:bg-interactive-hover rounded-md border px-3 py-1.5 text-xs font-medium transition active:scale-[0.96] disabled:cursor-not-allowed disabled:opacity-40"
            >
              Add to review
            </button>
          )}
          <button
            type="button"
            onClick={handleAddSingleComment}
            disabled={!body.trim() || isSubmitting}
            className="bg-accent text-accent-foreground hover:bg-accent-hover rounded-md px-3 py-1.5 text-xs font-medium transition active:scale-[0.96] disabled:cursor-not-allowed disabled:opacity-40"
          >
            {isSubmitting ? 'Adding…' : claudeMention ? 'Ask Claude' : 'Add comment'}
          </button>
        </div>
      </div>
    </div>
  )
}

function SubmitReviewDialog({
  open,
  draftReviewComments,
  owner,
  repo,
  number,
  commitId,
  onClose,
  onSubmitted
}: {
  open: boolean
  draftReviewComments: PullRequestReviewDraftComment[]
  owner: string
  repo: string
  number: number
  commitId: string
  onClose: () => void
  onSubmitted: () => Promise<void>
}) {
  const [body, setBody] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  useEffect(() => {
    if (!open) {
      setBody('')
      setErrorMessage(null)
      setIsSubmitting(false)
    }
  }, [open])

  if (!open) return null

  const handleSubmit = async (event: PullRequestReviewEvent): Promise<void> => {
    if (isSubmitting) return
    if ((event === 'COMMENT' || event === 'REQUEST_CHANGES') && !body.trim()) {
      setErrorMessage('Add a summary before submitting this review.')
      return
    }
    setIsSubmitting(true)
    setErrorMessage(null)
    try {
      await window.api.github.reviews.create(owner, repo, number, {
        commitId,
        body,
        event,
        comments: draftReviewComments
      })
      await onSubmitted()
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Unable to submit this review.')
      setIsSubmitting(false)
    }
  }

  return (
    <div className="bg-background/80 fixed inset-0 z-50 flex items-center justify-center px-4">
      <div className="border-border bg-surface w-full max-w-2xl rounded-2xl border shadow-2xl">
        <div className="border-border flex items-center justify-between gap-3 border-b px-5 py-4">
          <div>
            <h2 className="text-foreground text-lg font-semibold">Submit review</h2>
            <p className="text-foreground-muted mt-1 text-sm">
              {draftReviewComments.length} pending comment{draftReviewComments.length !== 1 ? 's' : ''}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-foreground-muted hover:bg-interactive hover:text-foreground inline-flex size-8 items-center justify-center rounded-md transition-colors"
            aria-label="Close review dialog"
          >
            <X size={16} />
          </button>
        </div>
        <div className="px-5 py-4">
          <textarea
            value={body}
            onChange={(event) => setBody(event.target.value)}
            placeholder="Write a summary of your review"
            className="border-border bg-background text-foreground placeholder:text-foreground-subtle min-h-36 w-full resize-y rounded-xl border px-4 py-3 text-sm focus:outline-none"
          />
          {errorMessage ? <p className="text-danger mt-3 text-sm">{errorMessage}</p> : null}
        </div>
        <div className="border-border flex flex-wrap items-center justify-between gap-3 border-t px-5 py-4">
          <p className="text-foreground-muted text-sm">Inline comments will be submitted with this review.</p>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="border-border bg-interactive text-foreground hover:bg-interactive-hover rounded-md border px-4 py-2 text-sm font-medium transition-colors"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => void handleSubmit('COMMENT')}
              disabled={isSubmitting}
              className="border-border bg-interactive text-accent-foreground hover:bg-interactive-hover rounded-md border px-4 py-2 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-40"
            >
              Comment
            </button>
            <button
              type="button"
              onClick={() => void handleSubmit('APPROVE')}
              disabled={isSubmitting}
              className="bg-success text-accent-foreground rounded-md px-4 py-2 text-sm font-medium transition-opacity disabled:cursor-not-allowed disabled:opacity-40"
            >
              Approve
            </button>
            <button
              type="button"
              onClick={() => void handleSubmit('REQUEST_CHANGES')}
              disabled={isSubmitting}
              className="bg-danger text-accent-foreground rounded-md px-4 py-2 text-sm font-medium transition-opacity disabled:cursor-not-allowed disabled:opacity-40"
            >
              Request changes
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

interface FileTreeNode {
  name: string
  path: string
  children: FileTreeNode[]
  file: PrDiffFileMeta | null
}

function buildFileTree(files: PrDiffFileMeta[]): FileTreeNode[] {
  const root: FileTreeNode = { name: '', path: '', children: [], file: null }
  for (const file of files) {
    const parts = file.filename.split('/')
    let current = root
    for (let i = 0; i < parts.length; i++) {
      const part = parts[i]!
      const isFile = i === parts.length - 1
      if (isFile) {
        current.children.push({ name: part, path: file.filename, children: [], file })
      } else {
        let folder = current.children.find((c) => c.file === null && c.name === part)
        if (!folder) {
          folder = { name: part, path: parts.slice(0, i + 1).join('/'), children: [], file: null }
          current.children.push(folder)
        }
        current = folder
      }
    }
  }
  return collapseSingleChildFolders(root.children)
}

function collapseSingleChildFolders(nodes: FileTreeNode[]): FileTreeNode[] {
  return nodes.map((node) => {
    if (node.file) return node
    let current = node
    const segments = [current.name]
    while (current.children.length === 1 && current.children[0]!.file === null) {
      current = current.children[0]!
      segments.push(current.name)
    }
    return { ...current, name: segments.join('/'), children: collapseSingleChildFolders(current.children) }
  })
}

type FileTreeRow =
  | { kind: 'folder'; depth: number; path: string; name: string }
  | { kind: 'file'; depth: number; path: string; file: PrDiffFileMeta }

function flattenFileTree(nodes: FileTreeNode[], collapsed: Set<string>, depth: number, out: FileTreeRow[]): void {
  for (const node of nodes) {
    if (node.file) {
      out.push({ kind: 'file', depth, path: node.path, file: node.file })
      continue
    }
    const isCollapsed = collapsed.has(node.path)
    out.push({ kind: 'folder', depth, path: node.path, name: node.name })
    if (!isCollapsed) flattenFileTree(node.children, collapsed, depth + 1, out)
  }
}

const FILE_TREE_ROW_STYLE: React.CSSProperties = {
  contentVisibility: 'auto',
  containIntrinsicSize: '0 22px'
}

function FileTree({
  tree,
  activeFilePath,
  commentCountsByFile,
  collapsedFolders,
  onToggleFolder,
  onSelectFile
}: {
  tree: FileTreeNode[]
  activeFilePath: string | null
  commentCountsByFile: Map<string, number>
  collapsedFolders: Set<string>
  onToggleFolder: (path: string) => void
  onSelectFile: (path: string) => void
}) {
  const rows: FileTreeRow[] = []
  flattenFileTree(tree, collapsedFolders, 0, rows)
  return (
    <div className="py-1">
      {rows.map((row) =>
        row.kind === 'folder' ? (
          <FileTreeFolderRow
            key={`folder:${row.path}`}
            depth={row.depth}
            name={row.name}
            path={row.path}
            isOpen={!collapsedFolders.has(row.path)}
            onToggle={onToggleFolder}
          />
        ) : (
          <FileTreeFileRow
            key={`file:${row.path}`}
            file={row.file}
            depth={row.depth}
            isActive={activeFilePath === row.path}
            commentCount={commentCountsByFile.get(row.path) ?? 0}
            onClick={onSelectFile}
          />
        )
      )}
    </div>
  )
}

const FileTreeFolderRow = memo(function FileTreeFolderRow({
  depth,
  name,
  path,
  isOpen,
  onToggle
}: {
  depth: number
  name: string
  path: string
  isOpen: boolean
  onToggle: (path: string) => void
}) {
  return (
    <div style={FILE_TREE_ROW_STYLE}>
      <button
        type="button"
        onClick={() => onToggle(path)}
        className="text-foreground hover:bg-surface-hover flex w-full items-center gap-1.5 py-1 text-left text-xs"
        style={{ paddingLeft: 8 + depth * 16 }}
      >
        <ChevronDown
          size={14}
          className={cn('text-foreground-subtle shrink-0 transition-transform', !isOpen && '-rotate-90')}
        />
        <FolderIcon name={name} open={isOpen} />
        <span className="truncate font-medium">{name}</span>
      </button>
    </div>
  )
})

const FileTreeFileRow = memo(function FileTreeFileRow({
  file,
  depth,
  isActive,
  commentCount,
  onClick
}: {
  file: PrDiffFileMeta
  depth: number
  isActive: boolean
  commentCount: number
  onClick: (path: string) => void
}) {
  const name = file.filename.split('/').pop() ?? file.filename
  return (
    <button
      type="button"
      onClick={() => onClick(file.filename)}
      style={{ paddingLeft: 8 + depth * 16 + 20, ...FILE_TREE_ROW_STYLE }}
      className={cn(
        'flex w-full items-center gap-1.5 py-1 pr-3 text-left text-xs transition-colors',
        isActive ? 'bg-surface-hover text-foreground' : 'text-foreground hover:bg-surface-hover'
      )}
    >
      <FileStatusIcon status={file.status} />
      <span className={cn('min-w-0 flex-1 truncate', fileStatusTextClass(file.status))}>{name}</span>
      {commentCount > 0 ? (
        <span className="text-foreground-subtle flex shrink-0 items-center gap-1">
          <MessageSquare size={12} />
          <span className="text-[11px]">{commentCount}</span>
        </span>
      ) : null}
    </button>
  )
})

// Distinct icon + token color per change status so the status reads at a glance
// — both in the file tree and at the top of each file in the diff. Each
// silhouette is deliberately different (plus / minus / pencil / arrow) so they
// stay distinguishable at small sizes and for color-blind users.
function FileStatusIcon({ status, size = 14 }: { status: string; size?: number }) {
  switch (status) {
    case 'added':
      return <FilePlus size={size} className="text-success shrink-0" aria-label="Added" />
    case 'removed':
      return <FileMinus size={size} className="text-danger shrink-0" aria-label="Removed" />
    case 'renamed':
      return <FileSymlink size={size} className="text-purple shrink-0" aria-label="Renamed or moved" />
    default:
      return <FilePen size={size} className="text-foreground-muted shrink-0" aria-label="Modified" />
  }
}

// Renders the filename in a file-content header. For a renamed/moved file (a
// previous path that differs from the current one) it shows `old → new` with an
// arrow, matching how GitHub renders moves; otherwise just the current path.
function FileHeaderName({ name, previousName }: { name: string; previousName?: string | null }) {
  if (previousName && previousName !== name) {
    return (
      <span className="flex min-w-0 items-center gap-1.5">
        <span className="text-foreground-muted min-w-0 truncate text-sm">{previousName}</span>
        <ArrowRight size={13} className="text-foreground-subtle shrink-0" />
        <span className="text-foreground min-w-0 truncate text-sm font-semibold">{name}</span>
      </span>
    )
  }
  return <span className="text-foreground min-w-0 truncate text-sm font-semibold">{name}</span>
}

// Tints a filename by its change status so the tree reads at a glance. Modified
// files keep the default foreground.
function fileStatusTextClass(status: string): string {
  switch (status) {
    case 'added':
      return 'text-success'
    case 'removed':
      return 'text-danger'
    case 'renamed':
      return 'text-purple'
    default:
      return ''
  }
}

interface ChangedFileDiffCardProps {
  owner: string
  repo: string
  number: number
  commitId: string
  file: PullRequestFile
  auth: AuthData | null | undefined
  fileThreads: readonly PullRequestReviewThread[]
  fileDrafts: readonly PreparedDraftEntry[]
  openCommentKey: string | null
  onOpenComment: (value: string | null) => void
  onAskClaude?: (
    prompt: string,
    filePath: string,
    lineNumber: number,
    lineContent: string,
    side: PullRequestReviewLineSide
  ) => Promise<void>
  onFixWithClaude?: (input: FixWithClaudeInput) => Promise<void>
  agentSessions: AgentSessionMeta[]
  fileInlineSessions: readonly AgentSessionMeta[]
  onContinueAgent?: (sessionId: string, prompt: string, files?: string[]) => Promise<void>
  onStopAgent?: (sessionId: string) => Promise<void>
  onPromoteAgent?: (sessionId: string) => void
  onAddDraftComment: (comment: PullRequestReviewDraftComment) => void
  onRemoveDraftComment: (index: number) => void
  onInlineCommentPosted: () => Promise<void>
  allowCommenting?: boolean
  threadRef: (commentId: number, element: HTMLElement | null) => void
}

/**
 * Standalone per-file diff card backed by a single `<PatchDiff>`. The streaming
 * PR Files tab renders into one shared `CodeView`, but the commit detail view
 * still renders an independent card per file, so this stays as a reusable unit.
 */
export const ChangedFileDiffCard = ChangedFileDiffCardInner

function ChangedFileDiffCardInner({
  owner,
  repo,
  number,
  commitId,
  file,
  auth,
  fileThreads,
  fileDrafts,
  openCommentKey,
  onOpenComment,
  onAskClaude,
  onFixWithClaude,
  agentSessions,
  fileInlineSessions,
  onContinueAgent,
  onStopAgent,
  onPromoteAgent,
  onAddDraftComment,
  onRemoveDraftComment,
  onInlineCommentPosted,
  allowCommenting = true,
  threadRef
}: ChangedFileDiffCardProps) {
  const { settings } = useSettings()
  const { theme } = useTheme()

  const [isCollapsed, setIsCollapsed] = useState(false)
  const { copied: pathCopied, copy: copyPath } = useCopyToClipboard()
  const handleCopyPath = (): void => copyPath(file.filename)

  const hasRenderablePatch = !!file.patch

  const replyTarget = { owner, repo, number }

  const anchoredAnnotations: DiffLineAnnotation<InlineAnnotationMeta>[] = []

  for (const thread of fileThreads) {
    if (thread.side == null || thread.line == null || thread.isOutdated) continue
    anchoredAnnotations.push({
      side: thread.side === 'LEFT' ? 'deletions' : 'additions',
      lineNumber: thread.line,
      metadata: { kind: 'thread', thread }
    })
  }

  for (const draft of fileDrafts) {
    anchoredAnnotations.push({
      side: draft.comment.side === 'LEFT' ? 'deletions' : 'additions',
      lineNumber: draft.comment.line,
      metadata: { kind: 'draft', draft }
    })
  }

  for (const session of fileInlineSessions) {
    const ctx = session.context
    if (!ctx || !ctx.inline || typeof ctx.lineNumber !== 'number') continue
    anchoredAnnotations.push({
      side: ctx.side === 'LEFT' ? 'deletions' : 'additions',
      lineNumber: ctx.lineNumber,
      metadata: { kind: 'agent', session }
    })
  }

  if (openCommentKey && openCommentKey.startsWith(`${file.filename}::`)) {
    const [, sideStr, lineStr] = openCommentKey.split('::')
    const line = Number(lineStr)
    if (!Number.isNaN(line)) {
      const side: PullRequestReviewLineSide = sideStr === 'LEFT' ? 'LEFT' : 'RIGHT'
      anchoredAnnotations.push({
        side: side === 'LEFT' ? 'deletions' : 'additions',
        lineNumber: line,
        metadata: { kind: 'composer', line, side, lineContent: '' }
      })
    }
  }

  const renderAnnotation = (annotation: DiffLineAnnotation<InlineAnnotationMeta>) => {
    const meta = annotation.metadata
    if (!meta) return null
    if (meta.kind === 'thread') {
      return (
        <AnnotationWrapper side={annotation.side} elementRef={(el) => threadRef(meta.thread.id, el)}>
          <InlineDiffThread
            thread={meta.thread}
            replyTarget={replyTarget}
            onFixWithClaude={onFixWithClaude}
            agentSessions={agentSessions}
            onStopAgent={onStopAgent}
            onContinueAgent={onContinueAgent}
            onPromoteAgent={onPromoteAgent}
          />
        </AnnotationWrapper>
      )
    }
    if (meta.kind === 'draft') {
      return (
        <AnnotationWrapper side={annotation.side}>
          <DraftCommentCard
            comment={meta.draft.comment}
            auth={auth}
            onRemove={() => onRemoveDraftComment(meta.draft.index)}
          />
        </AnnotationWrapper>
      )
    }
    if (meta.kind === 'agent') {
      return (
        <AnnotationWrapper side={annotation.side}>
          <InlineAgentResponseCard
            session={meta.session}
            onStop={() => onStopAgent?.(meta.session.id)}
            onContinue={(prompt) => onContinueAgent?.(meta.session.id, prompt)}
            onOpenInChat={() => onPromoteAgent?.(meta.session.id)}
            compact
          />
        </AnnotationWrapper>
      )
    }
    if (meta.kind === 'composer' && allowCommenting) {
      return (
        <AnnotationWrapper side={annotation.side}>
          <InlineDiffCommentComposer
            owner={owner}
            repo={repo}
            number={number}
            commitId={commitId}
            path={file.filename}
            line={meta.line}
            lineContent={meta.lineContent}
            side={meta.side}
            onCancel={() => onOpenComment(null)}
            onAddDraftComment={onAddDraftComment}
            onInlineCommentPosted={onInlineCommentPosted}
            onAskClaude={onAskClaude}
          />
        </AnnotationWrapper>
      )
    }
    return null
  }

  const gutterRef = useRef({ filename: file.filename, openCommentKey, onOpenComment })
  gutterRef.current = { filename: file.filename, openCommentKey, onOpenComment }
  const [stableGutterClick] = useState(() => (range: { start: number; side?: 'deletions' | 'additions' }): void => {
    const side: PullRequestReviewLineSide = range.side === 'deletions' ? 'LEFT' : 'RIGHT'
    const g = gutterRef.current
    const rowKey = `${g.filename}::${side}::${range.start}`
    g.onOpenComment(g.openCommentKey === rowKey ? null : rowKey)
  })

  const optionsRef = useRef<{
    key: string
    value: React.ComponentProps<typeof PatchDiff<InlineAnnotationMeta>>['options']
  } | null>(null)
  const diffStyle = settings.diffViewMode === 'split' ? 'split' : 'unified'
  const optionsKey = `${theme}|${diffStyle}|${allowCommenting ? '1' : '0'}`
  if (!optionsRef.current || optionsRef.current.key !== optionsKey) {
    optionsRef.current = {
      key: optionsKey,
      value: {
        ...BASE_DIFF_OPTIONS,
        themeType: theme,
        diffStyle,
        disableFileHeader: true,
        enableGutterUtility: allowCommenting,
        onGutterUtilityClick: allowCommenting ? stableGutterClick : undefined
      }
    }
  }

  return (
    <>
      <header className={cn('flex items-center gap-2 px-3 py-1.5', !isCollapsed && 'border-border border-b')}>
        <button
          type="button"
          onClick={() => setIsCollapsed(!isCollapsed)}
          className="text-foreground-subtle hover:bg-interactive hover:text-foreground flex size-5 shrink-0 items-center justify-center rounded transition-colors"
          aria-label={isCollapsed ? 'Expand file' : 'Collapse file'}
        >
          {isCollapsed ? <ChevronRight size={14} /> : <ChevronDown size={14} />}
        </button>
        <FileStatusIcon status={file.status} />
        <FileHeaderName name={file.filename} previousName={file.previous_filename} />
        <Tooltip label={pathCopied ? 'Copied' : 'Copy file path'} side="top">
          <button
            type="button"
            onClick={handleCopyPath}
            className="text-foreground-subtle hover:bg-interactive hover:text-foreground flex size-5 shrink-0 items-center justify-center rounded transition-colors"
            aria-label="Copy file path"
          >
            {pathCopied ? <Check size={13} className="text-success" /> : <Copy size={13} />}
          </button>
        </Tooltip>
        <div className="ml-auto flex shrink-0 items-center gap-2">
          <DiffStat additions={file.additions} deletions={file.deletions} />
          <a
            href={file.blob_url}
            target="_blank"
            rel="noreferrer"
            className="border-border bg-interactive text-foreground hover:bg-interactive-hover inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs font-medium transition-colors"
          >
            View
            <ExternalLink size={12} />
          </a>
        </div>
      </header>

      {isCollapsed ? null : (
        <>
          {hasRenderablePatch ? (
            <PatchDiff<InlineAnnotationMeta>
              patch={wrapGitPatch(file.filename, file.patch!)}
              options={optionsRef.current!.value}
              lineAnnotations={anchoredAnnotations}
              renderAnnotation={renderAnnotation}
            />
          ) : (
            <div className="text-foreground-muted px-4 py-6 text-sm">
              GitHub did not return a renderable patch for this file.
            </div>
          )}
        </>
      )}
    </>
  )
}
