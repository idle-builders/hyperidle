# KNOWLEDGE Domain — Live Browser Test Results (Z8)

Tested 2026-06-10 against live dev (web :5173, API :3001), Chromium headless 1440x900.
Scripts: `/Users/tg/hyperidle/test-knowledge.mjs` (+2,+3 follow-ups). Screenshots: `/tmp/test-knowledge/`.

## Verdicts

| Flag | Claim | Test | Verdict | Evidence |
|------|-------|------|---------|----------|
| **F-01** (HIGH) | Default "Shared"→factory item is immediately uneditable (Edit button hidden) | Create via `/knowledge/new` default scope, open detail, count Edit buttons | **CONFIRMED** | `ZZ-DefaultShared-EditTest` created with `scopeKind=factory` (DB-verified); detail page Edit button count = **0**. Default pill = "Shared"/factory. A factory item is read-only the instant it's made. Screenshot `02`. |
| **F-02** (HIGH) | Sort pills (relevance/recency/frequency) are placebo — change URL, sort nothing | Click each sort pill, diff curated text + URL | **CONFIRMED** | URL gains `?sort=` on every click; curated list innerText **byte-identical across all 3 sorts**. Pure dead control. Screenshot `01`. |
| **F-05** (MED) | Team scope pill hardcoded-disabled in create | Read pill `aria-disabled` | **CONFIRMED** | Team pill `aria-disabled="true"`, `disabled` attr set. Only Shared (read-only) + Private selectable. |
| **F-06** (HIGH) | ScopeChange sends stale frozen version → guaranteed 409 after a body edit | Edit body (autosave v2→v3), then Change scope, capture PATCH | **CONFIRMED** | version@mount=2, bumped to 3 by autosave; dialog still sent frozen `currentVersion=2` → **PATCH 409** `"Version conflict: expected 2, current is 3"`. Console + network both logged the 409. Screenshot `05`. |
| **F-07** (MED) | `knowledgeTriageCount` sidebar badge never renders (AppShell omits prop) | Inspect sidebar DOM for badge; call endpoint | **CONFIRMED** | `GET /api/knowledge/triage-count` works (200, `{"count":5}`) but **no badge anywhere in sidebar DOM**. Endpoint + badge both dead. `knowledgeTriageCount` referenced only in `Sidebar.tsx` + its tests, never AppShell. |
| **F-10** (MED) | Access count always 0 (GET /:id omits accessCount) | Read aside on seed-ki-1 | **CONFIRMED** | Aside "Access count" = **0** despite list payload reporting `accessCount30d=7` and access-log filling on every detail view. |
| **F-11** (MED) | Backlinks always empty (API never returns relatedItems) | Read BacklinksCard on seed-ki-1 | **CONFIRMED** | "No related items." rendered. API GET /:id returns no `relatedItems`/`topic`, fixture fallback finds nothing. Screenshot `03`. |
| **F-13** (LOW) | Editor shows truncated id (originAgent fixture-only) | Read Editor row | **CONFIRMED** | Editor renders `seed-age…` (truncated `seed-agent-cos` UUID), never a name. |
| **F-14** (LOW) | ScopeChangeDialog leaks all 7 raw scope kinds (vs AD6 3-label rule) | Count `<option>`s in scope select | **CONFIRMED** | Select has **7 options**: factory, product, practice, team, bet, task, user. Raw internal vocabulary leaks; user can move items into bet/task scopes no list pill filters to. |
| **F-15** (MED) | After triage validate, list never refetches — item missing from curated until remount | Validate factory draft, check curated w/ and w/o reload | **CONFIRMED** | API status→`active`; item **absent from curated without reload** (false), **appears only after full reload** (true). Validated item exists in neither tab until remount. Screenshot `06`. |
| **F-20** (INFO) | Triage reject = generic PATCH status→archived (emits `knowledge_updated`, not `knowledge_archived`) | Click row Reject, capture PATCH | **CONFIRMED** | PATCH `{version:1,status:"archived"}` → 200, status→archived, version→2. Hits `/api/knowledge/:id` not `/:id/archive` — so no `knowledge_archived` event; edit-log editor = real user (differs from overflow-menu Archive). |
| F-04 (MED) | attentionScore/relevanceScore null for UI-created items | API list payload inspection | **CONFIRMED** | All created items return `relevanceScore:null, attentionScore:null` (incl. seed). Triage attention-sort degrades to DB row order. |
| **Unreachable ops** | merge/split/flag/search/triage-count have no UI surface | Call endpoints + inspect detail overflow | **CONFIRMED** | Endpoints respond (merge 400 guarded, search 200, triage-count 200) but detail overflow exposes only **Archive + Change scope**; no UI control reaches merge/split/flag/search; sidebar triage badge absent. |
| seed render | seed-ki-1 renders on /knowledge | Curated tab | **PASS** | "Boil the Lake" present in Curated. Default tab = **Triage** (drafts exist → matches auto-tab effect, trace #3). |
| body fix | Seed body "Solve the full problem, not a subset." | Read detail body | **PASS (fix holds)** | Body renders correctly; recent GET-JOIN/remount patch still working. |
| kind render | Kind shows "principle" | Read aside | **PASS** | Aside Kind = "principle". |
| edit flow | Editable (Private) item: edit→autosave→persists | Edit, wait "Saved", Done, verify read+API | **PASS** | Saw `data-save-status="saved"`; edit text in read view AND `GET /:id` body; version→2. Screenshot `04`. |

## NEW ISSUES (beyond the 21 flags)

1. **POST /api/knowledge ignores `status` in body — always creates `draft`.** Passing `status:"active"` on create still yields `status:"draft"` (verified: all 3 user items + factory items came back `draft`). Compounds F-01: a default-Shared create is BOTH factory (no Edit) AND draft (lands in triage) — so the only way to "activate" your own freshly-created knowledge is to validate it in Triage, which (F-15) then makes it vanish from both tabs until reload.

2. **Status badge says "HEALTHY" in the detail aside StatusChip** for an `active` item (seed-ki-1). The list maps `active→"Active"` but the detail aside renders "HEALTHY" — inconsistent status vocabulary between list and detail surfaces (not in the trace; trace covered list badges only).

3. **`Last edited` shows a raw ISO timestamp** (`2026-06-09T21:44:03.060Z`) in the detail aside instead of a humanized/relative time — the list uses `relativeTime()` but the detail metadata bar does not. Minor polish gap.

4. **Confidence renders `n/a`** for seed-ki-1 (fabric never wrote confidence) — consistent with F-10/F-04 family; the metadata aside is largely placeholder (Access count 0, Confidence n/a, Editor truncated id, no backlinks) for any non-agent-curated item.

## Console / Network during run
- Console errors: only the expected `409 (Conflict)` from the F-06 scope PATCH. No other JS errors.
- Non-2xx API: only `409 PATCH /api/knowledge/:id/scope` (F-06, intentional). No unexpected 4xx/5xx.
