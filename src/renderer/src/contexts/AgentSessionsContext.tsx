import { createContext, useContext, type ReactNode } from 'react'
import type { AgentStreamEvent } from '../../../shared/types'

interface AgentSessionsContextValue {
  eventsBySessionId: Map<string, AgentStreamEvent[]>
}

const AgentSessionsContext = createContext<AgentSessionsContextValue | null>(null)

const EMPTY_EVENTS: AgentStreamEvent[] = []

export function AgentSessionsProvider({
  eventsBySessionId,
  children
}: {
  eventsBySessionId: Map<string, AgentStreamEvent[]>
  children: ReactNode
}) {
  return <AgentSessionsContext.Provider value={{ eventsBySessionId }}>{children}</AgentSessionsContext.Provider>
}

export function useAgentSessionEvents(sessionId: string): AgentStreamEvent[] {
  const ctx = useContext(AgentSessionsContext)
  if (!ctx) return EMPTY_EVENTS
  return ctx.eventsBySessionId.get(sessionId) ?? EMPTY_EVENTS
}
