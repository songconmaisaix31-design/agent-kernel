# Kernel acceptance readiness — 2026-09-11

## Verdict

`01bd406abb787a6b2fd8064e66bcefb75971b8ff` is a real Electron/Vite/React/Node
repository, but it is not itself a Kernel-acceptable candidate: `git ls-tree -r`
found 16,584 files and 182,861,999 bytes, while the fixed snapshot cap is 4,096
safe regular non-executable files and 16 MiB total. A separate, small native Git
Vite/React/Node product repository can use Kernel; its complete candidate tree
(not only the diff) must fit those limits and have no filters, sparse/partial or
per-worktree Git configuration, executable files, symlinks, ambiguous casing, or
`.git` path segments.

The supported topology is one independent parent plus three direct consumers.
Every consumer has exactly one dependency, the parent has none, all four
`writePaths` are mutually disjoint, and each consumer starts only after the
server-persisted acceptance of the parent. Deeper chains and multi-parent tasks
are rejected; `accepted` remains a verification record, not integration or a
Docker/product release.

## Minimal supported configuration

The following is the actual `--kernel-config` JSON shape. Replace angle-bracket
values only after creating the Run/Tasks: task `key` values must be the real Task
IDs in that Run, `repoId` is Orca's registered native local Git repository ID
(not a filesystem path), and `baseCommit` is a full nonzero SHA.

```json
{
  "repoId": "<native-repo-id>",
  "limits": {
    "maxConcurrentWorkers": 3,
    "maxAttemptsPerTask": 2,
    "maxAttempts": 8
  },
  "plan": {
    "schemaVersion": 1,
    "objective": "Bounded Vite product change with three independent consumers",
    "nonGoals": ["Docker release", "remote or WSL execution", "automatic integration"],
    "baseCommit": "<40-or-64-lowercase-hex-base-sha>",
    "tasks": [
      {
        "key": "<parent-task-id>",
        "owner": "parent-worker",
        "spec": "Make the bounded shared Vite application change.",
        "writePaths": ["src/app-shell.tsx"],
        "dependsOn": [],
        "acceptance": ["Trusted Node check confirms the parent artifact."],
        "escalateWhen": ["Candidate snapshot exceeds Kernel limits."]
      },
      {
        "key": "<consumer-a-task-id>",
        "owner": "consumer-a",
        "spec": "Add the first independent consumer artifact from the accepted parent.",
        "writePaths": ["src/consumers/a.tsx"],
        "dependsOn": ["<parent-task-id>"],
        "acceptance": ["Trusted Node check confirms parent and consumer A artifacts."],
        "escalateWhen": ["The parent has no current accepted record."]
      },
      {
        "key": "<consumer-b-task-id>",
        "owner": "consumer-b",
        "spec": "Add the second independent consumer artifact from the accepted parent.",
        "writePaths": ["src/consumers/b.tsx"],
        "dependsOn": ["<parent-task-id>"],
        "acceptance": ["Trusted Node check confirms parent and consumer B artifacts."],
        "escalateWhen": ["The parent has no current accepted record."]
      },
      {
        "key": "<consumer-c-task-id>",
        "owner": "consumer-c",
        "spec": "Add the third independent consumer artifact from the accepted parent.",
        "writePaths": ["src/consumers/c.tsx"],
        "dependsOn": ["<parent-task-id>"],
        "acceptance": ["Trusted Node check confirms parent and consumer C artifacts."],
        "escalateWhen": ["The parent has no current accepted record."]
      }
    ]
  }
}
```

`owner` is descriptive; `owner`, `acceptancePolicy`, and any capability data must
not be put in this file. The server derives and persists the owner only after a
verified coordinator bind, and it rejects an altered consumer generation.

## Trusted acceptance policy and supported commands

The policy is supplied separately by the coordinator, keyed by the same real
Task IDs. This is executable trusted Node source, not candidate-provided plan
text and not a shell/Docker sandbox. The sample only checks deterministic source
artifacts; maintainers must replace the asserted files/content with the reviewed
product contract before approval.

```json
{
  "<parent-task-id>": {
    "source": "const fs=require('node:fs');require('node:assert/strict').ok(fs.readFileSync('src/app-shell.tsx','utf8').includes('AppShell'))",
    "timeoutMs": 3000
  },
  "<consumer-a-task-id>": {
    "source": "const fs=require('node:fs'),a=require('node:assert/strict');a.ok(fs.existsSync('src/app-shell.tsx'));a.ok(fs.existsSync('src/consumers/a.tsx'))",
    "timeoutMs": 3000
  },
  "<consumer-b-task-id>": {
    "source": "const fs=require('node:fs'),a=require('node:assert/strict');a.ok(fs.existsSync('src/app-shell.tsx'));a.ok(fs.existsSync('src/consumers/b.tsx'))",
    "timeoutMs": 3000
  },
  "<consumer-c-task-id>": {
    "source": "const fs=require('node:fs'),a=require('node:assert/strict');a.ok(fs.existsSync('src/app-shell.tsx'));a.ok(fs.existsSync('src/consumers/c.tsx'))",
    "timeoutMs": 3000
  }
}
```

The API permits 1–16 task checks, 1–30,000 ms each, at most 60,000 ms and 128
KiB total. It runs `node --input-type=commonjs -e` in a raw-byte detached
snapshot, with a constrained environment and no inherited coordinator
capabilities. These are the supported invocations, in order (place the two JSON
files outside the candidate, and use the real coordinator handle/IDs):

```powershell
orca orchestration run-use --id <run-id> --kernel-config <kernel-config.json> --from <coordinator-handle> --json
orca orchestration kernel-approve-acceptance --run <run-id> --checks <trusted-checks.json> --from <coordinator-handle> --json
orca orchestration worker-start --run <run-id> --task <parent-task-id> --worktree new-top-level --agent codex --setup skip --from <coordinator-handle> --json
orca orchestration kernel-accept --run <run-id> --task <parent-task-id> --dispatch <parent-dispatch-id> --candidate <lowercase-full-parent-head> --from <coordinator-handle> --json
# Start each direct consumer only after the preceding command returns accepted.
orca orchestration worker-start --run <run-id> --task <consumer-a-task-id> --worktree new-top-level --agent codex --setup skip --from <coordinator-handle> --json
orca orchestration kernel-accept --run <run-id> --task <consumer-a-task-id> --dispatch <consumer-a-dispatch-id> --candidate <lowercase-full-consumer-a-head> --from <coordinator-handle> --json
```

For every acceptance, candidate must be the exact bound worker worktree `HEAD`,
the latest completed local supervised dispatch must have a settled successful
worker, its base must equal the server-selected base, and the candidate diff must
stay inside the Task's `writePaths`. SSH, WSL, federated workers, low-level
`orchestration dispatch`, existing/current worktrees, alternate `--on`, and
manual capability/coordinator values are unsupported/rejected for Kernel.

## Docker workflow blockers and smallest ownership boundary

1. The observed Orca checkout exceeds the complete snapshot limits by 12,488
files and about 158.4 MiB. A Docker product workflow cannot reach acceptance
until W0 supplies a separate small product repository or changes the legitimate
candidate packaging boundary; increasing/bypassing the acceptance limits would
weaken the gate and is not proposed.
2. Kernel's acceptance execution is one trusted Node expression in a detached
source snapshot, not the product's Docker runtime. It does not install
dependencies, start Electron, mount a Docker socket, or establish a networked
container service. Consequently `docker build`, container health, and
browser-level Vite behavior are not proved by the shown policy.
3. This checkout has no installed Vitest binary (`pnpm exec vitest ...` fails
with `Command "vitest" not found`), so current runtime tests are source-only;
W0 must prepare dependencies in its own environment before any Docker/product
claim.

Smallest necessary W0-owned fix paths are the product workflow/fixture boundary
only (for example `Dockerfile`, `docker-compose.yml`, `package.json`,
`pnpm-lock.yaml`, and a dedicated small acceptance fixture repository). W2 makes
no product edits; W1 remains isolated to Linux packaging. Any Docker-aware
acceptance extension must preserve the existing trusted-policy, bounded
snapshot, local-native, and exact-worker-HEAD checks rather than accepting a
worker assertion or a container log as proof.

## Evidence

Read-only source review covered `kernel-plan.ts`, `kernel-run-config.ts`,
`kernel-run-limits.ts`, `kernel-dependency-base.ts`,
`kernel-candidate-review.ts`, `kernel-candidate-snapshot.ts`,
`kernel-candidate-acceptance.ts`, and the matching CLI specs/handlers. The
targeted command was:

```powershell
pnpm exec vitest run --config config/vitest.config.ts src/main/runtime/orchestration/kernel-plan.test.ts src/main/runtime/orchestration/kernel-candidate-acceptance.test.ts src/main/runtime/orchestration/kernel-dependency-base.test.ts src/main/runtime/rpc/methods/orchestration-kernel-acceptance.test.ts
```

It did not run because dependencies are absent (`vitest` is not recognized); no
passing test or Docker/product claim is made. Once W0 has prepared a separate
eligible product checkout, rerun that command there and then run the four
server-mediated acceptance invocations above with actual Run/Task/Dispatch IDs.

## Follow-up: required Linux sandbox regression boundary

The first revision of this regression was unsafe on Windows: its `.cmd` shim was
not proven before starting a runner, so it invoked the real Docker executable.
W0 confirmed the resulting orphan `node.exe` PID 96476 (created
2026-09-11T01:11:17.96535+08:00) and real Docker volume
`orca-headless-pairing-artifact-96476-1789060277991` (created 17:11:18Z); W0,
not W2, stopped the exact proven orphan PID 96476 and Docker children 97964/95256
after creation-time verification and preserved the volume. Therefore the earlier
claim that no Docker was invoked is withdrawn.

The repaired independent regression at
`config/scripts/headless-required-sandbox.test.mjs` uses Node's built-in
`node:test`/`assert`, a Linux-only temporary fake Docker executable, and bounded
child-process calls (5 seconds, 1 MiB). Before each harness it executes the
shim's unique probe token, so failure to intercept prevents the runner from
starting; on non-Linux platforms every fixture is skipped before any runner or
Docker command is started. It asserts `--require-sandbox` forwards
`ORCA_REQUIRE_SANDBOX=1`, strict pairing reports only a successful startup
validation, stale ready plus `SANDBOX_OK` after container exit fails, an exited
owned launcher cannot borrow an unrelated `orca-ide --serve` process, and
implicit sandbox disable is rejected.

Run it only after the W1 implementation is present in the same checkout:

```powershell
node --test config/scripts/headless-required-sandbox.test.mjs
```

This is a process-fixture regression, not Docker/AppImage/Electron product
acceptance. A real strict Docker run remains blocked (rather than downgraded)
when the environment cannot establish Chromium namespaces or otherwise fails
the sandbox proof.
