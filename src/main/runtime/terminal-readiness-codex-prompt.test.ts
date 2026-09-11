import { describe, expect, it } from 'vitest'
import {
  isDismissedCodexCanceledCommandPrompt,
  isDismissedCodexRateLimitReminder
} from './terminal-readiness-codex-prompt'
import { computeTerminalTailWaitState } from './orca-runtime'

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

describe('dismissed Codex canceled command prompt', () => {
  const canceledCommand = [
    'would you like to run this command?',
    'press enter to confirm',
    "✗ You canceled the request to run & 'C:/workspace/tool.cmd'",
    '■ Conversation interrupted - tell the model what to do differently. Something went wrong?',
    '› Ask Codex to do anything',
    '  ⡀   ⠄',
    'gpt-6-astra xhigh · C:\\workspace · task'
  ].join('\n')

  it('accepts the observed canceled request followed by a new input prompt', () => {
    const text = canceledCommand.toLowerCase()
    const blockedIndex = text.indexOf('press enter to confirm')
    expect(isDismissedCodexCanceledCommandPrompt(text, blockedIndex)).toBe(true)
    expect(computeTerminalTailWaitState(text.split('\n'), '', '').signal).toBeNull()
  })

  it('accepts an explicit rejection boundary followed by a new input prompt', () => {
    const text = canceledCommand.replace('canceled', 'rejected').toLowerCase()
    expect(
      isDismissedCodexCanceledCommandPrompt(text, text.indexOf('press enter to confirm'))
    ).toBe(true)
  })

  it('does not treat an ordinary idle prompt as a dismissal boundary', () => {
    const text = ['press enter to confirm', '› Ask Codex to do anything'].join('\n').toLowerCase()
    expect(
      isDismissedCodexCanceledCommandPrompt(text, text.indexOf('press enter to confirm'))
    ).toBe(false)
  })

  it('does not accept quoted cancellation prose without Codex status markers', () => {
    const text = [
      'press enter to confirm',
      'The screen said "You canceled the request to run".',
      'The screen also said "Conversation interrupted - tell the model what to do differently."',
      '› Ask Codex to do anything'
    ]
      .join('\n')
      .toLowerCase()
    expect(
      isDismissedCodexCanceledCommandPrompt(text, text.indexOf('press enter to confirm'))
    ).toBe(false)
  })

  it('does not accept exact UI lines introduced as quoted model output', () => {
    const text = `for reference, this is a quoted old screen:\n\n${canceledCommand}`.toLowerCase()
    expect(
      isDismissedCodexCanceledCommandPrompt(text, text.indexOf('press enter to confirm'))
    ).toBe(false)
  })

  it.each([
    ['fenced', `\`\`\`text\n${canceledCommand}\n\`\`\``],
    [
      'blockquoted',
      canceledCommand
        .split('\n')
        .map((line) => `> ${line}`)
        .join('\n')
    ],
    [
      'interposed prose',
      canceledCommand.replace(
        'press enter to confirm\n✗',
        'press enter to confirm\ncodex quoted this:\n✗'
      )
    ]
  ])('does not accept a %s cancellation transcript', (_kind, value) => {
    const text = value.toLowerCase()
    expect(
      isDismissedCodexCanceledCommandPrompt(text, text.indexOf('press enter to confirm'))
    ).toBe(false)
    expect(computeTerminalTailWaitState(text.split('\n'), '', '').signal).not.toBeNull()
  })

  it('keeps a newer active permission prompt blocked', () => {
    const text = [canceledCommand, 'permission required', 'allow once', 'allow always', 'reject']
      .join('\n')
      .toLowerCase()
    expect(isDismissedCodexCanceledCommandPrompt(text, text.indexOf('permission required'))).toBe(
      false
    )
    expect(computeTerminalTailWaitState(text.split('\n'), '', '').signal?.reason).toBe(
      'codex-interactive-prompt'
    )
  })

  it.each([
    ['account', 'codex account login required\npress enter to continue'],
    ['payment', 'codex payment method required\npress enter to continue'],
    ['security', 'codex security review required\npress enter to continue'],
    [
      'quota',
      [
        'approaching rate limits',
        'switch to gpt-5.6-luna for lower credit usage?',
        confirmation
      ].join('\n')
    ],
    ['trust', 'do you trust this workspace?']
  ])('keeps a newer active %s prompt blocked', (_kind, activePrompt) => {
    const text = `${canceledCommand}\n${activePrompt}`.toLowerCase()
    expect(computeTerminalTailWaitState(text.split('\n'), '', '').signal).not.toBeNull()
  })
})
