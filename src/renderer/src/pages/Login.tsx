import { useAuth } from '../hooks/useAuth'

export default function Login() {
  const { loggingIn, deviceCode, login } = useAuth()

  return (
    <div className="flex h-screen flex-col items-center justify-center gap-6 bg-neutral-900">
      <h1 className="text-4xl font-bold text-white">Drafthouse</h1>

      {loggingIn ? (
        <div className="flex flex-col items-center gap-3">
          <p className="text-neutral-400">Your browser has been opened. Enter this code:</p>
          {deviceCode && (
            <code className="rounded-lg bg-white/10 px-6 py-3 font-mono text-2xl font-bold tracking-widest text-white">
              {deviceCode}
            </code>
          )}
          <p className="text-sm text-neutral-500">Waiting for authorization...</p>
        </div>
      ) : (
        <button
          onClick={login}
          className="rounded-lg bg-white/10 px-4 py-2 text-white hover:bg-white/20"
        >
          Sign in with GitHub
        </button>
      )}
    </div>
  )
}
