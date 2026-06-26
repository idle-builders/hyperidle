# AO1 Review — Filesystem registry + per-bot injection

**Reviewer:** evaluator (separate agent from builder). Read-only.
**Date:** 2026-06-26. Branch `concept/AO0-product-substrate` @ rebased origin/main.
**Scope:** filesystem registry record + per-bot injection mapping + routes + reachability + the two Settings web surfaces.

## Verdict: NOT DONE (needs-fixes)

The **backend** (schema, migration, routes, reachability, seam) is correct, well-tested, and contract-faithful — all 41 tests pass and survive sanity-break. But the **web layer does not work end-to-end**:

1. **The registry surface (`SettingsFilesystems`) is never mounted** — unreachable dead code (knip-confirmed unused file). The primary deliverable of the approved design renders nowhere in the app.
2. **The per-bot injection UI writes to a no-op** — `SettingsAgents` collects `filesystemIds` and PATCHes/POSTs them to `/api/agents`, which silently drops the field. The AO1 injection routes (`POST /api/filesystems/:id/injections`) are never called by any UI.

The WP's own AC1/AC1b require the attachment + injection to be **"visible"** and selectable. Neither web surface is wired through. The backend proves the model; the product does not deliver it.

---

## CRITICAL

### C1 — `SettingsFilesystems.tsx` is never mounted; the registry surface is unreachable
**File:** `packages/web/src/pages/SettingsPage.tsx` (imports `SettingsAgents`, `SettingsModels`, … but **no** `SettingsFilesystems`); `packages/web/src/settings/settings-types.ts:16-25` (`SettingsSectionId` has no `"filesystems"`); `SETTINGS_SECTIONS` (settings-types.ts:47-58) has no Filesystems entry.
**Evidence:** `npx knip` → "Unused files (1): packages/web/src/settings/SettingsFilesystems.tsx". `grep -rln SettingsFilesystems packages/web/src` returns only the file itself + its story.
**Spec:** `plans/AO1/design/approved.md` ("A new Settings section **Filesystems**, sibling of Harnesses/Models/Agents") and AO1 AC1 ("afterward that attachment … is **visible**"). The approved design's whole point is a reachable Settings section. It is not reachable.
**Why critical:** The team registry — where a founder registers a filesystem — cannot be opened in the running app. The component renders correctly in its story, but a story is not the product. Per CLAUDE.md "Proof & Definition of Done," a surface that only renders in `:8098` and never in the shell is not done.

### C2 — Per-bot injection UI is wired to an endpoint that ignores it (silent no-op)
**File:** `packages/web/src/settings/SettingsAgents.tsx:366-374` (PATCH body includes `filesystemIds`) and `:407-417` (POST body includes `filesystemIds`); consumed by **nothing** server-side.
**Evidence:** `grep -rln filesystemIds packages/server/src` → **zero hits**. `packages/server/src/routes/agents.ts` `patchAgentSchema` (line 60) and `createAgentSchema` (line 47) never include `filesystemIds`; the response builders (`:421`, `:494`) never return it; Zod drops the unknown key. The real injection routes (`filesystems.ts:256` `POST /:id/injections`, `:345` DELETE) are never called from any web file.
**Spec:** AO1 AC1b — "A registered filesystem can be **injected into** a bot and **ejected**." The concept ("How a filesystem is connected … (2) Per-bot injection — Settings → Agents: select which registered filesystems to inject") names this exact surface as load-bearing.
**Why critical:** A founder picks filesystems for a bot, clicks Save, gets "Agent saved" — and **nothing is persisted**. The injection mapping table the WP built stays empty. This is the "looks like it works, writes nowhere" failure mode. `AgentConfig.filesystemIds` (`settings-types.ts:94`) is `?: string[]` and is never populated by `/api/agents`, so on reload the selection is always empty — the round-trip is provably broken.
**Note:** AO1's plan §3 explicitly scopes injection to the `/api/filesystems/:id/injections` routes, and §10 (sharedFiles) does not list `agents.ts`. So routing injection through `/api/agents` is both unbuilt *and* off-plan. The fix is to make `SettingsAgents` call the injection routes (diff the selected vs. current set → POST/DELETE injections), not to extend `/api/agents`.

---

## MAJOR

### M1 — Dead, misleading "FK guard" block in the register route
**File:** `packages/server/src/routes/filesystems.ts:124-139`.
```ts
// Verify teamId exists (FK guard before insert)
const team = await db.select({ id: teamMembers.teamId }).from(teamMembers)
  .where(eq(teamMembers.teamId, body.teamId)).limit(1);
if (team.length === 0) {
  const teamRow = await db.select(...).from(filesystems)
    .where(eq(filesystems.teamId, body.teamId)).limit(0); // .limit(0) returns nothing
  void teamRow; // discarded
}
```
This block does **nothing**: it queries the wrong table (`teamMembers.teamId`, but `body.teamId` is a `teams.id`), then on miss runs a `.limit(0)` query whose result is `void`-discarded. It never returns, never validates. Actual FK enforcement is entirely the insert-catch (`:166-173`). The comment claims a guard that does not exist — a New-Hire trap and an Auditor mismatch (PR-claim "FK guard before insert" ≠ diff). **Fix:** delete lines 124-139 entirely; the catch-based 404 is the real (and correct) mechanism. The 404 path is proven by the test… actually it is **not** — see A1.

### M2 — No test exercises the teamId-not-found → 404 path
**File:** route `filesystems.ts:166-173` (catch → 404 on FK violation). No test in `AO1-filesystems.integration.test.ts` POSTs with a non-existent `teamId`.
**Spec:** AO1 AC1 verification table row says "`404` if `teamId` absent." Untested. The catch relies on string-matching the pg error message (`"filesystems_team_id_teams_id_fk"` / `"foreign key"`) — brittle and unproven. Add a test: POST with `teamId: "nope"` → expect 404. (This is the path M1's dead block pretends to cover.)

---

## MINOR

### m1 — `sourceHint` is an undocumented escape hatch that weakens the "source is route-derived" contract
**File:** `filesystems.ts:48-51, 148` — `source = derived ?? body.sourceHint ?? "unknown"`.
The plan §1 states "`source` is **NOT** client-supplied — the route derives it from the Connection." `sourceHint` lets the client set `source` to an arbitrary string whenever the resolver yields null (which, with `NoopAuthResolver`, is **always** for connection-backed filesystems). So in v1 the client fully controls `source` for any connection-backed register. The AC1 test (`:115`) relies on this to get `'github'`. It is plan-sanctioned (§3 "Alternatively the client may pass a sourceHint") but it inverts the headline contract and is the only way the "derived source" test passes. Acceptable for v1, but flag: when AN lands, ensure `sourceHint` cannot override a real resolver result (current precedence `derived ?? hint` is correct — hint only fills nulls — keep it that way).

### m2 — `rowToFilesystem` swallows malformed-JSON `resourceRef` into a silent fake
**File:** `filesystems.ts:62-68` — a `JSON.parse` failure returns `{ kind: "code", repo: "", branch: "" }`.
Since `resourceRef` is only ever written via `JSON.stringify(validatedBody.resourceRef)`, malformed JSON is impossible through the API — this is defensive code for an unreachable state (AI-slop tell). If it ever *did* fire, masking a corrupt row as an empty code repo is worse than surfacing it. Low impact (defensive, not wrong), but the fallback is dead. Consider letting it throw, or at minimum not fabricating a `code` shape for a `doc_set` row.

### m3 — `_eventBus` parameter is unused
**File:** `filesystems.ts:110` — `_eventBus?: EventBus` is accepted (and passed from `app.ts:411`) but never used; no events emitted on register/inject/eject. Consistent with the artifacts-route precedent and acceptable (underscore-prefixed), but note no domain events fire for filesystem lifecycle — if AO2/AO3 expect a `filesystem.registered` event, it isn't here.

### m4 — `GET /` reachability refresh is N updates on every list call
**File:** `filesystems.ts:219` — `Promise.all(rows.map(r => checkAndPersistState(...)))` runs a potential `UPDATE` per row on every team/bot list. With `NoopAuthResolver` every connection-backed row flips `attached→needs_attention` on first read then stabilizes, so it's bounded; but a real resolver doing network I/O here would make list a fan-out. Fine at single-founder scale (ETHOS), noted for AO2 when `canResolve` may become non-trivial.

---

## Positive-lens notes (what is correct)

- **Architecture:** schema matches the canonical shape field-for-field (`filesystems` team-scoped, `source`, no `agent_user_id`; `filesystem_injections` composite PK = UNIQUE; correct `onDelete`: team RESTRICT, injection CASCADE both ways). Migration `0040_chubby_chimera.sql` is forward-only, additive, touches no existing table. The plan said "0039" but main already had `0039_classy_nocturne` (`service_connections` partially re-merged on main); the builder correctly numbered the new migration 0040 after the live tail — **right call, the plan's number was stale.** `db/index.ts` re-exports are alphabetical and complete. Wire/row type split (`Filesystem` vs `FilesystemRow`) mirrors the `Artifact`/`ArtifactRow` precedent.
- **`org.ts` `teamActualId` addition** (`org.ts:62`): additive field on the existing `teams` select, joined `teamMembers → teams`. Non-breaking — all 24 org integration tests (P2 + AF15) pass. Necessary because `filesystems.team_id → teams.id` but the UI only had `teamMembers.id`; this is the cleanest seam to expose `teams.id` without a new route. Correct and justified.
- **Security:** no credential column on the row (AC2 test asserts absence of token/secret/credential/auth/password). SoR kinds rejected at the Zod boundary (`z.enum(FILESYSTEM_KINDS)` + discriminated-union `resourceRef`). Team-consistency enforced on inject (`:286-302`), including the no-team-assignment branch → 400. No SSRF/path-traversal surface (AO1 stores, never fetches/reads paths — correct, those open in AO2). `requireBoundary({kind:"public-data"})` on every route. Rate-limiting absent — consistent with the artifacts/bets posture and ETHOS (N/A with reason, per plan §7).
- **Reachability:** `resolveFilesystemState` is a clean pure function; the `needs_attention` default with `NoopAuthResolver` is concept-correct ("surface, never silent"). The disclosed v1 state (every connection-backed fs shows `needs_attention` until AN) is intended, not a regression.
- **Design tokens:** both components use Hearth tokens + DS primitives (`Button`, `Tag`, `StatusChip`, `Select`), no hardcoded colors, on-grid spacing, stories present. Lint (Biome + eslint-plugin-design + ag7-consistency) passes clean. The injection control reuses `Select`+`Tag`+`Button` (no bespoke multiselect). *If* the surfaces were mounted, the visuals are contract-faithful — the failure is wiring, not pixels.

---

## Sanity-break results (mock-validation guard — all RED on revert, then restored)

Tree left clean — `git diff` on both production files is empty after restoration. Three load-bearing lines reverted, each made its test fail:

| Production line reverted | File:line | Test | Result |
|---|---|---|---|
| `resolved ? "reachable" : "needs_attention"` → forced `"reachable"` | `filesystem-reachability.ts:79` | reachability unit (`needs_attention`, `doc_set`) + integration AC5 `needs_attention` | **RED** (2 unit + 1 integration failed) |
| UNIQUE-violation catch → swallowed, returned 201 | `filesystems.ts:315-323` | integration AC1b "re-injecting … → 409 (UNIQUE)" | **RED** (1 failed) |
| Team-consistency `if (...)` → `if (false && ...)` | `filesystems.ts:293` | integration AC1b "mismatched team → 400" | **RED** (1 failed) |

All three tests prove real behavior through the route/handler — none are tautologies or mock-validated. After restore: reachability 11/11 pass, integration 30/30 pass.

---

## AC → test/surface map

| AC | Requirement | Backend (test) | Surface | Status |
|---|---|---|---|---|
| AC1 | Register team-scoped, derived `source`, then visible | `AO1-filesystems…` AC1 block (POST→GET id/list, source derive, no agent col) — **PASS** | `SettingsFilesystems` **not mounted** | **FAIL** (visible-in-app unmet — C1) |
| AC1b | Inject + eject, N-N, UNIQUE, team-consistency | AC1b block (inject/eject/share/409/team-mismatch) — **PASS** | injection UI writes to `/api/agents` (no-op) | **FAIL** (round-trip broken — C2) |
| AC2 | code records connection+repo+branch via Connection seam, no creds | AC2 block + reachability seam unit — **PASS** | n/a (backend) | **PASS** |
| AC3 | `doc_set` accepted; SoR excluded | AC3 block (doc_set 201; inbox/crm/ticket_queue 400) + `FILESYSTEM_KINDS` unit — **PASS** | n/a | **PASS** |
| AC4 | Distinct from knowledge_items + git-export config | AC4 block (rowcount + config unchanged) + AC8 no-ALTER — **PASS** | n/a | **PASS** |
| AC5 | Unreachable → needs_attention, never silent | AC5 block (Noop→needs_attention; local→reachable; none→reachable) — **PASS** | registry would show amber chip (`SettingsFilesystems:38-48`) but **not mounted** | **PASS (backend)** / surface unreachable |
| AC6 | Delete cascades injections | AC6 block (delete→404, both bots' lists empty) — **PASS** | no delete affordance wired | **PASS (backend)** |
| AC7 | Types importable, `npm run check` clean | `npm run check` → all 13 packages PASS | — | **PASS** |
| AC8 | Forward-only migration, both tables, no agent col | AC8 block (pg_tables/information_schema asserts) — **PASS** | — | **PASS** |
| — | teamId-absent → 404 | **no test** (M2) | — | **GAP** |

**Backend: 8/8 ACs proven through real route/handler behavior.** The two ACs with a UI half (AC1 "visible", AC1b "inject/eject") fail at the surface: the registry is unmounted (C1) and injection writes nowhere (C2).

## Required fixes before DONE
1. **C1** — register `SettingsFilesystems` as a real Settings section (`SettingsSectionId` + `SETTINGS_SECTIONS` + `SettingsPage.tsx` dispatch).
2. **C2** — wire `SettingsAgents` injection to the real routes: on save, diff selected vs. current injected set and call `POST/DELETE /api/filesystems/:id/injections`; populate `AgentConfig.filesystemIds` from `GET /api/filesystems?agentUserId=` so the round-trip persists.
3. **M1** — delete the dead FK-guard block (`filesystems.ts:124-139`).
4. **M2** — add the teamId-absent → 404 test.
