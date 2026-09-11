# Same-owner Kernel rework

Kernel normally starts only local `new-top-level` Workers. A narrow exception lets the current verified coordinator create a fresh Dispatch over the exact terminal and worktree of its latest successful Worker when review rejects an unaccepted candidate.

The public request remains `orchestration.workerStart`: it must name the original Task as `retryOf`, the exact server-issued worktree id, and the original terminal. The caller cannot supply a rework mode, token, or resource id. The server derives an internal binding, then rechecks it before dispatch creation and before terminal authority transfer.

Admission requires all of the following:

- a local managed Git worktree in the configured repository, with the same currently observed branch;
- a live recognized agent terminal with the original pane and process incarnation, in the same runtime epoch;
- the latest Task Dispatch settled as succeeded, with no accepted or checking Kernel candidate;
- one owned, unreleased original resource, either `not_requested` or explicitly user-retained;
- unchanged coordinator generation, owner, approved plan, dependency base, policy, and Kernel limits; and
- no active downstream planned Task.

The database repeats the persisted identity, resource, acceptance, task, dependency, limit, and generation checks in the existing worker-start transaction. It creates a new Dispatch and updates the current Task through the normal lifecycle; it does not alter the completed predecessor, reset attempts, or bypass low-level Kernel dispatch refusal.

Remote, WSL, folder, arbitrary existing, unknown, released, cross-task, changed-incarnation, and already accepted cases remain unsupported. A packaged-runtime restart that changes the terminal incarnation or runtime epoch requires a separately reviewed recovery path; it is not silently rebound by rework.
