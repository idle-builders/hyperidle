# AU36 Review — round 1 (2026-08-11, ea455323)

**Verdict: NOT DONE** — all ACs proven except AC5's `npm run verify` green, which fails on two introduced knip errors.

| AC | Result | Evidence (reviewer's own runs) |
|---|---|---|
| AC1 reach w/o harness; descriptor clean | PASS | `inheritedTools`/`InheritedToolDescriptor` deleted, no compat alias; GET reads only reach cache (routes/connections.ts:212-224); wiring test boots with zero pool handle and sees facts; `npm run check` green |
| AC2 harness switch leaves reach identical | PASS | AU36-reach-wiring.integration.test.ts:255-298 exercises A→B→A on real `agentRunConfig.harnessType`, byte-identical GET bodies + non-vacuity asserts; ran green (3/3) |
| AC3 Connections view unchanged | PASS | probes/connections-section.png vs -main.png byte-identical (cmp); GitHub `environment · github`, working, inherited group; SettingsConnections.tsx untouched; projection contract/order preserved (D6 edge documented) |
| AC4 probe never obtains token | PASS | `gh auth status --json hosts` only (inherited-reach.ts:382); probes verbatim vs origin/main (type/field rename only); identity-only pins green incl. moved real-binary AN1 test (7/7 harness lane) |
| AC5 verify green + first boot | FAIL | First-boot proven (harness-lane gh test + live-boot screenshot). `npm run verify` EXIT=1 at knip (findings 1-2) |

## Blocking findings

1. `framework/domain-model/package.json:14` — devDependency `@hyperidle/harness-capability` now unused (its only consumer, the AN1 pin, was deleted in 3112ab34); knip errors → verify red. Fix: drop the devDep (+ lockfile line).
2. `layers/agent-orchestration/connections/src/__tests__/require-binary.ts:18` — `which` unlisted binary; the original copy is in knip.json:18 ignore, the new one isn't → knip errors → verify red. Fix: add the path to knip.json ignore.

## Verified clean

Red tests byte-identical 821d3dfb→HEAD (no weakening); unit slice 566 files/6138 tests green; governance-lint (cross-layer) PASS; disabled-topology parity; boot/redetect wiring identical across desktop/remote/test-utils; no new package; `createInheritedReach` production-consumed (boot.ts); AN1 lore traveled; docs updated; no OAuth.

## Non-blocking notes

- knip's 35 config hints + floors/misplacement WARNs pre-exist on main.
- D6 ordering edge documented and accepted in architecture.

---

# AU36 Review — round 2 (2026-08-11, 7011be9f)

**Verdict: DONE** — both round-1 blockers closed at source, `npm run verify` exit 0 (reviewer's own run), no new issues, no test weakening.

| AC | Result | Evidence (round-2 reviewer's own runs) |
|---|---|---|
| AC1 | PASS | `InheritedToolDescriptor` + `inheritedTools` deleted w/o alias; zero production refs; GET reads only `inheritedReach?.list()` (routes/connections.ts:221); wiring test boots w/o pool; check green |
| AC2 | PASS | AU36-reach-wiring.integration.test.ts 3/3 green (own run); A→B→A via real switchAgentHarness, byte-identical bodies + non-vacuity asserts |
| AC3 | PASS | cmp byte-identical screenshots (connections-section + settings-full) vs origin/main; SettingsConnections.tsx diff empty |
| AC4 | PASS | moved probes verbatim vs origin/main except type/field rename; only `gh auth status --json hosts`; AN1 real-gh lane 7/7; fact-shape pin "no token field" |
| AC5 | PASS | `npm run verify` exit 0 (own run); first-boot via moved AN1 real-binary test 7/7; unit slice 566 files/6138 tests green |

Round-1 blockers closed: devDep + lockfile line dropped (surgical); knip.json:19 ignore mirrors original pattern. Test weakening: none (red commit byte-identical to HEAD). Blocking findings: none. Non-blocking: pre-existing knip config hints on main.
