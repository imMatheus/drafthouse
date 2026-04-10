import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'

const api = {
  auth: {
    login: (): Promise<unknown> => ipcRenderer.invoke('auth:login'),
    logout: (): Promise<unknown> => ipcRenderer.invoke('auth:logout'),
    getUser: (): Promise<unknown> => ipcRenderer.invoke('auth:get-user'),
    onDeviceCode: (callback: (data: { userCode: string }) => void): void => {
      ipcRenderer.on('auth:device-code', (_event, data) => callback(data))
    },
    getRepos: (query?: string): Promise<unknown> => ipcRenderer.invoke('auth:get-repos', query)
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
