import { useAuth } from '../hooks/useAuth'

export default function Login() {
  const { loggingIn, deviceCode, login } = useAuth()

  return (
    <div className="bg-background flex h-screen flex-col items-center justify-center gap-6">
      <h1 className="text-foreground text-4xl font-bold">Drafthouse</h1>

      {loggingIn ? (
        <div className="flex flex-col items-center gap-3">
          <p className="text-foreground-muted">Your browser has been opened. Enter this code:</p>
          {deviceCode && (
            <code className="border-border bg-surface text-foreground rounded-lg border px-6 py-3 font-mono text-2xl font-bold tracking-widest">
              {deviceCode}
            </code>
          )}
          <p className="text-foreground-subtle text-sm">Waiting for authorization...</p>
        </div>
      ) : (
        <button
          onClick={login}
          className="bg-accent text-accent-foreground hover:bg-accent-hover rounded-lg px-5 py-2.5 font-medium"
        >
          Sign in with GitHub
        </button>
      )}
    </div>
  )
}
