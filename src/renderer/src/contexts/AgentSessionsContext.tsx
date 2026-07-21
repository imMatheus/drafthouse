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
 * Mutable per-session events store. Lives outside React state so a streaming
 * token only notifies the components actually reading *that specific*
 * session's events. Each update replaces the events array wholesale (a
 * shallow copy — never an in-place mutation), so the array reference doubles
 * as a change marker for downstream caches like `buildAgentTimeline`'s. React
 * syncs via `useSyncExternalStore`, which is the canonical primitive for
 * bridging mutable stores into the render tree.
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
      // Stream partials are never replayed by hydrate (the canonical snapshot
      // carries their final events), so buffering them is unbounded growth for
      // sessions that may never hydrate — e.g. another folder's live sessions.
      if (seq !== -1) state.buffered.push({ seq, event })
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
    this.subscribeFns.delete(sessionId)
    this.notify(sessionId)
  }

  private notify(sessionId: string): void {
    const set = this.listeners.get(sessionId)
    if (!set) return
    for (const listener of set) listener()
  }

  // useSyncExternalStore tears down and re-adds its listener whenever the
  // subscribe function's identity changes — during streaming that would be
  // once per token per consumer — so hand out one cached fn per session.
  private subscribeFns = new Map<string, (listener: Listener) => () => void>()

  subscribeTo(sessionId: string): (listener: Listener) => () => void {
    let subscribe = this.subscribeFns.get(sessionId)
    if (!subscribe) {
      subscribe = (listener: Listener) => {
        let set = this.listeners.get(sessionId)
        if (!set) {
          set = new Set()
          this.listeners.set(sessionId, set)
        }
        set.add(listener)
        return () => {
          set.delete(listener)
          if (set.size === 0 && this.listeners.get(sessionId) === set) {
            this.listeners.delete(sessionId)
          }
        }
      }
      this.subscribeFns.set(sessionId, subscribe)
    }
    return subscribe
  }
}

const AgentSessionsContext = createContext<AgentSessionsStore | null>(null)

export function AgentSessionsProvider({ store, children }: { store: AgentSessionsStore; children: ReactNode }) {
  return <AgentSessionsContext.Provider value={store}>{children}</AgentSessionsContext.Provider>
}

const noopSubscribe = (): (() => void) => () => {}

export function useAgentSessionEvents(sessionId: string): AgentStreamEvent[] {
  const store = useContext(AgentSessionsContext)
  return useSyncExternalStore(store ? store.subscribeTo(sessionId) : noopSubscribe, () =>
    store ? store.getEvents(sessionId) : EMPTY_EVENTS
  )
}
