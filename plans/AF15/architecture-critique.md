# AF15 — Critique (Design + Architecture)

Reviewer evaluation, Phase 2. Designer artifacts read cold; every load-bearing claim spot-checked against worktree code.

---

## Claim verification (designer's assertions vs. code)

| Claim | Verdict | Evidence |
|---|---|---|
| `SettingsTeams` has no component; catalog entry vestigial | **TRUE** | no `SettingsTeams.tsx`; `"teams"` id in `settings-types.ts` only. |
| `SETTINGS_SECTIONS`/`SettingsSectionId` have zero live consumers | **TRUE** | grep outside `settings-types.ts` = empty. |
| `SettingsAgents`/`SettingsWorker` built, tested, unmounted | **TRUE** | both `.tsx` + tests exist; not imported in `SettingsPage.tsx` (imports stop at Profile…Backend). |
| Models `updateServerConfig` is full-replacement → key wipe | **TRUE** | `server-config.ts:188` `modelGateway: patch.modelGateway !== undefined ? patch.modelGateway : current.modelGateway`. Comment even says "Full replacement". |
| `POST /api/users` idempotency is the mirror to copy | **TRUE** | `users.ts:94-111` — select existing human, return 200. Exactly the proposed shape. |
| `POST /api/teams` lacks existence check | **TRUE** | `teams-routes.ts:320-348` — only name validation, then unconditional `insert(teams)`. |
| Backend hardcodes `isLocal=true`; `backendMode` is real/available | **TRUE** | `SettingsBackend.tsx` `const isLocal = true`; `window.d.ts:26` `backendMode?: "local"|"shared"|null`. |
| `deriveTeams` circular + type-mismatched | **TRUE** | `SettingsOrgChart.tsx:303` derives **names** from existing edges; `org.ts:106` validates target against `teamMembers.id`. Names can never validate. Free-text fallback (`:422`) is dead-on-submit. |
| Email-digests already removed by AF8 | **TRUE** | absent from `SettingsNotifications.tsx`; guard test `AD3-SettingsNotifications-solo.test.tsx:96` already asserts absence. |
| Solo short-circuit blocks all edge creation | **TRUE** | `SettingsOrgChart.tsx:188` returns guidance `<p>` early — no AddEdgeForm rendered at all when 1 human. |

All ten designer claims verified accurate against code. Strong reconciliation discipline.

---

## Design Critique

DESIGN-CRITIQUE: variant=stacked-page-mount score=8/10 rounds=1 axes: H:8 S:8 T:8 C:8 Co:7 St:8 A:7 AS:9 PP:7

Routine design class — zero net-new components, reuses the existing `SettingsPage` stacked-section family (`<section>` + `SectionTitle`). No mockup to screenshot; scored against the contract, states matrix, and token claims in `approved.md`, cross-checked against the existing section code those new sections inherit from.

### CRITICAL
- none.

### WARNING
- [approved.md §3, §5] **Empty-state copy points users to a surface that may not let them act.** "No teams yet — create one in Work" + solo-relaxed Add-Edge form means a solo founder opens the form, sees only a disabled placeholder, and is told to go to Work. Verify the Work roster actually exposes team creation to a solo founder; if it doesn't, this is a dead-end loop (the same circular-dependency class the WP is trying to kill, relocated). Design must name the exact Work affordance that creates a team, or the unblock is illusory.
- [approved.md §3] **`mechanism="function"` target is free-text but unverified for persistence honesty.** The audit table (§2) covers toggles but not the function free-text input. `org.ts` validates `direct`/`team` targets but `function` is `z.string().min(1)` open. Confirm the function path persists and round-trips — it's an edge-creation control on the same form and the AC is "a first relationship can be created," which `function` also satisfies. Not scored as a control in §2.

### SUGGESTION
- [approved.md §5] AQ-015 touch-target ≥44px is asserted "already used elsewhere" for the new Worker toggle / Agents buttons — verify on the rendered mount rather than by inheritance assumption, since the new sections sit in a different vertical-rhythm context.
- [approved.md §1] Section ordering prose contradicts itself: §1 header list says "Models → Agents (NEW) → Assistant" but the placement diagram block says "Models → Agents → Assistant → Appearance." The arch plan (§5) also wavers ("after Assistant region … after Models/before Assistant per design"). Pin one order to avoid a builder coin-flip.

### What's Working Well
- Honest-affordance audit (§2) is exactly the right shape for the "no dead toggle" AC — it enumerates every control + its persistence path and concludes *no redesign needed, only a guarantee test*. Refreshingly restrained; no invented UI.
- Rejected-directions (§6) is substantive, not theatre — the `SettingsTeams` stub, the auto-create default edge (User Sovereignty), and the free-text team name (can't validate) rejections each cite a real constraint.

---

## Architecture Critique

ARCHITECTURE-SCORE: 8/10 rounds=1 score-line: SA:9 LI:9 AC:9 DM:8 N:8 MD:8 FMC:8 S:8 V:8

### CRITICAL
- none. All six ACs map to tasks with concrete verification; no scope creep; no layer violations.

### WARNING
- [plan §5 / §Migrations] **"`TeamSetting`/`UserSetting` are knip-dead, zero live consumers" is FALSE — they're transitively live via `SettingsData`.** `SettingsData.teams: TeamSetting[]` and `.users: UserSetting[]` (settings-types.ts) are consumed by `useSettings.ts` (which keeps `SettingsData`, and which the plan explicitly preserves). Deleting `TeamSetting`/`UserSetting` will break `SettingsData`'s field types. The plan's "grep before delete" instruction will surface this, but the stated premise is wrong and the plan offers no resolution. **Fix:** either (a) keep `TeamSetting`/`UserSetting` (they back live `SettingsData` fields), or (b) decide `SettingsData.teams`/`.users` are themselves dead and prune the fields + their default-construction in `useSettings.ts:65` together. Pick one explicitly; don't leave it to the builder's grep.
- [plan §Protected tests] **`protectedTests: []` is wrong — `SettingsData`-shape tests exist and will drift.** `useSettings.test.ts:26,43` and `AppShell.*-settings.test.tsx` assert on the `SettingsData` shape including `mutedTeams`/`teams`/`users`. Any catalog/`SettingsData` edit ripples into these. List them as protected (semantics frozen) or as expected-to-change; an empty block hides a real drift surface (CC-008).
- [plan §Contracts 1 / §Risks] **`PatchModelGatewaySchema` relax-to-partial is under-specified for the refinement loop.** Current schema is `ModelGatewayConfigSchema.superRefine(...)` (model-gateway.ts:46) — it assumes all three tiers present and full. Relaxing to deep-partial means the `superRefine` must (a) skip omitted tiers, (b) apply the "baseUrl required for openai-compatible" rule only when `provider` is being **set** in the patch (not when the merged result happens to be openai-compatible with a pre-stored baseUrl). The plan names this risk but gives no concrete schema; this is the single hardest change in the WP and the most likely to ship a bug (reject a valid partial, or accept a key-clearing patch). **Fix:** specify the partial schema's refinement predicates explicitly (per-tier `.partial()`, refinement guarded by `tier.provider !== undefined`).

### SUGGESTION
- [plan §Contracts 1 `mergeTier`] The `apiKey: patch.provider && patch.provider !== "openai-compatible" ? undefined : (patch.apiKey ?? current.apiKey)` rule silently drops the key on provider-change-away. Correct, but add an AC-2 sibling test asserting **provider change openai-compatible→same-openai-compatible with omitted apiKey preserves the key** (the common "user re-selects same provider" case) — distinct from the change-away drop case already listed.
- [plan §3] Idempotency returns the existing team with **200** while create returns **201**. Confirm `SetupFlow`'s success path treats 200 and 201 identically (it should, but the plan asserts "success path unchanged" without verifying the status-code branch). Cheap to check; cheaper than a silent setup regression.
- [plan §Contracts 4] `GET /api/org` now returns `teams` joined on `isNull(teamMembers.dissolvedAt)`. Confirm `teamMembers` has a `dissolvedAt` column (schema.ts) — if the column name differs, the join silently compiles to a type error or returns all rows. Name the column in the plan.

### What's Working Well
- **Design-it-twice on both the Models merge (§Design-it-twice) and the teams guard (§3) is genuine, not theatre.** The (B) "client sends full state" alternative is rejected with a real security reason (GET strips the key → client can't echo it → would require exposing the secret, violating A-SEC-2/AF11). That's a contract-grounded rejection, exactly right.
- **Security & abuse block (§Security)** addresses every STRIDE-relevant surface for this WP: credential-merge plaintext-at-rest, secret-in-GET, setup resource-amplification, org-edge target validation, with path-traversal/SSRF correctly marked N/A-with-reason. CC-003 satisfied.
- **AC→verification mapping** is concrete (named test files, specific assertions, integration vs component vs e2e correctly chosen per AC). No "write a test" hand-waving. Verifiability is real.

---

## Verdict

**APPROVED** — Design 8/10, Architecture 8/10. No unresolved CRITICAL.

Three WARNINGs the builder must resolve in-flight (none block the plan, all are accuracy/spec gaps the builder will hit):
1. `TeamSetting`/`UserSetting` are NOT dead — they back `SettingsData`; decide keep-vs-prune-with-fields explicitly.
2. `protectedTests: []` is wrong — `SettingsData`-shape tests (`useSettings.test.ts`, `AppShell.*-settings.test.tsx`) will drift; enumerate them.
3. `PatchModelGatewaySchema` partial-relax refinement predicates must be specified before green phase — highest bug risk in the WP.
