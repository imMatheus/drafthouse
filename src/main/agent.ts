import { app, ipcMain, type WebContents } from 'electron'
import { spawn, type ChildProcess } from 'child_process'
import { randomUUID } from 'crypto'
import { readFileSync } from 'fs'
import type { AgentSessionSummary, AgentStreamEvent } from '../shared/types'

interface AgentProcess {
  id: string
  prompt: string
  cwd: string
  status: 'running' | 'completed' | 'error' | 'cancelled'
  startedAt: number
  childProcess: ChildProcess
  webContents: WebContents
}

const sessions = new Map<string, AgentProcess>()

function sendAgentEvent(session: AgentProcess, event: AgentStreamEvent): void {
  if (session.webContents.isDestroyed()) return
  session.webContents.send('agent:event', { sessionId: session.id, event })
}

function buildPromptWithFiles(prompt: string, files?: string[]): string {
  if (!files || files.length === 0) return prompt

  const fileContents = files
    .map((filePath) => {
      try {
        const content = readFileSync(filePath, 'utf-8')
        return `Here is the content of ${filePath}:\n\`\`\`\n${content}\n\`\`\``
      } catch {
        return `(Could not read file: ${filePath})`
      }
    })
    .join('\n\n')

  return `${fileContents}\n\n${prompt}`
}

function buildCliArgs(options: {
  prompt: string
  resumeSessionId?: string
  skipPermissions?: boolean
}): string[] {
  const args = ['-p', '--output-format', 'stream-json', '--verbose']

  if (options.skipPermissions) {
    args.push('--dangerously-skip-permissions')
  }

  if (options.resumeSessionId) {
    args.push('--resume', options.resumeSessionId)
  }

  args.push(options.prompt)
  return args
}

function wireChildProcess(
  child: ChildProcess,
  sessionId: string
): void {
  let buffer = ''

  child.stdout?.on('data', (chunk: Buffer) => {
    buffer += chunk.toString()
    const lines = buffer.split('\n')
    buffer = lines.pop() ?? ''

    for (const line of lines) {
      if (!line.trim()) continue
      try {
        const event = JSON.parse(line) as AgentStreamEvent
        const session = sessions.get(sessionId)
        if (session) sendAgentEvent(session, event)
      } catch {
        // Ignore unparseable lines
      }
    }
  })

  child.stderr?.on('data', (chunk: Buffer) => {
    console.error(`[agent:${sessionId}] stderr:`, chunk.toString())
  })

  child.on('error', (err) => {
    const session = sessions.get(sessionId)
    if (session) {
      session.status = 'error'
      sendAgentEvent(session, {
        type: 'system',
        subtype: 'error',
        message: `Failed to start agent: ${err.message}`
      })
    }
  })

  child.on('exit', (code) => {
    // Flush remaining buffer
    if (buffer.trim()) {
      try {
        const event = JSON.parse(buffer) as AgentStreamEvent
        const session = sessions.get(sessionId)
        if (session) sendAgentEvent(session, event)
      } catch {
        // Ignore
      }
      buffer = ''
    }

    const session = sessions.get(sessionId)
    if (!session || session.status === 'cancelled') return

    session.status = code === 0 ? 'completed' : 'error'
    if (code !== 0) {
      sendAgentEvent(session, {
        type: 'system',
        subtype: 'exit',
        message: `Process exited with code ${code}`
      })
    }
  })
}

export function startAgentSession(
  cwd: string,
  prompt: string,
  files: string[] | undefined,
  skipPermissions: boolean,
  webContents: WebContents
): { sessionId: string } {
  const sessionId = randomUUID()
  const fullPrompt = buildPromptWithFiles(prompt, files)

  const child = spawn(
    'claude',
    buildCliArgs({ prompt: fullPrompt, skipPermissions }),
    { cwd, env: { ...process.env }, stdio: ['pipe', 'pipe', 'pipe'] }
  )

  const agentProcess: AgentProcess = {
    id: sessionId,
    prompt,
    cwd,
    status: 'running',
    startedAt: Date.now(),
    childProcess: child,
    webContents
  }

  sessions.set(sessionId, agentProcess)
  wireChildProcess(child, sessionId)

  return { sessionId }
}

export function continueAgentSession(
  existingSessionId: string,
  cliSessionId: string,
  cwd: string,
  prompt: string,
  files: string[] | undefined,
  skipPermissions: boolean,
  webContents: WebContents
): void {
  const existingSession = sessions.get(existingSessionId)
  const fullPrompt = buildPromptWithFiles(prompt, files)

  const child = spawn(
    'claude',
    buildCliArgs({ prompt: fullPrompt, resumeSessionId: cliSessionId, skipPermissions }),
    { cwd, env: { ...process.env }, stdio: ['pipe', 'pipe', 'pipe'] }
  )

  if (existingSession) {
    existingSession.childProcess = child
    existingSession.status = 'running'
    existingSession.webContents = webContents
  }

  wireChildProcess(child, existingSessionId)
}

export function registerAgentHandlers(): void {
  ipcMain.handle(
    'agent:start',
    (event, cwd: string, prompt: string, files?: string[], skipPermissions?: boolean) => {
      return startAgentSession(cwd, prompt, files, skipPermissions ?? false, event.sender)
    }
  )

  ipcMain.handle(
    'agent:continue',
    (
      event,
      sessionId: string,
      cliSessionId: string,
      cwd: string,
      prompt: string,
      files?: string[],
      skipPermissions?: boolean
    ) => {
      continueAgentSession(
        sessionId, cliSessionId, cwd, prompt, files,
        skipPermissions ?? false, event.sender
      )
    }
  )

  ipcMain.handle('agent:stop', (_event, sessionId: string) => {
    const session = sessions.get(sessionId)
    if (!session || session.status !== 'running') return

    session.status = 'cancelled'
    session.childProcess.kill('SIGTERM')
  })

  ipcMain.handle('agent:list-sessions', () => {
    const summaries: AgentSessionSummary[] = []
    for (const session of sessions.values()) {
      summaries.push({
        id: session.id,
        prompt: session.prompt,
        status: session.status,
        startedAt: session.startedAt
      })
    }
    return summaries
  })

  app.on('before-quit', () => {
    for (const session of sessions.values()) {
      if (session.status === 'running') {
        session.childProcess.kill('SIGTERM')
      }
    }
    sessions.clear()
  })
}
