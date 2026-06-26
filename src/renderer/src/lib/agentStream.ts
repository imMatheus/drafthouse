import type { AgentStreamAssistant, AgentStreamEvent, AgentStreamPartialMessage } from '../../../shared/types'

function isStreamingAssistant(event: AgentStreamEvent | undefined): event is AgentStreamAssistant {
  return event?.type === 'assistant' && event.streaming === true
}

export function mergePartialMessage(
  events: AgentStreamEvent[],
  partial: AgentStreamPartialMessage
): AgentStreamEvent[] {
  const sub = partial.event

  if (sub.type === 'message_start') {
    const streamingEvent: AgentStreamAssistant = {
      type: 'assistant',
      session_id: partial.session_id,
      streaming: true,
      message: {
        id: sub.message.id,
        role: 'assistant',
        content: [],
        stop_reason: null,
        usage: sub.message.usage
      }
    }
    return [...events, streamingEvent]
  }

  const lastIdx = events.length - 1
  const last = events[lastIdx]
  if (!isStreamingAssistant(last)) return events

  const content = [...last.message.content]

  if (sub.type === 'content_block_start') {
    content[sub.index] = sub.content_block
  } else if (sub.type === 'content_block_delta') {
    const existing = content[sub.index]
    if (sub.delta.type === 'text_delta' && existing?.type === 'text') {
      content[sub.index] = { ...existing, text: existing.text + sub.delta.text }
    } else if (sub.delta.type === 'input_json_delta' && existing?.type === 'tool_use') {
      // Tool inputs stream as JSON fragments; buffer them and parse at block stop.
      content[sub.index] = { ...existing, partialJson: (existing.partialJson ?? '') + sub.delta.partial_json }
    }
  } else if (sub.type === 'message_delta') {
    const updated: AgentStreamAssistant = {
      ...last,
      message: { ...last.message, content, stop_reason: sub.delta.stop_reason }
    }
    return [...events.slice(0, lastIdx), updated]
  } else if (sub.type === 'content_block_stop') {
    const existing = content[sub.index]
    if (existing?.type !== 'tool_use' || existing.partialJson === undefined) return events
    try {
      content[sub.index] = {
        type: 'tool_use',
        id: existing.id,
        name: existing.name,
        input: JSON.parse(existing.partialJson) as Record<string, unknown>
      }
    } catch {
      return events
    }
  } else if (sub.type === 'message_stop') {
    return events
  }

  const updated: AgentStreamAssistant = {
    ...last,
    message: { ...last.message, content }
  }
  return [...events.slice(0, lastIdx), updated]
}

export function appendOrReplaceAssistant(
  events: AgentStreamEvent[],
  finalEvent: AgentStreamAssistant
): AgentStreamEvent[] {
  const lastIdx = events.length - 1
  const last = events[lastIdx]
  if (isStreamingAssistant(last) && last.message.id && last.message.id === finalEvent.message.id) {
    return [...events.slice(0, lastIdx), finalEvent]
  }
  return [...events, finalEvent]
}
