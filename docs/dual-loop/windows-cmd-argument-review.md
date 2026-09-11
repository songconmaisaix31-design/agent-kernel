# Windows `.cmd` argument review

## Scope

This is an isolated PowerShell 7.6.5 -> `.cmd` -> Node v24.16.0 argv fixture. It uses only fixed, non-executable strings and does not contact an Orca terminal, runtime, model, authentication store, Docker, or production configuration.

## Result

| Input | PowerShell -> Node | PowerShell -> `.cmd` -> Node |
| --- | --- | --- |
| `--text` with `alpha line` + LF + `beta line`, then `--enter --json` | all four argv values preserved | only `--text`, `alpha line` reached Node |
| `--text` with one-line absolute file reference containing spaces, then `--enter --json` | preserved | preserved |
| Unicode text containing spaces, then `--enter --json` | preserved | preserved |

The `.cmd` forwarding boundary reproduces the observed truncation: the line feed terminates the forwarded command, so trailing flags never reach Node. The direct Node control retains the multiline value and flags, which excludes Kernel/RPC argument handling from this reproduction; it is not evidence of a Kernel RPC defect.

## Usable pattern

For multiline `--text`, invoke the Node/CLI executable directly from PowerShell instead of an `.cmd` wrapper. When the current workflow can use a path reference, send it as a single-line `--text` value (for example, `--text 'C:\\path with spaces\\task.md' --enter --json`); the fixture preserved its spaces, Unicode, and both flags through `.cmd`.

No Kernel source fix is necessary from this evidence. If preserving multiline text through the dev launcher becomes a product requirement, the narrow repair domain is the dev-only Windows `.cmd` argument-ingress wrapper: replace/bypass the batch forwarding for the target executable and add this three-case argv regression test; do not change RPC, terminal-send handling, or shared CLI configuration on this basis.

## Reproduce

```powershell
& 'C:\Users\DW\AppData\Local\OrcaKernelLab\night\dual-20260911-103612\W-evidence\W-CMD\run-argv-repro.ps1'
```

Evidence: `C:\Users\DW\AppData\Local\OrcaKernelLab\night\dual-20260911-103612\W-evidence\W-CMD\results.json`.
