import { useCallback, useEffect, useState } from 'react'
import { Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom'
import { AuthContext, useAuth, useAuthProvider } from './hooks/useAuth'
import RepoSidebar from './components/RepoSidebar'
import { ThemeProvider } from './hooks/useTheme'
import Home from './pages/Home'
import Login from './pages/Login'
import Workspace from './pages/Workspace'
import {
  clearWorkspaceSession,
  loadWorkspaceSession,
  saveWorkspaceSession,
  type WorkspaceSession
} from './lib/workspaceSession'

function AppContent(): React.JSX.Element {
  const { user, loading } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [workspaceSession, setWorkspaceSession] = useState<WorkspaceSession | null>(() =>
    loadWorkspaceSession()
  )

  const persistWorkspaceSession = useCallback(
    (updater: WorkspaceSession | null | ((current: WorkspaceSession | null) => WorkspaceSession | null)) => {
      setWorkspaceSession((currentSession) => {
        const nextSession =
          typeof updater === 'function'
            ? updater(currentSession)
            : updater

        if (nextSession) {
          saveWorkspaceSession(nextSession)
        } else {
          clearWorkspaceSession()
        }

        return nextSession
      })
    },
    []
  )

  const openWorkspace = useCallback(
    (folderPath: string) => {
      persistWorkspaceSession((currentSession) => ({
        folderPath,
        explorerVisible: currentSession?.explorerVisible ?? true,
        selectedFilePath: null
      }))

      const nextPath =
        location.pathname.startsWith('/workspace/') ? location.pathname : '/workspace/files'

      navigate(nextPath)
    },
    [location.pathname, navigate, persistWorkspaceSession]
  )

  const updateWorkspaceSession = useCallback(
    (patch: Partial<WorkspaceSession>) => {
      persistWorkspaceSession((currentSession) => {
        if (!currentSession) return null
        return { ...currentSession, ...patch }
      })
    },
    [persistWorkspaceSession]
  )

  const closeWorkspace = useCallback(() => {
    persistWorkspaceSession(null)
    navigate('/')
  }, [navigate, persistWorkspaceSession])

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
  }, [openWorkspace])

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
              onOpenWorkspace={openWorkspace}
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
      <AuthContext value={auth}>
        <AppContent />
      </AuthContext>
    </ThemeProvider>
  )
}

export default App
