import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { chmod, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { delimiter, join, resolve } from 'node:path'
import test from 'node:test'

const root = resolve(import.meta.dirname, '..', '..')
const pairingRunner = join(root, 'config', 'scripts', 'run-headless-linux-pairing-docker.mjs')
const shutdownRunner = join(root, 'config', 'scripts', 'run-headless-serve-shutdown-docker.mjs')
const pairingCase = join(root, 'config', 'docker', 'headless-pairing', 'run-appimage-case.sh')

test('strict pairing forwards sandbox mode and requires post-ready argv proof', async (t) => {
  if (skipOutsideLinux(t)) return
  const fixture = await createFixture(t)
  const success = runNode(pairingRunner, ['--appimage', fixture.appImage, '--require-sandbox'], fixture, 'valid')
  assert.equal(success.status, 0, success.stderr)
  assert.match(success.stdout, /Headless Linux pairing Docker validation passed/)
  const commands = await dockerCommands(fixture)
  const launch = commands.find((args) => args[0] === 'run' && args.includes('-d'))
  assert.ok(launch, 'strict pairing did not start its container')
  assert.ok(launch.includes('ORCA_REQUIRE_SANDBOX=1'), 'strict pairing did not forward sandbox mode')
  assert.ok(launch.includes('ORCA_TEST_APPIMAGE=/artifacts/squashfs-root/orca-ide'))
  assert.equal(launch.includes('--no-sandbox'), false, 'strict pairing passed --no-sandbox to Docker')

  for (const mode of ['missing-proof', 'eperm']) {
    const rejected = runNode(
      pairingRunner,
      ['--appimage', fixture.appImage, '--require-sandbox'],
      fixture,
      mode
    )
    assert.notEqual(rejected.status, 0, `${mode} produced a false strict-ready result`)
    assert.doesNotMatch(rejected.stdout, /Headless Linux pairing Docker validation passed/)
  }
})

test('strict pairing shell rejects disabled argv after a ready-like child process', async (t) => {
  if (skipOutsideLinux(t)) return
  const fixture = await createFixture(t)
  const child = join(fixture.directory, 'orca-ide')
  await writeFile(
    child,
    '#!/usr/bin/env bash\nprintf \'{"type":"orca_server_ready","schemaVersion":1}\\n\'\nsleep 30\n'
  )
  await chmod(child, 0o755)
  const clean = runBash(pairingCase, ['direct'], fixture, {
    ORCA_REQUIRE_SANDBOX: '1',
    ORCA_TEST_APPIMAGE: child,
    ORCA_STARTUP_TIMEOUT_SECONDS: '1'
  })
  assert.equal(clean.status, 124, clean.stderr)
  assert.match(clean.stdout, /SANDBOX_OK electron_pid=/)

  const disabled = runBash(pairingCase, ['direct'], fixture, {
    ORCA_REQUIRE_SANDBOX: '1',
    ORCA_TEST_APPIMAGE: child,
    ORCA_TEST_NO_SANDBOX: '1',
    ORCA_STARTUP_TIMEOUT_SECONDS: '1'
  })
  assert.notEqual(disabled.status, 0)
  assert.match(disabled.stderr, /rejects ORCA_TEST_NO_SANDBOX/)
})

test('strict shutdown forwards sandbox mode, rejects incompatible launcher mode, and keeps defaults usable', async (t) => {
  if (skipOutsideLinux(t)) return
  const fixture = await createFixture(t)
  const strict = runNode(shutdownRunner, ['--appimage', fixture.appImage, '--require-sandbox'], fixture, 'valid')
  assert.equal(strict.status, 0, strict.stderr)
  assert.match(strict.stdout, /"requireSandbox":true/)
  const strictRuns = (await dockerCommands(fixture)).filter((args) => args[0] === 'run')
  assert.equal(strictRuns.filter((args) => args.includes('ORCA_REQUIRE_SANDBOX=1')).length, 2)
  assert.equal(strictRuns.some((args) => args.includes('--no-sandbox')), false)

  const incompatible = runNode(
    shutdownRunner,
    ['--appimage', fixture.appImage, '--require-sandbox', '--entrypoint', 'launcher'],
    fixture,
    'valid'
  )
  assert.notEqual(incompatible.status, 0)
  assert.match(incompatible.stderr, /--require-sandbox requires --entrypoint app/)

  const compatible = runNode(shutdownRunner, ['--appimage', fixture.appImage, '--platform', 'linux/amd64'], fixture, 'valid')
  assert.equal(compatible.status, 0, compatible.stderr)
})

async function createFixture(t) {
  const directory = await mkdtemp(join(tmpdir(), 'orca-required-sandbox-'))
  t.after(() => rm(directory, { recursive: true, force: true }))
  const appImage = join(directory, 'orca.AppImage')
  const log = join(directory, 'docker.jsonl')
  const clientCount = join(directory, 'client-count')
  const dockerScript = join(directory, 'docker-fixture.mjs')
  await writeFile(appImage, 'not an executable AppImage; Docker is a process fixture')
  await writeFile(
    dockerScript,
    `import { appendFileSync, existsSync, readFileSync, writeFileSync } from 'node:fs'\n
const args = process.argv.slice(2)\nconst root = process.env.ORCA_SANDBOX_FIXTURE\nappendFileSync(root + '/docker.jsonl', JSON.stringify(args) + '\\n')\nconst mode = process.env.ORCA_SANDBOX_MODE\nif (args[0] === 'logs') {\n  const ready = '{"type":"orca_server_ready","schemaVersion":1,"endpoint":"ws://0.0.0.0:6768","boundEndpoint":"ws://0.0.0.0:6768","advertisedEndpoint":"ws://127.0.0.1:6768","pairing":{"available":true,"url":"orca://pair?code=fixture"}}\\n'\n  if (mode === 'valid') process.stdout.write(ready + 'SANDBOX_OK electron_pid=42\\n')\n  else if (mode === 'eperm') process.stdout.write(ready + 'Failed to move to new namespace: Operation not permitted\\n')\n  else process.stdout.write(ready)\n  process.exit(0)\n}\nif (args[0] === 'inspect') { process.stdout.write('true\\n'); process.exit(0) }\nif (args[0] === 'run' && args.includes('--pairing-code')) {\n  const countPath = root + '/client-count'\n  const count = existsSync(countPath) ? Number(readFileSync(countPath, 'utf8')) : 0\n  writeFileSync(countPath, String(count + 1))\n  if (count === 0) { process.stdout.write('{"result":{"runtime":{"state":"ready","reachable":true,"runtimeId":"fixture","appVersion":"1","capabilities":["updater.remote-control.v1"],"remoteUpdateSupport":{"automatic":false,"reason":"manual-service-update-required"}}}}\\n'); process.exit(0) }\n  process.stderr.write('unreachable fixture\\n'); process.exit(1)\n}\nprocess.exit(0)\n`
  )
  await writeFile(join(directory, 'docker'), `#!/usr/bin/env sh\nexec "${process.execPath}" "$(dirname "$0")/docker-fixture.mjs" "$@"\n`)
  await chmod(join(directory, 'docker'), 0o755)
  return { directory, appImage, log, clientCount }
}

function runnerEnvironment(fixture, mode, extra = {}) {
  return {
    ...process.env,
    ...extra,
    ORCA_SANDBOX_FIXTURE: fixture.directory,
    ORCA_SANDBOX_MODE: mode,
    PATH: `${fixture.directory}${delimiter}${process.env.PATH ?? ''}`
  }
}

function runNode(script, args, fixture, mode) {
  return spawnSync(process.execPath, [script, ...args], {
    cwd: root,
    encoding: 'utf8',
    env: runnerEnvironment(fixture, mode)
  })
}

function runBash(script, args, fixture, extra) {
  return spawnSync('bash', [script, ...args], {
    cwd: root,
    encoding: 'utf8',
    env: runnerEnvironment(fixture, 'valid', extra)
  })
}

async function dockerCommands(fixture) {
  return (await readFile(fixture.log, 'utf8'))
    .trim()
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => JSON.parse(line))
}

function skipOutsideLinux(t) {
  if (process.platform === 'linux') return false
  t.skip('Linux-only process fixture; it never invokes a host Docker daemon.')
  return true
}
