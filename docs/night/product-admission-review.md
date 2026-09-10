# Product admission review — 2026-09-11

## Evidence boundary

This is a read-only review of fixed Kernel production commit `3538e109d20a056cd7a05873f0e604c15b7222f7`. The Kernel orchestration source is byte-identical in this checkout, and the inspected candidate CLI was `C:/Users/DW/AppData/Local/OrcaKernelLab/body-smoke-20260907/native-run/profile/cli/bin/orca-dev.cmd`; no Run, Worker, database, profile, or runtime was changed.

Correction: the Fork CLI **does** expose `orchestration kernel-approve-acceptance` and `orchestration kernel-accept`. Both `--help` calls succeeded on 2026-09-11, and their command specs and handlers are present at `src/cli/specs/orchestration.ts:5-27` and `src/cli/handlers/orchestration-kernel-acceptance.ts`; the earlier contrary statement came from an incomplete search that omitted `src/cli/`, not a Kernel runtime defect.

Relevant entry points:

- CLI: `orca orchestration run-create`, `run-use --kernel-config <file>`, `task-create --parent --deps`, `kernel-approve-acceptance --checks <file>`, `kernel-accept`, and `worker-start` (live `--help`, 2026-09-11).
- Run identity: `src/main/runtime/rpc/methods/orchestration-runs.ts:33` requires a stable coordinator pane; `orchestration-kernel-admission.ts:23-39` requires a verified compatibility caller whose terminal matches `--from`.
- Plan and parent fan-out: `kernel-plan.ts:70-215` validates portable paths and forbids unordered write overlap; `kernel-dependency-base.ts:24-42` permits exactly one independent accepted parent and rejects multi-parent/deeper chains.
- Execution and acceptance: `orchestration-kernel-admission.ts:106-130,178-183` admits only local `new-top-level` supervised starts and rejects low-level dispatch; `kernel-candidate-acceptance.ts:34-203` owns candidate snapshot/check/acceptance.

## D0 minimal legal sequence

Run these only from the real coordinator terminal and use the returned IDs verbatim. The angle-bracket values below are placeholders, not literal schema values.

```powershell
$orca = 'C:/Users/DW/AppData/Local/OrcaKernelLab/body-smoke-20260907/native-run/profile/cli/bin/orca-dev.cmd'

& $orca orchestration run-create --from <COORDINATOR_TERMINAL> --objective 'TypeScript product Kernel run' --json
# Record result.run.id as RUN.

& $orca orchestration task-create --run <RUN> --from <COORDINATOR_TERMINAL> --task-title 'parent contract' --spec 'Produce the accepted integration baseline only.' --json
# Record result.task.id as PARENT.

& $orca orchestration task-create --run <RUN> --from <COORDINATOR_TERMINAL> --parent <PARENT> --deps '["<PARENT>"]' --task-title 'frontend leaf' --spec 'Leaf-specific native task text.' --json
& $orca orchestration task-create --run <RUN> --from <COORDINATOR_TERMINAL> --parent <PARENT> --deps '["<PARENT>"]' --task-title 'backend leaf' --spec 'Leaf-specific native task text.' --json
& $orca orchestration task-create --run <RUN> --from <COORDINATOR_TERMINAL> --parent <PARENT> --deps '["<PARENT>"]' --task-title 'graph leaf' --spec 'Leaf-specific native task text.' --json
# Record each result.task.id as FRONTEND, BACKEND, GRAPH.
```

The parent is the only dependency of each leaf. It must become `completed` with a current server-persisted `accepted` result before a leaf can start; completion alone is insufficient. All plan `tasks[].key` values must be these durable Task IDs, and all `dependsOn` arrays must exactly match the created task dependencies.

Create a JSON file locally for the documented CLI handoff, then bind it through `run-use`; do not include `owner` or `acceptancePolicy`, because the server assigns them after verifying the coordinator.

```json
{
  "repoId": "354e0e28-c0b1-47dc-aacf-4fcbab1f6230",
  "limits": {
    "maxConcurrentWorkers": 3,
    "maxAttemptsPerTask": 1,
    "maxAttempts": 4
  },
  "plan": {
    "schemaVersion": 1,
    "objective": "TypeScript product slice with one accepted integration parent and three leaves",
    "nonGoals": ["No deployment", "No remote or WSL worker", "No unapproved shell acceptance"],
    "baseCommit": "a8d97a60a99c2901a99c4e44f62fa84c99e991e7",
    "tasks": [
      {
        "key": "<PARENT>",
        "owner": "integration-owner",
        "spec": "Create the integration baseline and commit it. Stop if scope changes.",
        "writePaths": ["src/product/integration/"],
        "dependsOn": [],
        "acceptance": ["Server-approved fixed-commit check exits 0"],
        "escalateWhen": ["A requested path is outside writePaths"]
      },
      {
        "key": "<FRONTEND>",
        "owner": "frontend-owner",
        "spec": "Implement only the approved frontend leaf.",
        "writePaths": ["src/product/frontend/"],
        "dependsOn": ["<PARENT>"],
        "acceptance": ["Server-approved fixed-commit check exits 0"],
        "escalateWhen": ["A shared integration file is needed"]
      },
      {
        "key": "<BACKEND>",
        "owner": "backend-owner",
        "spec": "Implement only the approved backend leaf.",
        "writePaths": ["src/product/backend/"],
        "dependsOn": ["<PARENT>"],
        "acceptance": ["Server-approved fixed-commit check exits 0"],
        "escalateWhen": ["A schema change affects another leaf"]
      },
      {
        "key": "<GRAPH>",
        "owner": "graph-owner",
        "spec": "Implement only the approved graph leaf.",
        "writePaths": ["src/product/graph/"],
        "dependsOn": ["<PARENT>"],
        "acceptance": ["Server-approved fixed-commit check exits 0"],
        "escalateWhen": ["Graph storage needs an unapproved dependency"]
      }
    ]
  }
}
```

```powershell
& $orca orchestration run-use --id <RUN> --from <COORDINATOR_TERMINAL> --kernel-config <CONFIG_JSON_PATH> --json
& $orca orchestration kernel-approve-acceptance --run <RUN> --from <COORDINATOR_TERMINAL> --checks <CHECKS_JSON_PATH> --json
& $orca orchestration worker-start --run <RUN> --from <COORDINATOR_TERMINAL> --task <PARENT> --worktree new-top-level --agent codex --timeout-ms 60000 --json
# Record the successful parent Dispatch ID and its full lowercase candidate SHA, then accept it.
& $orca orchestration kernel-accept --run <RUN> --from <COORDINATOR_TERMINAL> --task <PARENT> --dispatch <PARENT_DISPATCH> --candidate <PARENT_CANDIDATE_SHA> --json
# Start each leaf only after this command returns acceptance.status=accepted.
& $orca orchestration worker-start --run <RUN> --from <COORDINATOR_TERMINAL> --task <FRONTEND> --worktree new-top-level --agent codex --timeout-ms 60000 --json
& $orca orchestration worker-start --run <RUN> --from <COORDINATOR_TERMINAL> --task <BACKEND> --worktree new-top-level --agent codex --timeout-ms 60000 --json
& $orca orchestration worker-start --run <RUN> --from <COORDINATOR_TERMINAL> --task <GRAPH> --worktree new-top-level --agent codex --timeout-ms 60000 --json
# For each completed leaf, use its own returned Dispatch ID and candidate SHA:
& $orca orchestration kernel-accept --run <RUN> --from <COORDINATOR_TERMINAL> --task <LEAF_TASK> --dispatch <LEAF_DISPATCH> --candidate <LEAF_CANDIDATE_SHA> --json
```

## Server-owned acceptance and limits

The public CLI handler reads the JSON file, calls `orchestration.kernelApproveAcceptance`, and requires the returned persisted policy to deep-equal the supplied checks; `kernel-accept` then requires a returned accepted binding for the same Task, Dispatch, and candidate (`src/cli/handlers/orchestration-kernel-acceptance.ts`). The RPC still requires the verified Run coordinator, binds the server-approved policy to durable Run state, and executes approved JavaScript with `process.execPath --input-type=commonjs -e` (`kernel-candidate-acceptance.ts:34-203`). CLI availability is not a sandbox and `Plan.acceptance` is never executed: only use the approval command for reviewed trusted Node source, never an ad hoc terminal shell command or database edit.

`<CHECKS_JSON_PATH>` must be a JSON object keyed by the actual durable Task IDs. All four checks must be approved before the parent starts, because a later leaf acceptance needs its own configured check.

```json
{
  "<PARENT>": {
    "source": "const fs=require('node:fs'); if(!fs.existsSync('package.json')) throw new Error('package.json missing'); const pkg=JSON.parse(fs.readFileSync('package.json','utf8')); if(!pkg.name) throw new Error('package name missing');",
    "timeoutMs": 5000
  },
  "<FRONTEND>": {
    "source": "const fs=require('node:fs'); if(!fs.existsSync('package.json')) throw new Error('package.json missing');",
    "timeoutMs": 5000
  },
  "<BACKEND>": {
    "source": "const fs=require('node:fs'); if(!fs.existsSync('package.json')) throw new Error('package.json missing');",
    "timeoutMs": 5000
  },
  "<GRAPH>": {
    "source": "const fs=require('node:fs'); if(!fs.existsSync('package.json')) throw new Error('package.json missing');",
    "timeoutMs": 5000
  }
}
```

The policy supports 1–16 approved checks, each 1–30,000 ms, with at most 60,000 ms and 131,072 source bytes in total (`kernel-acceptance-policy.ts:7-23`). Candidate review snapshots only safe regular non-executable files, rejects symlinks/sparse/partial/filter/worktree config, limits the complete tree to 4,096 files and 16 MiB, runs with a scrubbed environment, and buffers each Git operation at 16 MiB (`kernel-candidate-snapshot.ts:10-62,100-116`). The shown `3/1/4` limits are a new Run-local bound for one parent plus three leaves: three leaves may overlap only after the parent is accepted, every Task has one attempt, and four is the total planned attempt budget; reduce concurrency if verified active resource accounting leaves fewer than three slots.

## Product fit and task checks

This is suitable for a small TypeScript front-end/back-end/graph slice only when source is split into non-overlapping portable paths, dependencies are not vendored, all tasks begin from product commit `a8d97a60a99c2901a99c4e44f62fa84c99e991e7`, and validation is an approved dependency-light Node check. It is not suitable for a normal full-stack build that requires an installed dependency tree, a bundled graph database, a remote/WSL host, multi-parent aggregation, or a deeper dependency chain.

For a fast acceptance check, approve narrow Node source that verifies only fixed-candidate scoped files and package metadata. This can execute trusted Node code, but the Kernel does not provision or install dependencies: the snapshot is made from tracked Git blobs and `node_modules` is generally neither present nor admissible under the file/byte limits. A final application build/test remains a separate product verification step; do not call a successful Kernel acceptance a full dependency install, browser build, deployment, or integration result.
