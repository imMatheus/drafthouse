import type {
  AgentContentBlock,
  AgentStreamAssistant,
  AgentStreamEvent,
  AgentStreamPartialMessage
} from '../../../shared/types'

function sameParent(a: string | null | undefined, b: string | null | undefined): boolean {
  return (a ?? null) === (b ?? null)
}

function isStreamingAssistant(event: AgentStreamEvent): event is AgentStreamAssistant {
  return event.type === 'assistant' && event.streaming === true
}

/**
 * Find the in-flight streaming message for a given sub-agent thread (or the
 * main thread when parentToolUseId is null). Searched from the end — streams
 * are interleaved but each thread has at most one open message.
 */
function findStreamingIndex(events: AgentStreamEvent[], parentToolUseId: string | null): number {
  for (let i = events.length - 1; i >= 0; i--) {
    const event = events[i]
    if (isStreamingAssistant(event) && sameParent(event.parent_tool_use_id, parentToolUseId)) return i
  }
  return -1
}

/** Parse any tool_use blocks whose streamed JSON never got finalized. */
function finalizeBlocks(content: AgentContentBlock[]): AgentContentBlock[] {
  return content.map((block) => {
    if (block.type !== 'tool_use' || block.partialJson === undefined) return block
    try {
      return {
        type: 'tool_use',
        id: block.id,
        name: block.name,
        input: JSON.parse(block.partialJson) as Record<string, unknown>
      }
    } catch {
      return block
    }
  })
}

/**
 * Finalize any message whose `message_stop` will never arrive — the child was
 * killed or interrupted mid-message, so the event would otherwise render as
 * streaming forever and swallow later finals for the same message id. Called
 * when a turn-ending event lands; mirrors the `message_stop` finalization.
 */
export function finalizeDanglingStreams(events: AgentStreamEvent[]): AgentStreamEvent[] {
  let next: AgentStreamEvent[] | null = null
  for (let i = 0; i < events.length; i++) {
    const event = events[i]
    if (!isStreamingAssistant(event)) continue
    if (next === null) next = [...events]
    next[i] = {
      ...event,
      streaming: undefined,
      streamed: true,
      message: { ...event.message, content: finalizeBlocks(event.message.content) }
    }
  }
  return next ?? events
}

export function mergePartialMessage(
  events: AgentStreamEvent[],
  partial: AgentStreamPartialMessage
): AgentStreamEvent[] {
  const sub = partial.event
  const parentToolUseId = partial.parent_tool_use_id ?? null

  if (sub.type === 'message_start') {
    const streamingEvent: AgentStreamAssistant = {
      type: 'assistant',
      session_id: partial.session_id,
      parent_tool_use_id: parentToolUseId,
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

  const idx = findStreamingIndex(events, parentToolUseId)
  if (idx === -1) return events
  const current = events[idx] as AgentStreamAssistant

  const content = [...current.message.content]
  let updated: AgentStreamAssistant

  if (sub.type === 'content_block_start') {
    content[sub.index] = sub.content_block
    updated = { ...current, message: { ...current.message, content } }
  } else if (sub.type === 'content_block_delta') {
    const existing = content[sub.index]
    if (sub.delta.type === 'text_delta' && existing?.type === 'text') {
      content[sub.index] = { ...existing, text: existing.text + (sub.delta as { text: string }).text }
    } else if (sub.delta.type === 'thinking_delta' && existing?.type === 'thinking') {
      content[sub.index] = { ...existing, thinking: existing.thinking + (sub.delta as { thinking: string }).thinking }
    } else if (sub.delta.type === 'input_json_delta' && existing?.type === 'tool_use') {
      // Tool inputs stream as JSON fragments; buffer them and parse at block stop.
      content[sub.index] = {
        ...existing,
        partialJson: (existing.partialJson ?? '') + (sub.delta as { partial_json: string }).partial_json
      }
    } else {
      return events
    }
    updated = { ...current, message: { ...current.message, content } }
  } else if (sub.type === 'content_block_stop') {
    const existing = content[sub.index]
    if (existing?.type === 'tool_use' && existing.partialJson !== undefined) {
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
      updated = { ...current, message: { ...current.message, content } }
    } else {
      return events
    }
  } else if (sub.type === 'message_delta') {
    updated = { ...current, message: { ...current.message, content, stop_reason: sub.delta.stop_reason ?? null } }
  } else if (sub.type === 'message_stop') {
    // Finalize: the CLI re-emits this message as per-block `assistant` events,
    // which appendAssistantEvent dedupes against the `streamed` flag.
    updated = {
      ...current,
      streaming: undefined,
      streamed: true,
      message: { ...current.message, content: finalizeBlocks(content) }
    }
  } else {
    return events
  }

  const next = [...events]
  next[idx] = updated
  return next
}

/**
 * Merge a final `assistant` event into the list. The CLI emits one final
 * assistant event per content block (all sharing message.id):
 * - the message was accumulated from partials → drop the duplicate,
 * - a previous per-block final exists → append this block to it,
 * - otherwise → append as a new event.
 */
export function appendAssistantEvent(events: AgentStreamEvent[], finalEvent: AgentStreamAssistant): AgentStreamEvent[] {
  const messageId = finalEvent.message.id
  if (messageId) {
    for (let i = events.length - 1; i >= 0; i--) {
      const event = events[i]
      if (event.type !== 'assistant' || event.message.id !== messageId) continue
      if (!sameParent(event.parent_tool_use_id, finalEvent.parent_tool_use_id)) continue

      if (event.streamed || event.streaming) {
        // Already have richer content from the partial stream — except for a
        // tool_use block whose input JSON never finished parsing (a dropped
        // delta): there the final event's input is authoritative.
        const finalToolBlocks = new Map<string, AgentContentBlock>()
        for (const block of finalEvent.message.content) {
          if (block.type === 'tool_use') finalToolBlocks.set(block.id, block)
        }
        let upgraded = false
        const content = event.message.content.map((block) => {
          if (block.type !== 'tool_use' || block.partialJson === undefined) return block
          const finalBlock = finalToolBlocks.get(block.id)
          if (!finalBlock) return block
          upgraded = true
          return finalBlock
        })
        if (!upgraded) return events

        const next = [...events]
        next[i] = { ...event, message: { ...event.message, content } }
        return next
      }

      const next = [...events]
      next[i] = {
        ...event,
        message: { ...event.message, content: [...event.message.content, ...finalEvent.message.content] }
      }
      return next
    }
  }
  return [...events, finalEvent]
}
