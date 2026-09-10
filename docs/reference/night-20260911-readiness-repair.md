# Night 2026-09-11 readiness repair

## Scope

This repair addresses an answered Codex ordinary rate-limit reminder that remains in retained terminal output after its modal closes. It does not send input, clear the terminal, or change the worker-start lifecycle.

## Decision

Only the observed ordinary reminder is eligible: `Approaching rate limits`, `Switch to gpt-5.6-luna for lower credit usage?`, and `Press enter to confirm or esc to go back`, followed by an anchored final `Ask Codex to do anything` input line. It clears only that same reminder; a trust, sandbox, permission, or other interactive prompt remains blocked.

## Compatibility

The matcher runs locally against existing terminal text and does not change RPC schemas, terminal stream opcodes, process ownership, or workspace assumptions. The behavior therefore applies equally to folder workspaces and Git worktrees, including hosts paired at a different Orca version.
