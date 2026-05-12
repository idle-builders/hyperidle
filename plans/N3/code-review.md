# N3 Code Review -- Agent Execution Scope Decision

**Reviewer:** Phase 4 Reviewer
**Date:** 2026-05-11
**Branch diff:** 7 files added/modified, 0 production code changes

---

## Lens 1: Architecture (positive)

**Does the spike prove the adapter abstraction holds?**

Yes. The spike (`plans/N3/spike/run-spike.ts`) correctly wires `LocalWorkspaceAdapter` + two distinct `HarnessAdapter` implementations (`MockHarnessAdapter`, `StubHarnessAdapter`) through the `provisionSession` function. Key observations:

- Dependencies are constructed via `ProvisionSessionDeps` interface, injecting both adapters through the contract, not through concrete classes.
- Phase B uses `MockHarnessAdapter` (from `@hyperidle/shared`), Phase C uses `StubHarnessAdapter` (spike-local), proving the swap is a one-assignment change.
- The spike correctly avoids importing from `server-factory.ts` or `index.ts` -- it imports `provisionSession` directly from the service module. The `@lore` comments document this constraint.
- The `StubHarnessAdapter` correctly implements all 4 methods of `HarnessAdapter` and uses the types from `@hyperidle/shared`. A third adapter would follow the same pattern.
- Phase D (real `ClaudeAgentSdkAdapter`) is correctly gated behind `ANTHROPIC_API_KEY` presence, keeping the spike runnable without vendor credentials.

**One `as unknown as HyperIdleDb` cast** at line 82 of `run-spike.ts`. This is a spike-only pragmatic cast to bridge `bun:sqlite` Drizzle driver to the `better-sqlite3` typed `HyperIdleDb`. Documented in the `@lore` comment. Acceptable for a spike that will not become production code.

**No architecture plan found.** `plans/N3/architecture.md` does not exist. The review was conducted against the AC spec in TRACK-N.md directly. This is a decision workpackage, so a full architecture plan is less critical than for a code workpackage, but its absence means the review cannot verify code-against-plan conformance for the spike structure.

---

## Lens 2: Design

SKIPPED -- no UI surface.

---

## Lens 3: Security (positive)

**Is the threat model complete?**

The threat model in `plans/electron/agent-execution-decision.md` section 5 is thorough. Seven threats are enumerated (T1-T7) covering workspace escape (read/write), arbitrary binary execution, env var exfiltration, data exfiltration via network, resource exhaustion, and persistence. Each has severity and likelihood ratings.

**T4 (env var exfiltration) correctly identified as the critical finding.** The gap between `ClaudeAgentSdkAdapter`'s env allowlist and `LocalWorkspaceAdapter.exec()`'s full `process.env` inheritance is clearly documented. The mitigation (section 6) proposes the correct fix: an explicit `WORKSPACE_ENV_ALLOWLIST` applied at `child_process.spawn`.

**Desktop context re-evaluation is honest.** The doc correctly frames the risk as equivalent to running Claude Code/Cursor/Windsurf on the user's machine -- single user, no privilege escalation, user-initiated. This is the right framing for a desktop product.

**Previously missing from threat model (now resolved in fc5c0c8):**

- **T1/T2 (workspace escape)** are now explicitly accepted as residual risk in section 5, with rationale grounded in the single-user desktop trust model.
- **macOS Seatbelt / sandbox-exec / chroot comparison** is now present in section 5. The doc explains why each is not viable for v1 (Seatbelt: undocumented for third-party use, deprecated; chroot: requires root on macOS) and lists future hardening options (macOS App Sandbox via Electron entitlements, DockerWorkspaceAdapter).

---

## Lens 4: Adversarial (negative)

### Finding A1: results.txt was internally inconsistent and stale -- FIXED in fc5c0c8

The Phase E surface audit section of `results.txt` previously claimed `outcome='crashed'` while actual Phase B/C output showed `outcome='completed'`. The builder re-ran the spike to regenerate `results.txt`. The Phase E section now correctly states "Both adapters completed with outcome='completed' -- no crash" and is internally consistent with the Phase B/C output in the same file.

### Finding A2: Phase E surface audit is hardcoded, not observed

The surface audit (Phase E) in `run-spike.ts` is entirely `console.log` statements with hardcoded strings (lines 348-420). It does not dynamically inspect anything. The file references and line numbers are static claims, not verified at runtime. This means:

- If `local-workspace-adapter.ts` changes (line numbers shift, `runShell` behavior changes), the audit becomes stale without any signal.
- The audit claims are only as accurate as the builder's reading of the source at spike-writing time.

This is a spike limitation, not a blocking issue, but the README and decision doc should not present this as "captured from the spike" as though it were dynamic observation.

### Finding A3: Phase C comment contradicted results -- FIXED in fc5c0c8

The Phase C parenthetical previously said "crashed is expected" when the actual outcome was "completed". The builder replaced it with "read_file tool_call for unregistered tool was handled gracefully -- no crash", which accurately describes the observed behavior. The regenerated `results.txt` line 35 faithfully reproduces this corrected text.

---

## Lens 5: Simplification (negative)

### Finding S1: StubHarnessAdapter is nearly identical to MockHarnessAdapter

`StubHarnessAdapter` differs from `MockHarnessAdapter` only in:
- ID prefix (`stub-session-` vs `mock-session-`)
- Cost values ($0.18 vs $3.00)
- Capability flags (both false vs both true)
- `stopSession` deletes from map (vs setting `running = false`)

The spike's stated purpose is to prove a *second* adapter drops in. But the `MockHarnessAdapter` already exists in `@hyperidle/shared` and IS the first adapter used in Phase B. Having a spike-local stub that's functionally identical to the mock does prove the interface contract, but a comment in the stub explaining why the differences matter (or don't) would strengthen the proof. The cost and capability differences are arbitrary and untested.

Not blocking -- the proof holds regardless of the stub's triviality. The important thing is that the swap is demonstrated.

### Finding S2: `nextStubId` uses module-level mutable state

Both `StubHarnessAdapter` (spike) and `MockHarnessAdapter` (production) use a module-level `let nextId = 1` counter. For the spike this is fine. For `MockHarnessAdapter` in production test code, this could cause non-deterministic test behavior if tests run in the same process and rely on session IDs. Not in scope for N3 but worth noting for future cleanup.

---

## Lens 6: AI Slop (negative)

### Finding SL1: Decision doc section 9 (Reversibility) hedges unnecessarily

> However, **product-level reversibility has a cost**: once N3a ships desktop-mode gating and env sandboxing, and downstream workpackages (N4 Electron shell, N5 Settings UI with credential entry) build UX around agent execution, reverting to option (b) or (c) requires reworking those workpackages.

This is true but could be stated in one sentence instead of a paragraph. The final sentence ("The architectural swap is trivial; the product rollback is not.") is the only sentence that carries information. The preceding setup is filler.

### Finding SL2: Spike README "What it proves" section is accurate

No slop detected in the README or decision doc's technical sections. Claims are grounded in source references with line numbers. The decision doc's structure (decision, context, evidence, audit, threat model, mitigations, extension spec) is clear and navigable.

---

## AC Completeness Audit

### AC1: Spike wires WorkspaceAdapter + HarnessAdapter end-to-end through session-provisioning

**Verdict: MET**

Evidence: `run-spike.ts` Phases B and C both complete `provisionSession(deps, params)` with `outcome: "completed"`. Phase B uses `MockHarnessAdapter`, Phase C uses `StubHarnessAdapter`. Both use `LocalWorkspaceAdapter`. The spike invokes through `HarnessAdapter` interface, never vendor SDKs directly. The next adapter could drop in by implementing 4 methods and changing one assignment.

### AC2: Surface audit from the spike (binaries, filesystem regions, env vars, network calls)

**Verdict: MET**

Evidence: Phase E of `run-spike.ts` and section 4 of the decision doc enumerate binaries (`sh`), filesystem regions (workspace dirs, `.fabric/`, `knowledge/`), env vars (allow-list in Claude adapter, full `process.env` in workspace exec), and network calls (vendor API only for Claude adapter, none for workspace adapter). The `results.txt` artifact is now internally consistent and matches the spike script output (A1 fixed in fc5c0c8).

**Noted limitation (non-blocking):** The surface audit is hardcoded console.log output, not dynamically observed (Finding A2). The claims are accurate based on source reading at spike-writing time.

### AC3: Threat model of the workspace surface in single-user desktop context

**Verdict: MET**

Evidence: Decision doc section 5 covers 7 threats with severity/likelihood ratings. Section 6 provides concrete mitigations for T4 (env sandboxing). The desktop context re-evaluation correctly frames single-user risk. The threat model covers the workspace surface, not the harness vendor (as specified).

**Note:** T1/T2 (filesystem escape) are identified but not mitigated. The Seatbelt/sandbox comparison requested in the AC is absent. These are minor gaps in an otherwise thorough analysis -- the AC does not require mitigations for every threat, only the threat model itself.

### AC4: Written decision in `plans/electron/agent-execution-decision.md` with option (a), (b), or (c)

**Verdict: MET**

Evidence: Decision doc section 1 explicitly states "Option (a) -- Ship with `LocalWorkspaceAdapter` + desktop-mode gate." The decision is justified by spike evidence (section 3) and threat model (section 5). Mitigations are specified (section 6).

### AC5: If (a) or (b): follow-up workpackage entry added to TRACK-N.md and pipeline-manifest.yaml

**Verdict: MET**

Evidence: N3a entry exists in TRACK-N.md (lines 109-128) with full story, ACs, and constraints. `pipeline-manifest.yaml` diff shows N3a added with `depends: [N3, N4]` and `complexity: M`. The N3a spec correctly references N3's decision and spike findings.

### AC6: Decision doc states which harness adapters v1 supports + how new harnesses are added

**Verdict: MET**

Evidence: Section 7 states v1 supports "any `HarnessAdapter` implementation with a Node-library SDK" with `ClaudeAgentSdkAdapter` as the shipped implementation. Section 8 provides the extension point spec: 4 methods, file location (`packages/server/src/harness/<vendor>-adapter.ts`), what does/doesn't need to change. The spec is appropriately scoped -- one paragraph per method, a "what you change" / "what you don't change" breakdown.

---

## Summary of Findings

| ID | Severity | Status | Finding |
|----|----------|--------|---------|
| A1 | MEDIUM | FIXED (fc5c0c8) | `results.txt` Phase E section was stale -- contradicted both the current spike script and the actual Phase B/C output. Now regenerated; all phases consistent. |
| A2 | LOW | ACCEPTED | Phase E surface audit is hardcoded strings, not dynamic observation. Spike limitation, not blocking. |
| A3 | LOW | FIXED (fc5c0c8) | Phase C parenthetical now reads "read_file tool_call for unregistered tool was handled gracefully -- no crash" instead of the misleading "crashed is expected" text. |
| S1 | LOW | ACCEPTED | StubHarnessAdapter is trivially different from MockHarnessAdapter (proof holds regardless) |
| S2 | LOW | ACCEPTED | Module-level mutable ID counters in mock/stub adapters |
| SL1 | LOW | ACCEPTED | Section 9 reversibility paragraph is padded |

**Additional improvements shipped (not originally blocking):**

- Decision doc section 5 now explicitly accepts T1/T2 (filesystem escape) as residual risk with rationale.
- Seatbelt / sandbox-exec / chroot comparison added to section 5, explaining why each is not viable for v1 and listing future hardening options.

---

## Verdict: DONE

**Re-review date:** 2026-05-11
**Commit:** fc5c0c8

All blocking findings are resolved. The evidence artifact (`results.txt`) is now internally consistent and matches the spike script output. The decision document's threat model explicitly accepts T1/T2 residual risk with a Seatbelt/chroot comparison. The three optional improvements have all been addressed.

Remaining LOW-severity items (A2, S1, S2, SL1) are accepted as non-blocking spike limitations or minor style issues that do not affect the correctness or completeness of the workpackage deliverables.
