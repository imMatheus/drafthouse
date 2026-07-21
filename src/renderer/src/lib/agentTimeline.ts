import type {
  AgentContentBlock,
  AgentContentBlockToolUse,
  AgentStreamEvent,
  AgentToolResultContent
} from '../../../shared/types'

/** Tool calls rendered as first-class response content (diff blocks). */
export const FILE_EDIT_TOOLS = new Set(['Edit', 'Write', 'MultiEdit'])

// ============================================================
// Timeline shapes
//
// `buildAgentTimeline` normalizes the raw event stream into turns of
// chronological items. Tool calls are paired with their results, sub-agent
// events nest under their Task call, and consecutive "work" steps (thinking,
// searches, bash runs) group into collapsible step groups while text, edits,
// todos and permission prompts stay inline.
// ============================================================

export interface TimelineToolResult {
  text: string
  imageCount: number
  isError: boolean
}

export interface TimelineStepThinking {
  kind: 'thinking'
  text: string
  streaming: boolean
}

export interface TimelineStepTool {
  kind: 'tool'
  id: string
  name: string
  input: Record<string, unknown>
  /** True while the tool's input JSON is still streaming in. */
  inputStreaming: boolean
  result: TimelineToolResult | null
  /** Sub-agent (Task tool) activity nested under this call. */
  children: TimelineStep[]
}

export type TimelineStep = TimelineStepThinking | TimelineStepTool

export interface TimelineItemSteps {
  kind: 'steps'
  steps: TimelineStep[]
}

export interface TimelineItemText {
  kind: 'text'
  text: string
  streaming: boolean
}

export interface TimelineItemEdit {
  kind: 'edit'
  toolName: string
  filePath: string
  edits: { oldString: string; newString: string }[]
  result: TimelineToolResult | null
}

export interface TimelineTodo {
  content: string
  status: 'pending' | 'in_progress' | 'completed'
  activeForm?: string
}

export interface TimelineItemTodos {
  kind: 'todos'
  todos: TimelineTodo[]
}

export interface TimelineQuestionOption {
  label: string
  description: string
}

export interface TimelineQuestion {
  question: string
  header: string
  multiSelect: boolean
  options: TimelineQuestionOption[]
}

export interface TimelineItemPermission {
  kind: 'permission'
  requestId: string
  toolName: string
  input: Record<string, unknown>
  description?: string
  /** Markdown plan when this is an ExitPlanMode approval request. */
  plan?: string
  /** Parsed questions when this is an AskUserQuestion request. */
  questions?: TimelineQuestion[]
  /** Answers the user submitted (question text → answer), from the resolved event. */
  answers?: Record<string, string>
  resolution: 'allow' | 'deny' | null
}

export interface TimelineItemNotice {
  kind: 'notice'
  tone: 'info' | 'error'
  text: string
  detail?: string
}

export type TimelineItem =
  | TimelineItemSteps
  | TimelineItemText
  | TimelineItemEdit
  | TimelineItemTodos
  | TimelineItemPermission
  | TimelineItemNotice

export interface TimelineTurnResult {
  isError: boolean
  subtype: string
  errorText: string | null
  durationMs: number
  numTurns: number
  costUsd: number | null
}

export interface TimelineTurn {
  user: { text: string; attachedFiles: string[] } | null
  items: TimelineItem[]
  result: TimelineTurnResult | null
}

export interface AgentTimeline {
  turns: TimelineTurn[]
  /** Unresolved permission request — the CLI is blocked waiting for an answer. */
  pendingPermission: TimelineItemPermission | null
  /** Human label of the most recent work step, for the live activity indicator. */
  latestStepLabel: string | null
  /** Total count of steps across all step groups (for accordion summaries). */
  stepCount: number
}

// ============================================================
// Labels
// ============================================================

function basename(filePath: string): string {
  return filePath.split('/').pop() ?? filePath
}

export function getStepLabel(name: string, input: Record<string, unknown>): string {
  switch (name) {
    case 'Bash':
      return typeof input.command === 'string' ? input.command.slice(0, 80) : 'Running a command'
    case 'Read':
      return typeof input.file_path === 'string' ? `Reading ${basename(input.file_path)}` : 'Reading a file'
    case 'Grep':
      return typeof input.pattern === 'string' ? `Searching for "${input.pattern}"` : 'Searching'
    case 'Glob':
      return typeof input.pattern === 'string' ? `Finding files: ${input.pattern}` : 'Finding files'
    case 'Edit':
    case 'MultiEdit':
      return typeof input.file_path === 'string' ? `Editing ${basename(input.file_path)}` : 'Editing a file'
    case 'Write':
      return typeof input.file_path === 'string' ? `Writing ${basename(input.file_path)}` : 'Writing a file'
    case 'Task':
      return typeof input.description === 'string' ? `Agent: ${input.description}` : 'Running a sub-agent'
    case 'WebFetch':
      return typeof input.url === 'string' ? `Fetching ${input.url}` : 'Fetching a page'
    case 'WebSearch':
      return typeof input.query === 'string' ? `Searching the web: "${input.query}"` : 'Searching the web'
    case 'TodoWrite':
      return 'Updating the plan'
    case 'ExitPlanMode':
      return 'Proposing a plan'
    case 'AskUserQuestion': {
      const first = Array.isArray(input.questions)
        ? (input.questions[0] as { question?: unknown } | undefined)
        : undefined
      return typeof first?.question === 'string' ? `Asking: ${first.question}` : 'Asking a question'
    }
    case 'NotebookEdit':
      return typeof input.notebook_path === 'string' ? `Editing ${basename(input.notebook_path)}` : 'Editing a notebook'
    default:
      return name
  }
}

// ============================================================
// Normalization helpers
// ============================================================

function normalizeToolResult(content: AgentToolResultContent | undefined, isError: boolean): TimelineToolResult {
  if (content === undefined) return { text: '', imageCount: 0, isError }
  if (typeof content === 'string') return { text: content, imageCount: 0, isError }

  const parts: string[] = []
  let imageCount = 0
  for (const block of content) {
    if (!block || typeof block !== 'object') continue
    if (block.type === 'text' && typeof (block as { text?: unknown }).text === 'string') {
      parts.push((block as { text: string }).text)
    } else if (block.type === 'image') {
      imageCount++
    } else if (typeof block.type === 'string') {
      parts.push(`[${block.type}]`)
    }
  }
  return { text: parts.join('\n'), imageCount, isError }
}

/**
 * The CLI reports local command activity (e.g. answering a `set_model`
 * control request) as user-role events wrapped in command tags. These are
 * meta output — rendering them as user bubbles would look like the user
 * sent a message. Surface stdout/stderr bodies as notices, drop the rest.
 */
function parseCliMetaUserMessage(text: string): { notice: string | null; isError: boolean } | null {
  const trimmed = text.trim()
  const stdout = trimmed.match(/^<local-command-stdout>([\s\S]*?)<\/local-command-stdout>$/)
  if (stdout) return { notice: stdout[1].trim() || null, isError: false }
  const stderr = trimmed.match(/^<local-command-stderr>([\s\S]*?)<\/local-command-stderr>$/)
  if (stderr) return { notice: stderr[1].trim() || null, isError: true }
  if (trimmed.startsWith('<command-name>') || trimmed.startsWith('<command-message>')) {
    return { notice: null, isError: false }
  }
  return null
}

function textOfUserContent(content: AgentContentBlock[] | string): string | null {
  if (typeof content === 'string') return content
  if (!Array.isArray(content)) return null
  const texts: string[] = []
  for (const block of content) {
    if (block && typeof block === 'object' && block.type === 'text' && typeof block.text === 'string') {
      texts.push(block.text)
    }
  }
  return texts.length > 0 ? texts.join('\n') : null
}

function parseTodos(input: Record<string, unknown>): TimelineTodo[] | null {
  if (!Array.isArray(input.todos)) return null
  const todos: TimelineTodo[] = []
  for (const raw of input.todos) {
    if (!raw || typeof raw !== 'object') continue
    const item = raw as Record<string, unknown>
    if (typeof item.content !== 'string') continue
    const status = item.status === 'in_progress' || item.status === 'completed' ? item.status : 'pending'
    todos.push({
      content: item.content,
      status,
      activeForm: typeof item.activeForm === 'string' ? item.activeForm : undefined
    })
  }
  return todos
}

/** Parse AskUserQuestion input. Null on malformed input — the caller falls back to a generic permission card. */
function parseQuestions(input: Record<string, unknown>): TimelineQuestion[] | null {
  if (!Array.isArray(input.questions)) return null
  const questions: TimelineQuestion[] = []
  for (const raw of input.questions) {
    if (!raw || typeof raw !== 'object') continue
    const item = raw as Record<string, unknown>
    if (typeof item.question !== 'string' || !Array.isArray(item.options)) continue
    const options: TimelineQuestionOption[] = []
    for (const rawOption of item.options) {
      if (!rawOption || typeof rawOption !== 'object') continue
      const option = rawOption as Record<string, unknown>
      if (typeof option.label !== 'string') continue
      options.push({
        label: option.label,
        description: typeof option.description === 'string' ? option.description : ''
      })
    }
    if (options.length === 0) continue
    questions.push({
      question: item.question,
      header: typeof item.header === 'string' ? item.header : '',
      multiSelect: item.multiSelect === true,
      options
    })
  }
  return questions.length > 0 ? questions : null
}

// ============================================================
// Builder
// ============================================================

// The store replaces the events array wholesale on every update (never an
// in-place mutation), so the array reference is a complete cache key. This
// keeps renders that didn't change events — scrolling, selection, parent
// state — from paying for a full rebuild, and lets every consumer of the same
// session share one build. WeakMap entries die with their events array.
const timelineCache = new WeakMap<AgentStreamEvent[], AgentTimeline>()

export function buildAgentTimeline(events: AgentStreamEvent[]): AgentTimeline {
  const cached = timelineCache.get(events)
  if (cached) return cached
  const timeline = buildAgentTimelineUncached(events)
  timelineCache.set(events, timeline)
  return timeline
}

function buildAgentTimelineUncached(events: AgentStreamEvent[]): AgentTimeline {
  // Pass 1: pair tool results and group sub-agent events under their parent.
  const resultsByToolUseId = new Map<string, TimelineToolResult>()
  const childrenByParent = new Map<string, AgentStreamEvent[]>()

  for (const event of events) {
    if (event.type === 'user' || event.type === 'assistant') {
      const parentId = event.parent_tool_use_id ?? null
      if (parentId !== null) {
        const list = childrenByParent.get(parentId)
        if (list) list.push(event)
        else childrenByParent.set(parentId, [event])
      }
    }
    if (event.type === 'user' && Array.isArray(event.message.content)) {
      for (const block of event.message.content) {
        if (block && typeof block === 'object' && block.type === 'tool_result') {
          resultsByToolUseId.set(block.tool_use_id, normalizeToolResult(block.content, block.is_error === true))
        }
      }
    }
  }

  const permissionItemsById = new Map<string, TimelineItemPermission>()
  const turns: TimelineTurn[] = []
  let currentTurn: TimelineTurn | null = null
  let latestStepLabel: string | null = null
  let stepCount = 0

  const ensureTurn = (): TimelineTurn => {
    if (!currentTurn) {
      currentTurn = { user: null, items: [], result: null }
      turns.push(currentTurn)
    }
    return currentTurn
  }

  const pushItem = (item: TimelineItem): void => {
    ensureTurn().items.push(item)
  }

  const pushStep = (step: TimelineStep): void => {
    const turn = ensureTurn()
    const last = turn.items[turn.items.length - 1]
    if (last && last.kind === 'steps') {
      last.steps.push(step)
    } else {
      turn.items.push({ kind: 'steps', steps: [step] })
    }
    stepCount++
    if (step.kind === 'tool') {
      latestStepLabel = getStepLabel(step.name, step.input)
    } else {
      latestStepLabel = 'Thinking...'
    }
  }

  const buildToolStep = (block: AgentContentBlockToolUse, streaming: boolean): TimelineStepTool => ({
    kind: 'tool',
    id: block.id,
    name: block.name,
    input: block.input ?? {},
    inputStreaming: streaming && block.partialJson !== undefined,
    result: resultsByToolUseId.get(block.id) ?? null,
    children: buildChildSteps(block.id)
  })

  // Sub-agent activity renders as a flat step list nested under the Task call.
  const buildChildSteps = (parentId: string): TimelineStep[] => {
    const childEvents = childrenByParent.get(parentId)
    if (!childEvents) return []
    const steps: TimelineStep[] = []
    for (const event of childEvents) {
      if (event.type !== 'assistant') continue
      const streaming = event.streaming === true
      for (const block of event.message.content) {
        if (block.type === 'thinking') {
          steps.push({ kind: 'thinking', text: block.thinking, streaming })
        } else if (block.type === 'text') {
          if (block.text.trim().length > 0) steps.push({ kind: 'thinking', text: block.text, streaming })
        } else if (block.type === 'tool_use') {
          steps.push(buildToolStep(block, streaming))
        }
      }
    }
    return steps
  }

  // Pass 2: walk top-level events chronologically.
  for (const event of events) {
    switch (event.type) {
      case 'user': {
        if ((event.parent_tool_use_id ?? null) !== null) break
        const text = textOfUserContent(event.message.content)
        if (text !== null && text.trim().length > 0) {
          const meta = parseCliMetaUserMessage(text)
          if (meta) {
            if (meta.notice) {
              pushItem({ kind: 'notice', tone: meta.isError ? 'error' : 'info', text: meta.notice })
            }
            break
          }
          // A user prompt starts a new turn.
          currentTurn = { user: { text, attachedFiles: event.attachedFiles ?? [] }, items: [], result: null }
          turns.push(currentTurn)
        }
        // tool_result-only user events were consumed in pass 1.
        break
      }

      case 'assistant': {
        if ((event.parent_tool_use_id ?? null) !== null) break
        const streaming = event.streaming === true
        for (const block of event.message.content) {
          if (block.type === 'text') {
            if (block.text.trim().length > 0) pushItem({ kind: 'text', text: block.text, streaming })
          } else if (block.type === 'thinking') {
            if (block.thinking.trim().length > 0) pushStep({ kind: 'thinking', text: block.thinking, streaming })
          } else if (block.type === 'redacted_thinking') {
            pushStep({ kind: 'thinking', text: '(redacted thinking)', streaming: false })
          } else if (block.type === 'tool_use') {
            if (FILE_EDIT_TOOLS.has(block.name)) {
              const edit = buildEditItem(block, resultsByToolUseId.get(block.id) ?? null)
              if (edit) {
                pushItem(edit)
                latestStepLabel = getStepLabel(block.name, block.input ?? {})
              } else {
                // Input still streaming — show as a step until it parses.
                pushStep(buildToolStep(block, streaming))
              }
            } else if (block.name === 'TodoWrite') {
              const todos = parseTodos(block.input ?? {})
              if (todos) {
                pushItem({ kind: 'todos', todos })
                latestStepLabel = getStepLabel(block.name, block.input ?? {})
              } else {
                pushStep(buildToolStep(block, streaming))
              }
            } else {
              pushStep(buildToolStep(block, streaming))
            }
          }
        }
        break
      }

      case 'system': {
        if (event.subtype === 'init') break
        const message = 'message' in event ? event.message : undefined
        if (typeof message === 'string' && message.length > 0) {
          pushItem({ kind: 'notice', tone: 'info', text: message })
        }
        break
      }

      case 'lifecycle': {
        pushItem({
          kind: 'notice',
          tone: event.subtype === 'exit' && !event.failedTurn ? 'info' : 'error',
          text: event.message,
          detail: event.stderrTail
        })
        break
      }

      case 'permission_request': {
        const item: TimelineItemPermission = {
          kind: 'permission',
          requestId: event.requestId,
          toolName: event.toolName,
          input: event.input,
          description: event.description,
          plan:
            event.toolName === 'ExitPlanMode' && typeof event.input.plan === 'string' ? event.input.plan : undefined,
          questions: event.toolName === 'AskUserQuestion' ? (parseQuestions(event.input) ?? undefined) : undefined,
          resolution: null
        }
        permissionItemsById.set(event.requestId, item)
        pushItem(item)
        break
      }

      case 'permission_resolved': {
        const item = permissionItemsById.get(event.requestId)
        if (item) {
          item.resolution = event.behavior
          const submitted = event.updatedInput?.answers
          if (submitted && typeof submitted === 'object' && !Array.isArray(submitted)) {
            const answers: Record<string, string> = {}
            for (const [question, answer] of Object.entries(submitted)) {
              if (typeof answer === 'string') answers[question] = answer
            }
            item.answers = answers
          }
        }
        break
      }

      case 'result': {
        const turn = ensureTurn()
        turn.result = {
          isError: event.is_error,
          subtype: event.subtype,
          errorText: event.is_error ? (event.result ?? null) : null,
          durationMs: event.duration_ms,
          numTurns: event.num_turns,
          costUsd: typeof event.total_cost_usd === 'number' ? event.total_cost_usd : null
        }
        break
      }

      // stream_event partials are merged before they reach the store.
      default:
        break
    }
  }

  let pendingPermission: TimelineItemPermission | null = null
  for (const item of permissionItemsById.values()) {
    if (item.resolution === null) pendingPermission = item
  }

  return { turns, pendingPermission, latestStepLabel, stepCount }
}

function buildEditItem(block: AgentContentBlockToolUse, result: TimelineToolResult | null): TimelineItemEdit | null {
  const input = block.input ?? {}
  if (typeof input.file_path !== 'string') return null

  if (block.name === 'Edit' && typeof input.old_string === 'string' && typeof input.new_string === 'string') {
    return {
      kind: 'edit',
      toolName: 'Edit',
      filePath: input.file_path,
      edits: [{ oldString: input.old_string, newString: input.new_string }],
      result
    }
  }
  if (block.name === 'Write' && typeof input.content === 'string') {
    return {
      kind: 'edit',
      toolName: 'Write',
      filePath: input.file_path,
      edits: [{ oldString: '', newString: input.content }],
      result
    }
  }
  if (block.name === 'MultiEdit' && Array.isArray(input.edits)) {
    const edits: { oldString: string; newString: string }[] = []
    for (const raw of input.edits) {
      if (!raw || typeof raw !== 'object') continue
      const edit = raw as Record<string, unknown>
      if (typeof edit.old_string === 'string' && typeof edit.new_string === 'string') {
        edits.push({ oldString: edit.old_string, newString: edit.new_string })
      }
    }
    if (edits.length === 0) return null
    return { kind: 'edit', toolName: 'Edit', filePath: input.file_path, edits, result }
  }
  return null
}
