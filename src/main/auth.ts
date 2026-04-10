import { BrowserWindow, ipcMain, app, shell } from 'electron'
import { join } from 'path'
import { readFileSync, writeFileSync, existsSync } from 'fs'
import type { AuthData, GitHubRepo, GitHubUser } from '../shared/types'

const GITHUB_CLIENT_ID = import.meta.env.MAIN_VITE_GITHUB_CLIENT_ID

function getAuthPath(): string {
  return join(app.getPath('userData'), 'auth.json')
}

function loadAuth(): AuthData | null {
  const authPath = getAuthPath()
  if (!existsSync(authPath)) return null
  try {
    const data = JSON.parse(readFileSync(authPath, 'utf-8'))
    if (!data.token) return null
    return data
  } catch {
    return null
  }
}

function saveAuth(data: AuthData): void {
  writeFileSync(getAuthPath(), JSON.stringify(data))
}

function clearAuth(): void {
  const authPath = getAuthPath()
  if (existsSync(authPath)) {
    writeFileSync(authPath, '')
  }
}

async function requestDeviceCode(): Promise<{
  device_code: string
  user_code: string
  verification_uri: string
  interval: number
  expires_in: number
}> {
  const res = await fetch('https://github.com/login/device/code', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json'
    },
    body: JSON.stringify({
      client_id: GITHUB_CLIENT_ID,
      scope: 'read:user'
    })
  })

  const data = await res.json()
  if (data.error) throw new Error(data.error_description || data.error)
  return data
}

async function pollForToken(deviceCode: string, interval: number): Promise<string> {
  const wait = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms))

  while (true) {
    await wait(interval * 1000)

    const res = await fetch('https://github.com/login/oauth/access_token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json'
      },
      body: JSON.stringify({
        client_id: GITHUB_CLIENT_ID,
        device_code: deviceCode,
        grant_type: 'urn:ietf:params:oauth:grant-type:device_code'
      })
    })

    const data = await res.json()

    if (data.access_token) return data.access_token
    if (data.error === 'authorization_pending') continue
    if (data.error === 'slow_down') {
      interval += 5
      continue
    }
    throw new Error(data.error_description || data.error)
  }
}

async function fetchGitHubUser(token: string): Promise<GitHubUser> {
  const res = await fetch('https://api.github.com/user', {
    headers: { Authorization: `Bearer ${token}` }
  })
  if (!res.ok) throw new Error('Failed to fetch user')
  return res.json()
}

async function fetchRepos(token: string, query?: string): Promise<GitHubRepo[]> {
  if (query) {
    const res = await fetch(
      `https://api.github.com/search/repositories?q=${encodeURIComponent(query)}&per_page=10&affiliation=owner,collaborator,organization_member`,
      { headers: { Authorization: `Bearer ${token}` } }
    )
    if (!res.ok) throw new Error('Failed to search repos')
    const data = await res.json()
    return data.items
  }

  const res = await fetch(
    'https://api.github.com/user/repos?sort=pushed&per_page=10&affiliation=owner,collaborator,organization_member',
    { headers: { Authorization: `Bearer ${token}` } }
  )
  if (!res.ok) throw new Error('Failed to fetch repos')
  return res.json()
}

export function registerAuthHandlers(): void {
  ipcMain.handle('auth:login', async (event) => {
    const { device_code, user_code, verification_uri, interval } = await requestDeviceCode()

    shell.openExternal(`${verification_uri}?code=${user_code}`)

    const window = BrowserWindow.fromWebContents(event.sender)
    window?.webContents.send('auth:device-code', { userCode: user_code })

    const token = await pollForToken(device_code, interval)
    const user = await fetchGitHubUser(token)
    const authData: AuthData = { token, user }
    saveAuth(authData)
    return authData
  })

  ipcMain.handle('auth:logout', () => {
    clearAuth()
    return null
  })

  ipcMain.handle('auth:get-user', () => {
    return loadAuth()
  })

  ipcMain.handle('auth:get-repos', async (_event, query?: string) => {
    const auth = loadAuth()
    if (!auth) return null
    return fetchRepos(auth.token, query)
  })
}
