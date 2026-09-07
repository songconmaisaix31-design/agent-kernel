import { readFile } from 'node:fs/promises'
import { isDeepStrictEqual } from 'node:util'
import { RuntimeClientError } from '../runtime-client'

export type KernelRunConfigRequest = {
  repoId: unknown
  plan: unknown
  limits?: unknown
}

type RunUseKernelResponse = {
  kernel_config?: unknown
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function containsRequestedValues(persisted: unknown, requested: unknown): boolean {
  if (!isRecord(requested)) {
    return isDeepStrictEqual(persisted, requested)
  }
  if (!isRecord(persisted)) {
    return false
  }
  return Object.entries(requested).every(
    ([key, value]) =>
      Object.hasOwn(persisted, key) && containsRequestedValues(persisted[key], value)
  )
}

function unsupportedKernelConfig(message: string): never {
  throw new RuntimeClientError('kernel_config_unsupported', message)
}

export async function readKernelRunConfigFile(path: string): Promise<KernelRunConfigRequest> {
  if (!path) {
    throw new RuntimeClientError('invalid_argument', 'Missing value for --kernel-config.')
  }
  let source: string
  try {
    source = await readFile(path, 'utf8')
  } catch {
    throw new RuntimeClientError('invalid_argument', `Could not read --kernel-config file: ${path}`)
  }
  let parsed: unknown
  try {
    parsed = JSON.parse(source)
  } catch {
    throw new RuntimeClientError(
      'invalid_argument',
      '--kernel-config file must contain valid JSON.'
    )
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new RuntimeClientError(
      'invalid_argument',
      '--kernel-config file must contain an object with repoId and plan.'
    )
  }
  const value = parsed as Record<string, unknown>
  if (
    !Object.hasOwn(value, 'repoId') ||
    !Object.hasOwn(value, 'plan') ||
    Object.keys(value).some((key) => key !== 'repoId' && key !== 'plan' && key !== 'limits')
  ) {
    throw new RuntimeClientError(
      'invalid_argument',
      '--kernel-config file must contain repoId and plan.'
    )
  }
  return {
    repoId: value.repoId,
    plan: value.plan,
    ...(Object.hasOwn(value, 'limits') ? { limits: value.limits } : {})
  }
}

export function assertKernelRunUseResponse(
  run: RunUseKernelResponse,
  requested: KernelRunConfigRequest | null
): void {
  const stored = run.kernel_config
  if (requested === null) {
    if (stored !== null) {
      unsupportedKernelConfig(
        'The Orca runtime did not confirm Kernel configuration was disabled. No success was reported.'
      )
    }
    return
  }
  if (typeof stored !== 'string') {
    unsupportedKernelConfig(
      'The Orca runtime did not return persisted kernel_config. This server may not support --kernel-config.'
    )
  }
  let persisted: unknown
  try {
    persisted = JSON.parse(stored)
  } catch {
    unsupportedKernelConfig(
      'The Orca runtime returned invalid persisted kernel_config. No success was reported.'
    )
  }
  if (
    !isRecord(persisted) ||
    !isDeepStrictEqual(persisted.repoId, requested.repoId) ||
    !isDeepStrictEqual(persisted.plan, requested.plan) ||
    (requested.limits !== undefined && !containsRequestedValues(persisted.limits, requested.limits))
  ) {
    unsupportedKernelConfig(
      'The Orca runtime returned a different persisted kernel_config. No success was reported.'
    )
  }
}
