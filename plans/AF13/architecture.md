# AF13 — Architecture plan: Knowledge authoring and curation that works

Defect-fix workpackage. No new primitive, no new component, no schema migration. Six contract seams between the knowledge UI and the knowledge route are broken; this plan repairs each with the minimum surface change. Fixed inputs: `plans/AF13/concept.md` (no noun reshaped), `plans/AF13/design/approved.md` (repair-in-place).

## Required reading (engineer, before implementing)

- `packages/server/src/routes/knowledge.ts` — list (213), detail (297), create (375), scope PATCH (439), update PATCH (547). All edits land here for backend.
- `packages/web/src/pages/KnowledgeList.tsx` — sort (deriveSort 66, handleSortChange 872), triage action (handleTriageAction 839), optimisticRemovals (778).
- `packages/web/src/pages/KnowledgeDetail.tsx` — editability (isFactory 465, Edit 689), scope dialog wiring (847), version state (514).
- `packages/web/src/pages/KnowledgeCreate.tsx` — create payload (77), default scope (52), hasTeam (65).
- `packages/web/src/pages/knowledge/ScopeChangeDialog.tsx` — raw-enum select (150), version source (99).
- `packages/web/src/hooks/useKnowledgeItem.ts` — `KnowledgeItemData` declared fields (15-38).
- `packages/web/src/hooks/useAutoSave.ts` — version state machine.
- `packages/web/src/utils/scope-labels.ts` — AD6/AE1 label contract (authoritative; do not modify).
- `packages/shared/src/types.ts` 142-167 — `SCOPE_KINDS`, `SCOPES_REQUIRING_ID`.
- `docs/human-interface-layer/the-three-views-the-rail.md` line 342 — KnowledgeRow signal contract.

## Plan reconciliation (spec ⇆ reality)

| Spec assumption | Reality | Plan handling |
|---|---|---|
| "default Shared maps to factory, hides Edit" | Confirmed: `KnowledgeCreate` default `SCOPE_CREATE_OPTIONS[0]` = `{label:"Shared", scopeKind:"factory"}` (scope-labels.ts:59); `KnowledgeDetail.isFactory` (465) gates Edit off (689). | Fix at editability predicate (author check) — §2. |
| "create endpoint ignores requested status, always draft" | Route **does** honor `status` (knowledge.ts:408 `body.status ?? "draft"`); the *create page* never sends `status` (KnowledgeCreate payload, line 77-83). | Defect is client-side: send `status: "active"` for human create — §1. |
| "sort pills change URL but not order" | Confirmed: `handleSortChange` (872) writes `?sort=` but no code consumes `sort` to reorder; curated uses `groupByTopic(curatedItems)` unsorted, triage sorts only by attentionScore. | Apply sort client-side — §3. |
| "scope dialog sends stale version, 409s after autosave" | Confirmed: dialog `currentVersion={item.versionNum ?? 1}` (KnowledgeDetail:852) is the mount value; autosave bumps `version` state (514, 538) but dialog never sees it. | Pass live `version` state into dialog — §4. |
| "Access count always 0, Backlinks always empty — detail route omits fields" | Confirmed: detail returns `{...item, kind, layer, confidence}` (362-367) — **no** `accessCount`, **no** `relatedItems`. UI reads `apiItem.accessCount` (KnowledgeDetail:264) + `apiItem.relatedItems` (266); both `undefined` → `?? 0` / empty. | Add both to detail response — §5. |
| "team scope selectable where intended, not permanently disabled" | Confirmed: `hasTeam: boolean = false` hardcoded (KnowledgeCreate:65). `CurrentUser` has no `teamId`. | Single source-of-truth flag, not hardcoded false — §6. |
| "no raw scope-kind enums leak to users" | Confirmed leak: `ScopeChangeDialog` select renders raw `SCOPE_KINDS` (150-154: factory, practice, bet, task…). | Replace with 3 labeled options — §4A. |
| dedicated backlinks/relations table | None exists. Only `knowledgeStrategyFabric` + `knowledgeEditLog` + `knowledgeAccessLog`. | Related = topic-derived (out-of-scope to add a table) — §5. |

No schema migration required. No symbol rename. No route added or removed.

---

## §1 — Create-status contract

**Contract:** `POST /api/knowledge` already accepts `status?: KNOWLEDGE_STATUSES` and defaults to `draft` (knowledge.ts:72, 408). Keep this. A human creating an item through the full-page create flow intends a finished, usable item — not a draft requiring self-triage.

**Change (client only):** `KnowledgeCreate.handleCreate` adds `status: "active"` to the payload.

```ts
// packages/web/src/pages/KnowledgeCreate.tsx
interface CreateKnowledgePayload {
  title: string; body: string; format: string;
  scopeKind: ScopeKind; updatedBy: string;
  status: "active";            // NEW — human-authored items are active on create
}
// payload: { ...existing, status: "active" }
```

**Why not change the server default?** Agents also POST (capture flow) and *should* default to `draft` for triage. The human-create intent differs from the agent-capture intent; the requested-status contract is the right seam. The server already honors it.

**Verification:** integration test `POST /api/knowledge` with `status: "active"` → response `status === "active"` (already passes server-side; add an assertion if absent). Component/E2E: create item → detail loads → status chip is "Active", item appears in Curated not Triage.

---

## §2 — Default-scope → editability coupling

**Decision (design §1, preferred lever):** editability is `false` only for factory items the current user did **not** author.

```ts
// packages/web/src/pages/KnowledgeDetail.tsx — KnowledgeDetailView
// today: const isFactory = item.scope === "factory" || item.scopeKind === "factory";
//        ...Edit gated by `!(editing || isFactory)`
const isFactory = item.scope === "factory" || item.scopeKind === "factory";
const isReadOnly = isFactory && item.updatedBy !== user?.id;   // NEW
// Edit button: !(editing || isReadOnly)
// amendableBanner stays keyed on isFactory (review flow unchanged)
```

`user` already in scope (`useCurrentUser`, line 531). `item.updatedBy` already populated. A user who just created the item is its `updatedBy` → Edit shows. Agent-authored factory knowledge (different `updatedBy`) stays read-only — the deliberate rule the concept protects.

**Edge:** combined with §1, a human's default item is `active` + `factory` + `updatedBy = self` → editable. Even if §1 were not applied, §2 alone makes the just-created item editable.

**Fallback (only if author-check proves brittle in review):** change `SCOPE_CREATE_OPTIONS[0].scopeKind` from `factory` to `practice` (still labels "Shared" per scope-labels.ts:78). Keep `isReadOnly = isFactory`. Pick one in write-code; the design accepts either.

**Verification:** component test — render `KnowledgeDetail` with `apiItem={scopeKind:"factory", updatedBy:"u1"}` and `useCurrentUser → {id:"u1"}` → Edit button present. Same with `updatedBy:"agent-x"` → Edit absent. (Mock `useKnowledgeItem` + `useCurrentUser`.) E2E: create → land on detail → click Edit → type → reload → text persists.

**Protected-test caution:** `KnowledgeDetail.factory.test.tsx` asserts factory read-only. Read it before editing §2 — the new predicate must keep agent-factory read-only so that test stays green. If it asserts read-only for a *self-authored* factory item, that assertion encodes the bug and is updated (note in `protectedTests`).

---

## §3 — Sort implementation

**Decision (design §3):** client-side sort over the fetched list, applied in both tabs. Add a pure `sortItems` helper.

```ts
// packages/web/src/pages/KnowledgeList.tsx (module scope)
function sortItems(items: ApiKnowledgeItem[], sort: KnowledgeSortOption): ApiKnowledgeItem[] {
  const by = (a: ApiKnowledgeItem, b: ApiKnowledgeItem): number => {
    switch (sort) {
      case "recency":
        return b.updatedAt.localeCompare(a.updatedAt) || a.title.localeCompare(b.title);
      case "frequency": {
        const av = a.signals?.accessCount30d ?? null, bv = b.signals?.accessCount30d ?? null;
        if (av === null && bv === null) return b.updatedAt.localeCompare(a.updatedAt);
        if (av === null) return 1;
        if (bv === null) return -1;
        return bv - av || b.updatedAt.localeCompare(a.updatedAt);
      }
      default: { // relevance
        const av = a.signals?.relevanceScore ?? null, bv = b.signals?.relevanceScore ?? null;
        if (av === null && bv === null) return b.updatedAt.localeCompare(a.updatedAt);
        if (av === null) return 1;
        if (bv === null) return -1;
        return bv - av || b.updatedAt.localeCompare(a.updatedAt);
      }
    }
  };
  return items.slice().sort(by);
}
```

**Wiring:**
- Curated: sort **within** each topic group. In `groupByTopic`, sort each bucket's `items` via `sortItems(..., sort)` before returning (pass `sort` in), OR sort `g.items` at render. Groups stay ordered by topic name (design §3 reject: don't reorder groups).
- Triage: replace the inline attentionScore-only sort. When `sort === "relevance"` keep the attentionScore ordering (triage's native relevance); for `recency`/`frequency` apply `sortItems`. Cleanest: `const sortedTriage = sort === "relevance" ? <attention-order> : sortItems(raw, sort)`.
- `sort` is already derived from URL (`deriveSort`, 66) and passed into `KnowledgeListContent` (417). Thread it into `groupByTopic`/triage memos via `useMemo` deps.

ISO-8601 `updatedAt` string-compares correctly for recency (no Date parse — avoids the AF14 `NaN` class of bug).

**Verification:** unit test on `sortItems` — feed 3 items with known `updatedAt`/`relevanceScore`/`accessCount30d`, assert order per option, assert null-last, assert tie-break. Component test: render list, click Recency pill, assert DOM row order matches `updatedAt` desc.

---

## §4 — Scope-change dialog: vocabulary + version

### §4A — Vocabulary (no raw enums)

Replace the raw-`SCOPE_KINDS` `<select>` with the 3 labeled options from `SCOPE_CREATE_OPTIONS` (Shared/Team/Private), matching the create flow.

```ts
// ScopeChangeDialog.tsx
import { SCOPE_CREATE_OPTIONS, type ScopeCreateOption } from "../../utils/scope-labels.js";
// state holds the selected ScopeCreateOption (default = option matching currentScopeKind via scopeKindToLabel)
// on submit: scopeKind = selectedOption.scopeKind  (Shared→factory|practice, Team→team, Private→user)
// scopeId free-text input shown only when SCOPES_REQUIRING_ID.has(selectedOption.scopeKind) → only Team
```

Map `currentScopeKind` → default selected option by label: find the `SCOPE_CREATE_OPTIONS` entry whose `scopeKind` matches, else fall to the entry whose label equals `scopeKindToLabel(currentScopeKind)` (handles practice→Shared, product→Team). This removes `factory/practice/bet/task` from the visible select.

### §4B — Version source (kill the 409)

The dialog must send the **live** version. The detail page already tracks it in `version` state (KnowledgeDetail:514, bumped by `useAutoSave.onSaved` at 538).

```tsx
// KnowledgeDetail.tsx — pass the live version, not the frozen item field
<ScopeChangeDialog
  ...
  currentVersion={version}          // was: item.versionNum ?? 1
  currentScopeKind={item.scopeKind ?? "factory"}
/>
```

`version` is defined in `KnowledgeDetailView` (line 514) and is in scope at the dialog render site (line 847). After autosave bumps 1→2, the dialog sends 2 → server version check (knowledge.ts:462) passes → no spurious 409.

**Genuine conflict still 409s** and surfaces the dialog's inline error (ScopeChangeDialog:113-118) — correct behavior, not auto-retried.

**Verification:** E2E — open detail, edit body (autosave fires, version→2), open Change scope, pick Private, reason, Save → 200, scope updates. Integration: PATCH `/:id/scope` with correct version succeeds; with stale version 409s (existing `knowledge.q2.integration.test.ts` likely covers the server side — confirm). Component: assert the select renders "Shared/Team/Private", never "factory"/"bet".

---

## §5 — Detail-response omitted fields

The detail route (knowledge.ts:297-368) must return every field `KnowledgeItemData` declares. Current gaps: `accessCount`, `relatedItems`. `kind`/`layer`/`confidence` already returned; `topic`/`updatedBy`/`status`/`version`/`scopeKind` already in `...item`.

**Change (server, detail route):**

1. **Access count (30-day):** the list route already computes this from `knowledgeAccessLog` (knowledge.ts:233-258). Reuse the pattern in detail: count `knowledgeAccessLog` rows for `item.id` within the 30-day window. Return as flat `accessCount` (the UI reads `apiItem.accessCount`, useKnowledgeItem.ts:35 — flat, not `signals.accessCount30d`).

```ts
const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
const [{ count: accessCount } = { count: 0 }] = await db
  .select({ count: sql<number>`count(*)` })
  .from(knowledgeAccessLog)
  .where(and(eq(knowledgeAccessLog.itemId, id),
             sql`${knowledgeAccessLog.accessedAt} >= ${thirtyDaysAgo}`));
```
Compute **before** the best-effort access-log insert (337-349) so the current read isn't counted, or after — pick one and assert it in the test. (Design: count excludes the current page-load; compute before insert.)

2. **Related items (topic-derived):** mirror the fixture `findRelated` logic on the server — same `topic`, exclude self, cap (e.g. 10), respect user-scope visibility. Return `relatedItems: {id, title}[]`.

```ts
const relatedItems = item.topic
  ? (await db.select({ id: knowledgeItems.id, title: knowledgeItems.title })
       .from(knowledgeItems)
       .where(and(eq(knowledgeItems.topic, item.topic),
                  ne(knowledgeItems.id, item.id),
                  or(ne(knowledgeItems.scopeKind, "user"), eq(knowledgeItems.updatedBy, userId))))
       .limit(10))
  : [];
```

3. **Response shape:**
```ts
return c.json({
  ...item,                                   // topic, updatedBy, status, version, scopeKind, scopeId
  kind: row.kind ?? undefined,
  layer: row.layer ?? undefined,
  confidence: row.confidence ? Number.parseFloat(row.confidence) : undefined,
  accessCount,                               // NEW — number (0 honest, not placeholder)
  relatedItems,                              // NEW — {id,title}[]
});
```

**Honesty rule:** every declared field is now sourced. Nothing in `KnowledgeItemData` is removed. `kind` may be `undefined` (no strategy classification) → UI shows "—" (design §5; change the aside's `{item.kind}` to render "—" when `kind === "unknown"`/undefined). Access count `0` is now a real computed zero.

**Verification:** integration test — seed item + 3 access-log rows in window + 1 outside → GET `/:id` returns `accessCount === 3`. Seed 2 items same topic → `relatedItems.length === 1` with correct `{id,title}`. Component (`KnowledgeDetail.metadata.test.tsx`, `.related.test.tsx`): assert Access count renders the number, backlinks-card renders related-item links. These are likely **protected** — read them; the route fix should make them pass with real data, not require assertion changes.

---

## §6 — Team-scope selectability

**Problem:** `hasTeam = false` hardcoded (KnowledgeCreate:65) and `ScopeChangeDialog` (post-§4A) Team option. `CurrentUser` has no `teamId`.

**Decision (design §4):** a single source-of-truth predicate, not a hardcoded literal that can never flip.

- **Minimal, honest now:** define `const hasTeam = user?.teamId !== undefined` once. Since `CurrentUser` lacks `teamId` today, this is currently `false` — but it flips automatically the moment the user model carries `teamId` (no code change at the call site). This satisfies "not permanently disabled by mistake": the disablement is *data-driven*, not a literal.
- To make it real now without waiting on the user model: add optional `teamId?: string` to `CurrentUser` (web hook only — `GET /api/auth/me` may already return it; if so wire it through). If the auth response has no team field, leave `teamId` optional/undefined — disabled with the existing tooltip "Join a team to use team-scoped knowledge". The pill is not a dead literal; it reflects state.

```ts
// CurrentUser (useCurrentUser.ts): add  teamId?: string;
// KnowledgeCreate.tsx:  const hasTeam = user?.teamId !== undefined;
```

Apply the same `hasTeam` gate to the Team option in `ScopeChangeDialog` (§4A) so the two surfaces agree.

**Verification:** component test — render `KnowledgeCreate` with `useCurrentUser → {teamId:"t1"}` → Team pill enabled (not `cursor-not-allowed`/opacity-40); with no `teamId` → Team pill disabled + tooltip. Confirms the gate is data-driven.

---

## Type signatures / contract summary

```ts
// Detail response (GET /api/knowledge/:id) — additive, no removals
interface KnowledgeDetailResponse extends KnowledgeItemRow {
  kind?: string; layer?: string; confidence?: number;
  accessCount: number;                       // NEW
  relatedItems: Array<{ id: string; title: string }>;  // NEW
}
// Create payload (POST /api/knowledge) — client adds status
{ ...existing, status: "active" }
// ScopeChangeDialog props — unchanged signature; currentVersion now fed the LIVE version
// CurrentUser — add optional teamId?: string
```

## Ordered task list

| # | Task | Files | Proven by | Deps |
|---|---|---|---|---|
| 1 | Detail route returns `accessCount` + `relatedItems` | `knowledge.ts` (detail 297-368) | integration: access count + related count | — |
| 2 | Render "—" for null kind in detail aside | `KnowledgeDetail.tsx` (863) | component metadata test | — |
| 3 | Editability predicate `isReadOnly = isFactory && updatedBy !== userId` | `KnowledgeDetail.tsx` (465, 689) | component: self-authored factory editable, agent factory read-only | — |
| 4 | Create page sends `status:"active"` | `KnowledgeCreate.tsx` (77-83) | integration + E2E create→active | — |
| 5 | `sortItems` helper + wire into curated groups & triage | `KnowledgeList.tsx` | unit (sortItems) + component (row order) | — |
| 6 | Triage optimistic **status override** (not removal) | `KnowledgeList.tsx` (778, 839-870) | component: validate → leaves triage, enters curated same render | — |
| 7 | Dialog vocabulary → 3 labeled options | `ScopeChangeDialog.tsx` (150) | component: no raw enum in select | — |
| 8 | Dialog gets **live** version | `KnowledgeDetail.tsx` (852) | E2E: edit→change scope no 409 | 7 |
| 9 | `CurrentUser.teamId?` + data-driven `hasTeam` | `useCurrentUser.ts`, `KnowledgeCreate.tsx` (65), `ScopeChangeDialog.tsx` | component: teamId present→enabled | 7 |

### Task 6 detail (triage visibility)

Replace `optimisticRemovals: Set<string>` with `optimisticStatus: Map<string,"active"|"archived">`. Apply over `allItems` before the triage/curated split:

```ts
const effectiveItems = useMemo(() =>
  allItems.map(i => optimisticStatus.has(i.id) ? { ...i, status: optimisticStatus.get(i.id)! } : i),
  [allItems, optimisticStatus]);
// scopeFilteredItems, triageItems, curatedItems derive from effectiveItems
// handleTriageAction: setOptimisticStatus(prev => new Map(prev).set(id, newStatus)); PATCH; on failure delete(id) to revert
```
This makes a validated item leave triage (no longer draft) **and** enter curated (now active) in one render — closes the "vanishes from every tab" bug. No `useFetch` widening needed (it has no `refetch`; the override is the durable optimistic state until the next natural fetch, whose server status agrees).

## Design-it-twice — triage visibility (non-trivial)

**A. Add `refetch` to `useFetch`, refetch list after PATCH.** Trade-off: real server truth, no optimistic drift. Reject: `useFetch` is used app-wide; widening its return type is a cross-cutting change with blast radius far beyond AF13, and a refetch round-trip flickers the whole list. Out of proportion to the fix.

**B. Optimistic status-override map (chosen).** Trade-off: must revert on failure (already the pattern). Reject reason for A is the accept reason for B: localized to `KnowledgeList`, zero cross-cutting change, instant relocation. The existing failure-revert logic transfers directly (delete key instead of remove-from-set).

Synthesis: B. The PATCH already returns the updated row; if a future workpackage adds list refetch, the override harmlessly agrees with it.

## Security & abuse cases

- **Rate-limit POST/PATCH:** N/A new — create/update/scope endpoints already mounted behind `requireBoundary({kind:"public-data"})`; AF13 adds no new endpoint. No new rate-limit surface.
- **Input-trust (agent-authored fields):** `status:"active"` from create page is a client value, but the server validates against `KNOWLEDGE_STATUSES` z.enum (knowledge.ts:55,72) — untrusted input already bounded. No new trust boundary.
- **Related-items query (new):** uses parameterized Drizzle `eq`/`ne` — no injection. Respects existing user-scope visibility filter (excludes other users' private items) so the detail backlinks cannot leak private titles. Capped `.limit(10)` — no unbounded scan.
- **Access-count query (new):** parameterized; bounded by `itemId` + 30-day window. No abuse surface.
- **Secret-handling / path-traversal / SSRF:** N/A — no credentials, no path input, no outbound URLs touched.

## Route checklist

No route added/removed. Modified: `GET /api/knowledge/:id` (detail — adds 2 response fields). Unchanged contracts: `POST /api/knowledge`, `PATCH /api/knowledge/:id`, `PATCH /api/knowledge/:id/scope`, `GET /api/knowledge`.

## protectedTests

- `packages/web/src/__tests__/KnowledgeDetail.factory.test.tsx` — must stay green; new editability predicate must keep **agent-authored** factory read-only. If it asserts read-only for a self-authored factory item, that assertion encodes the bug → update + note here.
- `packages/web/src/__tests__/KnowledgeDetail.metadata.test.tsx` — access count / editor rows; route fix should satisfy with real data.
- `packages/web/src/__tests__/KnowledgeDetail.related.test.tsx` — backlinks card.
- `packages/web/src/__tests__/KnowledgeList.y4-triage.test.tsx` — triage flow; the status-override refactor must keep validate/reject + keyboard behavior. Read before editing task 6.
- `packages/web/src/__tests__/U9-knowledge-scope-pills.test.tsx`, `AD6-knowledge-simplification.test.tsx` — scope-pill vocabulary; dialog §4A must not break list pill assertions.
- `packages/server/src/routes/__tests__/knowledge.q2.integration.test.ts` — scope PATCH version semantics; §5 detail-field additions must not change scope-PATCH behavior.

## sharedFiles

- `packages/web/src/hooks/useCurrentUser.ts` (adds optional `teamId?`) — other web workpackages consume `CurrentUser`; additive optional field is safe but flagged.
- `packages/server/src/routes/knowledge.ts` — high-traffic route file; concurrent knowledge workpackages may overlap. AF13 touches only the detail handler body.

## Risks / ambiguities

1. **Editability predicate vs protected factory test** — resolved by author-check; confirm the protected test's intent before edit (task 3 / protectedTests).
2. **Access-count timing** (before vs after the page-load insert) — decision: compute before insert (exclude current load); assert in test.
3. **Relevance sort when `relevanceScore` is null for all items** — falls back to `updatedAt` desc (same as recency). Acceptable; documented in `sortItems`.
4. **`status:"active"` default for human create** — if product later wants human items to also triage, flip the create payload; server contract already supports both.
