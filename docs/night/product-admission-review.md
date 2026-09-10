# Product admission review — 2026-09-11

## Evidence boundary

This is a read-only review of fixed production commit `3538e109d20a056cd7a05873f0e604c15b7222f7`. The Kernel orchestration source is byte-identical in this checkout, and the inspected candidate CLI was `C:/Users/DW/AppData/Local/OrcaKernelLab/body-smoke-20260907/native-run/profile/cli/bin/orca-dev.cmd`; no Run, Worker, database, profile, or runtime was changed.

Relevant entry points:

- CLI: `orca orchestration run-create`, `run-use --kernel-config <file>`, `task-create --parent --deps`, and `worker-start` (live `--help`, 2026-09-11).
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
  "repoId": "<LOCAL_GIT_REPO_ID_FROM_orca_repo_list>",
  "limits": {
    "maxConcurrentWorkers": 2,
    "maxAttemptsPerTask": 2,
    "maxAttempts": 8
  },
  "plan": {
    "schemaVersion": 1,
    "objective": "TypeScript product slice with one accepted integration parent and three leaves",
    "nonGoals": ["No deployment", "No remote or WSL worker", "No unapproved shell acceptance"],
    "baseCommit": "3538e109d20a056cd7a05873f0e604c15b7222f7",
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
& $orca orchestration worker-start --run <RUN> --from <COORDINATOR_TERMINAL> --task <PARENT> --worktree new-top-level --agent codex --timeout-ms 60000 --json
# Start each leaf only after the parent has the current server-persisted accepted record.
```

## Server-owned acceptance and limits

The public CLI help exposes Run/task/worker operations but no `kernelApproveAcceptance` or `kernelAccept` command. The production RPC entry points require the verified Run coordinator, bind a server-approved policy to durable Run state, and execute approved JavaScript with `process.execPath --input-type=commonjs -e`; they do not accept a candidate-provided command or shell string (`kernel-candidate-acceptance.ts:34-203`). Therefore D0 may create/configure the legal graph, but a product acceptance step requires the existing authorized Kernel acceptance surface; do not imitate it with terminal shell commands or database edits.

The policy supports 1–16 approved checks, each 1–30,000 ms, with at most 60,000 ms and 131,072 source bytes in total (`kernel-acceptance-policy.ts:7-23`). Candidate review snapshots only safe regular non-executable files, rejects symlinks/sparse/partial/filter/worktree config, limits the complete tree to 4,096 files and 16 MiB, runs with a scrubbed environment, and buffers each Git operation at 16 MiB (`kernel-candidate-snapshot.ts:10-62,100-116`). `node_modules` should not be committed into a candidate: it is likely to exceed those limits and acceptance checks intentionally do not inherit user Node preloads or caller capabilities.

## Product fit and task checks

This is suitable for a small TypeScript front-end/back-end/graph slice only when source is split into non-overlapping portable paths, dependencies are not vendored, all tasks begin from the fixed commit, and validation is an approved dependency-light Node check. It is not suitable for a normal full-stack build that requires an installed dependency tree, a bundled graph database, arbitrary package-manager/network commands, a remote/WSL host, multi-parent aggregation, or a deeper dependency chain.

For a fast check, approve a per-task read-only Node source that verifies only the fixed candidate's scoped files and package metadata. For a complete check, use one or more approved checks within the same 16-check/60-second/128-KiB policy budget; each check must still operate against the server-created fixed candidate snapshot and its exact candidate SHA, not a live mutable checkout.
