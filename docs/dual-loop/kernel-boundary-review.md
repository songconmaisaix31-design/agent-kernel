# Kernel boundary review — dual-20260911-103612

## Scope and versions

Read-only review of the Kernel source available in this worktree. Fixed baseline:
`01bd406abb787a6b2fd8064e66bcefb75971b8ff`; stated running production:
`3538e109d20a056cd7a05873f0e604c15b7222f7`. The reviewed Kernel boundary files
are byte-identical between those revisions. No run, worker, profile, runner, Docker,
or product repository was touched.

## Confirmed boundary: multi-leaf integration is external to one Kernel Run

This is an explicit supported boundary, not a new Kernel defect or a silent
acceptance bypass.

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

The proposed native process is viable: after all leaf candidates are fixed and
independently accepted, create a new single-task integration Run with no Kernel
dependencies. Its approved plan base is the fixed product base (or the audited common
parent candidate); its task body names the reviewed leaf SHAs as input, and its sole
integration worker combines them in a separate worktree. The new Run establishes its
own policy, candidate, and acceptance; it does not treat old accepted records as a new
authorization. `kernelDependencyBase` returns the new Run's `plan.baseCommit` for its
dependency-free task (`kernel-dependency-base.ts:33-35`), while candidate review requires
the final integration candidate to descend from that fixed base (`kernel-candidate-review.ts:126-158`).

The integration task's one write domain must cover the audited combined file set; a
conflict or an unreviewed path remains a return-to-leaf-owner condition. No Kernel source
change is needed for this boundary.

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
