# AH4 Retro — Teams and agents land in the org chart

Fresh-context observation pass. Observe, don't fix.

## Timeline (2026-06-15)

| Phase | Commit | Notes |
|---|---|---|
| Scaffold | 8d45bed1 | WIP empty commit, draft PR #292 |
| 1 — architecture | a6a349f8 | 265-line plan, design-it-twice + spec-vs-reality reconciliation |
| 1 — design | 9c1de87e | 53-line approved direction, routine classification, zero new components |
| 2 — critique | 2a6da0f7 | design 8/10, architecture 8/10, no CRITICAL |
| 3 — red | 731956f3 | 1124 test LOC before implementation |
| 3 — green | 3c29b9cc | ~900 LOC feature + all 5 architect riders honored in-commit |
| 4 — fix cycle | 07506b10 | W1 anti-spoof test + honest E2E re-scope + nits |
| 4 — review DONE | b6b32344 | verdict DONE after one fix cycle |

## Cost signals

- One Phase-4 fix cycle (review NOT DONE → fix → DONE). All other phases single-pass.
- Plan-to-code coherence high: architecture task list mapped 1:1 to implementation; code review found zero plan drift.
- Riders cheap: all 5 architect suggestions (TOCTOU `onConflictDoNothing`, loud-skip logging, FK-422, 201/200 split, zero-teams handling) built during green, none deferred to a post-hoc fix.
- Design-system reuse prediction held: `KeyValue` + `Select` primitives used as-is, no new components.

## Process observations

1. **Architecture rigor prevented rework.** The plan's spec-vs-reality reconciliation (verifying `POST /api/agents` already accepts `teamId`, the `org_edges_unique` tuple, `GET /api/org` shape, absence of a standalone graph view) meant the builder explored nothing during green. Worth keeping.

2. **The one fix cycle was a spec-interpretation gap, not a code bug.** AH4's two `(Playwright, required)` specs were written fully mocked (`page.route`), proving only UI rendering — they would stay green even if the edge-upsert code were deleted. The reviewer correctly flagged this. But its prescribed fix (build real-backend E2E) collided with two facts: the repo's Playwright harness boots **vite only** (no backend — `@lore N2`), and **AH5 explicitly owns the real-path lane** for AH1–AH4. Resolution: backend behavior is proven by integration tests (real Hono+PGlite); real-path E2E deferred to AH5; specs honestly re-annotated.

3. **Recurring track-AH structural tension (compound candidate).** Every AH1–AH4 workpackage carries `(Playwright, required)` ACs that *cannot be satisfied independently* — they structurally depend on AH5's live lane — yet the dependency graph lists their deps as None. The spec-writing pattern marks proofs "required" without encoding the AH5 proof dependency. This produced a predictable review round on AH1 (attestation-timing) and AH4 (E2E proof tier). Recommend: encode an AH1–AH4 → AH5 *proof* dependency, or have the spec template state explicitly which proofs ride AH5's lane.

4. **Manifest defect.** `pipeline-manifest.yaml` AH4 entry: `depends: [AG5, AG6, AH3, AH4]` — contains a self-reference (AH4 depends on AH4) and contradicts the spec's "Depends on: None." Manifest dependency validation should reject self-references.

5. **W1 anti-spoof test relies on implicit ordering.** Local-mode auth resolves the founder via `SELECT id FROM users WHERE kind='human' LIMIT 1` with no `ORDER BY`. The test seeds founder A first and asserts the edge is `fromUserId === A` (not body `userId = B`). Stable in PGlite (insertion order holds), but an explicit `orderBy(users.createdAt)` in the auth resolver would make determinism explicit. Non-blocking.

6. **Stale attestation in tree.** Attestation committed during green (c61ad873) predates later commits; `/ship` writes a fresh one. Same low-severity attestation-timing pattern observed on AH1 (CC-005).
