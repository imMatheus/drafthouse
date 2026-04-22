import { createContext, useContext, useSyncExternalStore, type ReactNode } from 'react'
import type { AgentStreamEvent } from '../../../shared/types'

type Listener = () => void

const EMPTY_EVENTS: AgentStreamEvent[] = []

/**
 * Mutable per-session events store. Lives outside React state so every
 * streaming token is an O(1) update that only notifies the components
 * actually reading *that specific* session's events. React syncs via
 * `useSyncExternalStore`, which is the canonical primitive for bridging
 * mutable stores into the render tree.
 */
export class AgentSessionsStore {
  private events = new Map<string, AgentStreamEvent[]>()
  private listeners = new Map<string, Set<Listener>>()

  getEvents = (sessionId: string): AgentStreamEvent[] => this.events.get(sessionId) ?? EMPTY_EVENTS

  setEvents(sessionId: string, updater: (prev: AgentStreamEvent[]) => AgentStreamEvent[]): void {
    const prev = this.events.get(sessionId) ?? EMPTY_EVENTS
    const next = updater(prev)
    if (next === prev) return
    this.events.set(sessionId, next)
    const set = this.listeners.get(sessionId)
    if (!set) return
    for (const listener of set) listener()
  }

  subscribe = (sessionId: string, listener: Listener): (() => void) => {
    let set = this.listeners.get(sessionId)
    if (!set) {
      set = new Set()
      this.listeners.set(sessionId, set)
    }
    set.add(listener)
    return () => {
      set?.delete(listener)
    }
  }
}

const AgentSessionsContext = createContext<AgentSessionsStore | null>(null)

export function AgentSessionsProvider({ store, children }: { store: AgentSessionsStore; children: ReactNode }) {
  return <AgentSessionsContext.Provider value={store}>{children}</AgentSessionsContext.Provider>
}

export function useAgentSessionEvents(sessionId: string): AgentStreamEvent[] {
  const store = useContext(AgentSessionsContext)
  return useSyncExternalStore(
    (listener) => (store ? store.subscribe(sessionId, listener) : () => {}),
    () => (store ? store.getEvents(sessionId) : EMPTY_EVENTS)
  )
}
