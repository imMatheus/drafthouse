const CLAUDE_MENTION_REGEX = /^@claude(?:\s|$)/i
const CLAUDE_MENTION_STRIP_REGEX = /^@claude\s*/i

export function isClaudeMention(text: string): boolean {
  return CLAUDE_MENTION_REGEX.test(text.trim())
}

export function extractClaudePrompt(text: string): string {
  return text.trim().replace(CLAUDE_MENTION_STRIP_REGEX, '')
}
