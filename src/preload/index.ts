import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'

const api = {
  auth: {
    login: (): Promise<unknown> => ipcRenderer.invoke('auth:login'),
    logout: (): Promise<unknown> => ipcRenderer.invoke('auth:logout'),
    getUser: (): Promise<unknown> => ipcRenderer.invoke('auth:get-user'),
    onDeviceCode: (callback: (data: { userCode: string }) => void): (() => void) => {
      const listener = (_event: IpcRendererEvent, data: { userCode: string }): void =>
        callback(data)
      ipcRenderer.on('auth:device-code', listener)
      return () => ipcRenderer.removeListener('auth:device-code', listener)
    },
    getRepos: (query?: string): Promise<unknown> => ipcRenderer.invoke('auth:get-repos', query),
    getPullRequests: (owner: string, repo: string): Promise<unknown> =>
      ipcRenderer.invoke('auth:get-pull-requests', owner, repo)
  },
  fs: {
    openFolder: (): Promise<unknown> => ipcRenderer.invoke('fs:open-folder'),
    readDir: (path: string): Promise<unknown> => ipcRenderer.invoke('fs:read-dir', path),
    readFile: (path: string): Promise<unknown> => ipcRenderer.invoke('fs:read-file', path),
    getRecentFolders: (): Promise<unknown> => ipcRenderer.invoke('fs:get-recent-folders'),
    openRecent: (path: string): Promise<unknown> => ipcRenderer.invoke('fs:open-recent', path),
    getGitInfo: (path: string): Promise<unknown> => ipcRenderer.invoke('fs:get-git-info', path),
    onOpenFolder: (callback: (path: string) => void): (() => void) => {
      const listener = (_event: IpcRendererEvent, path: string): void => callback(path)
      ipcRenderer.on('menu:open-folder', listener)
      return () => ipcRenderer.removeListener('menu:open-folder', listener)
    }
  }
}

if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electron', electronAPI)
    contextBridge.exposeInMainWorld('api', api)
  } catch (error) {
    console.error(error)
  }
} else {
  // @ts-ignore (define in dts)
  window.electron = electronAPI
  // @ts-ignore (define in dts)
  window.api = api
}
