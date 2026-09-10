import assert from 'node:assert/strict'
import { spawn, spawnSync } from 'node:child_process'
import { chmod, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { delimiter, join, resolve } from 'node:path'
import test from 'node:test'

const root = resolve(import.meta.dirname, '..', '..')
const pairingRunner = join(root, 'config', 'scripts', 'run-headless-linux-pairing-docker.mjs')
const shutdownRunner = join(root, 'config', 'scripts', 'run-headless-serve-shutdown-docker.mjs')
const pairingCase = join(root, 'config', 'docker', 'headless-pairing', 'run-appimage-case.sh')
const timeoutMs = 5_000
const maxBuffer = 1_048_576

test('strict pairing is startup-only, forwards sandbox mode, and requires a live proof', async (t) => {
  if (skipOutsideLinux(t)) return
  const fixture = await createFixture(t)
  const success = runRunner(pairingRunner, ['--appimage', fixture.appImage, '--require-sandbox'], fixture, 'valid')
  assert.equal(success.status, 0, success.stderr)
  assert.match(success.stdout, /Headless Linux sandbox-required startup validation passed/)
  assert.doesNotMatch(success.stdout, /pairing Docker validation passed/)
  const commands = await dockerCommands(fixture)
  const launch = commands.find((args) => args[0] === 'run' && args.includes('-d'))
  assert.ok(launch, 'strict pairing did not start a fixture container')
  assert.ok(launch.includes('ORCA_REQUIRE_SANDBOX=1'), 'strict pairing did not forward sandbox mode')
  assert.ok(launch.includes('ORCA_TEST_APPIMAGE=/artifacts/squashfs-root/orca-ide'))
  assert.equal(launch.includes('--no-sandbox'), false, 'strict pairing forwarded --no-sandbox')

  for (const mode of ['stale-ready', 'eperm']) {
    const rejected = runRunner(pairingRunner, ['--appimage', fixture.appImage, '--require-sandbox'], fixture, mode)
    assert.notEqual(rejected.status, 0, `${mode} produced a false strict pass`)
    assert.doesNotMatch(rejected.stdout, /sandbox-required startup validation passed/)
  }
})

test('strict pairing rejects an exited owned launcher despite an unrelated --serve process', async (t) => {
  if (skipOutsideLinux(t) || process.getuid?.() === 0) {
    t.skip('Requires a non-root Linux runner so the case does not re-exec through runuser.')
    return
  }
  const fixture = await createFixture(t)
  const app = join(fixture.directory, 'orca-ide')
  await writeFile(app, '#!/usr/bin/env bash\nexit 0\n')
  await chmod(app, 0o755)
  const decoy = spawn('bash', ['-c', 'exec -a "$1" bash -c "sleep 30" --serve', 'bash', app], {
    stdio: 'ignore', timeout: timeoutMs, killSignal: 'SIGKILL'
  })
  t.after(() => decoy.kill('SIGTERM'))
  const result = runCase(pairingCase, ['direct'], fixture, {
    ORCA_REQUIRE_SANDBOX: '1', ORCA_TEST_APPIMAGE: app, ORCA_STARTUP_TIMEOUT_SECONDS: '1'
  })
  assert.notEqual(result.status, 0, 'unrelated --serve process satisfied an exited launcher')
  assert.match(result.stderr, /SANDBOX_EXIT|did not observe a current serving Electron child/)
})

test('strict pairing rejects implicit sandbox disable and shutdown keeps supported legacy arguments', async (t) => {
  if (skipOutsideLinux(t)) return
  const fixture = await createFixture(t)
  const disabled = runRunner(pairingRunner, ['--appimage', fixture.appImage, '--require-sandbox'], fixture, 'implicit-no-sandbox')
  assert.notEqual(disabled.status, 0, 'implicit --no-sandbox produced a strict pass')
  const incompatible = runRunner(shutdownRunner, ['--appimage', fixture.appImage, '--require-sandbox', '--entrypoint', 'launcher'], fixture, 'valid')
  assert.notEqual(incompatible.status, 0)
  assert.match(incompatible.stderr, /--require-sandbox requires --entrypoint app/)
  const compatible = runRunner(shutdownRunner, ['--appimage', fixture.appImage, '--platform', 'linux/amd64'], fixture, 'valid')
  assert.equal(compatible.status, 0, compatible.stderr)
})

async function createFixture(t) {
  const directory = await mkdtemp(join(tmpdir(), 'orca-required-sandbox-'))
  t.after(() => rm(directory, { recursive: true, force: true, maxRetries: 3 }))
  const appImage = join(directory, 'orca.AppImage')
  await writeFile(appImage, 'fixture only')
  await writeFile(join(directory, 'docker-fixture.mjs'), `import { appendFileSync } from 'node:fs'\nconst args=process.argv.slice(2),root=process.env.ORCA_SANDBOX_FIXTURE,mode=process.env.ORCA_SANDBOX_MODE\nif(args[0]==='--fixture-probe'){process.stdout.write(process.env.ORCA_SANDBOX_SHIM_TOKEN);process.exit(0)}\nappendFileSync(root+'/docker.jsonl',JSON.stringify(args)+'\\n')\nif(args[0]==='logs'){const ready='{"type":"orca_server_ready","schemaVersion":1,"endpoint":"ws://0.0.0.0:6768","boundEndpoint":"ws://0.0.0.0:6768","advertisedEndpoint":"ws://127.0.0.1:6768","pairing":{"available":true}}\\n';process.stdout.write(ready+(mode==='valid'?'SANDBOX_OK electron_pid=42\\n':mode==='implicit-no-sandbox'?'FAIL: ORCA_REQUIRE_SANDBOX observed --no-sandbox\\n':mode==='eperm'?'Failed to move to new namespace: Operation not permitted\\n':'SANDBOX_OK electron_pid=42\\n'));process.exit(0)}\nif(args[0]==='inspect'){process.stdout.write(['stale-ready','eperm','implicit-no-sandbox'].includes(mode)?'false\\n':'true\\n');process.exit(0)}\nprocess.exit(0)\n`)
  await writeFile(join(directory, 'docker'), `#!/usr/bin/env sh\nexec "${process.execPath}" "$(dirname "$0")/docker-fixture.mjs" "$@"\n`)
  await chmod(join(directory, 'docker'), 0o755)
  return { directory, appImage }
}

function fixtureEnvironment(fixture, mode, extra = {}) {
  return { ...process.env, ...extra, ORCA_SANDBOX_FIXTURE: fixture.directory, ORCA_SANDBOX_MODE: mode, ORCA_SANDBOX_SHIM_TOKEN: 'orca-sandbox-shim-v1', PATH: `${fixture.directory}${delimiter}${process.env.PATH ?? ''}` }
}

function runRunner(script, args, fixture, mode) {
  const env = fixtureEnvironment(fixture, mode)
  proveShim(fixture, env)
  return spawnSync(process.execPath, [script, ...args], { cwd: root, encoding: 'utf8', env, timeout: timeoutMs, killSignal: 'SIGKILL', maxBuffer })
}

function runCase(script, args, fixture, extra) {
  const env = fixtureEnvironment(fixture, 'valid', extra)
  proveShim(fixture, env)
  return spawnSync('bash', [script, ...args], { cwd: root, encoding: 'utf8', env, timeout: timeoutMs, killSignal: 'SIGKILL', maxBuffer })
}

function proveShim(fixture, env) {
  const probe = spawnSync('docker', ['--fixture-probe'], { cwd: fixture.directory, encoding: 'utf8', env, timeout: timeoutMs, killSignal: 'SIGKILL', maxBuffer })
  assert.equal(probe.status, 0, `Docker shim was not executable: ${probe.stderr}`)
  assert.equal(probe.stdout, env.ORCA_SANDBOX_SHIM_TOKEN, 'Docker shim interception was not proven')
}

async function dockerCommands(fixture) {
  return (await readFile(join(fixture.directory, 'docker.jsonl'), 'utf8')).trim().split(/\r?\n/).filter(Boolean).map((line) => JSON.parse(line))
}

function skipOutsideLinux(t) {
  if (process.platform === 'linux') return false
  t.skip('Linux-only process fixture; no runner or Docker command is started on this platform.')
  return true
}
