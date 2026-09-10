const RATE_LIMIT_REMINDER = 'approaching rate limits'
const LOWER_CREDIT_MODEL = 'switch to gpt-5.6-luna for lower credit usage?'
const RATE_LIMIT_CONFIRMATION = 'press enter to confirm or esc to go back'
const CODEX_INPUT_PROMPT_RE = /^(?:[>›]\s*)?ask codex to do anything$/

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
