# AH4 — Teams and agents land in the org chart — Architecture Plan

## Summary

Two gaps to close:
1. **Team creation produces no founder→team org edge.** `POST /api/teams` builds team + teamMembers + agents but never writes an `orgEdges` row, so a manually-created team floats disconnected. Fix: after the team + teamMembers are built, upsert a single `mechanism:"team"` edge `(fromUserId=founder, target=teamMembersId)` using the **same dedup logic as `PUT /api/org/edges`** — idempotent by construction.
2. **Add-agent placement is implicit or absent.** The API (`POST /api/agents`) already accepts `teamId` (= `teamMembers.id`). WorkTeam's `AgentAddDialog` already passes it but never surfaces it. SettingsAgents' inline add form sends **no** `teamId` → orphaned agents. Fix: surface the destination team in `AgentAddDialog` (read-only context), and add an explicit team picker to the SettingsAgents add form. Placement becomes explicit in the API in both callers.

No schema changes. No new endpoints. No new nouns. Reuses `orgEdges` + the `"team"` mechanism end-to-end.

---

## Required reading (before implementing)

- `packages/server/src/routes/teams-routes.ts` — `POST /` handler (lines 320–540). The edge upsert lands after the `leadAgentId` update (line 428) and before `provisionTeamRoutines` (line 446), where `teamId`, `teamMembersId`, and the founder `userId` are all in scope.
- `packages/server/src/routes/org.ts` — `PUT /edges` handler (lines 68–163). The dedup-then-insert pattern (lines 138–162) is the canonical idempotent upsert to mirror. Do **not** call the HTTP route internally; extract/replicate the same DB logic.
- `packages/db/src/schema.ts` lines 516–531 — `orgEdges` table + `org_edges_unique` composite index `(from_user_id, mechanism, target)`. This index is what makes the upsert idempotent.
- `packages/server/src/middleware/auth.ts` lines 45–58 — `HyperIdleEnv.Variables.userId`. The teams router must be typed `Hono<HyperIdleEnv>` to read `c.get("userId")`.
- `packages/web/src/pages/AgentAddDialog.tsx` — already receives `teamMembersId`; needs a surfaced placement line.
- `packages/web/src/settings/SettingsAgents.tsx` lines 239–284 — inline add form; needs a team picker + `teamId` in the POST body.
- `plans/AH4/design/approved.md` — the placement-affordance design (visual contract; do not re-litigate).
- `docs/process-layer/` (Teams) and `docs/human-interface-layer/` (org/trust) — for the founder/team relationship mental model.

---

## Plan reconciliation (spec ⇆ reality)

| Spec assumption | Reality | Plan handling |
|---|---|---|
| "Reuse existing org-edge mechanism (`/api/org`)" | `orgEdges` table + `"team"` mechanism exist; `PUT /edges` upserts on the composite unique index | Replicate the dedup-then-insert DB logic inside team creation. No HTTP self-call. |
| Edge target for a team | `mechanism:"team"` validates `target` against **`teamMembers.id`**, NOT `teams.id` (org.ts:119–132) | Edge uses `target=teamMembersId` (the `team-…` id built at teams-routes.ts:356). |
| Founder identity available in `POST /api/teams` | Auth middleware mounts `*` before `/teams` (app.ts:338–340) → `c.get("userId")` populated (fallback `u-founder`). Body also carries `userId` (used for welcome msg). | Resolve founder = `c.get("userId")` (primary) → body `userId` → first `kind:"human"` user (defensive). Type the router `Hono<HyperIdleEnv>`. |
| `POST /api/agents` accepts placement | `createAgentSchema` already has `teamId: z.string().nullable().optional()` (agents.ts:57); handler writes `users.teamId` (agents.ts:292) | No API change needed. Frontend must SEND `teamId`. |
| "Open the org chart" is a dedicated view | **No standalone visual org-chart view exists.** The only org surface is Settings → Org Chart (`SettingsOrgChart.tsx`, the edge table from `GET /api/org`). | "Team appears connected" = founder→team edge row present in that table with no manual add. Playwright targets the Settings table. Out of scope: building a graph view. |
| AgentAddDialog already has placement | True — passes `teamMembersId` (WorkTeam.tsx:645) but never displays it | Surface as read-only context text; no API change. |
| SettingsAgents add form has placement | **False** — sends no `teamId` (SettingsAgents.tsx:246–253) → orphan path | Add team picker; include `teamId` in POST body. |
| Idempotency | `PUT /edges` already idempotent; `POST /teams` already short-circuits on first existing team (teams-routes.ts:338–341, AF15) | Edge upsert is the only new idempotent op; the composite unique index guarantees no duplicate even if creation runs twice. |

**No spec/reality contradictions block the plan.** One clarification surfaced: there is no graph view — the org chart IS the Settings edge table. This is reflected in the design + Playwright scope.

---

## Design-it-twice — edge-creation mechanism

**Option A — call the org-edge HTTP route internally from team creation.**
Shape: `POST /api/teams` issues an internal `PUT /api/org/edges` (sub-fetch or shared Hono app dispatch). Trade-off: maximal reuse of the validated upsert + target-validation path. Reject: introduces an HTTP self-call inside a request handler (latency, error-mapping ambiguity, auth re-derivation), and couples two route modules at runtime. Boring-tech violation.

**Option B — replicate the dedup-then-insert DB logic inline (chosen).**
Shape: in the team-creation handler, after building `teamMembersId`, run the same three-column `SELECT … WHERE (fromUserId, mechanism, target) LIMIT 1`; if absent, `INSERT INTO orgEdges`. Trade-off: ~12 lines duplicated from `org.ts`. Reject reason considered: duplication. Mitigation: extract a tiny shared helper `upsertOrgEdge(db, {fromUserId, mechanism, target})` in `packages/server/src/services/org-edges.ts`, used by BOTH `org.ts` PUT and team creation — removes duplication AND keeps both call sites idempotent against the same composite index.

**Synthesis (final):** Option B with a shared helper. `upsertOrgEdge` owns the dedup-then-insert; `org.ts` keeps its mechanism-specific *target validation* (direct/function/team existence checks) before calling the helper; team creation calls the helper directly because its target (`teamMembersId`) was just created and is known-valid — no re-validation needed.

```ts
// packages/server/src/services/org-edges.ts
import { type HyperIdleDb, orgEdges } from "@hyperidle/db";
import type { OrgEdgeMechanism } from "@hyperidle/shared";
import { and, eq } from "drizzle-orm";

export interface UpsertOrgEdgeInput {
  fromUserId: string;
  mechanism: OrgEdgeMechanism;
  target: string;
}

/**
 * Idempotent upsert on the (from_user_id, mechanism, target) composite unique
 * index. Returns the existing edge (created:false) or the newly inserted one
 * (created:true). Callers that accept untrusted target values must validate
 * target existence BEFORE calling this (see org.ts PUT /edges).
 */
export async function upsertOrgEdge(
  db: HyperIdleDb,
  input: UpsertOrgEdgeInput,
): Promise<{ edge: typeof orgEdges.$inferSelect; created: boolean }> {
  const { fromUserId, mechanism, target } = input;
  const [existing] = await db
    .select()
    .from(orgEdges)
    .where(
      and(
        eq(orgEdges.fromUserId, fromUserId),
        eq(orgEdges.mechanism, mechanism),
        eq(orgEdges.target, target),
      ),
    )
    .limit(1);
  if (existing) return { edge: existing, created: false };

  const id = crypto.randomUUID();
  const createdAt = new Date().toISOString();
  await db.insert(orgEdges).values({ id, fromUserId, mechanism, target, createdAt });
  const [created] = await db.select().from(orgEdges).where(eq(orgEdges.id, id)).limit(1);
  // created is guaranteed present immediately after insert
  return { edge: created as typeof orgEdges.$inferSelect, created: true };
}
```

---

## Founder resolution (team creation)

```ts
// inside POST /api/teams, after teamMembersId is known
async function resolveFounderId(
  db: HyperIdleDb,
  ctxUserId: string | undefined,
  bodyUserId: string | undefined,
): Promise<string | null> {
  // 1. auth context (primary — set by authMiddleware for all /api routes)
  if (ctxUserId) {
    const [u] = await db.select({ id: users.id }).from(users).where(eq(users.id, ctxUserId)).limit(1);
    if (u) return u.id;
  }
  // 2. explicit body userId (already used for the welcome message)
  if (bodyUserId) {
    const [u] = await db.select({ id: users.id }).from(users).where(eq(users.id, bodyUserId)).limit(1);
    if (u) return u.id;
  }
  // 3. defensive fallback — first human user
  const [human] = await db.select({ id: users.id }).from(users).where(eq(users.kind, "human")).limit(1);
  return human?.id ?? null;
}
```

Edge creation (best-effort, mirrors the welcome-message pattern — a missing founder must not 500 team creation):

```ts
const founderId = await resolveFounderId(db, c.get("userId"), userId);
if (founderId) {
  await upsertOrgEdge(db, { fromUserId: founderId, mechanism: "team", target: teamMembersId });
}
// teamMembersId is the just-built team-members group id — known-valid, no re-validation
```

Router type change: `function createTeamRoutes(...): Hono` → `Hono<HyperIdleEnv>`, and `const router = new Hono<HyperIdleEnv>()`.

---

## Agent placement contract (explicit in API)

The API contract is **unchanged** — `POST /api/agents` already accepts `teamId` (= `teamMembers.id`) and writes `users.teamId`. AH4 makes the FRONTEND send it explicitly and surface the destination to the user before confirmation.

**Request (unchanged, now always carries placement from team-scoped callers):**
```ts
POST /api/agents
{
  name: string;
  role: string;
  soulPrompt?: string | null;
  harnessType?: string | null;
  modelTierPreference?: string | null;
  maxConcurrentSessions?: number;        // default 1
  teamId: string | null;                 // teamMembers.id; null = unassigned (explicit choice)
}
```

**Two callers, two placement modes (per approved design):**

1. **`AgentAddDialog` (WorkTeam page)** — destination is fixed to the team being viewed. Surface a read-only line: *"Joins {teamName}"*. `teamId` already passed as `teamMembersId`. Add a `teamName` prop (WorkTeam already has `data.team.name`) for the label. No picker — the context is the team page itself.

2. **`SettingsAgents` inline add form** — destination is chosen. Add a team `<Select>` populated from `GET /api/org` (`teams` array: `{id: teamMembers.id, name: teams.name}`) — the same source SettingsOrgChart already uses, so no new endpoint. Default selection: first team. Include `teamId` in the POST body. If zero teams exist, the select shows a disabled "No teams — run Setup" option and the agent is created with `teamId:null` only if the user explicitly proceeds (matches SettingsOrgChart empty-team copy).

**Why `GET /api/org` for the team list, not `GET /api/teams`:** `GET /api/org` returns `teams: {id: teamMembers.id, name}[]` — the id is already the `teamMembers.id` the agent placement needs (`users.teamId` FK). `GET /api/teams` returns `teams.id` (domain id), which would require a second hop to map to `teamMembers.id`. Reuse the org endpoint; one fetch, correct id.

---

## Acceptance criteria → verification method

| # | Acceptance criterion | Verification method |
|---|---|---|
| AC1 | Creating a team produces a founder→team org edge; team appears connected with no manual step | **Integration test** (`teams-routes` or new `AH4-*.integration.test.ts`): seed a `kind:"human"` founder; `POST /api/teams`; query `orgEdges` and assert exactly one row `(fromUserId=founder, mechanism="team", target=<teamMembersId>)`. |
| AC2 | Adding an agent makes the destination team clear before confirmation, and the agent lands there | **Component test** (`AgentAddDialog.test.tsx`): render with `teamName="Acme"`; assert "Joins Acme" visible. **Component test** (`SettingsAgents.test.tsx`): render add form; assert team `<Select>` present and populated; assert POST body includes selected `teamId`. **Integration test**: `POST /api/agents` with `teamId`; assert `users.teamId` = that value. |
| AC3 | After creating a team + agents, org chart reflects real structure — no orphans | **Integration test**: `POST /api/teams`, then `POST /api/agents` with that team's `teamMembers.id`; `GET /api/org`; assert the founder→team edge exists AND the agent's `teamId` resolves to that team. (No orphan = edge present + agent.teamId set.) |
| AC4 | Manual org-edge management still works; no duplicate/contradictory edges | **Integration test (idempotency)**: `POST /api/teams` (creates edge); then `PUT /api/org/edges` with the identical `(founder, "team", teamMembersId)`; assert the PUT returns the EXISTING edge (200, same id) and `orgEdges` count for that tuple = 1. **Second test**: run the edge-upsert helper twice; assert single row (composite-unique enforced). |
| AC5 (Playwright, required) | Founder creates a team → opens org chart → team shown connected, no manual edge add | **Playwright spec** (`AH4-team-connected.spec.ts`): drive Setup/team creation → navigate Settings → Org Chart → assert an edge row with mechanism `team` and the team's name as target label is present; screenshot. (Rides AH5 live-lane infra where a real backend is needed; UI-structural assertion here.) |
| AC6 (Playwright, required) | Add-agent form shows the team it will join; after create, agent appears under that team | **Playwright spec** (`AH4-add-agent-placement.spec.ts`): open SettingsAgents add form → assert team select visible with a team selected → create → assert new agent row; OR open WorkTeam → Add agent → assert "Joins {team}" text → create → assert agent in roster. Screenshot both states. |

---

## Ordered task list

1. **`packages/server/src/services/org-edges.ts`** — create `upsertOrgEdge` helper (above). *Proof: unit test asserts second call returns `created:false` with same id.* No deps.
2. **`packages/server/src/routes/org.ts`** — refactor `PUT /edges` to call `upsertOrgEdge` after its mechanism-specific target validation (keep validation; replace lines 138–162 with the helper call). *Proof: existing `org.routes.integration.test.ts` + `AF15-org-teams` stay green (protected).* Depends on 1.
3. **`packages/server/src/routes/teams-routes.ts`** — (a) type router `Hono<HyperIdleEnv>`; (b) add `resolveFounderId`; (c) after `leadAgentId` update (line 428), upsert the founder→team edge via the helper. *Proof: AC1 integration test.* Depends on 1.
4. **`packages/web/src/pages/AgentAddDialog.tsx`** — add `teamName` prop; render read-only "Joins {teamName}" placement line near the header. *Proof: AC2 component test.* No deps.
5. **`packages/web/src/pages/WorkTeam.tsx`** — pass `teamName={data.team.name}` to `AgentAddDialog`. *Proof: AC2 / AC6 Playwright.* Depends on 4.
6. **`packages/web/src/settings/SettingsAgents.tsx`** — fetch `teams` from `GET /api/org`; add team `<Select>` to the add form; include `teamId` in the POST body; default to first team; handle zero-teams state. *Proof: AC2 component test + AC6 Playwright.* No deps.
7. **`packages/web/src/pages/AgentAddDialog.stories.tsx`** — add a story showing the placement line (story coverage required for custom-component states). Depends on 4.
8. **Tests** (red first, per TDD): `AH4-org-edge.integration.test.ts` (AC1, AC3, AC4), `AgentAddDialog.test.tsx` + `SettingsAgents.test.tsx` updates (AC2), `org-edges.test.ts` unit (AC4), Playwright `AH4-team-connected.spec.ts` + `AH4-add-agent-placement.spec.ts` (AC5, AC6).

---

## Type signatures / contracts

- `upsertOrgEdge(db, {fromUserId, mechanism, target}): Promise<{edge, created}>` — see above.
- `resolveFounderId(db, ctxUserId, bodyUserId): Promise<string | null>` — see above.
- `AgentAddDialogProps` gains `teamName: string` (required; WorkTeam always has it).
- `POST /api/agents` request: unchanged; `teamId` now always sent by team-scoped callers.
- No `CreateTeamRequest` / `CreateTeamResponse` shape change. The edge is a side effect; response stays `{team, teamMembers}`.

---

## Route checklist

| Route | File | Change |
|---|---|---|
| `POST /api/teams` | `teams-routes.ts` | Add founder→team edge upsert; type router `Hono<HyperIdleEnv>`. |
| `PUT /api/org/edges` | `org.ts` | Refactor to call shared `upsertOrgEdge` (behavior unchanged, dedup preserved). |
| `POST /api/agents` | `agents.ts` | **No change** — already accepts/writes `teamId`. Listed for the reviewer to confirm no regression. |
| `GET /api/org` | `org.ts` | **No change** — already returns `teams[]` consumed by the new SettingsAgents picker. |

---

## Security & abuse cases

- **Rate-limit on POST/PATCH:** N/A new surface — no new endpoint added. `POST /api/teams` and `POST /api/agents` keep existing boundaries (`requireBoundary({kind:"public-data"})`). No change to rate-limit posture.
- **Input-trust boundary (agent-authored fields):** `target=teamMembersId` is server-derived (just-built id), never client-supplied at the edge-creation site → no injection surface. The SettingsAgents `teamId` is client-supplied but is a `teamMembers.id`; `POST /api/agents` writes it to `users.teamId` (existing FK). **Addressed:** the FK constraint rejects a non-existent `teamMembers.id`; recommend the agent route surface a 4xx rather than 500 on FK violation (verify existing behavior — may be pre-existing).
- **Founder spoofing:** `resolveFounderId` prefers `c.get("userId")` (auth-derived) over body `userId`, so a caller cannot create an edge *from* an arbitrary user by lying in the body unless the body fallback is reached (only when auth context is absent — local single-founder mode). Acceptable for the single-founder local model; note for reviewer.
- **Path traversal / SSRF:** N/A — no path or URL inputs.
- **Secret handling:** N/A — no credentials touched.
- **Idempotency abuse (edge flooding):** composite unique index `org_edges_unique` makes repeated creation a no-op → no unbounded row growth. Addressed by design.

---

## Migrations

No symbol renames/removals. New file `org-edges.ts` is additive. `PUT /edges` internal refactor keeps the same external contract — **no call-site migration**. `AgentAddDialog` gains a *required* prop `teamName`; every call site must pass it:
- `packages/web/src/pages/WorkTeam.tsx` (line ~643) — **update**: pass `teamName={data.team.name}`.
- `packages/web/src/pages/AgentAddDialog.stories.tsx` — **update**: pass `teamName` in story args.
- Any `AgentAddDialog` test render — **update** to pass `teamName`.

---

## Protected tests

```
protectedTests:
  - packages/server/src/routes/__tests__/org.routes.integration.test.ts
  - packages/server/src/__tests__/AF15-org-teams.integration.test.ts
  - packages/server/src/__tests__/P2-org-routes.integration.test.ts
```
These pin the existing `PUT /edges` upsert + mechanism:"team" + idempotency contract. The `org.ts` refactor (Task 2) must keep them green unchanged.

---

## Shared files

```
sharedFiles:
  - packages/server/src/routes/teams-routes.ts
  - packages/server/src/routes/org.ts
  - packages/web/src/settings/SettingsAgents.tsx
  - packages/web/src/pages/WorkTeam.tsx
  - packages/web/src/pages/AgentAddDialog.tsx
```
No `schema.ts`, shared types, or `app.ts` changes — low merge-overlap risk. `org.ts` is the only file touched by both AH4 and any concurrent org-touching workpackage; the refactor is behavior-preserving.

---

## Risks / ambiguities (for the reviewer)

1. **No visual org-chart view exists.** "Org chart" = Settings → Org Chart edge table. If a graph view is expected later, the founder→team edge is already the correct data; only rendering would be added. Flag if the spec author assumed a graph.
2. **Founder-from-body fallback** (path 2 of `resolveFounderId`) is a weak trust boundary, only reachable when auth context is absent (local mode). Reviewer should confirm this is acceptable for the single-founder threat model.
3. **`teamId` null on SettingsAgents zero-teams path** — an agent created with no team is still an orphan. The design surfaces "run Setup" guidance; whether to *block* creation entirely is a design call (currently: allow with explicit null, since the user chose it). Reviewer: confirm explicit-orphan is acceptable vs. hard-block.
4. **FK error mapping on bad `teamId`** — `POST /api/agents` may currently 500 on an invalid `teamMembers.id` FK. Pre-existing; AH4 should at minimum not regress it. Consider a 422 if cheap.
