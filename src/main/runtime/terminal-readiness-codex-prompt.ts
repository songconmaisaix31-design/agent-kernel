const RATE_LIMIT_REMINDER = 'approaching rate limits'
const LOWER_CREDIT_MODEL = 'switch to gpt-5.6-luna for lower credit usage?'
const RATE_LIMIT_CONFIRMATION = 'press enter to confirm or esc to go back'
const CODEX_INPUT_PROMPT_RE = /^(?:[>›]\s*)?ask codex to do anything$/
const CANCELED_COMMAND_RE = /^✗\s+you (?:canceled|rejected) the request to run(?:\s|$)/
const CONVERSATION_INTERRUPTED_RE =
  /^■\s+conversation interrupted - tell the model what to do differently(?:\.|\s|$)/

export function isDismissedCodexRateLimitReminder(
  normalized: string,
  blockedPromptIndex: number
): boolean {
  const reminderIndex = normalized.lastIndexOf(RATE_LIMIT_REMINDER)
  const lowerCreditModelIndex = normalized.indexOf(LOWER_CREDIT_MODEL, reminderIndex)
  if (reminderIndex === -1 || lowerCreditModelIndex === -1) {
    return false
  }
  const confirmationIndex = normalized.indexOf(RATE_LIMIT_CONFIRMATION, reminderIndex)
  if (
    confirmationIndex === -1 ||
    lowerCreditModelIndex > confirmationIndex ||
    confirmationIndex !== blockedPromptIndex
  ) {
    return false
  }
  const lines = normalized.slice(confirmationIndex + RATE_LIMIT_CONFIRMATION.length).split('\n')
  const nonBlankLines = lines.map((line) => line.trim()).filter(Boolean)
  return nonBlankLines.length === 1 && CODEX_INPUT_PROMPT_RE.test(nonBlankLines[0])
}

export function isDismissedCodexCanceledCommandPrompt(
  normalized: string,
  blockedPromptIndex: number
): boolean {
  let canceled = false
  let interrupted = false
  let offset = 0
  for (const line of normalized.split('\n')) {
    const trimmed = line.trim()
    const lineIndex = offset + line.indexOf(trimmed)
    offset += line.length + 1
    if (lineIndex <= blockedPromptIndex) {
      continue
    }
    if (CANCELED_COMMAND_RE.test(trimmed)) {
      canceled = true
      interrupted = false
      continue
    }
    if (canceled && CONVERSATION_INTERRUPTED_RE.test(trimmed)) {
      interrupted = true
      continue
    }
    if (interrupted && CODEX_INPUT_PROMPT_RE.test(trimmed)) {
      return true
    }
  }
  return false
}
