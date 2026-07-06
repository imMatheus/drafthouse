import { createContext, useContext, useSyncExternalStore, type ReactNode } from 'react'
import type { AgentStreamEvent } from '../../../shared/types'
import { appendAssistantEvent, mergePartialMessage } from '../lib/agentStream'

type Listener = () => void

const EMPTY_EVENTS: AgentStreamEvent[] = []

function reduceEvent(events: AgentStreamEvent[], event: AgentStreamEvent): AgentStreamEvent[] {
  if (event.type === 'stream_event') return mergePartialMessage(events, event)
  if (event.type === 'assistant') return appendAssistantEvent(events, event)
  return [...events, event]
}

interface SessionEventsState {
  events: AgentStreamEvent[]
  /** Live events buffer here until the canonical snapshot from main lands. */
  hydrated: boolean
  buffered: { seq: number; event: AgentStreamEvent }[]
}

/**
 * Mutable per-session events store. Lives outside React state so every
 * streaming token is an O(1) update that only notifies the components
 * actually reading *that specific* session's events. React syncs via
 * `useSyncExternalStore`, which is the canonical primitive for bridging
 * mutable stores into the render tree.
 *
 * The main process owns the canonical event log. Sessions must be hydrated
 * (via `hydrate`, fed from `agent:events`) before live events apply; anything
 * arriving earlier is buffered and replayed after the snapshot using its
 * sequence number, so a snapshot fetch can never drop or duplicate events.
 */
export class AgentSessionsStore {
  private states = new Map<string, SessionEventsState>()
  private listeners = new Map<string, Set<Listener>>()

  private stateFor(sessionId: string): SessionEventsState {
    let state = this.states.get(sessionId)
    if (!state) {
      state = { events: EMPTY_EVENTS, hydrated: false, buffered: [] }
      this.states.set(sessionId, state)
    }
    return state
  }

  getEvents = (sessionId: string): AgentStreamEvent[] => this.states.get(sessionId)?.events ?? EMPTY_EVENTS

  isHydrated(sessionId: string): boolean {
    return this.states.get(sessionId)?.hydrated === true
  }

  /** Feed one live event from the IPC stream. `seq` is -1 for stream partials. */
  ingest(sessionId: string, seq: number, event: AgentStreamEvent): void {
    const state = this.stateFor(sessionId)
    if (!state.hydrated) {
      state.buffered.push({ seq, event })
      return
    }
    state.events = reduceEvent(state.events, event)
    this.notify(sessionId)
  }

  /**
   * Install the canonical snapshot from the main process, then replay any
   * buffered live events that happened after it. Buffered stream partials are
   * dropped — their message's final events carry the same content.
   */
  hydrate(sessionId: string, canonical: AgentStreamEvent[], nextSeq: number): void {
    const state = this.stateFor(sessionId)
    if (state.hydrated) return

    let events = EMPTY_EVENTS
    for (const event of canonical) {
      events = reduceEvent(events, event)
    }
    for (const { seq, event } of state.buffered) {
      if (seq >= nextSeq) {
        events = reduceEvent(events, event)
      }
    }
    state.events = events
    state.buffered = []
    state.hydrated = true
    this.notify(sessionId)
  }

  /** Drop a deleted session's events. */
  remove(sessionId: string): void {
    this.states.delete(sessionId)
    this.notify(sessionId)
  }

  private notify(sessionId: string): void {
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
