import { describe, expect, it } from 'vitest'
import { isDismissedCodexRateLimitReminder } from './terminal-readiness-codex-prompt'

const confirmation = 'press enter to confirm or esc to go back'

function rateLimitReminder(lines: string[]): string {
  return [
    'approaching rate limits',
    'switch to gpt-5.6-luna for lower credit usage?',
    confirmation,
    ...lines
  ].join('\n')
}

describe('dismissed Codex rate-limit reminder', () => {
  it('accepts the actual reminder followed by the current input prompt', () => {
    const text = rateLimitReminder(['› Ask Codex to do anything']).toLowerCase()
    expect(isDismissedCodexRateLimitReminder(text, text.indexOf(confirmation))).toBe(true)
  })

  it('keeps the current open reminder blocked without the input prompt', () => {
    const text = rateLimitReminder([])
    expect(isDismissedCodexRateLimitReminder(text, text.indexOf(confirmation))).toBe(false)
  })

  it('keeps a reminder blocked when the input prompt marker is missing', () => {
    const text = rateLimitReminder(['Codex is ready'])
    expect(isDismissedCodexRateLimitReminder(text, text.indexOf(confirmation))).toBe(false)
  })

  it('does not accept ordinary output that quotes the input prompt after an approval', () => {
    const text = rateLimitReminder([
      'permission required',
      'allow once',
      'allow always',
      'reject',
      'the prior screen said "Ask Codex to do anything"'
    ]).toLowerCase()
    expect(isDismissedCodexRateLimitReminder(text, text.indexOf('permission required'))).toBe(false)
  })

  it('does not clear a real approval that follows the input prompt', () => {
    const text = rateLimitReminder([
      '› Ask Codex to do anything',
      'permission required',
      'allow once',
      'allow always',
      'reject'
    ]).toLowerCase()
    expect(isDismissedCodexRateLimitReminder(text, text.indexOf('permission required'))).toBe(false)
  })
})
