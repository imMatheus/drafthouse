import { app, ipcMain, type WebContents } from 'electron'
import { spawn, spawnSync, type ChildProcess } from 'child_process'
import { randomUUID } from 'crypto'
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'fs'
import { readFile } from 'fs/promises'
import { homedir } from 'os'
import { join } from 'path'
import type {
  AgentContentBlock,
  AgentEffortLevel,
  AgentPermissionMode,
  AgentPermissionResponse,
  AgentSendRequest,
  AgentSessionMeta,
  AgentSessionSnapshot,
  AgentStartRequest,
  AgentStreamEvent,
  AgentStreamPermissionRequest,
  AgentStreamPermissionResolved
} from '../shared/types'
import { requireAllowedDirectory } from './fs'

// ============================================================
// Claude binary + PATH resolution
//
// GUI apps launched from Finder/Dock get a minimal PATH that almost never
// contains `claude` (or the user's node/git shims). Resolve both through the
// user's login shell once and cache the result.
// ============================================================

let cachedShellPath: string | null | undefined
let cachedClaudeBinary: string | null | undefined

function loginShellPath(): string | null {
  if (cachedShellPath !== undefined) return cachedShellPath
  if (process.platform === 'win32') {
    cachedShellPath = process.env.PATH ?? null
    return cachedShellPath
  }
  const shell = process.env.SHELL || '/bin/zsh'
  const result = spawnSync(shell, ['-lc', 'printf %s "$PATH"'], { encoding: 'utf-8', timeout: 5000 })
  cachedShellPath = result.status === 0 && result.stdout ? result.stdout : null
  return cachedShellPath
}

function resolveClaudeBinary(): string | null {
  if (cachedClaudeBinary !== undefined) return cachedClaudeBinary

  const candidates = [
    join(homedir(), '.local', 'bin', 'claude'),
    join(homedir(), '.claude', 'local', 'claude'),
    '/opt/homebrew/bin/claude',
    '/usr/local/bin/claude'
  ]

  const shellPath = loginShellPath()
  if (shellPath) {
    const shell = process.env.SHELL || '/bin/zsh'
    const result = spawnSync(shell, ['-lc', 'command -v claude'], {
      encoding: 'utf-8',
      timeout: 5000,
      env: { ...process.env, PATH: shellPath }
    })
    const found = result.status === 0 ? result.stdout.trim() : ''
    if (found) {
      cachedClaudeBinary = found
      return found
    }
  }

  for (const candidate of candidates) {
    if (existsSync(candidate)) {
      cachedClaudeBinary = candidate
      return candidate
    }
  }

  cachedClaudeBinary = null
  return null
}

function childEnv(): NodeJS.ProcessEnv {
  const shellPath = loginShellPath()
  return shellPath ? { ...process.env, PATH: shellPath } : { ...process.env }
}

// ============================================================
// Persistence
//
// One JSON file per session under userData/agent-sessions. Canonical events
// exclude `stream_event` partials — finals carry the same content. Writes are
// debounced per session and flushed synchronously on quit.
// ============================================================

const PERSIST_VERSION = 1

interface PersistedSession {
  version: number
  meta: AgentSessionMeta
  events: AgentStreamEvent[]
}

function sessionsDir(): string {
  return join(app.getPath('userData'), 'agent-sessions')
}

function sessionFile(sessionId: string): string {
  return join(sessionsDir(), `${sessionId}.json`)
}

function readPersistedSession(sessionId: string): PersistedSession | null {
  try {
    const raw = readFileSync(sessionFile(sessionId), 'utf-8')
    const parsed = JSON.parse(raw) as PersistedSession
    if (!parsed || typeof parsed !== 'object' || !parsed.meta || !Array.isArray(parsed.events)) return null
    return parsed
  } catch {
    return null
  }
}

// ============================================================
// Session registry
// ============================================================

interface PendingControl {
  resolve: (response: Record<string, unknown>) => void
  reject: (err: Error) => void
  timer: NodeJS.Timeout
}

interface ManagedSession {
  meta: AgentSessionMeta
  /** Canonical event log (no stream_event partials). Mirrors what's on disk. */
  events: AgentStreamEvent[]
  child: ChildProcess | null
  /** Bumped on every spawn; child callbacks bail when their generation is stale. */
  generation: number
  webContents: WebContents | null
  stdoutBuffer: string
  stderrTail: string[]
  pendingControls: Map<string, PendingControl>
  pendingPermissions: Map<string, AgentStreamPermissionRequest>
  /** True between a user message being sent and its result event. */
  turnActive: boolean
  /** Set when we intentionally kill the child (stop escalation, idle reap, delete). */
  expectExit: boolean
  /**
   * A spawn-time-only setting (--effort) changed mid-turn; reap the child when
   * the turn ends so the next message resumes with the new flags.
   */
  respawnPending: boolean
  idleTimer: NodeJS.Timeout | null
  saveTimer: NodeJS.Timeout | null
}

const sessions = new Map<string, ManagedSession>()
/** Session ids whose files exist on disk but haven't been loaded into memory. */
let diskScanned = false

const IDLE_CHILD_TIMEOUT_MS = 5 * 60 * 1000
const CONTROL_REQUEST_TIMEOUT_MS = 30_000
const STDERR_TAIL_LINES = 40
const SAVE_DEBOUNCE_MS = 400

const BASELINE_SYSTEM_PROMPT =
  'UI rendering: whenever you mention a GitHub pull request in your response, include its full URL (e.g. `https://github.com/{owner}/{repo}/pull/{number}`) inline with the mention. The chat UI parses these URLs and renders them as interactive PR pills showing the number, title, and state. Prefer the URL form over bare `#N` references.'

function scheduleSave(session: ManagedSession, immediate = false): void {
  if (session.saveTimer) {
    clearTimeout(session.saveTimer)
    session.saveTimer = null
  }
  if (immediate) {
    saveSessionNow(session)
    return
  }
  session.saveTimer = setTimeout(() => {
    session.saveTimer = null
    saveSessionNow(session)
  }, SAVE_DEBOUNCE_MS)
}

function saveSessionNow(session: ManagedSession): void {
  try {
    mkdirSync(sessionsDir(), { recursive: true })
    const payload: PersistedSession = { version: PERSIST_VERSION, meta: session.meta, events: session.events }
    writeFileSync(sessionFile(session.meta.id), JSON.stringify(payload))
  } catch (err) {
    console.error(`[agent:${session.meta.id}] failed to persist session:`, err)
  }
}

/**
 * A session persisted while a permission prompt was still pending (quit or
 * crash mid-prompt) restores with an unanswered card that no child can ever
 * receive an answer for — respondToPermission would silently no-op. Deny the
 * orphans in the log so the cards render as resolved.
 */
function resolveDanglingPermissions(events: AgentStreamEvent[]): void {
  const resolved = new Set<string>()
  const requested: string[] = []
  for (const event of events) {
    if (event.type === 'permission_resolved') resolved.add(event.requestId)
    else if (event.type === 'permission_request') requested.push(event.requestId)
  }
  for (const requestId of requested) {
    if (!resolved.has(requestId)) {
      events.push({ type: 'permission_resolved', requestId, behavior: 'deny' })
    }
  }
}

/** Load every persisted session into memory once; running→interrupted on load. */
function ensureDiskScanned(): void {
  if (diskScanned) return
  diskScanned = true
  let files: string[]
  try {
    files = readdirSync(sessionsDir()).filter((f) => f.endsWith('.json'))
  } catch {
    return
  }
  for (const file of files) {
    const sessionId = file.slice(0, -'.json'.length)
    if (sessions.has(sessionId)) continue
    const persisted = readPersistedSession(sessionId)
    if (!persisted) continue
    if (persisted.meta.status === 'running') {
      persisted.meta.status = 'interrupted'
    }
    resolveDanglingPermissions(persisted.events)
    sessions.set(sessionId, {
      meta: persisted.meta,
      events: persisted.events,
      child: null,
      generation: 0,
      webContents: null,
      stdoutBuffer: '',
      stderrTail: [],
      pendingControls: new Map(),
      pendingPermissions: new Map(),
      turnActive: false,
      expectExit: false,
      respawnPending: false,
      idleTimer: null,
      saveTimer: null
    })
  }
}

// ============================================================
// Event fan-out
// ============================================================

function forwardEvent(session: ManagedSession, event: AgentStreamEvent, seq: number): void {
  const wc = session.webContents
  if (!wc || wc.isDestroyed()) return
  wc.send('agent:event', { sessionId: session.meta.id, seq, event })
}

/** Append to the canonical log, persist (debounced) and forward to the renderer. */
function pushEvent(session: ManagedSession, event: AgentStreamEvent): void {
  session.events.push(event)
  session.meta.lastActivityAt = Date.now()
  scheduleSave(session)
  forwardEvent(session, event, session.events.length - 1)
}

/**
 * Forward-only path for stream_event partials — never persisted. They carry
 * the canonical position they sit after, so a renderer hydrating mid-stream
 * can replay buffered partials that postdate its snapshot.
 */
function pushPartial(session: ManagedSession, event: AgentStreamEvent): void {
  forwardEvent(session, event, session.events.length)
}

// ============================================================
// Attachments → content blocks
// ============================================================

const IMAGE_MEDIA_TYPES: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp'
}

const BINARY_EXTENSIONS = new Set([
  'bmp',
  'ico',
  'svgz',
  'mp3',
  'mp4',
  'wav',
  'avi',
  'mov',
  'mkv',
  'zip',
  'tar',
  'gz',
  'rar',
  '7z',
  'pdf',
  'doc',
  'docx',
  'xls',
  'xlsx',
  'exe',
  'dll',
  'so',
  'dylib',
  'wasm'
])

const MAX_IMAGE_BYTES = 3 * 1024 * 1024
const MAX_TEXT_ATTACHMENT_CHARS = 200_000

function fileExtension(filePath: string): string {
  return filePath.split('.').pop()?.toLowerCase() ?? ''
}

async function buildUserContent(prompt: string, files: string[] | undefined): Promise<AgentContentBlock[]> {
  const blocks: AgentContentBlock[] = []

  for (const filePath of files ?? []) {
    const ext = fileExtension(filePath)
    const imageMediaType = IMAGE_MEDIA_TYPES[ext]

    if (imageMediaType) {
      try {
        const data = await readFile(filePath)
        if (data.byteLength <= MAX_IMAGE_BYTES) {
          blocks.push({
            type: 'image',
            source: { type: 'base64', media_type: imageMediaType, data: data.toString('base64') }
          })
          continue
        }
        blocks.push({ type: 'text', text: `(Attached image is too large to inline: ${filePath})` })
        continue
      } catch {
        blocks.push({ type: 'text', text: `(Attached file: ${filePath})` })
        continue
      }
    }

    if (BINARY_EXTENSIONS.has(ext)) {
      blocks.push({ type: 'text', text: `(Attached file: ${filePath})` })
      continue
    }

    try {
      let content = await readFile(filePath, 'utf-8')
      let note = ''
      if (content.length > MAX_TEXT_ATTACHMENT_CHARS) {
        content = content.slice(0, MAX_TEXT_ATTACHMENT_CHARS)
        note = `\n... (truncated, read the full file at ${filePath})`
      }
      blocks.push({ type: 'text', text: `Here is the content of ${filePath}:\n\`\`\`\n${content}${note}\n\`\`\`` })
    } catch {
      blocks.push({ type: 'text', text: `(Attached file: ${filePath})` })
    }
  }

  blocks.push({ type: 'text', text: prompt })
  return blocks
}

// ============================================================
// Child process management
// ============================================================

function buildCliArgs(meta: AgentSessionMeta, firstSpawn: boolean): string[] {
  const args = [
    '-p',
    '--output-format',
    'stream-json',
    '--input-format',
    'stream-json',
    '--include-partial-messages',
    '--verbose',
    '--permission-prompt-tool',
    'stdio',
    '--permission-mode',
    meta.permissionMode
  ]

  if (meta.permissionMode === 'bypassPermissions') {
    args.push('--dangerously-skip-permissions')
  }

  if (meta.model) {
    args.push('--model', meta.model)
  }

  if (meta.effort) {
    args.push('--effort', meta.effort)
  }

  if (meta.cliSessionId) {
    args.push('--resume', meta.cliSessionId)
  } else if (firstSpawn) {
    // Pin the CLI session id to our own so transcripts and resume line up. Only
    // safe on the very first spawn — a retry after an early crash could collide
    // with the transcript the dead process already created under this id.
    args.push('--session-id', meta.id)
  }

  const suffix = meta.context?.systemPromptSuffix
  args.push('--append-system-prompt', suffix ? `${BASELINE_SYSTEM_PROMPT}\n\n${suffix}` : BASELINE_SYSTEM_PROMPT)

  return args
}

/**
 * Spawn (or return) the live child for a session. Returns null after emitting
 * a lifecycle event when the claude binary can't be found or spawning fails.
 */
function ensureChild(session: ManagedSession): ChildProcess | null {
  if (session.child && session.child.exitCode === null && !session.child.killed) {
    return session.child
  }

  const binary = resolveClaudeBinary()
  if (!binary) {
    session.meta.status = 'error'
    pushEvent(session, {
      type: 'lifecycle',
      subtype: 'binary_missing',
      message:
        'The `claude` CLI was not found. Install Claude Code (https://claude.com/claude-code) and make sure `claude` is on your PATH.'
    })
    scheduleSave(session, true)
    return null
  }

  const child = spawn(binary, buildCliArgs(session.meta, session.generation === 0), {
    cwd: session.meta.cwd,
    stdio: ['pipe', 'pipe', 'pipe'],
    env: childEnv()
  })

  session.child = child
  session.generation += 1
  session.stdoutBuffer = ''
  session.stderrTail = []
  session.expectExit = false
  const generation = session.generation

  child.stdout?.on('data', (chunk: Buffer) => {
    if (session.generation !== generation) return
    session.stdoutBuffer += chunk.toString()
    const lines = session.stdoutBuffer.split('\n')
    session.stdoutBuffer = lines.pop() ?? ''
    for (const line of lines) {
      if (line.trim()) handleChildLine(session, line)
    }
  })

  child.stderr?.on('data', (chunk: Buffer) => {
    if (session.generation !== generation) return
    const lines = chunk.toString().split('\n').filter(Boolean)
    session.stderrTail.push(...lines)
    if (session.stderrTail.length > STDERR_TAIL_LINES) {
      session.stderrTail.splice(0, session.stderrTail.length - STDERR_TAIL_LINES)
    }
    console.error(`[agent:${session.meta.id}] stderr:`, chunk.toString())
  })

  // Pipe errors (EPIPE from a dying child) are emitted asynchronously on the
  // stream; without a listener they crash the main process. writeToChild's
  // try/catch only covers synchronous write failures, and the exit handler
  // already does the recovery.
  child.stdin?.on('error', (err) => {
    console.error(`[agent:${session.meta.id}] stdin error:`, err)
  })

  child.on('error', (err) => {
    if (session.generation !== generation) return
    session.child = null
    failPendingRequests(session)
    session.meta.status = 'error'
    session.turnActive = false
    pushEvent(session, {
      type: 'lifecycle',
      subtype: 'spawn_error',
      message: `Failed to start agent: ${err.message}`,
      failedTurn: true
    })
    scheduleSave(session, true)
  })

  child.on('exit', (code) => {
    if (session.generation !== generation) return

    if (session.stdoutBuffer.trim()) {
      handleChildLine(session, session.stdoutBuffer)
      session.stdoutBuffer = ''
    }

    session.child = null
    failPendingRequests(session)

    if (session.turnActive && !session.expectExit) {
      // Died mid-turn without a result event — surface it loudly.
      session.turnActive = false
      session.meta.status = 'error'
      pushEvent(session, {
        type: 'lifecycle',
        subtype: 'exit',
        message: `Claude exited unexpectedly (code ${code ?? 'unknown'})`,
        exitCode: code,
        stderrTail: session.stderrTail.length > 0 ? session.stderrTail.join('\n') : undefined,
        failedTurn: true
      })
    } else if (session.turnActive && session.expectExit) {
      // We killed it (stop escalation / delete) — the stop path already set status.
      session.turnActive = false
    }

    session.expectExit = false
    scheduleSave(session, true)
  })

  // Handshake the control channel like the SDK does. Fire-and-forget: if this
  // CLI version answers with an error (or nothing), sessions still work.
  void sendControlRequest(session, { subtype: 'initialize' }).catch(() => {})

  return child
}

function failPendingRequests(session: ManagedSession): void {
  for (const [, pending] of session.pendingControls) {
    clearTimeout(pending.timer)
    pending.reject(new Error('Agent process exited'))
  }
  session.pendingControls.clear()

  // Unblock any permission cards still waiting in the UI.
  for (const [requestId] of session.pendingPermissions) {
    pushEvent(session, { type: 'permission_resolved', requestId, behavior: 'deny' })
  }
  session.pendingPermissions.clear()
}

function writeToChild(session: ManagedSession, payload: Record<string, unknown>): boolean {
  const child = session.child
  if (!child || !child.stdin || child.exitCode !== null) return false
  try {
    child.stdin.write(JSON.stringify(payload) + '\n')
    return true
  } catch (err) {
    console.error(`[agent:${session.meta.id}] stdin write failed:`, err)
    return false
  }
}

function killChild(session: ManagedSession): void {
  const child = session.child
  if (!child) return
  session.expectExit = true
  child.kill('SIGTERM')
  const generation = session.generation
  setTimeout(() => {
    if (session.generation === generation && session.child === child && child.exitCode === null) {
      child.kill('SIGKILL')
    }
  }, 3000)
}

function clearIdleTimer(session: ManagedSession): void {
  if (session.idleTimer) {
    clearTimeout(session.idleTimer)
    session.idleTimer = null
  }
}

function startIdleTimer(session: ManagedSession): void {
  clearIdleTimer(session)
  session.idleTimer = setTimeout(() => {
    session.idleTimer = null
    // Reap the idle child to release memory. The session resumes transparently
    // via --resume on the next message.
    if (!session.turnActive && session.child) {
      killChild(session)
    }
  }, IDLE_CHILD_TIMEOUT_MS)
}

// ============================================================
// Control protocol (stdin/stdout control_* messages)
// ============================================================

function sendControlRequest(
  session: ManagedSession,
  request: Record<string, unknown>
): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    const requestId = randomUUID()
    const ok = writeToChild(session, { type: 'control_request', request_id: requestId, request })
    if (!ok) {
      reject(new Error('Agent process is not running'))
      return
    }
    const timer = setTimeout(() => {
      session.pendingControls.delete(requestId)
      reject(new Error(`Control request ${String(request.subtype)} timed out`))
    }, CONTROL_REQUEST_TIMEOUT_MS)
    session.pendingControls.set(requestId, { resolve, reject, timer })
  })
}

function handleControlResponse(session: ManagedSession, message: Record<string, unknown>): void {
  const response = message.response as { subtype?: string; request_id?: string; error?: string } | undefined
  if (!response?.request_id) return
  const pending = session.pendingControls.get(response.request_id)
  if (!pending) return
  session.pendingControls.delete(response.request_id)
  clearTimeout(pending.timer)
  if (response.subtype === 'error') {
    pending.reject(new Error(response.error ?? 'Control request failed'))
  } else {
    pending.resolve(response as Record<string, unknown>)
  }
}

function handleIncomingControlRequest(session: ManagedSession, message: Record<string, unknown>): void {
  const requestId = message.request_id as string | undefined
  const request = message.request as Record<string, unknown> | undefined
  if (!requestId || !request) return

  if (request.subtype === 'can_use_tool') {
    const permissionRequest: AgentStreamPermissionRequest = {
      type: 'permission_request',
      requestId,
      toolName: typeof request.tool_name === 'string' ? request.tool_name : 'Unknown tool',
      input: (request.input as Record<string, unknown>) ?? {},
      toolUseId: typeof request.tool_use_id === 'string' ? request.tool_use_id : undefined,
      description: typeof request.description === 'string' ? request.description : undefined
    }
    session.pendingPermissions.set(requestId, permissionRequest)
    pushEvent(session, permissionRequest)
    return
  }

  // Anything else (hook callbacks, MCP passthrough) is unsupported here.
  writeToChild(session, {
    type: 'control_response',
    response: {
      subtype: 'error',
      request_id: requestId,
      error: `Unsupported control request: ${String(request.subtype)}`
    }
  })
}

function handleCancelledControlRequest(session: ManagedSession, message: Record<string, unknown>): void {
  const requestId = message.request_id as string | undefined
  if (!requestId) return
  if (session.pendingPermissions.delete(requestId)) {
    pushEvent(session, { type: 'permission_resolved', requestId, behavior: 'deny' })
  }
}

// ============================================================
// Stream event dispatch
// ============================================================

function handleChildLine(session: ManagedSession, line: string): void {
  let parsed: Record<string, unknown>
  try {
    parsed = JSON.parse(line) as Record<string, unknown>
  } catch {
    return
  }

  switch (parsed.type) {
    case 'control_response':
      handleControlResponse(session, parsed)
      return
    case 'control_request':
      handleIncomingControlRequest(session, parsed)
      return
    case 'control_cancel_request':
      handleCancelledControlRequest(session, parsed)
      return
  }

  const event = parsed as unknown as AgentStreamEvent

  if (event.type === 'stream_event') {
    pushPartial(session, event)
    return
  }

  if (event.type === 'system' && event.subtype === 'init') {
    session.meta.cliSessionId = (event as { session_id?: string }).session_id ?? session.meta.cliSessionId
    const model = (event as { model?: string }).model
    if (model) session.meta.initModel = model
  }

  if (event.type === 'result') {
    session.turnActive = false
    if (typeof event.total_cost_usd === 'number') {
      session.meta.totalCostUsd = event.total_cost_usd
    }
    // A stop can race the turn's own result — the user's cancel wins.
    if (session.meta.status !== 'cancelled') {
      session.meta.status = event.is_error ? 'error' : 'completed'
    }
    if (session.respawnPending) {
      // A spawn-time setting changed mid-turn; reap now that the turn is over
      // so the next message resumes under the new flags.
      session.respawnPending = false
      killChild(session)
    } else {
      startIdleTimer(session)
    }
  }

  pushEvent(session, event)

  if (event.type === 'result') {
    scheduleSave(session, true)
  }
}

// ============================================================
// Public operations
// ============================================================

async function startSession(webContents: WebContents, request: AgentStartRequest): Promise<{ sessionId: string }> {
  ensureDiskScanned()

  const sessionId = randomUUID()
  const now = Date.now()
  const meta: AgentSessionMeta = {
    id: sessionId,
    prompt: request.prompt,
    status: 'running',
    startedAt: now,
    lastActivityAt: now,
    cliSessionId: null,
    files: request.files ?? [],
    context: request.context,
    permissionMode: request.permissionMode,
    model: request.model ?? null,
    effort: request.effort ?? null,
    cwd: request.cwd
  }

  const session: ManagedSession = {
    meta,
    events: [],
    child: null,
    generation: 0,
    webContents,
    stdoutBuffer: '',
    stderrTail: [],
    pendingControls: new Map(),
    pendingPermissions: new Map(),
    turnActive: false,
    expectExit: false,
    respawnPending: false,
    idleTimer: null,
    saveTimer: null
  }
  sessions.set(sessionId, session)

  await sendUserTurn(session, request.prompt, request.prompt, request.files)
  return { sessionId }
}

async function sendToSession(webContents: WebContents, request: AgentSendRequest): Promise<void> {
  ensureDiskScanned()
  const session = sessions.get(request.sessionId)
  if (!session) throw new Error(`Unknown agent session: ${request.sessionId}`)
  session.webContents = webContents
  await sendUserTurn(session, request.prompt, request.cliPrompt ?? request.prompt, request.files)
}

async function sendUserTurn(
  session: ManagedSession,
  displayPrompt: string,
  cliPrompt: string,
  files: string[] | undefined
): Promise<void> {
  clearIdleTimer(session)

  // Local echo first so the bubble shows even if the spawn fails right after.
  pushEvent(session, {
    type: 'user',
    synthetic: true,
    message: { role: 'user', content: [{ type: 'text', text: displayPrompt }] },
    attachedFiles: files && files.length > 0 ? files : undefined,
    session_id: session.meta.cliSessionId ?? session.meta.id
  })

  const child = ensureChild(session)
  if (!child) return

  session.meta.status = 'running'
  session.turnActive = true
  scheduleSave(session)

  const content = await buildUserContent(cliPrompt, files)

  // A stop can land while attachments were being read — don't start a turn
  // the user already cancelled. (Widened read: TS narrows status to 'running'
  // from the assignment above and can't see stopSession mutating it mid-await.)
  if ((session.meta.status as AgentSessionMeta['status']) === 'cancelled') {
    session.turnActive = false
    return
  }

  const ok = writeToChild(session, { type: 'user', message: { role: 'user', content } })
  if (!ok) {
    session.turnActive = false
    session.meta.status = 'error'
    pushEvent(session, {
      type: 'lifecycle',
      subtype: 'exit',
      message: 'Could not send the message: the agent process is not accepting input.',
      failedTurn: true
    })
  }
}

async function stopSession(sessionId: string): Promise<void> {
  const session = sessions.get(sessionId)
  if (!session || session.meta.status !== 'running') return

  session.meta.status = 'cancelled'
  scheduleSave(session)

  if (!session.child) return
  try {
    await sendControlRequest(session, { subtype: 'interrupt' })
    // Interrupt succeeded: the child stays alive for follow-ups.
    session.turnActive = false
    startIdleTimer(session)
  } catch {
    killChild(session)
  }
}

function deleteSession(sessionId: string): void {
  const session = sessions.get(sessionId)
  if (session) {
    clearIdleTimer(session)
    if (session.saveTimer) {
      clearTimeout(session.saveTimer)
      session.saveTimer = null
    }
    session.expectExit = true
    if (session.child) {
      const child = session.child
      child.kill('SIGTERM')
      setTimeout(() => {
        if (child.exitCode === null) child.kill('SIGKILL')
      }, 3000)
    }
    // Invalidate the child's callbacks so its exit handler can't resurrect the
    // session file we're about to remove.
    session.generation += 1
    sessions.delete(sessionId)
  }
  try {
    rmSync(sessionFile(sessionId), { force: true })
  } catch {
    // Already gone.
  }
}

function listSessions(webContents: WebContents, cwd: string): AgentSessionSnapshot[] {
  ensureDiskScanned()
  const snapshots: AgentSessionSnapshot[] = []
  for (const session of sessions.values()) {
    if (session.meta.cwd !== cwd) continue
    // Rebind so a reloaded window keeps receiving live events.
    session.webContents = webContents
    snapshots.push({ meta: session.meta, live: session.child !== null })
  }
  snapshots.sort((a, b) => a.meta.startedAt - b.meta.startedAt)
  return snapshots
}

function getSessionEvents(sessionId: string): { events: AgentStreamEvent[]; nextSeq: number } {
  ensureDiskScanned()
  const session = sessions.get(sessionId)
  if (!session) return { events: [], nextSeq: 0 }
  return { events: session.events, nextSeq: session.events.length }
}

function respondToPermission(sessionId: string, requestId: string, response: AgentPermissionResponse): void {
  const session = sessions.get(sessionId)
  if (!session) return
  const pending = session.pendingPermissions.get(requestId)
  if (!pending) return
  session.pendingPermissions.delete(requestId)

  const payload =
    response.behavior === 'allow'
      ? { behavior: 'allow', updatedInput: response.updatedInput ?? pending.input }
      : { behavior: 'deny', message: response.message ?? 'The user declined this action.' }

  writeToChild(session, {
    type: 'control_response',
    response: { subtype: 'success', request_id: requestId, response: payload }
  })
  const resolved: AgentStreamPermissionResolved = {
    type: 'permission_resolved',
    requestId,
    behavior: response.behavior
  }
  if (response.behavior === 'allow' && response.updatedInput) resolved.updatedInput = response.updatedInput
  pushEvent(session, resolved)
}

async function setSessionPermissionMode(sessionId: string, mode: AgentPermissionMode): Promise<void> {
  const session = sessions.get(sessionId)
  if (!session) return
  const previousMode = session.meta.permissionMode
  session.meta.permissionMode = mode
  scheduleSave(session)
  if (session.child) {
    try {
      await sendControlRequest(session, { subtype: 'set_permission_mode', mode })
    } catch (err) {
      // The CLI rejected the mode — don't let it stick and silently apply on
      // the next respawn while the renderer shows an error.
      session.meta.permissionMode = previousMode
      scheduleSave(session)
      throw err
    }
  }
}

async function setSessionModel(sessionId: string, model: string | null): Promise<void> {
  const session = sessions.get(sessionId)
  if (!session) return
  const previousModel = session.meta.model
  session.meta.model = model
  scheduleSave(session)
  if (session.child) {
    try {
      await sendControlRequest(session, { subtype: 'set_model', model: model ?? undefined })
    } catch (err) {
      // The CLI rejected the model (unknown id, etc.) — don't let a bad value
      // stick around to break the next spawn.
      session.meta.model = previousModel
      scheduleSave(session)
      throw err
    }
  }
}

const EFFORT_LEVELS = new Set<AgentEffortLevel>(['low', 'medium', 'high', 'xhigh', 'max'])

/**
 * Effort is a spawn-time-only flag (--effort) — the control protocol has no
 * set_effort. Persist the new level and recycle the child at the next safe
 * point; --resume makes the respawn invisible to the conversation.
 */
function setSessionEffort(sessionId: string, effort: AgentEffortLevel | null): void {
  if (effort !== null && !EFFORT_LEVELS.has(effort)) return
  const session = sessions.get(sessionId)
  if (!session || session.meta.effort === effort) return
  session.meta.effort = effort
  scheduleSave(session)
  if (!session.child) return
  if (session.turnActive) {
    session.respawnPending = true
  } else {
    killChild(session)
  }
}

// ============================================================
// IPC registration
// ============================================================

export function registerAgentHandlers(): void {
  ipcMain.handle('agent:start', (event, request: AgentStartRequest) => {
    // The agent child runs with --dangerously-skip-permissions, so hold its
    // cwd to the same sandbox every fs:/git: handler enforces.
    requireAllowedDirectory(event.sender, request.cwd)
    return startSession(event.sender, request)
  })

  ipcMain.handle('agent:send', (event, request: AgentSendRequest) => {
    return sendToSession(event.sender, request)
  })

  ipcMain.handle('agent:stop', (_event, sessionId: string) => {
    return stopSession(sessionId)
  })

  ipcMain.handle('agent:delete', (_event, sessionId: string) => {
    // The id feeds a filesystem path (sessionFile) — reject anything that
    // isn't a UUID so "../../x" can't escape the sessions directory.
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(sessionId)) return
    deleteSession(sessionId)
  })

  ipcMain.handle('agent:list', (event, cwd: string) => {
    return listSessions(event.sender, cwd)
  })

  ipcMain.handle('agent:events', (_event, sessionId: string) => {
    return getSessionEvents(sessionId)
  })

  ipcMain.handle(
    'agent:respond-permission',
    (_event, sessionId: string, requestId: string, response: AgentPermissionResponse) => {
      respondToPermission(sessionId, requestId, response)
    }
  )

  ipcMain.handle('agent:set-permission-mode', (_event, sessionId: string, mode: AgentPermissionMode) => {
    return setSessionPermissionMode(sessionId, mode)
  })

  ipcMain.handle('agent:set-effort', (_event, sessionId: string, effort: AgentEffortLevel | null) => {
    setSessionEffort(sessionId, effort)
  })

  ipcMain.handle('agent:set-model', (_event, sessionId: string, model: string | null) => {
    return setSessionModel(sessionId, model)
  })

  ipcMain.handle('agent:doctor', () => {
    const path = resolveClaudeBinary()
    return { found: path !== null, path }
  })

  app.on('before-quit', () => {
    for (const session of sessions.values()) {
      if (session.saveTimer) {
        clearTimeout(session.saveTimer)
        session.saveTimer = null
      }
      if (session.child) {
        session.expectExit = true
        if (session.meta.status === 'running') session.meta.status = 'interrupted'
        session.child.kill('SIGTERM')
      }
      saveSessionNow(session)
    }
  })
}
