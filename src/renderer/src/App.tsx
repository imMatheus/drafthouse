import { useEffect, useState } from 'react'
import { Navigate, Route, Routes, useNavigate } from 'react-router-dom'
import { AuthContext, useAuth, useAuthProvider } from './hooks/useAuth'
import RepoSidebar from './components/RepoSidebar'
import { SettingsProvider } from './hooks/useSettings'
import { ThemeProvider } from './hooks/useTheme'
import Home from './pages/Home'
import Login from './pages/Login'
import Workspace from './pages/Workspace'
import {
  createInitialWorkspaceSession,
  clearWorkspaceSession,
  loadWorkspaceSessionForFolder,
  loadWorkspaceSession,
  saveWorkspaceSession,
  type WorkspaceSession
} from './lib/workspaceSession'

function AppContent(): React.JSX.Element {
  const { user, loading } = useAuth()
  const navigate = useNavigate()
  const [workspaceSession, setWorkspaceSession] = useState<WorkspaceSession | null>(() => loadWorkspaceSession())

  const persistWorkspaceSession = (
    updater: WorkspaceSession | null | ((current: WorkspaceSession | null) => WorkspaceSession | null)
  ): void => {
    setWorkspaceSession((currentSession) => {
      const nextSession = typeof updater === 'function' ? updater(currentSession) : updater

      if (nextSession) {
        saveWorkspaceSession(nextSession)
      } else {
        clearWorkspaceSession()
      }

      return nextSession
    })
  }

  const openWorkspace = (folderPath: string): void => {
    persistWorkspaceSession(loadWorkspaceSessionForFolder(folderPath) ?? createInitialWorkspaceSession(folderPath))
    navigate('/workspace')
  }

  const updateWorkspaceSession = (patch: Partial<WorkspaceSession>): void => {
    persistWorkspaceSession((currentSession) => {
      if (!currentSession) return null
      return { ...currentSession, ...patch }
    })
  }

  const closeWorkspace = (): void => {
    persistWorkspaceSession(null)
    navigate('/')
  }

  useEffect(() => {
    const unsubscribe = window.api.fs.onOpenFolder((path) => {
      void window.api.fs
        .openRecent(path)
        .then((openedPath) => {
          openWorkspace(openedPath)
        })
        .catch((error: unknown) => {
          console.error('Failed to open folder from app menu', error)
        })
    })

    return unsubscribe
  }, [])

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-background">
        <p className="text-foreground-muted">Loading...</p>
      </div>
    )
  }

  if (!user) return <Login />

  return (
    <Routes>
      <Route
        path="/"
        element={
          <div className="flex h-screen bg-background">
            <RepoSidebar />
            <Home onOpenFolder={openWorkspace} />
          </div>
        }
      />
      <Route
        path="/workspace/*"
        element={
          <div className="flex h-screen bg-background">
            <Workspace
              session={workspaceSession}
              onCloseWorkspace={closeWorkspace}
              onUpdateSession={updateWorkspaceSession}
            />
          </div>
        }
      />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}

function App(): React.JSX.Element {
  const auth = useAuthProvider()

  return (
    <ThemeProvider>
      <SettingsProvider>
        <AuthContext value={auth}>
          <AppContent />
        </AuthContext>
      </SettingsProvider>
    </ThemeProvider>
  )
}

export default App
