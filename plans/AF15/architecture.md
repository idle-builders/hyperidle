# AF15 — Settings reachability and persistence — Architecture

**Fixed inputs:** `plans/AF15/design/approved.md` (visual contract — not re-litigated). Spec: `.pipeline/work-packages/TRACK-AF.md` § AF15.
**Depends on:** AF4 (settings/model-gateway/org/credential routes type-green), AF5 (settings UI type-green) — both landed.
**Coordinate with:** AF11 (credential model — must not clobber/expose secrets).

## Required reading (before implementing)
- `packages/web/src/pages/SettingsPage.tsx` — stacked-section host.
- `packages/web/src/settings/{SettingsWorker,SettingsAgents,SettingsOrgChart,SettingsModels,SettingsBackend}.tsx`
- `packages/web/src/settings/settings-types.ts` — dead catalog.
- `packages/server/src/services/server-config.ts` — `updateServerConfig` (clobber site, line 188), AF11 encrypt helpers.
- `packages/server/src/routes/{model-gateway,org,teams-routes,users}.ts`
- `packages/db/src/schema.ts` — `teams`, `teamMembers`, `users`, `orgEdges`.

---

## Plan reconciliation (spec ⇆ reality)

| Spec / design assumption | Reality | Plan handling |
|---|---|---|
| "Settings nav" with dead items | SettingsPage is a **hardcoded stacked page**; `SETTINGS_SECTIONS` array + `SettingsSection`/`SettingsSectionId` have **zero live consumers** (only a stale `@lore` in SettingsWorker). No rendered nav. | Mount the two sections directly in SettingsPage; **delete only the section-catalog trio** (`SETTINGS_SECTIONS`, `SettingsSection`, `SettingsSectionId`) — knip-clean. **KEEP `TeamSetting`/`UserSetting`** — they are *not* dead (see correction below). |
| `@lore S4`: AppShell filters worker out of `SETTINGS_SECTIONS` | **No such filter exists** (grep empty). Claim is stale. | SettingsWorker self-gates internally (already does). Mount unconditionally. Remove the stale `@lore` lines in SettingsWorker. |
| `SettingsTeams` referenced | **No component file.** Only a `"teams"` id in the dead union. | Remove the id with the catalog. Do not build a stub. |
| Models PATCH is "full replacement, 3 tiers complete" | True — `updateServerConfig` line 188 replaces `modelGateway` wholesale; UI omits `apiKey` for unedited tiers → **adjacent stored key wiped**. | Per-tier per-field merge in `updateServerConfig`; preserve stored `apiKey` when patch tier omits it. |
| Backend reads wrong field | `SettingsBackend` hardcodes `isLocal = true`; never reads `window.__HYPERIDLE__.backendMode`. | Read `backendMode` from the bridge; map to label; add web-mode (no bridge) state. |
| Setup duplicates teams | `POST /api/teams` (line 320) has **no existence check** — every call inserts team + members + full roster. | Idempotency guard mirroring `POST /api/users` (returns existing human 200). |
| Email-digests toggle never persists | **Already removed by AF8.** Not in UI. | Verify absent; do not reintroduce. AC met by prior work + a guarantee test. |
| Mute toggle "AF15 owns per-user persistence" | Mute **already persists** factory-level (`defaultMutePreferenceWriter`). AC requires *persist-across-reload*, which holds. Per-user is a larger concern. | **Scope to the AC**: verify persist-across-reload. Per-user persistence **explicitly deferred** (see Risks) — not required by any AF15 AC. |
| Org `team` target = team name (UI `deriveTeams`) | Server expects target = **`teamMembers.id`** (org.ts line 106). UI derives **names** from existing team edges → circular + type-mismatched; first team edge uncreatable. | Extend `GET /api/org` with `teams: {id, name}[]` (teamMembers joined to teams.name); UI select shows name, submits id; delete `deriveTeams`; relax solo short-circuit to keep the Add-Edge form. |

**CORRECTION (critique WARNING-1, verified against code):** an earlier draft claimed `TeamSetting`/`UserSetting` are knip-dead. **That is false.** They are transitively live:
- `settings-types.ts`: `SettingsData.teams: TeamSetting[]` and `SettingsData.users: UserSetting[]`.
- `SettingsData` is consumed by `useSettings.ts` (lines 20, 26, 65: `import type { SettingsData }`, the `Omit<SettingsData, "appearance">` raw shape, and the composed `SettingsData` return). The hook is explicitly preserved by this WP.
- Grep `TeamSetting|UserSetting` across `packages/web/src` excluding `settings-types.ts` = **zero direct refs** — they're consumed *only* through `SettingsData`'s field types, which is exactly why deleting the types would break `SettingsData`.

**Decision: KEEP `TeamSetting`, `UserSetting`, and the `SettingsData.teams`/`.users` fields.** Rationale: the `GET /api/settings` response still carries `teams[]` and `users[]` (confirmed live in `useSettings.test.ts` fixture and `AppShell.P4-settings.test.tsx` mock — both send `teams`/`users` and the hook spreads them into `SettingsData`). Pruning the fields would require also changing the server's `/api/settings` response shape and both tests — out of AF15's AC scope (no AC touches the settings GET payload). Only the **section-catalog trio** (`SETTINGS_SECTIONS`, `SettingsSection`, `SettingsSectionId`) is dead and gets deleted. `AgentConfig`, `NotificationSettings`, `ProfileSettings`, `AppearanceSettings`, `SettingsData`, `Theme`, `AutonomyLevel`, `TeamSetting`, `UserSetting` all stay.

DB driver: `pgTable` (Postgres + PGlite). No schema migration needed — all changes are route/service/UI logic.

---

## Contracts

### 1. Models partial-update (the load-bearing fix)

**Problem:** `SettingsModels.saveConfig` builds a PATCH body that includes `apiKey` only when the user typed one *for an openai-compatible tier*. For every other tier the body has `{provider, model}` (+maybe baseUrl) and **no `apiKey`**. `updateServerConfig` does `modelGateway: patch.modelGateway` (full replace) → the stored (encrypted) key on an untouched tier is dropped.

**Fix — server-side per-tier merge.** Change `updateServerConfig`'s `modelGateway` branch from replace to a per-tier, per-field merge against `current.modelGateway`:

```ts
// server-config.ts — replace line 188 branch
function mergeTier(current: ModelTierConfig, patch: Partial<ModelTierConfig>): ModelTierConfig {
  return {
    provider: patch.provider ?? current.provider,
    model: patch.model ?? current.model,
    baseUrl: patch.baseUrl ?? current.baseUrl,
    // KEY PRESERVATION: incoming undefined apiKey keeps the stored key.
    // Empty string is NOT a clear signal (UI never sends "") — only an
    // explicit non-empty apiKey replaces. provider change away from
    // openai-compatible drops the key (it's invalid for the new provider).
    apiKey: patch.provider && patch.provider !== "openai-compatible"
      ? undefined
      : (patch.apiKey ?? current.apiKey),
  };
}

modelGateway: patch.modelGateway
  ? {
      reasoning: mergeTier(current.modelGateway.reasoning, patch.modelGateway.reasoning ?? {}),
      workhorse: mergeTier(current.modelGateway.workhorse, patch.modelGateway.workhorse ?? {}),
      fast:      mergeTier(current.modelGateway.fast,      patch.modelGateway.fast ?? {}),
    }
  : current.modelGateway,
```

**Type change:** `ServerConfigPatch.modelGateway` becomes a deep-partial of `ModelGatewayConfig` (each of the 3 tiers optional; within a present tier, every field optional). Update the inline `type ServerConfigPatch` in `server-config.ts:114` and remove the "Full replacement — 3 tiers is the complete shape" `@lore` on line 116.

**The relaxed `PatchModelGatewaySchema` — exact spec (this is the highest-bug-risk change; build it precisely).**

Current (`model-gateway.ts:46`): `ModelGatewayConfigSchema.superRefine(...)` — requires all 3 tiers, each a *full* `ModelTierConfigSchema` (provider + model both required). Replace with a deep-partial base + a refinement that runs **only over tiers actually present in the patch**:

```ts
// Each tier: every field optional. provider/model are NO LONGER required,
// because a partial PATCH may touch only e.g. { model } on one tier.
const PartialModelTierSchema = z.object({
  provider: z.enum(MODEL_PROVIDERS).optional(),
  model: z.string().min(1).optional(),
  baseUrl: z.string().url().optional(),
  apiKey: z.string().optional(),
});

// All three tiers optional. At least one must be present (empty PATCH is a no-op
// and should 400 rather than silently do nothing).
const PartialModelGatewaySchema = z
  .object({
    reasoning: PartialModelTierSchema.optional(),
    workhorse: PartialModelTierSchema.optional(),
    fast:      PartialModelTierSchema.optional(),
  })
  .refine((g) => g.reasoning || g.workhorse || g.fast, {
    message: "PATCH must include at least one tier",
  });

const PatchModelGatewaySchema = PartialModelGatewaySchema.superRefine((data, ctx) => {
  for (const [tier, tc] of Object.entries(data) as [
    string,
    { provider?: string; model?: string; baseUrl?: string; apiKey?: string } | undefined,
  ][]) {
    if (!tc) continue;                       // (a) skip omitted tiers entirely

    // (b) apiKey rule — guarded by provider BEING SET in this patch.
    //     If provider is omitted (not being changed), do NOT judge apiKey
    //     against a provider we can't see here; the merge layer preserves
    //     the existing key and never accepts a key for a non-oai-compat tier.
    if (tc.provider !== undefined &&
        tc.provider !== "openai-compatible" &&
        tc.apiKey !== undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `apiKey is only allowed for openai-compatible providers (tier: ${tier})`,
        path: [tier, "apiKey"],
      });
    }

    // (c) baseUrl-required rule — applies ONLY when provider is being SET to
    //     openai-compatible in THIS patch. An unchanged openai-compatible tier
    //     (provider omitted) already has a stored baseUrl from a prior write,
    //     so we must NOT demand baseUrl just because the merged result is oai.
    if (tc.provider === "openai-compatible" && !tc.baseUrl) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `baseUrl is required when setting provider to openai-compatible (tier: ${tier})`,
        path: [tier, "baseUrl"],
      });
    }
  }
});
```

**Predicate summary (the three load-bearing guards):**
1. **Skip omitted tiers:** `if (!tc) continue;` — a tier absent from the patch is never validated.
2. **apiKey rejection guarded by `provider !== undefined`:** only reject a stray apiKey when the patch is *also* setting the provider in the same tier. A patch of `{ apiKey }` alone with provider omitted is not rejected at the schema (the merge layer's `mergeTier` already drops/keeps correctly), avoiding false rejection of a legitimate re-key on an already-oai tier.
3. **baseUrl-required guarded by `provider === "openai-compatible"` *in the patch*:** validate the rule against what the patch *sets*, NOT the merged result. This is the explicit choice between the two options the prior draft left open — **validate against the patch, not the merge.** Reason: the merged-result approach would force the client to re-send `baseUrl` on every unrelated edit to an oai tier (it's stripped from GET only for `apiKey`, but the contract should not require echoing baseUrl); validating the patch means "if you're switching a tier *to* openai-compatible, you must supply baseUrl in the same request," which is the only moment baseUrl can be genuinely missing.

**Why not validate the merged result for baseUrl:** if provider is omitted, the tier stays whatever it was; if it was already openai-compatible it already has a stored baseUrl, so the rule is moot. The only baseUrl-absence hazard is a provider *transition into* openai-compatible — caught by predicate 3. Validating the merge would additionally reject valid `{ model }`-only patches on an oai tier whose baseUrl lives only server-side — a false reject. Patch-level validation is correct and strictly simpler.

**Tests the schema demands (red-phase, AC-2 sibling cases):**
- `{ fast: { model } }` (provider omitted) → **accepted** (no apiKey/baseUrl judged).
- `{ fast: { provider: "anthropic", apiKey: "x" } }` → **rejected** (apiKey on non-oai with provider set).
- `{ fast: { provider: "openai-compatible", model } }` (no baseUrl) → **rejected** (baseUrl required on transition).
- `{ fast: { apiKey: "newkey" } }` on an already-oai tier → **accepted** (re-key path; provider omitted).
- `{}` (no tiers) → **rejected** (`at least one tier`).

**AF11 coordination (plaintext-at-rest):** `encryptModelGatewayKeys` already runs on the *merged* gateway before persist and is idempotent (decrypt→null ⟺ plaintext). After the merge fix, `current.modelGateway[tier].apiKey` is the **already-encrypted** stored value; `mergeTier` carries it forward untouched; `encryptTierApiKey` sees valid ciphertext → leaves it. **No plaintext introduced, no double-encrypt, no key exposed in GET** (sanitizeConfig still strips). AF11 owns the deeper model; AF15 only guarantees the merge preserves ciphertext and never logs/returns it.

**Edge cases the test must cover:**
- Edit tier B's model → tier A's stored openai-compatible key survives (the headline AC).
- Replace tier A's key with a new non-empty value → new key encrypted, stored.
- Change tier A provider openai-compatible → anthropic → key dropped (invalid for provider).
- Round-trip: stored ciphertext stays ciphertext after an unrelated edit (no re-encrypt corruption).

### 2. Backend mode source

`SettingsBackend.tsx`:
```ts
const bridge = typeof window !== "undefined" ? window.__HYPERIDLE__ : undefined;
// Three states:
//  - no bridge (web)      → "Web" / "Running in a browser against a remote server."
//  - bridge, backendMode==="shared" → "Shared (remote)"
//  - bridge, backendMode==="local" | null/undefined → "Local (laptop)"
```
Map `backendMode` ("local" | "shared" | null) to label+hint. Remove the `isLocal = true` constant and the dead-branch `@lore`. `backendMode` is already declared on the bridge type (`window.d.ts` line 26) — no type change.

### 3. Setup idempotency — `POST /api/teams`

Mirror `POST /api/users`. Before creating, check for an existing team and short-circuit:

```ts
// teams-routes.ts, top of POST handler, after name validation
const [existingTeam] = await db.select().from(teams).limit(1);
if (existingTeam) {
  // Idempotent: setup re-submission returns the existing first team, 200.
  // Does NOT create a duplicate team / team_members / roster.
  return c.json(existingTeam, 200);  // shape parity with create response
}
```

**Decision (design-it-twice):**
- **(A) "first team" guard — any existing team blocks creation.** Matches the user idempotency model ("a human already exists" → return it). Setup creates exactly one default team. Trade-off: a deliberate second team via this route is also blocked. Reject reason for A: none for the setup flow — but it over-constrains if multi-team-create is ever wanted here.
- **(B) name-keyed idempotency — block only if a team with the same name exists.** Allows distinct named teams. Trade-off: setup derives name from repo basename or "My Team"; re-running setup with the same repo → same name → blocked (correct), but a renamed repo would create a second team on re-run (the exact duplication bug the AC forbids).

**Chosen: A.** The AC is "re-running setup does not create duplicate teams"; setup is the only caller and creates one default team. A is the direct mirror of the proven user-idempotency pattern and fully satisfies the AC. If a future workpackage needs explicit multi-team creation, it adds a distinct authenticated route — out of scope here. Return the existing team (200) so SetupFlow's success path is unchanged.

`POST /api/users` is already idempotent (returns existing human 200) — no change; setup's user step is already safe.

### 4. Org first team-edge — populate the Team target

**Server:** extend `GET /api/org` response with a real teams list:
```ts
// org.ts GET — add alongside edges + users
const teamRows = await db
  .select({ id: teamMembers.id, name: teams.name })
  .from(teamMembers)
  .innerJoin(teams, eq(teams.id, teamMembers.teamId))
  .where(isNull(teamMembers.dissolvedAt));
return c.json({ edges, users: allUsers, teams: teamRows });
```
`teams[].id` is the **`teamMembers.id`** (what `PUT /edges` validates against for `mechanism:"team"`), `teams[].name` is the display label. This resolves the name/id mismatch.

**UI (`SettingsOrgChart`):**
- Add `teams: {id,name}[]` to `OrgData`; pass into `AddEdgeForm`.
- Delete `deriveTeams(edges)`. Team-target `<select>` populates from `data.teams`, `value=team.id`, label=`team.name`.
- Empty teams → single **disabled** option: "No teams yet — use a Function relationship instead, or run Setup to create your first team." **Do NOT say "create one in Work"** — verified: no Work affordance creates teams. The ONLY team-create path in the web app is `SetupFlow.tsx` (`POST /api/teams`); `WorkTeam.tsx` manages an existing team's agents, it does not create teams. The old "create one in Work" copy was a dead-end loop (critique WARNING). The placeholder names only affordances that exist.
- **Relax solo short-circuit:** when exactly 1 human, keep the guidance copy as a *hint above the form* but still render the Add-Edge control. **Default `mechanism` to `function`** in the solo case — a free-text role needs neither a second human nor a team. `direct` dead-ends (no second human to target); `team` dead-ends (no teams). Solo hint copy: "Add a function (e.g. 'Engineering') to describe your role, or add a second human to define reporting lines."

**Note:** the `function` mechanism (target = free-text role; server validates `z.string().min(1)`, persists to `orgEdges.target`, round-trips in `GET /api/org` and renders in the edge table) creates a first relationship **with zero dependencies** — no second human, no team. It is the unambiguous solo first-relationship path and fully satisfies AC-6 on a fresh org. The `direct` path also works *if* a second human exists; the team-edge data-source fix unblocks `team` once a team exists. AC-6 is therefore satisfiable by a lone founder via `function` alone.

### 5. Section mounting + dead-catalog removal

`SettingsPage.tsx`: add two `<section>` blocks per approved.md ordering — `SettingsAgents` after Assistant region (title `AGENTS`, after Models/before Assistant per design: Models → Agents → Assistant), and `SettingsWorker` before Backend (title `WORKER`). Use the existing `<section id data-testid>` + `<SectionTitle>` pattern. Import both components.

Delete from `settings-types.ts` **only the dead section-catalog trio**: `SETTINGS_SECTIONS`, `SettingsSection`, `SettingsSectionId` (verified zero live consumers — only the stale `SettingsWorker` `@lore` comment). The `"teams"`/`"worker"`/`"agents"` ids vanish with the `SettingsSectionId` union. **Do NOT delete `TeamSetting`/`UserSetting`** — they back `SettingsData.teams`/`.users`, which `useSettings.ts` consumes (see CORRECTION above). Keep `AgentConfig`, `NotificationSettings`, `ProfileSettings`, `AppearanceSettings`, `SettingsData`, `Theme`, `AutonomyLevel`, `TeamSetting`, `UserSetting`. Remove the stale `@lore S4` AppShell-filter lines from `SettingsWorker.tsx`.

### 6. Toggle persistence guarantee
No UI control change. Add tests proving: (a) Notifications mute persists across reload; (b) no Settings control presents as enabled-interactive without a persistence path. Email-digests stays removed.

---

## Acceptance criteria → verification

| # | AC | Verification method |
|---|---|---|
| AC-1 | Every launch section reachable; no dead nav | **Component test** (`SettingsPage.test.tsx`): render SettingsPage, assert `settings-section-agents` and `settings-section-worker` testids present alongside existing sections. **Lint/knip**: `npm run lint` + knip prove `SETTINGS_SECTIONS`/`TeamSetting`/`UserSetting`/`"teams"` removed with zero dangling refs. |
| AC-2 | Editing one model tier does not erase another tier's stored credential | **Integration test** (`X4-model-gateway.integration.test.ts` extension): store openai-compatible key on `reasoning`; PATCH `fast` with `{provider,model}` only; GET → `reasoning.hasApiKey===true`; decrypt-at-use returns original key. |
| AC-3 | Backend section reports actual mode | **Component test** (`SettingsBackend.test.tsx`): mock `window.__HYPERIDLE__.backendMode` = "shared" → asserts "Shared (remote)"; = "local" → "Local (laptop)"; bridge undefined → web label. |
| AC-4 | Re-running setup does not create duplicate teams/rosters | **Integration test** (`teams-routes`): POST `/api/teams` twice with same body; assert second returns 200 with the first team; `select count` on `teams`/`teamMembers`/agent users unchanged after second call. |
| AC-5 | Persistent-looking toggle persists across reload; non-persistable not shown as persistent | **E2E** (`settings.spec.ts`): toggle a notification mute, reload, assert state retained. **Component test**: assert SettingsNotifications renders no control lacking an onChange→persist path; assert no "Email digests" control exists. |
| AC-6 | A first org-chart relationship can be created from the UI | **Integration test** (`org.routes`): (a) `GET /api/org` returns `teams:[{id,name}]`; (b) PUT `/edges` with `mechanism:"team"`, target=teamMembers.id → 201; (c) PUT `/edges` with `mechanism:"function"`, target="Engineering" → 201 (the zero-dependency solo path). **E2E** (`settings.spec.ts`): with exactly **1 human and 0 teams** (fresh solo org), open Org chart, assert the Add-Edge form is rendered (not short-circuited) with mechanism defaulted to `function`, create a function edge, assert it appears in the table. This is the strongest AC-6 case — no second human, no team. |

---

## Ordered task list

1. **Models merge (server)** — `server-config.ts`: add `mergeTier`, change `updateServerConfig` modelGateway branch to per-tier merge; widen inline `ServerConfigPatch.modelGateway` (line 114) to deep-partial; drop the "Full replacement" `@lore` (line 116). `model-gateway.ts`: replace `PatchModelGatewaySchema` with the `PartialModelTierSchema`/`PartialModelGatewaySchema` + guarded `superRefine` spec'd in §Contracts 1 (predicates: skip omitted tiers; apiKey-reject guarded by `provider !== undefined`; baseUrl-required guarded by `provider === "openai-compatible"` *in the patch*; ≥1 tier required). The PATCH handler's `c.req.valid(...) as ModelGatewayConfig` cast (line ~116 of the route) becomes a deep-partial type, passed straight to `updateServerConfig`. Import `MODEL_PROVIDERS` from `@hyperidle/shared` for the partial tier enum. *Proves:* AC-2 integration test + the five schema-predicate cases in §Contracts 1 (write first, red).
2. **Backend mode (web)** — `SettingsBackend.tsx`: read `window.__HYPERIDLE__.backendMode`, three-state label; drop `isLocal` constant + dead `@lore`. *Proves:* AC-3 component test.
3. **Setup idempotency (server)** — `teams-routes.ts`: existing-team guard returning 200. *Proves:* AC-4 integration test.
4. **Org teams source (server)** — `org.ts` GET: add `teams:{id,name}[]` via teamMembers⋈teams join. *Proves:* AC-6 integration (GET shape + PUT team edge).
5. **Org UI (web)** — `SettingsOrgChart.tsx`: add `teams` to OrgData, delete `deriveTeams`, populate Team select from `data.teams` (id value/name label), relax solo short-circuit to render Add-Edge form. *Proves:* AC-6 E2E.
6. **Mount sections + catalog cleanup (web)** — `SettingsPage.tsx`: import + mount `SettingsAgents`, `SettingsWorker` in approved order. `settings-types.ts`: delete dead catalog (grep each symbol first). `SettingsWorker.tsx`: remove stale `@lore S4` filter lines. *Proves:* AC-1 component test + knip.
7. **Toggle guarantee (web)** — tests only: persist-across-reload E2E, no-dead-toggle component assertion. *Proves:* AC-5.
8. **Full verify** — `npm run check && npm run lint && npm run test:all && npm run test:e2e`.

Tasks 1–4 are independent (parallelizable). 5 depends on 4. 6 depends on nothing but should land after 5 to keep SettingsPage edits in one pass. 7 last.

---

## Design-it-twice (Models merge shape)

- **(A) Server-side merge (chosen).** Server preserves stored apiKey when patch omits it. Trade-off: server must distinguish "omitted" from "cleared" — handled by treating only explicit non-empty apiKey as replacement, and provider-change-away as drop. Single fix point; every client benefits. Reject reason: none material.
- **(B) Client sends full state including stored key.** UI would need the real key to echo it back — but GET deliberately strips it (`hasApiKey` only, security). Reject: would require exposing the secret to the client. **Hard no** — violates the A-SEC-2 contract and AF11. (A) is the only safe shape.

---

## Security & abuse cases
- **Model PATCH (mutation/credential surface):** already authenticated + global rate limiter (60/min). Merge fix **does not relax** auth; GET still strips apiKey (`sanitizeConfig`). No plaintext at rest (encrypt-on-persist preserved; merge carries ciphertext). **Addressed.**
- **Secret exposure via merge:** merge never moves apiKey into a returned/logged path; `mergeTier` output flows through `encryptModelGatewayKeys`→persist and `sanitizeConfig`→response. **Addressed.**
- **Setup idempotency (POST /api/teams):** guard prevents resource-amplification (duplicate roster spam) on re-submit. Auth unchanged (`public-data` boundary, same as today). **Addressed.**
- **Org PUT team edge:** target still validated against `teamMembers.id` existence (org.ts unchanged validation). The new `teams` GET list exposes only id+name of non-dissolved teams — no secret. **Addressed.**
- Path traversal / SSRF: N/A (no path or outbound-URL input added).

## Protected tests

`protectedTests` is **not empty** (critique WARNING-2). Two classes:

**A. Frozen semantics — must keep passing unchanged (do NOT alter assertions):**
- `packages/web/src/hooks/__tests__/useSettings.test.ts` (lines 26, 43, fixture) — asserts the `SettingsData` shape carries `teams[]`, `users[]`, and `notifications.mutedTeams`. Because the WP **keeps** `TeamSetting`/`UserSetting` and the `/api/settings` payload, these assertions stay green untouched. If a builder is tempted to prune the fields, this test is the tripwire — it must NOT be edited to make pruning pass.
- `packages/web/src/__tests__/AppShell.P4-settings.test.tsx` (lines 73–82) — mocks the settings response with `teams: []`, `users: []`, `mutedTeams: []`; asserts the overlay/save flow over that shape. Frozen for the same reason.
- `packages/web/src/__tests__/AppShell.settings-overlay.test.tsx` — settings overlay open/close + save wiring. No `SettingsData` field assertions, but it renders the settings surface; mounting the two new sections must not break its render/interaction assertions.
- model-gateway / org / teams existing integration assertions (apiKey stripped from GET, `mechanism:"team"`/`"function"` edge validation, edge upsert-200) — **extended, never rewritten**.

**B. Expected-to-change (CC-008):**
- The model-gateway integration suite (`X4-model-gateway.integration.test.ts`) **gains** AC-2 cases (partial-tier PATCH preserves adjacent key; provider-change-away drops key; same-provider re-select preserves key). Existing full-PATCH cases must still pass — the relaxed schema is a superset of the strict one for already-complete bodies.
- `SettingsPage` component test gains the two new section testids.

**Net:** no existing assertion changes *semantics*; the `SettingsData` shape is deliberately frozen by the keep-the-types decision, so the drift surface the critique flagged is closed, not merely tracked.

## Migrations (symbol removals — call-site sweep)
- Delete **only** `SETTINGS_SECTIONS`, `SettingsSection`, `SettingsSectionId` from `settings-types.ts`. Call-site sweep: grep each across `packages/web/src` (excluding settings-types) — **confirmed zero live consumers** (only stale comment in SettingsWorker.tsx, removed in task 6). After deletion, `npm run check` + knip must be green.
- **`TeamSetting`/`UserSetting` are NOT removed** — they back `SettingsData.teams`/`.users` (live via `useSettings.ts`). The earlier "knip-dead" claim was wrong; verified by code read (grep shows no direct refs but they're reached through `SettingsData`'s field types). Removing them would break `SettingsData` and the two SettingsData-shape tests.
- The `"teams"`/`"worker"`/`"agents"` string ids disappear when `SettingsSectionId` is deleted — no separate sweep needed; `tsc` will flag any lingering reference.
- No DB migration (no schema change).

## Shared files
`sharedFiles: ["packages/server/src/services/server-config.ts", "packages/server/src/routes/org.ts", "packages/server/src/routes/teams-routes.ts", "packages/web/src/pages/SettingsPage.tsx", "packages/web/src/settings/settings-types.ts"]`
**Overlap risk: AF11** also touches `server-config.ts` (credential encryption). AF15's `mergeTier` must compose with AF11's `encryptModelGatewayKeys` — coordinate merge order; AF15 carries ciphertext forward, AF11 owns the encrypt/decrypt seam. If AF11 lands first, rebase the merge onto its encrypt helpers (already present today).

## Risks / ambiguities
- **Per-user mute persistence deferred.** Mute persists factory-level today; the AF8/AF15 `@lore` anticipates per-user. **No AF15 AC requires per-user** — AC-5 is satisfied by persist-across-reload. Per-user mute (and a `userId` on the mute writer/table) is a distinct concern; flag for a follow-up workpackage. Do **not** silently expand AF15 scope into a per-user persistence model.
- **PatchModelGatewaySchema baseUrl-required refinement** under partial tiers — **resolved in §Contracts 1, no longer open.** Refinement runs only over tiers present in the patch (`if (!tc) continue`); the baseUrl-required rule is judged against the **patch's** provider, not the merged result (predicate 3), and the apiKey-reject rule is guarded by `provider !== undefined` (predicate 2). The decision between "validate patch" vs "validate merge" is settled as **validate patch** with the rationale in §Contracts 1.
- **Section ordering** per approved.md: Models → Agents → Assistant. Confirm Assistant section gating (`user &&`) still wraps correctly when Agents inserts above it.
