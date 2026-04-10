import { AuthContext, useAuth, useAuthProvider } from './hooks/useAuth'
import Home from './pages/Home'
import Login from './pages/Login'

function AppContent(): React.JSX.Element {
  const { user, loading } = useAuth()

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-background">
        <p className="text-foreground-muted">Loading...</p>
      </div>
    )
  }

  return user ? <Home /> : <Login />
}

function App(): React.JSX.Element {
  const auth = useAuthProvider()

  return (
    <AuthContext value={auth}>
      <AppContent />
    </AuthContext>
  )
}

export default App
