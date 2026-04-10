import { useAuth } from '../hooks/useAuth'

export default function Login() {
  const { loggingIn, deviceCode, login } = useAuth()

  return (
    <div className="flex h-screen flex-col items-center justify-center gap-6 bg-background">
      <h1 className="text-4xl font-bold text-foreground">Drafthouse</h1>

      {loggingIn ? (
        <div className="flex flex-col items-center gap-3">
          <p className="text-foreground-muted">Your browser has been opened. Enter this code:</p>
          {deviceCode && (
            <code className="rounded-lg border border-border bg-surface px-6 py-3 font-mono text-2xl font-bold tracking-widest text-foreground">
              {deviceCode}
            </code>
          )}
          <p className="text-sm text-foreground-subtle">Waiting for authorization...</p>
        </div>
      ) : (
        <button
          onClick={login}
          className="rounded-lg bg-accent px-5 py-2.5 font-medium text-foreground hover:bg-accent-hover"
        >
          Sign in with GitHub
        </button>
      )}
    </div>
  )
}
