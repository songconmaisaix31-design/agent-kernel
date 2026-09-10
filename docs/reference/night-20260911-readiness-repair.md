# Night 2026-09-11 readiness repair

## Scope

This repair addresses an answered Codex ordinary rate-limit reminder that remains in retained terminal output after its modal closes. It does not send input, clear the terminal, or change the worker-start lifecycle.

## Decision

`Ask Codex to do anything` is current-screen evidence that the earlier Codex startup-style modal is no longer actionable. It clears only an older matched prompt; a trust, sandbox, permission, or other interactive prompt that follows it remains blocked because the latest actionable signal wins.

## Compatibility

The matcher runs locally against existing terminal text and does not change RPC schemas, terminal stream opcodes, process ownership, or workspace assumptions. The behavior therefore applies equally to folder workspaces and Git worktrees, including hosts paired at a different Orca version.
