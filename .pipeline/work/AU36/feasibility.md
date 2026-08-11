# AU36 Feasibility

One load-bearing live-state assumption was unknown: whether THIS machine (where AC5's boot-detection and
AC3's rendered-surface verification must be proven) has a logged-in GitHub CLI and the harness binaries
the moved real-binary test hard-fails without. Probed live on 2026-08-11 in the worktree environment.

## Probe 1 — gh presence + login state (boot-detection AC)

- **Question:** Is `gh` installed and logged in here, so first-boot detection and the rendered-surface
  check have something to show?
- **Method:** `which gh` + `gh auth status --json hosts` (the exact probe command shape, identity only).
- **Result:** `/opt/homebrew/bin/gh`; exit 0; hosts JSON shows `github.com` → `state: "success"`,
  `login: tobias-ambrovia`, `tokenSource: keyring`.
- **Verdict:** FEASIBLE. The boot wire and the harness-lane `requireBinary("gh")` test can genuinely
  prove detection on this machine; the manual Connections check should show GitHub/working/inherited.

## Probe 2 — harness binaries for the moved real-binary test

- **Question:** Are claude/codex/opencode/cursor-agent present (the moved AN1 test hard-fails, never
  skips, on an absent binary)?
- **Method:** `which claude codex opencode cursor-agent`.
- **Result:** all four on PATH (`/opt/homebrew/bin/{claude,codex,opencode}`,
  `/Users/tg/.local/bin/cursor-agent`).
- **Verdict:** FEASIBLE — the harness lane can run here.

## No probe needed — redetect wiring legality

How the redetect trigger legally reaches connections was settled by reading the tree, not by live state:
`POST /api/harnesses/redetect` is core-api-hosted (`routes/harnesses.ts:142`) and already refreshes via
an injected handle (`HarnessCapabilityReader.refresh`); the Applications (`applications/desktop/src/create-server.ts`,
`applications/remote-server/src/create-server.ts`) and `createTestApp` (`core-api/src/__testing__/test-utils.ts`)
are the two sanctioned composition sites and already forward values across layers through boot-face
options with deferred-binding closures (transport pattern, desktop create-server.ts:192-210). An opaque
`() => Promise<void>` callback threaded the same way is a composition-root act, legal under
`tools/governance/README.md`. No assumption left unverified → no further probes.

Scratch: none kept (commands run directly; outputs above are the evidence).
