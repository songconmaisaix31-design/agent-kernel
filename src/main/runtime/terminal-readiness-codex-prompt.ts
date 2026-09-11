const RATE_LIMIT_REMINDER = 'approaching rate limits'
const LOWER_CREDIT_MODEL = 'switch to gpt-5.6-luna for lower credit usage?'
const RATE_LIMIT_CONFIRMATION = 'press enter to confirm or esc to go back'
const CODEX_INPUT_PROMPT_RE = /^(?:[>›]\s*)?ask codex to do anything$/
const COMMAND_CONFIRMATION_RE = /^press enter to confirm(?: or esc to (?:cancel|go back))?$/
const COMMAND_PROMPT_RE = /^would you like to run this command\?$/
const CANCELED_COMMAND_RE = /^✗\s+you (?:canceled|rejected) the request to run(?:\s|$)/
const CONVERSATION_INTERRUPTED_RE =
  /^■\s+conversation interrupted - tell the model what to do differently(?:\.|\s|$)/
const TOOL_RECEIPT_START_RE = /^•\s+ran(?:\s|$)/u
const TOOL_RECEIPT_CONTINUATION_RE = /^[│└…]/u
const TERMINAL_SECTION_RE = /^[─━]{3,}$/u
const MARKDOWN_FENCE_RE = /^(?:```|~~~)/

type IndexedPromptLine = {
  text: string
  start: number
  end: number
  fenced: boolean
}

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
  const lines: IndexedPromptLine[] = []
  let offset = 0
  let fenced = false
  for (const line of normalized.split('\n')) {
    const trimmed = line.trim()
    const startsFence = MARKDOWN_FENCE_RE.test(trimmed)
    lines.push({
      text: trimmed,
      start: offset + line.indexOf(trimmed),
      end: offset + line.length,
      fenced: fenced || startsFence
    })
    if (startsFence) {
      fenced = !fenced
    }
    offset += line.length + 1
  }

  const confirmationIndex = lines.findIndex(
    (line) =>
      blockedPromptIndex >= line.start &&
      blockedPromptIndex <= line.end &&
      !line.fenced &&
      COMMAND_CONFIRMATION_RE.test(line.text)
  )
  if (confirmationIndex === -1) {
    return false
  }
  const commandPromptIndex = findPreviousLine(lines, confirmationIndex, COMMAND_PROMPT_RE)
  if (commandPromptIndex === -1 || !startsIndependentTerminalSection(lines, commandPromptIndex)) {
    return false
  }
  const canceledIndex = findNextNonBlankLine(lines, confirmationIndex)
  if (canceledIndex === -1 || !CANCELED_COMMAND_RE.test(lines[canceledIndex].text)) {
    return false
  }
  const interruptedIndex = findInterruptedAfterToolReceipt(lines, canceledIndex)
  if (interruptedIndex === -1) {
    return false
  }
  const inputIndex = findNextNonBlankLine(lines, interruptedIndex)
  return inputIndex !== -1 && CODEX_INPUT_PROMPT_RE.test(lines[inputIndex].text)
}

function findPreviousLine(lines: IndexedPromptLine[], before: number, pattern: RegExp): number {
  const floor = Math.max(0, before - 12)
  for (let index = before - 1; index >= floor; index -= 1) {
    if (!lines[index].fenced && pattern.test(lines[index].text)) {
      return index
    }
  }
  return -1
}

function startsIndependentTerminalSection(lines: IndexedPromptLine[], index: number): boolean {
  for (let cursor = index - 1; cursor >= 0; cursor -= 1) {
    if (lines[cursor].text !== '') {
      return TERMINAL_SECTION_RE.test(lines[cursor].text)
    }
  }
  return true
}

function findNextNonBlankLine(lines: IndexedPromptLine[], after: number): number {
  for (let index = after + 1; index < lines.length; index += 1) {
    if (lines[index].text !== '') {
      return lines[index].fenced ? -1 : index
    }
  }
  return -1
}

function findInterruptedAfterToolReceipt(lines: IndexedPromptLine[], after: number): number {
  let receiptStarted = false
  for (let index = after + 1; index < lines.length; index += 1) {
    const line = lines[index]
    if (line.text === '') {
      continue
    }
    if (line.fenced) {
      return -1
    }
    if (CONVERSATION_INTERRUPTED_RE.test(line.text)) {
      return index
    }
    if (!receiptStarted && TOOL_RECEIPT_START_RE.test(line.text)) {
      receiptStarted = true
      continue
    }
    if (!receiptStarted || !TOOL_RECEIPT_CONTINUATION_RE.test(line.text)) {
      return -1
    }
  }
  return -1
}
