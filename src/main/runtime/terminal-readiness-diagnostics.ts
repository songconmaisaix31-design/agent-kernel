import { lstatSync, readFileSync, realpathSync, writeFileSync } from 'node:fs'
import { isAbsolute, join, resolve } from 'node:path'
import { z } from 'zod'
import { redactString } from '../observability/redactor'

const captureConfig = z
  .object({
    terminal: z.string().regex(/^term_[a-zA-Z0-9-]+$/),
    maxSnapshots: z.number().int().min(1).max(5)
  })
  .strict()

export type ReadinessDiagnosticSnapshot = {
  runtimeId: string
  capturedAt: number
  phase: string
  identity: { handle: string; ptyId: string | null; bindingAfter: string | null }
  inputs: { tailBuffer: string[]; tailPartialLine: string; preview: string; waitText: string }
  state: object
  result: object
}

function redactDiagnosticText(text: string): string {
  return redactString(text).replace(
    /(["']?[\w.-]*(?:token|secret|password|api[_-]?key|authorization|cookie|credential)[\w.-]*["']?\s*[:=]\s*)(?:"[^"\r\n]*"|'[^'\r\n]*'|[^\s,;}]+)/gi,
    '$1[redacted]'
  )
}

// Opt-in private experiment files; no RPC, polling, process inspection or decision authority.
export class TerminalReadinessDiagnostics {
  private config: z.infer<typeof captureConfig> | undefined
  private count = 0

  constructor(private readonly env: NodeJS.ProcessEnv = process.env) {}

  record(handle: string, snapshot: () => ReadinessDiagnosticSnapshot): void {
    if (
      this.env.ORCA_EXPERIMENT_READINESS_DIAGNOSTICS !== '1' ||
      !this.env.ORCA_EXPERIMENT_CODEX_SYSTEM_HOME ||
      !this.env.ORCA_DEV_REPO_ROOT
    ) {
      return
    }
    try {
      const profile = this.env.ORCA_USER_DATA_PATH
      if (!profile || !isAbsolute(profile)) {
        return
      }
      const directory = join(profile, 'private-readiness')
      // The operator creates the private directory; never follow a redirected sink.
      if (
        resolve(realpathSync(directory)) !== resolve(directory) ||
        lstatSync(directory).isSymbolicLink()
      ) {
        return
      }
      if (!this.config) {
        const configPath = join(directory, 'capture.json')
        if (lstatSync(configPath).isSymbolicLink() || lstatSync(configPath).size > 4096) {
          return
        }
        this.config = captureConfig.parse(JSON.parse(readFileSync(configPath, 'utf8')))
      }
      if (handle !== this.config.terminal || this.count >= this.config.maxSnapshots) {
        return
      }
      const sequence = ++this.count
      const value = snapshot()
      const inputs = {
        tailBuffer: value.inputs.tailBuffer.map(redactDiagnosticText),
        tailPartialLine: redactDiagnosticText(value.inputs.tailPartialLine),
        preview: redactDiagnosticText(value.inputs.preview),
        waitText: redactDiagnosticText(value.inputs.waitText)
      }
      const body = JSON.stringify(
        {
          schemaVersion: 1,
          source: 'runtime retained tail at wait result; not a screen capture',
          readMode: 'synchronous; no asynchronous state or process read',
          timestampUnits: 'epoch milliseconds except title observation sequence stamps',
          ...value,
          inputs,
          redactionChangedInputs: JSON.stringify(inputs) !== JSON.stringify(value.inputs)
        },
        (_key, item: unknown) => (typeof item === 'string' ? redactDiagnosticText(item) : item),
        2
      )
      const output =
        body.length <= 1024 * 1024
          ? body
          : JSON.stringify({
              schemaVersion: 1,
              runtimeId: value.runtimeId,
              sequence,
              error: 'snapshot_size_limit'
            })
      writeFileSync(join(directory, `${value.runtimeId}-${sequence}.json`), `${output}\n`, {
        encoding: 'utf8',
        flag: 'wx',
        mode: 0o600
      })
    } catch {
      // Observation failures must not change the original wait result or write elsewhere.
    }
  }
}
