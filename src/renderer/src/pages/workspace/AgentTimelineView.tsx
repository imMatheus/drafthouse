import { useEffect, useState } from 'react'
import {
  Ban,
  Bot,
  Brain,
  Check,
  ChevronRight,
  FileText,
  Globe,
  ListTodo,
  MessageCircleQuestionMark,
  Search,
  ShieldQuestion,
  Terminal,
  Wrench,
  X
} from 'lucide-react'
import { cn } from '../../lib/cn'
import type { AgentContext, AgentSessionMeta } from '../../../../shared/types'
import {
  buildAgentTimeline,
  getStepLabel,
  type AgentTimeline,
  type TimelineItem,
  type TimelineItemEdit,
  type TimelineItemNotice,
  type TimelineItemPermission,
  type TimelineItemTodos,
  type TimelineStep,
  type TimelineStepTool,
  type TimelineToolResult,
  type TimelineTurn
} from '../../lib/agentTimeline'
import type { AgentStreamEvent } from '../../../../shared/types'
import { useWorkspaceContext } from '../../contexts/WorkspaceContext'
import { getPathBasename, isImageFile } from '../../lib/path'
import AgentEditDiffBlock from './AgentEditDiffBlock'
import AgentSpinner from './AgentSpinner'
import MarkdownBody from './MarkdownBody'
import HighlightedMentionText from '../../components/HighlightedMentionText'
import MessagePRMentions from '../../components/MessagePRMentions'

interface AgentTimelineViewProps {
  session: AgentSessionMeta
  events: AgentStreamEvent[]
  compact?: boolean
  /** Skip the first turn's prompt bubble (inline cards show their own context). */
  hideFirstUserMessage?: boolean
  allMentionedPRs?: AgentContext['prs']
}

export default function AgentTimelineView({
  session,
  events,
  compact,
  hideFirstUserMessage,
  allMentionedPRs
}: AgentTimelineViewProps) {
  const timeline = buildAgentTimeline(events)
  const isRunning = session.status === 'running'
  const lastTurnIndex = timeline.turns.length - 1

  return (
    <div>
      {timeline.turns.map((turn, turnIndex) => (
        <TurnBlock
          key={turnIndex}
          turn={turn}
          session={session}
          compact={compact}
          hideUserMessage={hideFirstUserMessage === true && turnIndex === 0}
          isLastTurn={turnIndex === lastTurnIndex}
          isRunning={isRunning}
          allMentionedPRs={allMentionedPRs}
        />
      ))}

      {isRunning && !timeline.pendingPermission && (
        <LiveIndicator label={liveLabel(timeline)} since={session.lastActivityAt} />
      )}

      {session.status === 'cancelled' && (
        <div className="text-foreground-subtle mt-2 flex items-center gap-1.5 text-xs">
          <Ban size={12} className="shrink-0" />
          <span>Stopped</span>
        </div>
      )}
    </div>
  )
}

/** Label for the live activity row: latest step, unless text is already streaming. */
function liveLabel(timeline: AgentTimeline): string {
  const lastTurn = timeline.turns[timeline.turns.length - 1]
  const lastItem = lastTurn?.items[lastTurn.items.length - 1]
  if (lastItem?.kind === 'text') return 'Writing...'
  if (lastItem?.kind === 'steps' && timeline.latestStepLabel) return timeline.latestStepLabel
  return timeline.latestStepLabel ?? 'Thinking...'
}

// ============================================================
// Turn
// ============================================================

function TurnBlock({
  turn,
  session,
  compact,
  hideUserMessage,
  isLastTurn,
  isRunning,
  allMentionedPRs
}: {
  turn: TimelineTurn
  session: AgentSessionMeta
  compact?: boolean
  hideUserMessage: boolean
  isLastTurn: boolean
  isRunning: boolean
  allMentionedPRs?: AgentContext['prs']
}) {
  return (
    <div>
      {turn.user && !hideUserMessage && (
        <UserBubble
          text={turn.user.text}
          attachedFiles={turn.user.attachedFiles}
          compact={compact}
          allMentionedPRs={allMentionedPRs}
        />
      )}

      {turn.items.map((item, i) => (
        <TimelineItemBlock
          key={i}
          item={item}
          session={session}
          compact={compact}
          turnRunning={isRunning && isLastTurn && turn.result === null}
        />
      ))}

      {turn.result &&
        (turn.result.isError ? (
          <div className="border-danger/30 bg-danger/5 my-3 rounded-md border px-3 py-2">
            <p className="text-danger text-xs font-medium">
              {turn.result.subtype === 'error_max_turns' ? 'Stopped: maximum turns reached' : 'The agent hit an error'}
            </p>
            {turn.result.errorText && (
              <pre className="text-danger/90 mt-1 text-xs break-all whitespace-pre-wrap">{turn.result.errorText}</pre>
            )}
          </div>
        ) : isLastTurn ? (
          <TurnStats
            durationMs={turn.result.durationMs}
            numTurns={turn.result.numTurns}
            costUsd={turn.result.costUsd}
            model={session.initModel}
          />
        ) : null)}
    </div>
  )
}

function TurnStats({
  durationMs,
  numTurns,
  costUsd,
  model
}: {
  durationMs: number
  numTurns: number
  costUsd: number | null
  model: string | undefined
}) {
  return (
    <div className="text-foreground-subtle mt-2 mb-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
      <span>{(durationMs / 1000).toFixed(1)}s</span>
      <span>
        {numTurns} turn{numTurns !== 1 ? 's' : ''}
      </span>
      {costUsd !== null && costUsd > 0 && <span>${costUsd.toFixed(costUsd < 0.1 ? 3 : 2)}</span>}
      {model && <span>{model}</span>}
    </div>
  )
}

// ============================================================
// Items
// ============================================================

function TimelineItemBlock({
  item,
  session,
  compact,
  turnRunning
}: {
  item: TimelineItem
  session: AgentSessionMeta
  compact?: boolean
  turnRunning: boolean
}) {
  switch (item.kind) {
    case 'text':
      return (
        <MarkdownBody className={compact ? 'p-2' : 'p-4'} compact={compact}>
          {item.text}
        </MarkdownBody>
      )
    case 'steps':
      return <StepGroupBlock steps={item.steps} turnRunning={turnRunning} />
    case 'edit':
      return <EditBlock item={item} />
    case 'todos':
      return <TodosCard item={item} />
    case 'permission':
      if (item.plan !== undefined) return <PlanCard item={item} sessionId={session.id} compact={compact} />
      if (item.questions !== undefined) return <QuestionCard item={item} sessionId={session.id} />
      return <PermissionCard item={item} sessionId={session.id} />
    case 'notice':
      return <NoticeBlock item={item} />
    default:
      return null
  }
}

function EditBlock({ item }: { item: TimelineItemEdit }) {
  return (
    <>
      {item.edits.map((edit, i) => (
        <AgentEditDiffBlock
          key={i}
          filePath={item.filePath}
          oldString={edit.oldString}
          newString={edit.newString}
          toolLabel={item.toolName}
          errorText={item.result?.isError ? item.result.text || 'The edit failed to apply' : undefined}
        />
      ))}
    </>
  )
}

// ============================================================
// Step groups (thinking + hidden tool work)
// ============================================================

function StepGroupBlock({ steps, turnRunning }: { steps: TimelineStep[]; turnRunning: boolean }) {
  const [expanded, setExpanded] = useState(false)

  return (
    <div className="my-2">
      <button
        onClick={() => setExpanded(!expanded)}
        className="text-foreground-muted hover:bg-surface-hover hover:text-foreground flex items-center gap-1.5 rounded-md px-1.5 py-1 text-xs transition-colors"
      >
        <ChevronRight size={12} className={cn('shrink-0 transition-transform', expanded && 'rotate-90')} />
        <span>
          {steps.length} step{steps.length !== 1 ? 's' : ''}
        </span>
      </button>

      {expanded && (
        <div className="border-border mt-1 ml-1.5 flex flex-col gap-0.5 border-l pl-3">
          {steps.map((step, i) => (
            <StepRow key={step.kind === 'tool' ? step.id : i} step={step} turnRunning={turnRunning} />
          ))}
        </div>
      )}
    </div>
  )
}

const TOOL_ICONS: Record<string, typeof Terminal> = {
  Bash: Terminal,
  Read: FileText,
  Glob: Search,
  Grep: Search,
  Edit: FileText,
  Write: FileText,
  MultiEdit: FileText,
  Task: Bot,
  WebFetch: Globe,
  WebSearch: Globe,
  TodoWrite: ListTodo,
  ExitPlanMode: ListTodo,
  AskUserQuestion: MessageCircleQuestionMark
}

function StepRow({ step, turnRunning }: { step: TimelineStep; turnRunning: boolean }) {
  if (step.kind === 'thinking') {
    return <ThinkingRow text={step.text} />
  }
  return <ToolRow step={step} turnRunning={turnRunning} />
}

function ThinkingRow({ text }: { text: string }) {
  const [expanded, setExpanded] = useState(false)
  return (
    <button
      onClick={() => setExpanded(!expanded)}
      className="hover:bg-surface-hover flex items-start gap-2 rounded-md px-1.5 py-1 text-left transition-colors"
    >
      <Brain size={12} className="text-foreground-subtle mt-0.5 shrink-0" />
      <span
        className={cn(
          'text-foreground-subtle min-w-0 flex-1 text-xs whitespace-pre-wrap italic',
          !expanded && 'line-clamp-2'
        )}
      >
        {text}
      </span>
    </button>
  )
}

function ToolRow({ step, turnRunning }: { step: TimelineStepTool; turnRunning: boolean }) {
  const [expanded, setExpanded] = useState(false)
  const Icon = TOOL_ICONS[step.name] ?? Wrench
  const label = getStepLabel(step.name, step.input)
  const pending = step.result === null && (turnRunning || step.inputStreaming)
  const hasDetail = !step.inputStreaming && (Object.keys(step.input).length > 0 || step.result !== null)

  return (
    <div>
      <button
        onClick={() => hasDetail && setExpanded(!expanded)}
        className={cn(
          'flex w-full items-center gap-2 rounded-md px-1.5 py-1 text-left transition-colors',
          hasDetail && 'hover:bg-surface-hover'
        )}
      >
        <Icon size={12} className="text-foreground-subtle shrink-0" />
        <span
          className={cn(
            'text-foreground-muted min-w-0 flex-1 truncate text-xs',
            step.name === 'Bash' && 'font-mono text-[11px]'
          )}
        >
          {label}
        </span>
        {pending ? (
          <span className="shrink-0">
            <AgentSpinner />
          </span>
        ) : step.result?.isError ? (
          <X size={12} className="text-danger shrink-0" />
        ) : null}
      </button>

      {expanded && <ToolDetail step={step} />}

      {step.children.length > 0 && (
        <div className="border-border mt-0.5 mb-1 ml-1.5 flex flex-col gap-0.5 border-l pl-3">
          {step.children.map((child, i) => (
            <StepRow key={child.kind === 'tool' ? child.id : i} step={child} turnRunning={turnRunning} />
          ))}
        </div>
      )}
    </div>
  )
}

function ToolDetail({ step }: { step: TimelineStepTool }) {
  return (
    <div className="border-border bg-surface my-1 ml-6 rounded-md border px-2.5 py-2">
      {step.name !== 'Bash' && Object.keys(step.input).length > 0 && (
        <pre className="text-foreground-subtle max-h-40 overflow-y-auto text-[11px] break-all whitespace-pre-wrap">
          {JSON.stringify(step.input, null, 2)}
        </pre>
      )}
      {step.name === 'Bash' && typeof step.input.command === 'string' && (
        <pre className="text-foreground-muted text-[11px] break-all whitespace-pre-wrap">$ {step.input.command}</pre>
      )}
      {step.result && <ToolResultDetail result={step.result} />}
    </div>
  )
}

function ToolResultDetail({ result }: { result: TimelineToolResult }) {
  const [showAll, setShowAll] = useState(false)
  const isLong = result.text.length > 600
  const text = !showAll && isLong ? result.text.slice(0, 600) + '…' : result.text

  return (
    <div className={cn('border-border mt-1.5 border-t pt-1.5', result.isError && 'border-danger/30')}>
      {result.text.length > 0 && (
        <pre
          className={cn(
            'max-h-60 overflow-y-auto text-[11px] break-all whitespace-pre-wrap',
            result.isError ? 'text-danger/90' : 'text-foreground-subtle'
          )}
        >
          {text}
        </pre>
      )}
      {result.imageCount > 0 && (
        <p className="text-foreground-subtle mt-1 text-[11px] italic">
          {result.imageCount} image{result.imageCount !== 1 ? 's' : ''} returned
        </p>
      )}
      {isLong && (
        <button onClick={() => setShowAll(!showAll)} className="text-accent hover:text-accent-hover mt-1 text-[11px]">
          {showAll ? 'Show less' : 'Show more'}
        </button>
      )}
    </div>
  )
}

// ============================================================
// Todos
// ============================================================

function TodosCard({ item }: { item: TimelineItemTodos }) {
  const done = item.todos.filter((t) => t.status === 'completed').length
  return (
    <div className="border-border bg-surface my-2 rounded-md border px-3 py-2">
      <div className="text-foreground-subtle mb-1.5 flex items-center gap-1.5 text-[11px] font-medium tracking-wide uppercase">
        <ListTodo size={12} className="shrink-0" />
        <span>
          Plan · {done}/{item.todos.length}
        </span>
      </div>
      <div className="flex flex-col gap-1">
        {item.todos.map((todo, i) => (
          <div key={i} className="flex items-start gap-2 text-xs">
            {todo.status === 'completed' ? (
              <Check size={12} className="text-success mt-0.5 shrink-0" />
            ) : todo.status === 'in_progress' ? (
              <span className="mt-0.5 shrink-0">
                <AgentSpinner />
              </span>
            ) : (
              <span className="border-border mt-1 ml-0.5 size-2 shrink-0 rounded-full border" />
            )}
            <span
              className={cn(
                todo.status === 'completed' ? 'text-foreground-subtle line-through' : 'text-foreground-muted',
                todo.status === 'in_progress' && 'text-foreground'
              )}
            >
              {todo.status === 'in_progress' && todo.activeForm ? todo.activeForm : todo.content}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

// ============================================================
// Permissions & plan approval
// ============================================================

function PermissionCard({ item, sessionId }: { item: TimelineItemPermission; sessionId: string }) {
  const workspace = useWorkspaceContext()
  const label = getStepLabel(item.toolName, item.input)

  if (item.resolution !== null) {
    return (
      <div className="text-foreground-subtle my-2 flex items-center gap-1.5 text-xs">
        {item.resolution === 'allow' ? (
          <Check size={12} className="text-success shrink-0" />
        ) : (
          <Ban size={12} className="shrink-0" />
        )}
        <span>
          {item.resolution === 'allow' ? 'Allowed' : 'Denied'}: {label}
        </span>
      </div>
    )
  }

  return (
    <div className="border-accent/40 bg-accent-bg/40 my-3 rounded-lg border p-3">
      <div className="text-foreground flex items-center gap-2 text-xs font-medium">
        <ShieldQuestion size={14} className="text-accent shrink-0" />
        <span>Claude wants to use {item.toolName}</span>
      </div>
      {item.description && <p className="text-foreground-muted mt-1 text-xs">{item.description}</p>}
      <div className="bg-surface border-border mt-2 rounded-md border px-2.5 py-1.5">
        {item.toolName === 'Bash' && typeof item.input.command === 'string' ? (
          <pre className="text-foreground-muted font-mono text-[11px] break-all whitespace-pre-wrap">
            $ {item.input.command}
          </pre>
        ) : (
          <p className="text-foreground-muted truncate text-xs">{label}</p>
        )}
      </div>
      <div className="mt-2.5 flex items-center gap-2">
        <button
          onClick={() => workspace?.agentActions.respondPermission(sessionId, item.requestId, 'allow')}
          className="bg-accent text-accent-foreground hover:bg-accent-hover rounded-md px-3 py-1.5 text-xs font-medium transition-colors"
        >
          Allow
        </button>
        <button
          onClick={() => workspace?.agentActions.respondPermission(sessionId, item.requestId, 'deny')}
          className="border-border text-foreground-muted hover:bg-surface-hover hover:text-foreground rounded-md border px-3 py-1.5 text-xs font-medium transition-colors"
        >
          Deny
        </button>
      </div>
    </div>
  )
}

/**
 * AskUserQuestion prompt. The CLI expects the user's choices back on the
 * permission response as `updatedInput.answers` (question text → answer,
 * multi-select comma-separated) — a plain allow reads as "didn't answer".
 */
function QuestionCard({ item, sessionId }: { item: TimelineItemPermission; sessionId: string }) {
  const workspace = useWorkspaceContext()
  const questions = item.questions ?? []
  /** Selected option labels per question index; free text lives separately so it can coexist for multi-select. */
  const [selections, setSelections] = useState<string[][]>(() => questions.map(() => []))
  const [customTexts, setCustomTexts] = useState<string[]>(() => questions.map(() => ''))

  const answerFor = (index: number): string => {
    const parts = [...(selections[index] ?? [])]
    const custom = (customTexts[index] ?? '').trim()
    if (custom.length > 0) parts.push(custom)
    return parts.join(', ')
  }
  const allAnswered = questions.every((_, index) => answerFor(index).length > 0)

  const toggleOption = (index: number, label: string, multiSelect: boolean): void => {
    setSelections((prev) =>
      prev.map((labels, i) => {
        if (i !== index) return labels
        if (multiSelect) return labels.includes(label) ? labels.filter((l) => l !== label) : [...labels, label]
        return labels.includes(label) ? [] : [label]
      })
    )
    // A single-select answer is one string — picking an option supersedes typed text.
    if (!multiSelect) setCustomTexts((prev) => prev.map((text, i) => (i === index ? '' : text)))
  }

  const setCustomText = (index: number, text: string): void => {
    setCustomTexts((prev) => prev.map((t, i) => (i === index ? text : t)))
    if (text.length > 0 && questions[index]?.multiSelect !== true) {
      setSelections((prev) => prev.map((labels, i) => (i === index ? [] : labels)))
    }
  }

  const submit = (): void => {
    if (!allAnswered) return
    const answers: Record<string, string> = {}
    questions.forEach((question, index) => {
      answers[question.question] = answerFor(index)
    })
    workspace?.agentActions.respondPermission(sessionId, item.requestId, 'allow', {
      updatedInput: { ...item.input, answers }
    })
  }

  const skip = (): void => {
    workspace?.agentActions.respondPermission(sessionId, item.requestId, 'deny', {
      message: 'User declined to answer questions'
    })
  }

  if (item.resolution === 'deny') {
    return (
      <div className="text-foreground-subtle my-2 flex items-center gap-1.5 text-xs">
        <Ban size={12} className="shrink-0" />
        <span>Questions skipped</span>
      </div>
    )
  }

  if (item.resolution === 'allow') {
    return (
      <div className="border-border bg-surface my-3 rounded-lg border">
        <div className="border-border flex items-center gap-2 border-b px-3 py-2">
          <MessageCircleQuestionMark size={14} className="text-accent shrink-0" />
          <span className="text-foreground text-xs font-medium">Claude asked</span>
        </div>
        <div className="flex flex-col gap-2 px-3 py-2">
          {questions.map((question, index) => (
            <div key={index} className="text-xs">
              <p className="text-foreground-muted">{question.question}</p>
              <p className="text-foreground mt-0.5 font-medium">{item.answers?.[question.question] ?? '—'}</p>
            </div>
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="border-accent/40 bg-accent-bg/40 my-3 rounded-lg border p-3">
      <div className="text-foreground flex items-center gap-2 text-xs font-medium">
        <MessageCircleQuestionMark size={14} className="text-accent shrink-0" />
        <span>Claude has {questions.length === 1 ? 'a question' : 'questions'}</span>
      </div>

      <div className="mt-2.5 flex flex-col gap-3.5">
        {questions.map((question, index) => (
          <div key={index}>
            {question.header && (
              <span className="bg-interactive text-foreground-subtle mb-1 inline-block rounded px-1.5 py-0.5 text-[10px] font-medium tracking-wide uppercase">
                {question.header}
              </span>
            )}
            <p className="text-foreground text-xs font-medium">{question.question}</p>
            {question.multiSelect && <p className="text-foreground-subtle mt-0.5 text-[11px]">Select all that apply</p>}

            <div className="mt-1.5 flex flex-col gap-1">
              {question.options.map((option) => {
                const isSelected = (selections[index] ?? []).includes(option.label)
                return (
                  <button
                    key={option.label}
                    onClick={() => toggleOption(index, option.label, question.multiSelect)}
                    className={cn(
                      'w-full rounded-md border px-2.5 py-1.5 text-left transition-colors',
                      isSelected ? 'border-accent bg-accent-bg' : 'border-border bg-surface hover:bg-surface-hover'
                    )}
                  >
                    <span className="flex items-center justify-between gap-2">
                      <span
                        className={cn('text-xs font-medium', isSelected ? 'text-foreground' : 'text-foreground-muted')}
                      >
                        {option.label}
                      </span>
                      {isSelected && <Check size={12} className="text-accent shrink-0" />}
                    </span>
                    {option.description && (
                      <span className="text-foreground-subtle mt-0.5 block text-[11px]">{option.description}</span>
                    )}
                  </button>
                )
              })}
              <input
                type="text"
                value={customTexts[index] ?? ''}
                onChange={(e) => setCustomText(index, e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') submit()
                }}
                placeholder={question.multiSelect ? 'Add your own answer…' : 'Or type your own answer…'}
                className={cn(
                  'text-foreground placeholder:text-foreground-subtle focus:border-accent w-full rounded-md border px-2.5 py-1.5 text-xs transition-colors outline-none',
                  (customTexts[index] ?? '').trim().length > 0
                    ? 'border-accent bg-accent-bg'
                    : 'border-border bg-surface'
                )}
              />
            </div>
          </div>
        ))}
      </div>

      <div className="mt-3 flex items-center gap-2">
        <button
          onClick={submit}
          disabled={!allAnswered}
          className="bg-accent text-accent-foreground hover:bg-accent-hover rounded-md px-3 py-1.5 text-xs font-medium transition-colors disabled:pointer-events-none disabled:opacity-50"
        >
          Submit {questions.length === 1 ? 'answer' : 'answers'}
        </button>
        <button
          onClick={skip}
          className="border-border text-foreground-muted hover:bg-surface-hover hover:text-foreground rounded-md border px-3 py-1.5 text-xs font-medium transition-colors"
        >
          Skip
        </button>
      </div>
    </div>
  )
}

function PlanCard({
  item,
  sessionId,
  compact
}: {
  item: TimelineItemPermission
  sessionId: string
  compact?: boolean
}) {
  const workspace = useWorkspaceContext()

  return (
    <div className="border-border bg-surface my-3 overflow-hidden rounded-lg border">
      <div className="border-border flex items-center gap-2 border-b px-3 py-2">
        <ListTodo size={14} className="text-accent shrink-0" />
        <span className="text-foreground text-xs font-medium">Claude's plan</span>
        {item.resolution === 'allow' && (
          <span className="text-success ml-auto flex items-center gap-1 text-xs">
            <Check size={12} className="shrink-0" /> Approved
          </span>
        )}
        {item.resolution === 'deny' && (
          <span className="text-foreground-subtle ml-auto flex items-center gap-1 text-xs">
            <Ban size={12} className="shrink-0" /> Sent back
          </span>
        )}
      </div>
      <MarkdownBody className={compact ? 'p-2' : 'p-3'} compact>
        {item.plan ?? ''}
      </MarkdownBody>
      {item.resolution === null && (
        <div className="border-border flex items-center gap-2 border-t px-3 py-2.5">
          <button
            onClick={() => workspace?.agentActions.approvePlan(sessionId, item.requestId)}
            className="bg-accent text-accent-foreground hover:bg-accent-hover rounded-md px-3 py-1.5 text-xs font-medium transition-colors"
          >
            Approve & run
          </button>
          <button
            onClick={() => workspace?.agentActions.rejectPlan(sessionId, item.requestId)}
            className="border-border text-foreground-muted hover:bg-surface-hover hover:text-foreground rounded-md border px-3 py-1.5 text-xs font-medium transition-colors"
          >
            Keep planning
          </button>
        </div>
      )}
    </div>
  )
}

// ============================================================
// Notices, user bubbles, live indicator
// ============================================================

function NoticeBlock({ item }: { item: TimelineItemNotice }) {
  const [showDetail, setShowDetail] = useState(false)

  if (item.tone === 'info') {
    return <div className="text-foreground-subtle my-2 text-xs italic">{item.text}</div>
  }

  return (
    <div className="border-danger/30 bg-danger/5 my-3 rounded-md border px-3 py-2">
      <p className="text-danger text-xs">{item.text}</p>
      {item.detail && (
        <>
          <button
            onClick={() => setShowDetail(!showDetail)}
            className="text-danger/80 hover:text-danger mt-1 text-[11px] underline"
          >
            {showDetail ? 'Hide details' : 'Show details'}
          </button>
          {showDetail && (
            <pre className="text-danger/80 mt-1 max-h-40 overflow-y-auto text-[11px] break-all whitespace-pre-wrap">
              {item.detail}
            </pre>
          )}
        </>
      )}
    </div>
  )
}

export function UserBubble({
  text,
  attachedFiles,
  compact,
  allMentionedPRs
}: {
  text: string
  attachedFiles?: string[]
  compact?: boolean
  allMentionedPRs?: AgentContext['prs']
}) {
  return (
    <div className="mt-2 mb-3 flex flex-col items-end gap-2">
      <MessagePRMentions text={text} allPRs={allMentionedPRs} />
      {attachedFiles && attachedFiles.length > 0 && (
        <div className="flex max-w-[80%] flex-wrap justify-end gap-1.5">
          {attachedFiles.map((filePath) => (
            <FileAttachmentChip key={filePath} filePath={filePath} />
          ))}
        </div>
      )}
      {text.length > 0 && (
        <div
          className={cn('bg-accent-bg text-accent max-w-[80%] rounded-2xl px-3 py-2', compact ? 'text-xs' : 'text-sm')}
        >
          <span className="whitespace-pre-wrap">
            <HighlightedMentionText text={text} />
          </span>
        </div>
      )}
    </div>
  )
}

function FileAttachmentChip({ filePath }: { filePath: string }) {
  const fileName = getPathBasename(filePath)
  const isImage = isImageFile(filePath)
  const [dataUrl, setDataUrl] = useState<string | null>(null)

  useEffect(() => {
    if (!isImage) return
    let cancelled = false
    window.api.fs
      .readFileDataUrl(filePath)
      .then((url) => {
        if (!cancelled) setDataUrl(url)
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [filePath, isImage])

  if (isImage && dataUrl) {
    return (
      <div className="border-border overflow-hidden rounded-md border">
        <img src={dataUrl} alt={fileName} className="max-h-48 max-w-xs object-contain" />
      </div>
    )
  }

  return (
    <div className="border-border bg-interactive flex items-center gap-1.5 rounded-md border px-2 py-1">
      <FileText size={12} className="text-foreground-subtle shrink-0" />
      <span className="text-foreground-muted max-w-[140px] truncate text-xs">{fileName}</span>
    </div>
  )
}

function LiveIndicator({ label, since }: { label: string; since: number }) {
  return (
    <div className="text-accent flex items-center gap-2 py-1">
      <AgentSpinner />
      <span className="text-foreground-muted truncate text-xs">{label}</span>
      <ElapsedTimer since={since} />
    </div>
  )
}

function ElapsedTimer({ since }: { since: number }) {
  const [, setTick] = useState(0)
  useEffect(() => {
    const timer = setInterval(() => setTick((n) => n + 1), 1000)
    return () => clearInterval(timer)
  }, [])

  const totalSeconds = Math.max(0, Math.floor((Date.now() - since) / 1000))
  if (totalSeconds < 1) return null
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return (
    <span className="text-foreground-subtle shrink-0 text-[11px] tabular-nums">
      {minutes > 0 ? `${minutes}m ${seconds}s` : `${seconds}s`}
    </span>
  )
}
