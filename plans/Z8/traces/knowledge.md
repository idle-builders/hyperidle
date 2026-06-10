# KNOWLEDGE Domain — Deep Trace Audit (Z8)

Audited: 2026-06-10. Files read in full: `KnowledgeList.tsx` (1051 ln), `KnowledgeDetail.tsx` (924 ln), `KnowledgeCreate.tsx` (253 ln), `KnowledgeCreateDialog.tsx`, `ScopeChangeDialog.tsx`, `KnowledgeTopicGroup.tsx`, `CurationSuggestionCard.tsx`, `KnowledgeBody.tsx`, `BodyEditor.tsx` + `use-body-editor.ts`, `useKnowledgeItem.ts`, `useAutoSave.ts`, `useFetch.ts`, `useKeyboardNavigation.ts`, `scope-labels.ts`, `api-fetch.ts`, `routes/knowledge.ts` (954 ln, every route), `db/schema.ts` (knowledge tables), `fabric/types.ts` (scopeToLayer), `Sidebar.tsx`, `AppShell.tsx`, router.

Route mount: `app.ts:385` → `api.route("/knowledge", createKnowledgeRoutes(db, eventBus))` → all endpoints under `/api/knowledge`. All client calls go through `apiFetch` (`services/api-fetch.ts:63`) which injects `X-API-Key`; auth middleware sets `c.get("userId")` (`middleware/auth.ts:109/198/229`, falls back to `u-founder` in local mode).

---

## Element Inventory

### KnowledgeList (`/knowledge`, `packages/web/src/pages/KnowledgeList.tsx`)

| # | Element | File:Line | Handler chain | Endpoint | Server | DB ops | Events |
|---|---------|-----------|---------------|----------|--------|--------|--------|
| 1 | Page data load | KnowledgeList.tsx:780-784 | `useFetch("/api/knowledge")` → apiFetch GET | GET /api/knowledge | knowledge.ts:212-273 | SELECT knowledge_items LEFT JOIN knowledge_strategy_fabric (relevanceScore, attentionScore) WHERE scope_kind != 'user' OR updated_by = userId (l.215-226); SELECT knowledge_access_log WHERE accessedAt >= now-30d (l.234-237); signals computed in app code | none |
| 2 | Curated/Triage tab pills | :924-956 | `setTab` + `tabManuallySelectedRef` | none (client state) | — | — | — |
| 3 | Auto-tab effect | :822-831 | scope change resets manual flag; defaults to triage when any draft/needs_human item exists | none | — | — | — |
| 4 | Search input | :964-981 | `setSearchQuery` → client-side title-substring filter (:461-472) | none — purely client-side filter | — | — | — |
| 5 | "+ New" button | :982-989 | `navigate("/knowledge/new")` | none | — | — | — |
| 6 | Empty-state "Create first item" | :1016-1024 | `navigate("/knowledge/new")` | none | — | — | — |
| 7 | Scope filter pills (All/Shared/Team/Private) | :549-571, options scope-labels.ts:47-52 | `onScopePillChange` → `setSelectedScopePill` → client filter on `scopeKind` (:792-796) | none — client-side only | — | — | — |
| 8 | Sort pills (relevance/recency/frequency) | :585-604 | `handleSortChange` (:872-880) → URL param `?sort=` | none | — | — | — **FLAG F-02: sort is never applied** |
| 9 | Curated topic group header (collapse) | KnowledgeTopicGroup.tsx:51-81 | `setCollapsed` toggle | none | — | — | — |
| 10 | Curated row (click) | :733-741 (KnowledgeListRow :364-411) | `onClick` → `navigate(/knowledge/:id)` | (triggers detail GET on next page) | — | — | — |
| 11 | Triage row open (button body / arrow icon / Enter / o) | :635-647, :329-353, :512-517 | `onOpen`/`onNavigate` → navigate to detail | — | — | — | — |
| 12 | Triage validate button (✓) / `v` key | :279-303, :500-505 → `handleTriageAction(id,"active")` :839-870 | optimistic removal → apiFetch PATCH `{version, updatedBy, status:"active"}` | PATCH /api/knowledge/:id | knowledge.ts:536-623 | SELECT item; version check (409); INSERT knowledge_edit_log (field=status, editType=update) :577-587; UPDATE knowledge_items SET status, version+1, updatedBy, updatedAt :604; re-SELECT | `knowledge_updated` (action "updated") :613-620 |
| 13 | Triage reject button (✗) / `x` key | :304-328, :506-511 → `handleTriageAction(id,"archived")` | same as #12 with status:"archived" | PATCH /api/knowledge/:id | same | same (status → archived via generic PATCH, **not** the /archive endpoint, so no `knowledge_archived` event) | `knowledge_updated` |
| 14 | Triage keyboard nav j/k/ArrowUp/ArrowDown/Escape | :475-525 | document-level keydown (active only when tab==="triage"); guards input/textarea/contentEditable | none | — | — | — |
| 15 | Keyboard hint bar | :652-683 | display only | — | — | — | — |
| 16 | Private badge | :248-257/:378-386 | display: `item.scopeKind === "user"` | — | — | — | — |
| 17 | Status badge (Active/Stale) | :267-274/:397-404 | display: `statusBadgeStyle` (:193-204); "archived" renders "Stale"; draft → "captured" → no badge | — | — | — | — |
| 18 | Kind badge | :258-265 + kindBadgeStyle :169-187 | **never rendered** — no call site passes `kind` | — | — | — | **FLAG F-03 dead code** |
| 19 | Timestamp | :356-358 | display: `relativeTime(item.updatedAt)` | — | — | — | — |
| 20 | Empty-state hint card + "Got it" | :700-719 | `useHint("knowledge-empty")` → dismiss POSTs | POST /api/hint-progress/:id/dismiss (useHints.tsx:99) | hint routes | hint_progress | — |
| 21 | Triage sort-by-attention | :799-812 | client sorts on `signals.attentionScore` desc | (data from #1) | — | attentionScore from knowledge_strategy_fabric.attention_score (text → parseFloat at knowledge.ts:267) | **FLAG F-04: null for all UI-created items** |

### KnowledgeCreate (`/knowledge/new`, `KnowledgeCreate.tsx`)

| # | Element | File:Line | Handler chain | Endpoint | Server | DB ops | Events |
|---|---------|-----------|---------------|----------|--------|--------|--------|
| 22 | Breadcrumb "Knowledge" link | :106-114 | router Link → /knowledge | — | — | — | — |
| 23 | Title input | :117-139 | `setTitle` (maxLength 500) | — | — | — | — |
| 24 | BodyEditor (TipTap) | :183-190 | `onChange(md)` → `setBody` | — | — | — | — |
| 25 | Scope pills Shared/Team/Private | :209-244 (options scope-labels.ts:58-62) | `setSelectedScope`; Team always disabled (`hasTeam=false` hardcoded :59) | — | — | — | **FLAG F-05** |
| 26 | Cancel | :141-148 | `navigate("/knowledge")` | — | — | — | — |
| 27 | Create | :149-157 → `handleCreate` :63-95 | apiFetch POST `{title, body, format:"markdown", scopeKind, updatedBy:user.id}` → navigate to `/knowledge/:newId` | POST /api/knowledge | knowledge.ts:374-429 | scopeId guard (400 for product/practice/team/bet/task without id, SCOPES_REQUIRING_ID shared/types.ts:161); user-scope auto-fills scopeId=userId :388-389; INSERT knowledge_items (version=1, status default **"draft"**) :394-408; upsertFabricLayer :411 → SELECT/UPDATE-or-INSERT knowledge_strategy_fabric with `layer = scopeToLayer(scopeKind)` (fabric/types.ts:25-37: factory→L4, product→L2, practice→L3, task→L1, bet/team/user→null); re-SELECT, 201 | `knowledge_created` :420-426. No knowledge_edit_log row on create. |
| 28 | Error alert | :170-178 | server error → role=alert | — | — | — | — |

### KnowledgeCreateDialog (`pages/knowledge/KnowledgeCreateDialog.tsx`)

Reachable only from WorkBet.tsx:1133 ("Add knowledge" button :1106-1115, locked `scopeKind="bet"`, `scopeId=bet.id`). NOT reachable from any knowledge page (Q2 lore: list "+ New" now navigates to /knowledge/new).

| # | Element | File:Line | Chain | Endpoint |
|---|---------|-----------|-------|----------|
| 29 | dialog open/close sync | :72-95 | showModal()/close() with JSDOM fallback | — |
| 30 | Title input / BodyEditor / scope pills | :153-225 | local state; locked scope renders read-only tag :185-188 | — |
| 31 | Create | :244-251 → handleSubmit :97-134 | POST same as #27 with `scopeId` only when locked (:114-116) | POST /api/knowledge |
| 32 | Cancel | :236-243 | onClose | — |

### KnowledgeDetail (`/knowledge/:knowledgeId`, `KnowledgeDetail.tsx`)

| # | Element | File:Line | Handler chain | Endpoint | Server | DB ops | Events |
|---|---------|-----------|---------------|----------|--------|--------|--------|
| 33 | Item load | :248 `useKnowledgeItem` (hooks/useKnowledgeItem.ts:40-42) → useFetch | GET /api/knowledge/:id | knowledge.ts:296-367 | SELECT knowledge_items LEFT JOIN knowledge_strategy_fabric (kind, layer, confidence, relevanceScore, attentionScore) :300-315; user-scope privacy 404 :328-334; best-effort INSERT knowledge_access_log (accessorKind "human", accessorId "browser") :339-345; response = item + kind/layer/confidence (relevance/attention selected but **dropped**) :361-366 | `knowledge_accessed` :351-359 — **FLAG F-09: no subscriber exists** |
| 34 | Fixture fallback | :249-269, LEGACY_DETAILS :113-144, fixtures/knowledge-data.ts | apiItem priority; else fixture; else FALLBACK_DETAIL | — | — | — | — |
| 35 | Remount key (recent patch) | :276-280 | `key = knowledgeId + (loaded\|fallback)` remounts KnowledgeDetailView when API/fixture data lands | — | — | — | see "Patch verification" below |
| 36 | Breadcrumb | :284-310 | Link /knowledge; scope/topic segments | — | — | — | **topic/scope never set for API items (F-12)** |
| 37 | StatusChip / confidence / origin agent / updated-at metadata bar | :658-678 | display | — | — | confidence from fabric (null unless fabric service writes it → "n/a"); originAgent not in API → always "by unknown" (F-13) | — |
| 38 | Edit button | :685-692 | `startEdit` :557-562 — hidden when `isFactory` (:460, :685) | — | — | — | **FLAG F-01: default-created (Shared→factory) items have no Edit button** |
| 39 | Done button | :693-700 | `exitEdit` — exits edit mode only; persistence already happened via autosave | — | — | — | — |
| 40 | BodyEditor (edit mode) | :806-816 | TipTap onUpdate → `handleContentChange` :576-580 (dirty-check vs editContent) → `triggerSave(markdown)` | → useAutoSave PATCH (see machine below) | knowledge.ts:536-623 | edit log per changed field + UPDATE version+1 | `knowledge_updated` |
| 41 | Save indicator | :414-440, :683 | renders saving/saved/error (**not** conflict — covered by banner) | — | — | — | — |
| 42 | Conflict banner + Reload | :753-772 | shown when `conflictVersion !== null`; Reload → `window.location.reload()` | — | — | — | — |
| 43 | Overflow menu (···) | :358-411, :703-715 | toggle; click-outside + Escape close :480-496 | — | — | — | — |
| 44 | Archive menu item | :390-398 → `handleArchive` :588-607 | apiFetch POST, on success navigate /knowledge; inline error :735-750 | POST /api/knowledge/:id/archive | knowledge.ts:811-861 | SELECT; UPDATE status='archived', updatedAt (no version bump, no updatedBy change); INSERT knowledge_edit_log (editor = **item.updatedBy**, editType "archive") :834-843; re-SELECT | `knowledge_archived` :852-858 |
| 45 | Change scope menu item | :399-406 → opens ScopeChangeDialog :843-850 | see #50 | — | — | — | — |
| 46 | KnowledgeBody (read mode) | :818-824, KnowledgeBody.tsx:99-163 | deriveBlocks(body) → Block primitives, DOMPurify-sanitized; Space/Enter on block → `onOpenBlockActions` | — | — | — | — |
| 47 | BlockActionsPopover Discuss/Share | :781-803, handlers :613-637 | Discuss → thread prefill; Share → CocContext.attachContext (only when overlay open) | — | — | — | — |
| 48 | HostThreadSection "Discussion" | :826-833 | `useHostThread("knowledge_item", item.id)` → GET /api/threads?host_kind=…&host_id=… then GET /api/threads/:id (useHostThread.ts:72,90) | threads routes | threads/messages tables | — |
| 49 | Metadata aside (Kind, Scope, Status, Confidence, Last edited, Editor, Access count) | :853-912 | display; Editor resolves updatedBy→user.name or truncated UUID :891-904; Access count `item.accessCount ?? 0` :909 | — | — | — | **FLAG F-10: accessCount never returned by GET /:id → always 0** |
| 50 | ScopeChangeDialog (Save) | ScopeChangeDialog.tsx:89-123 | PATCH `{scopeKind, scopeId?, reason, updatedBy, version: currentVersion}`; currentVersion prop = `item.versionNum ?? 1` (KnowledgeDetail.tsx:848) | PATCH /api/knowledge/:id/scope | knowledge.ts:433-532 | SELECT; version check 409 (:452-459); scopeId guard 400; INSERT knowledge_edit_log for scope_kind (reason embedded in newValue) :475-485 and scope_id :488-499 (editType "scope_change"); UPDATE scopeKind/scopeId/version+1/updatedBy/updatedAt :501-510; upsertFabricLayer :513; re-SELECT | `knowledge_updated` :522-529 — **FLAG F-06 stale version race; F-14 raw 7-kind vocabulary** |
| 51 | ScopeChangeDialog scope select / scopeId input / reason textarea | :140-186 | SCOPE_KINDS (all 7) select; scopeId free-text shown for SCOPES_REQUIRING_ID; reason required | — | — | — | — |
| 52 | BacklinksCard | :313-350, :915-918 | structuredRelatedItems (API) else fixture `findRelated` :215-229 | — | — | — | **FLAG F-11: API never returns relatedItems; API items also lack topic → always "No related items."** |
| 53 | Amendable banner | :724-732 | display when factory + needs_human | — | — | — | — |

### Sidebar / unconsumed surfaces

| # | Element | File:Line | Status |
|---|---------|-----------|--------|
| 54 | Knowledge triage badge | Sidebar.tsx:326-333 (`knowledgeTriageCount` prop :97) | **Prop never passed by AppShell.tsx (no occurrence) → badge never renders; GET /api/knowledge/triage-count (knowledge.ts:280-292: COUNT WHERE status IN (draft,needs_human) + user-scope filter) has zero production callers** (F-07) |
| 55 | CurationSuggestionCard | components/CurationSuggestionCard.tsx | Only imported by its test + stories. Never rendered on any page (lore N5: "Curation suggestions have no API yet so that block is suppressed"). Review/Dismiss buttons wired to no-ops |
| 56 | KnowledgeRow (design-system) | design-system/src/KnowledgeRow.tsx | No longer used by KnowledgeList (replaced by inline KnowledgeListRow); still used by GlobalSearchPanel.tsx:251 for knowledge search results |
| 57 | useKeyboardNavigation hook | hooks/useKeyboardNavigation.ts | NOT used by triage (triage has its own inline document handler, KnowledgeList.tsx:475-525). Only consumer: GlobalSearchPanel |

---

## Autosave & Concurrency Machine

`hooks/useAutoSave.ts` — states: `idle | saving | saved | error | conflict`.

- **Trigger**: BodyEditor TipTap `onUpdate` → serialized GFM (use-body-editor.ts:67-73, onChangeRef avoids stale closure) → `handleContentChange` (KnowledgeDetail.tsx:576-580): updates `latestContentRef`, skips when markdown === editContent (mount-fire guard, T2 F3), else `save(markdown)`.
- **Debounce**: 1500ms default (:71); each `save()` clears the prior timer (:165-167) — trailing-edge debounce.
- **Dispatch**: timer fires → `status="saving"` → `executePatch` (:54-65): `PATCH endpoint {body: content, version: versionRef.current, updatedBy}`.
- **Success**: server returns full updated row; hook reads `data.version` (:143-144) → `status="saved"` → `onSaved(newVersion)` → KnowledgeDetail `setVersion(newVersion)` + `setSavedContent(latestContentRef.current)` (:534-537); "saved" auto-clears to "idle" after 3s (:155-159).
- **409**: reads `details.currentVersion` (matches server ApiErrorResponse, knowledge.ts:556-561) → `status="conflict"`, `onConflict` → `setConflictVersion` → conflict banner + Reload (full page reload, discarding local edits).
- **Other !ok / network**: `status="error"` → "Save failed" in SaveIndicator. No retry; the next keystroke re-schedules.
- **Versioning**: server-side optimistic lock — `existing.version !== body.version → 409` (knowledge.ts:555-562); on success `version = existing.version + 1` (:593).
- **Unmount**: timers cleared; `unmountedRef` guards setState; StrictMode-safe reset (R9 lore :110-125).
- **Race (F-08)**: there is no in-flight serialization. Sequence: save A dispatched (version N) → user types → save B's timer fires before A's response arrives → B sends version N again → server is now at N+1 → spurious 409 conflict banner from the user's *own* save. Window = network latency vs 1.5s debounce; realistic on slow links.
- **SaveIndicator omission**: status "conflict" renders nothing in the indicator (:422-438) — acceptable since the banner covers it, but `data-save-status="conflict"` is the only signal.

## Triage Flow

1. Items qualify when `status ∈ {draft, needs_human}` (KnowledgeList.tsx:799-801), sorted by `signals.attentionScore` desc (nulls last).
2. Keyboard: `j`/`ArrowDown` next, `k`/`ArrowUp` prev (clamped), `Escape` clears focus, `Enter`/`o` opens detail, `v` validate, `x` reject (:485-518). Handler ignores keystrokes originating in input/textarea/contentEditable (:480-483). Focus state resets/clamps when the filtered list shrinks (:528-534).
3. `v` → `PATCH /api/knowledge/:id {version: item.version ?? 1, updatedBy: user.id ?? "unknown", status: "active"}`. DB transition: `draft|needs_human → active`, version+1, knowledge_edit_log row (field "status", editType "update"), `knowledge_updated` event.
4. `x` → same PATCH with `status: "archived"` → `draft|needs_human → archived`. Note: this bypasses POST /:id/archive, so **no `knowledge_archived` event** is emitted for rejects, and the edit-log editor is the real user (unlike the archive endpoint).
5. Optimistic UI: id added to `optimisticRemovals`; on !ok or network error the id is removed so the row reappears (:853-868). On success the item silently stays removed — **no refetch**, so a validated item does not appear in the Curated tab until full page remount (F-15). The version sent comes from the original list payload; if anything else bumped the item since load, the PATCH 409s and the row just reappears with no message (F-16).

## Data Flow Chains (signals)

- **knowledge_access_log writes**: only GET /:id (knowledge.ts:339-345), one row per detail view, accessor hardcoded `human/browser` (auth identity not wired — L22 lore in schema.ts:572-574). Nothing else writes it in the server; fabric `relevance-service.ts` reads it.
- **accessCount30d / lastActivityAt**: computed at GET / list time from a single batched access-log query (:232-257). Delivered in `items[].signals`. The list UI receives but never displays them; only `attentionScore` is used (triage sort). GET /:id does *not* compute accessCount, yet the detail UI renders `item.accessCount ?? 0` → permanently 0 (F-10).
- **relevanceScore / attentionScore**: stored as text on knowledge_strategy_fabric (schema.ts:636-637), written only by fabric services (`attention-service.ts:211`, `relevance-service.ts:197`, `practice-meeting.ts`) and skill-tool `score-attention.ts:118` — i.e. agent/routine paths. The HTTP route layer never writes scores; `upsertFabricLayer` (knowledge.ts:131-159) writes only `layer`. So for any UI-created item both scores are null → triage attention sort is a no-op and `relevanceScore` is null everywhere (F-04).
- **knowledge_edit_log writers**: PATCH /:id (per changed field of title/body/topic/format/status, :567-589), PATCH /:id/scope (scope_kind + scope_id rows, reason string-embedded, :474-499), merge (2 rows, :683-703), split (1 row, :786-795), archive (1 row, :834-843), flag (1 row, :888-897). POST / (create) writes none. There is no read endpoint for the edit log — it is write-only from the product's perspective.
- **knowledge_conflicts**: written/read only by skill-tools (`create-conflict-review.ts`, `promote-knowledge.ts`) — agent tool surface. No HTTP route, no UI. The detail-page "conflict" state (409) never creates a knowledge_conflicts row.
- **Events**: `knowledge_created` (POST /), `knowledge_updated` (PATCH /:id, PATCH /:id/scope, merge "merged", split "split", flag "flagged"), `knowledge_archived` (POST /:id/archive only), `knowledge_accessed` (GET /:id). No subscriber for `knowledge_accessed` exists anywhere (F-09).
- **Topic grouping**: `groupByTopic` (KnowledgeList.tsx:118-143) keys on `knowledge_items.topic`, null → "General". `topic` is settable only via POST body.topic / PATCH body.topic — **no UI surface ever sends topic** (create page and dialog omit it), so all human-created items land in "General"; topics exist only via seeds/agents/split-inheritance (F-17).
- **scopeToLayer** (fabric/types.ts:25-37): factory→L4, practice→L3, product→L2, task→L1, bet/team/user→null. Called inline in POST /, PATCH /:id/scope, POST /:id/split via `upsertFabricLayer`. Layer returned by GET /:id; the detail page maps it to `item.layer` but AD6 removed the layer badge — only `kind` shows in the aside.

## Patch verification (GET /:id JOIN + remount key)

Commit 4ba2a681. Verdict: **sound, with residue**.

- LEFT JOIN is safe — `knowledge_strategy_fabric.knowledge_item_id` is UNIQUE (schema.ts:631), so no row fan-out; `.limit(1)` belts-and-braces.
- `confidence ? parseFloat : undefined` — text column; `"0"` is truthy so a zero score survives; empty string → undefined (acceptable).
- `relevanceScore`/`attentionScore` are selected (:306-307) but never included in the response (:361-366) — dead select fields.
- `viewKey = ${knowledgeId}-${loaded|fallback}` correctly remounts KnowledgeDetailView when data arrives, resetting `savedContent`, `editContent`, and `version` (from `item.versionNum`) — fixes the stale-body bug.
- Residue 1: during load (`apiItem === null`, no fixture) the view renders FALLBACK_DETAIL — a flash of "Unknown Knowledge Item / This knowledge item was not found." `isLoading` is destructured (:248) but never used; no skeleton/loading state (F-18).
- Residue 2: if the user clicks Edit during the fallback window, the remount on data arrival destroys edit state silently (low likelihood, same root cause as Residue 1).
- Residue 3: if the GET fails (network/500), `useFetch.error` is ignored — the fallback "not found" content shows permanently with no error/retry affordance.

## UI-Unreachable Operations

| Endpoint | Server | Reachable from UI? |
|----------|--------|--------------------|
| GET /api/knowledge/triage-count | knowledge.ts:280-292 | **No.** Sidebar badge prop `knowledgeTriageCount` exists (Sidebar.tsx:97) but AppShell never passes it. Endpoint + badge both dead in production. |
| POST /api/knowledge/:id/merge | knowledge.ts:626-722 | **No UI surface.** API-only. Also: no version/optimistic-concurrency check; source archived without version bump; full old body copied into edit log. |
| POST /api/knowledge/:id/split | knowledge.ts:725-808 | **No UI surface.** API-only. New items status "draft", inherit scope + fabric layer; original archived without version bump; no guard against splitting archived items. |
| POST /api/knowledge/:id/flag | knowledge.ts:865-916 | **No UI surface** (AD6 removed Flag from overflow menu, KnowledgeDetail lore :355). Sets status→"draft" (re-enters triage), edit log editor = item.updatedBy (mis-attribution). |
| GET /api/knowledge/search | knowledge.ts:174-203 | **No web consumer.** GlobalSearchPanel uses `/api/search` (useGlobalSearch.ts:234), a different route. Knowledge-FTS endpoint dead from the UI. |
| knowledge_conflicts table | schema.ts:594-610 | No HTTP route; agent skill-tools only. |
| CurationSuggestionCard | components/CurationSuggestionCard.tsx | Component shipped, never rendered. |

## FLAGS

1. **F-01 (HIGH, UX-breaking)**: KnowledgeCreate defaults scope to "Shared" → `scopeKind: "factory"` (scope-labels.ts:59). KnowledgeDetail hides the Edit button for factory items (`isFactory`, KnowledgeDetail.tsx:460, 685). Net effect: **an item created with the default scope can never be edited in the UI** immediately after creation. Only Private/Team (team disabled, see F-05) items are editable.
2. **F-02 (HIGH, dead control)**: Sort pills (relevance/recency/frequency) write `?sort=` to the URL (KnowledgeList.tsx:872-880) but **no code consumes `sort`** — neither curated grouping nor triage ordering changes. Pure placebo control.
3. **F-03 (LOW, dead code)**: `kindBadgeStyle` + kind badge markup (KnowledgeList.tsx:169-187, 258-265, 388-395) can never render — no call site passes `kind`.
4. **F-04 (MED, display always null)**: triage attentionScore sort and `signals.relevanceScore` are always null for UI-created items — `upsertFabricLayer` writes only `layer`; scores come solely from fabric services/skill-tools that no UI flow triggers. Triage order degrades to DB row order.
5. **F-05 (MED)**: "Team" scope pill permanently disabled in both create surfaces (`hasTeam = false` hardcoded, KnowledgeCreate.tsx:59, KnowledgeCreateDialog.tsx:66) — user model lacks teamId. Effective create choices: Shared (→ read-only per F-01) or Private.
6. **F-06 (HIGH, version race)**: ScopeChangeDialog receives `currentVersion={item.versionNum ?? 1}` (KnowledgeDetail.tsx:848) — the *prop* item frozen at view mount — not the live `version` state that autosave bumps. Edit the body (version N→N+1 via autosave), then "Change scope" → guaranteed 409 with only a raw "Version conflict" error string. Same staleness for fixture items (versionNum undefined → always sends 1).
7. **F-07 (MED, unreachable)**: GET /triage-count + Sidebar triage badge fully implemented on both ends but never wired together (AppShell passes nothing). Y4's headline badge feature is invisible.
8. **F-08 (MED, race)**: useAutoSave has no in-flight queueing — a second debounced PATCH can dispatch with the pre-bump `versionRef` before the first response lands, producing a self-inflicted 409 conflict banner and a scary "someone else saved this item" message that is false.
9. **F-09 (LOW)**: `knowledge_accessed` event emitted on every GET /:id (knowledge.ts:351-359) has **zero subscribers** in the codebase — emitted into the void. (Access analytics work via the access-log table instead.)
10. **F-10 (MED, field omitted)**: useKnowledgeItem declares `accessCount` (useKnowledgeItem.ts:35) and the detail aside renders it — but GET /:id never computes/returns it. "Access count" displays **0 forever** despite the access log filling up.
11. **F-11 (MED, field omitted)**: useKnowledgeItem declares `relatedItems` — GET /:id never returns it. BacklinksCard falls back to fixture-based `findRelated`, which needs `topic`/`relatedItems` that API-mapped items never have → **"No related items." always** for real data.
12. **F-12 (LOW)**: detail mapping (KnowledgeDetail.tsx:252-267) drops `apiItem.topic` (available in the API response) — breadcrumb topic segment and topic-based related lookup never work for API items.
13. **F-13 (LOW)**: `originAgent` is fixture-only — every real item shows "by unknown" in the metadata bar.
14. **F-14 (LOW, vocabulary leak)**: ScopeChangeDialog's select lists all 7 raw SCOPE_KINDS (bet, task, product...) — contradicts AD6/AE1 ("no raw internal scope vocabulary leaks to users") which collapsed scopes to 3 labels everywhere else. Also lets users move items into bet/task scopes that no list pill can filter to (bet/task items fall under "Shared" label only via scopeKindToLabel fallback, and the "All" pill).
15. **F-15 (MED)**: after triage validate, the list never refetches — the validated item exists in neither tab (removed from triage optimistically, curated memo still built from stale fetch). Curated shows it only after a full remount/navigation.
16. **F-16 (LOW)**: triage PATCH failure reverts the row silently — no toast/error; a 409 (stale version from list load) looks like a flaky button.
17. **F-17 (LOW)**: no UI surface sets `topic`; all human-created knowledge piles into the "General" group. Topic grouping only differentiates seeded/agent data.
18. **F-18 (LOW, patch residue)**: `isLoading` from useKnowledgeItem is unused — during fetch, the detail page flashes FALLBACK_DETAIL ("Unknown Knowledge Item"); on fetch *error* it shows that fallback permanently with no retry. (Typecheck currently passes despite `noUnusedLocals` — verified via `npm run check`.)
19. **F-19 (LOW, attribution)**: POST /:id/archive and /:id/flag write knowledge_edit_log with `editor: item.updatedBy` (the *previous* editor, not the actor) and don't update `updatedBy`/`version` — audit trail mis-attributes archive/flag actions; archive also skips optimistic locking entirely.
20. **F-20 (INFO)**: triage reject (`x`) uses generic PATCH status→archived, so rejected items emit `knowledge_updated` not `knowledge_archived` — event consumers distinguishing archival would miss every triage reject; conversely the overflow-menu Archive emits `knowledge_archived` but logs the wrong editor (F-19). Two archive paths, two different behaviors.
21. **F-21 (INFO)**: KnowledgeList status mapper `toKnowledgeStatus` maps "draft" → "captured" (:98-109), for which `statusBadgeStyle` returns null — triage rows carry no status badge by construction; only needs_human (also null) behaves the same. Intentional-looking but means triage rows are visually indistinguishable by status.
