import { useState, useEffect, createContext, useContext } from 'react'
import type { GitHubUser } from '../../../shared/types'

interface AuthState {
  user: GitHubUser | null
  loading: boolean
  loggingIn: boolean
  deviceCode: string | null
}

interface AuthContextValue extends AuthState {
  login: () => Promise<void>
  logout: () => Promise<void>
}

export const AuthContext = createContext<AuthContextValue | null>(null)

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}

export function useAuthProvider(): AuthContextValue {
  const [state, setState] = useState<AuthState>({
    user: null,
    loading: true,
    loggingIn: false,
    deviceCode: null
  })

  useEffect(() => {
    let cancelled = false
    window.api.auth
      .getUser()
      .then((data) => {
        if (!cancelled) setState((s) => ({ ...s, user: data?.user ?? null, loading: false }))
      })
      .catch(() => {
        // Never leave the app stuck on the loading screen if the IPC call fails.
        if (!cancelled) setState((s) => ({ ...s, loading: false }))
      })

    const unsubscribe = window.api.auth.onDeviceCode(({ userCode }) => {
      setState((s) => ({ ...s, deviceCode: userCode }))
    })

    return () => {
      cancelled = true
      unsubscribe()
    }
  }, [])

  const login = async (): Promise<void> => {
    setState((s) => ({ ...s, loggingIn: true, deviceCode: null }))
    try {
      const data = await window.api.auth.login()
      if (data) {
        setState({ user: data.user, loading: false, loggingIn: false, deviceCode: null })
      }
    } catch {
      setState((s) => ({ ...s, loggingIn: false, deviceCode: null }))
    }
  }

  const logout = async (): Promise<void> => {
    await window.api.auth.logout()
    setState({ user: null, loading: false, loggingIn: false, deviceCode: null })
  }

  return {
    user: state.user,
    loading: state.loading,
    loggingIn: state.loggingIn,
    deviceCode: state.deviceCode,
    login,
    logout
  }
}
