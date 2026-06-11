# AF4 — Type-green the server package: code review (Phase 4)

**Reviewer verdict: DONE.** All four acceptance criteria met with hard evidence. Zero CRITICAL findings. The two root-cause src fixes (`ValidatedJson<T>` boundary helper, `RegisteredTool` invariance erasure) are sound and behavior-neutral; the 655 test fixes are mechanical `!`/`toBeDefined` narrowing with zero assertion deltas; the three Z8 entries (167/168/169) are real, correctly scoped, and routed.

Reviewed `git diff origin/main...HEAD` (net AF4 contribution after the AF3 #245 merge). Empirically re-ran the gate, lint, and behavior-adjacent integration suites with leaf dist populated + src droppings cleaned per `plans/AF4/lore.md`.

---

## AC table

| AC | Status | Evidence |
|---|---|---|
| **AC1** — server compiles 0 errors under real gate, off exception list | **MET** | `npm run check` → `server 0 PASS`, gate PASS over all 11 packages. `typecheck-debt.json` keys = `["eval","web"]` — no `server`. `eval` (8, AF2) + `web` (211, AF5) are not AF4's. `design-system`/`desktop` removal is the gate-forced stale-ratchet consequence (0 real errors in built-leaf state), documented in Z8-169 — verified empirically (both = 0 PASS in the gate run). |
| **AC2** — route req/resp types sound, no `any` at boundary | **MET** | `validate.ts` exposes `ValidatedJson<T> = { in:{json:z.input<T>}; out:{json:z.output<T>} }`; only cast is `schema as never` (schema-arg bridge into `zValidator`, not a payload cast) + the `as MiddlewareHandler<…>` middleware-type annotation. `validate.route-boundary.test.ts` type-checks GREEN (server own-errors = 0; the red test compiles clean as part of the project). Zero `"json"→never` at notifications/observability/git-export routes. `npm run lint` (biome + eslint) exit 0 — `no-explicit-any`/`no-unsafe-*` green. AC2 grep: **no `@ts-ignore`/`@ts-expect-error` anywhere in code; no `as any`/`as unknown as` at any route/middleware payload boundary.** |
| **AC3** — genuine contract bugs fixed or recorded against Z8 | **MET** | Z8-167 (create_item phantom `attentionScore`/`costEstimate` insert — dropped, never persisted, routed to knowledge WP), Z8-168 (message-payload `blockId`/`MentionRef.sourceText` drift — runtime untouched, read-back bridge only, routed to conversations WP), Z8-169 (design-system/desktop stale-quarantine removal — gate-forced). All real, correctly scoped, behavior-neutral on the server side. D-candidates adjudicated: dispatcher dead-case removal (behavior-neutral, all current DomainEvent kinds listed → `return false` = prior default), credentials:311 (fail-closed `{valid:false}` preserved), traceId (required field on `SessionContext` all along; supplied to satisfy TS2741, matches sibling `tasks.ts:146` pattern — behavior-neutral), team-lookup:47 (unreachable guard after length-invariant throws). |
| **AC4** — `npm run verify` passes | **MET** | Full `verify` ran end-to-end with dist populated + src clean: typecheck-gate PASS, lint (biome 0 errors / eslint exit 0), knip, mock-inventory, **2583 tests passed / 5 skipped**, web build OK, desktop bundle complete + validation passed, attestation written to `.verify-attestations/<sha>.json`. Exit-0 success signal = attestation emission (final stage). |

---

## Findings by severity

### CRITICAL
None.

### WARNINGS
None blocking. (No type loosened, no flag carve-out, no boundary `any`, no silent behavior change that should have been a Z8 entry, no assertion-weakening.)

### OBSERVATIONS (non-blocking, builder may leave as-is)

1. **`bet.schema.ts:102` uses `selectBetSchema as unknown as z.ZodTypeAny`** — the plan §4c prescribed the single cast `selectBetSchema as z.ZodTypeAny`. The builder used the double `as unknown as`. This is a **non-boundary internal schema-construction cast** (the AC2 grep is scoped to route/middleware *payload* boundaries — this is a schema-array construction in a schema file), so it does NOT violate AC2, and the lore comment correctly explains the drizzle-zod 3.25.76 vs server 4.4.3 brand mismatch. Minor deviation from the plan's prescribed single-cast form; harmless. If the single cast `as z.ZodTypeAny` compiles, prefer it (tighter), but not required.

2. **`create-artifact.test.ts:108` — `{ kind: "text" } as ArtifactPreview as any`** — redundant: the trailing `as any` (a *pre-existing*, deliberate invalid-payload negative-test fixture) makes the prepended `as ArtifactPreview` pointless. Test file, not a boundary; the `as any` tests that the handler rejects a malformed preview. Slop (redundant cast chain) — drop the `as ArtifactPreview`, leaving the original `as any` for the invalid-input test. Cosmetic.

3. **`handoff-to.ts:54` mints `traceId: randomUUID()`** while the sibling handoff path at `tasks.ts:201` uses the established `traceId: ""` empty-string sentinel (per O2 lore) for the same unconsumed-on-handoff field. Both behavior-neutral (the comment confirms handoff never reads traceId), but minting a throwaway UUID is less consistent than the `""` sentinel the codebase already uses on the handoff path. Cosmetic.

4. **`credentials.ts:311` — `const exhaustive: never = name; void exhaustive;`** — the `void exhaustive` to silence TS6133 is a touch verbose vs keeping the `_exhaustive` underscore-prefix convention. Fail-closed behavior preserved. Cosmetic.

---

## Lens notes

- **Architecture** — Layer integrity intact (no Human Interface ↔ Meta ↔ Runtime violations introduced; type-only changes). The new `isolated-session-protocol.ts` is a clean type-only IPC module (discriminated union + type guards) correctly separated from the fork-only worker entrypoint. `RegisteredTool` is honest naming (boundary-erased tool); `toRegistered` folds the prior bespoke `wrapForRegistry`/`wrapAssistantTool` into one named adapter — naming-is-architecture respected. No new routes/mounts. Data model untouched.
- **Design** — skipped (no UI files changed).
- **Security** — `validateBody` fix *tightens* the boundary (`c.req.valid("json")` now typed `z.output<T>` instead of `unknown`); the 400 `validationHook` runtime path is untouched (S1-auth + validation 400 integration tests pass). Harness IPC narrows preserve exact runtime dispatch (session-isolation invariant held). credentials switch stays fail-closed. No new trust boundaries, secrets, SSRF, or path inputs. Type-only WP.
- **Adversarial** — Saboteur: no weakened tests — every `-expect(...)` line is replaced by an identical assertion with `[0]` → `[0]!` narrowing (sampled AA3-routine-cost, cost-cap, bets.L14; assertion *values* unchanged). No tsconfig/vitest carve-out; strictness flags untouched. Zero `!` non-null assertions added in src (non-test) files — all src fixes use genuine guards (early-return/throw). The `toRegistered` `args as Input` erasure is sound (handler only invoked post-`inputSchema.safeParse`, tool-registry.ts:269-273). Auditor: PR claims (no user-facing API shape change) match the diff — the only schema change is `z.record(z.unknown())` → `z.record(z.string(), z.unknown())` (same string-keyed wire shape, zod v4 arity).
- **Simplification** — no premature generics or dead code introduced; the tool-registry change *removes* bespoke wrappers in favor of one adapter. Two cosmetic redundancies noted (Observations 2, 4).
- **AI Slop** — `void exhaustive` and the doubled cast chain are minor tells (Observations 2, 4); otherwise clean. Lore comments are load-bearing (explain the zod brand-split), not filler.

## Doc check
**No user-facing doc updates required.** No route request/response wire shape changed (verified by diffing `packages/server/src/schemas` + `routes` — only the behavior-neutral `z.record` arity fix). The builder's claim is correct.

---

**Verdict: DONE.** Ship it. The 4 observations are cosmetic and non-blocking.
