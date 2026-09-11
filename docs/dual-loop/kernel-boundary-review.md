# Kernel boundary review — dual-20260911-103612

## Scope and versions

Read-only review of the Kernel source available in this worktree. Fixed baseline:
`01bd406abb787a6b2fd8064e66bcefb75971b8ff`; stated running production:
`3538e109d20a056cd7a05873f0e604c15b7222f7`. The reviewed Kernel boundary files
are byte-identical between those revisions. No run, worker, profile, runner, Docker,
or product repository was touched.

## Finding: multi-leaf integration has no trusted Kernel path

This is an explicit product-flow blocker, not a silent acceptance bypass.

Reproducible plan shape:

```text
P: dependsOn=[]
L1: dependsOn=[P]
L2: dependsOn=[P]
I: dependsOn=[L1,L2]
```

After `P`, `L1`, and `L2` have current accepted results, asking Kernel to derive
`I`'s start base calls `kernelDependencyBase(..., 'I')` and throws
`kernel_dependency_unsupported`: only one independent accepted parent is supported.
`src/main/runtime/orchestration/kernel-dependency-base.ts:36-41` implements that
rule; `kernel-dependency-base.test.ts:465-473` asserts the multi-parent rejection.
An integration task that names only `L1` can start from `L1`'s candidate, but it has
no trusted inclusion of `L2`'s candidate.

Impact: D0's contract parent plus disjoint leaf tasks is supported only through
independent leaf acceptance. Final composition must remain an explicitly external,
manual integration boundary, or a future Kernel owner must add a separately approved
multi-leaf integration design. Suggested owner paths, if authorized: `kernel-dependency-base.ts`,
`kernel-candidate-acceptance.ts`, `orchestration-kernel-admission.ts`, and their
corresponding tests. The candidate owner must not self-authorize that authority change.

## Checked boundaries with no incorrect-acceptance finding

- **Write domains:** `kernel-plan.ts:145-181` rejects overlapping unordered write
  paths. Parent-to-leaf ordering exempts overlap only where the dependency is ordered.
- **Accepted dependency base:** `kernel-dependency-base.ts:43-94` requires the
  current parent task, latest dispatch, settled successful worker, policy approval,
  candidate SHA, and binding stamp. `kernel-dependency-base.test.ts:193-232` covers
  a child worktree beginning at the accepted parent SHA and accepting only its own
  changed path.
- **Candidate binding and retries:** `kernel-candidate-acceptance.ts:205-226` stores
  a `checking` reservation, returns an identical accepted result only when its
  binding/candidate/location still match, and refuses automatic retry after process
  loss. Rejected checks can be submitted again; an unresolved `checking` record is a
  deliberate human-resolution stop, not an automatic retry.
- **Snapshot isolation:** `kernel-candidate-snapshot.ts:117-244` reads raw Git blobs,
  verifies object IDs, materializes a detached owned worktree, and verifies bytes and
  metadata both before and after the approved check.

## Conditional limitation and unverified items

Candidate snapshots always materialize the complete candidate tree and reject more
than 4,096 safe regular files or 16 MiB (`kernel-candidate-snapshot.ts:86-115,150-153`).
Thus a product repository with 4,097 files or a 16 MiB-plus tree cannot use Kernel
acceptance even when a leaf changes one allowed file; this review has no D0 repository
inventory, so it is a conditional staging blocker, not a demonstrated current failure.

Commands actually run: `git cat-file -t` and `git show -s` for both fixed revisions,
`git diff --quiet` for the reviewed production boundary files, and targeted `rg`/source
inspection. Runtime unit tests were not run because this checkout has no `node_modules`;
no cross-platform or product acceptance is claimed.
