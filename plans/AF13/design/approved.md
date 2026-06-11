# AF13 — Approved design (repair-in-place)

`routine`. One variant. No new components, no new shapes — every change is corrected behavior on an existing, already-approved surface. The HTML mockups (`knowledge-list.html`, `knowledge-detail.html`, `knowledge-edit.html`) remain the visual truth; nothing here alters their pixels.

---

## 1. Default-scope → editability (create + detail)

**The user-visible outcome:** create an item via the default flow → land on its detail page → an **Edit** button is present and editing persists.

**Decision — move two levers, minimally:**

- **(a) Editability is owned by scope, and the human default scope is editable.** The rule "`factory` is read-only" stays (it protects agent-curated org knowledge — the `amendableBanner` flow depends on it). What changes is that a **human-created default item must not land in `factory`**.
- **(b) The create page's default "Shared" pill stops meaning `factory`.** "Shared" remains the default *label* (it is what a solo founder wants — visible to the whole factory), but a human-authored Shared item is editable by its creator. Two acceptable implementations, decided in `/architecture`:
  - **Preferred:** introduce an editability predicate that is `false` only for `factory` items the current user does **not** author — i.e. `isReadOnly = isFactory && updatedBy !== currentUserId`. A user who just created the item authored it, so Edit shows. Agent-authored factory knowledge stays read-only. This keeps "Shared = factory" intact and fixes the coupling at the editability rule, which is where the concept says the rule belongs.
  - Fallback (if author-check proves unreliable): map the default create scope to `practice` (still labeled "Shared", per `scope-labels.ts` where factory+practice both → "Shared") and keep `factory` fully read-only. The user never sees the difference; the item is editable.

**Edit button states (unchanged shape):** `Edit` (primary pill) when editable & not editing → `Done` when editing. Read-only items show neither; factory-under-review shows the existing `factory-amendable-banner`. No copy change.

**Signature:** the Edit button is visible on the page you land on right after Create. Zero dead-ends.

---

## 2. Triage post-action visibility

**The user-visible outcome:** validate a triage item → it disappears from the Triage tab and **appears in Curated** in the same render, no reload.

**Decision — optimistic *status transition*, not optimistic *removal*.** Today `handleTriageAction` adds the id to `optimisticRemovals` (suppress-from-triage only) and PATCHes. Replace the suppress-set with an **optimistic status override map** `{ [id]: "active" | "archived" }` applied to `allItems` before the triage/curated split:

- Validate → override status `active` → item leaves Triage (no longer draft) **and** enters Curated (now active) in the same `useMemo` pass.
- Reject → override status `archived` → item leaves Triage and is correctly absent from Curated (curated = active only).
- On PATCH success: the override is confirmed; when the next list fetch lands it carries the real status (override can be cleared or left — it agrees with the server).
- On PATCH failure: revert the override → item returns to Triage for retry. Same recovery semantics as today, just keyed by status instead of a boolean removal.

**Confirmation affordance:** none added — the item *visibly relocating* to the Curated tab is the confirmation. No toast (the inbox/list grammar doesn't toast). The Triage tab count drops; Curated grows.

**Empty-state copy (unchanged):** when Triage empties, existing "Nothing needs attention / Triage is clear" copy renders.

**Signature:** the verdict moves the item; it never makes it vanish.

---

## 3. Sort pills that reorder

**The user-visible outcome:** switch sort from Relevance to Recency → the list reorders.

**Decision — sort is applied client-side over the fetched list, in both tabs.** The three closed options (`relevance | recency | frequency`, from `KNOWLEDGE_SORT_OPTIONS`) map to:

| Pill | Orders by | Source field | Tie-break |
|---|---|---|---|
| **Relevance** (default) | `signals.relevanceScore` desc | list-response signal | then `updatedAt` desc |
| **Recency** | `updatedAt` desc | item field (always present) | then `title` asc |
| **Frequency** | `signals.accessCount30d` desc | list-response signal | then `updatedAt` desc |

- Items with a `null` signal sort **last** within their group (same null-handling pattern the existing triage `attentionScore` sort uses).
- **Curated tab:** sort applies *within each topic group* (groups stay; rows inside reorder). Group order itself stays by topic name — the spec does not ask to reorder groups, and doing so would fight the topic-health grouping.
- **Triage tab:** the existing `attentionScore` desc ordering is the triage default; when the user picks a sort pill, triage honors it too (recency/frequency are meaningful for triage). Relevance pill on triage falls back to the attention ordering (triage's native relevance signal).

**Pill active state (unchanged):** selected pill = accent-primary weight 600; others tertiary. No new control.

**Signature:** the pill you click is the order you get — no placebo.

---

## 4. Scope-change dialog: vocabulary + version

**The user-visible outcome:** edit a body, then change scope, confirm → success (no 409). The dialog shows human labels, not raw enums.

**Decision A — labels, not enums.** Replace the 7-option raw-enum `<select>` (which leaks `factory`, `practice`, `bet`, `task`…) with the **3 user-facing options from `SCOPE_CREATE_OPTIONS`** (Shared / Team / Private), matching the create flow exactly. The dialog maps the chosen label → `scopeKind` on submit (Shared→factory or practice per the create mapping, Team→team, Private→user). `scopeId` free-text input stays only for Team (the one selectable option that requires an id); Shared/Private need none. This kills the AD6/AE1 vocabulary leak.

**Decision B — version source.** The dialog must send the **current** version, not the mount-time `item.versionNum`. The detail page already tracks the live version in `useAutoSave`'s `version` state (bumped on every save). The dialog must receive *that* live value, not the frozen `item.versionNum ?? 1`. So the detail page passes its `version` state into `ScopeChangeDialog currentVersion`. After autosave bumps version 1→2, the dialog sends 2 → no conflict.

**Conflict still possible, still handled:** if a genuine concurrent edit lands, the existing 409 path shows the dialog's inline error. We do not auto-retry — a real conflict deserves the user's attention. (Architecture note: if the dialog can re-read the latest version on open, even cleaner; minimum bar is "pass live version in.")

**Team selectability — decision:** the Team pill/option is disabled **only** when the product genuinely has no team context, not permanently. Today `hasTeam = false` is hardcoded. The intent (per AC) is Team is selectable where the product means it to be. Decision: gate Team on a real signal (`currentUser.teamId` when the user model carries it; until then, a single source-of-truth flag the architecture defines) — but it must not be a hardcoded `false` that can never flip. If the team model is genuinely absent, the disabled pill keeps its tooltip "Join a team to use team-scoped knowledge"; the moment a team context exists, it enables. No permanent dead control.

**Signature:** changing scope after editing just works; the dialog speaks the user's vocabulary.

---

## 5. Detail metadata that is real

**The user-visible outcome:** the metadata aside shows real Access count, real Backlinks, real Editor/Kind/Topic — or an honest empty state, never a permanent `0`/empty placeholder.

The detail route must return every field `useKnowledgeItem`'s `KnowledgeItemData` declares. Per field:

| Field | Real source | Empty/zero display |
|---|---|---|
| **Access count** | `knowledgeAccessLog` rows in 30-day window for this item (route already computes this for the *list*; detail must too). | `0` is honest if there are genuinely no accesses — but it must be the *computed* count, not a hardcoded fallback. |
| **Backlinks / related** | Derived by **topic** (same `scope` + `topic`, excluding self), mirroring the existing fixture `findRelated` logic — returned as `relatedItems: {id, title}[]`. No new relations table (out of scope). | "No related items." (existing `BacklinksCard` copy). |
| **Editor** | `updatedBy` (already on item). Display: current user's name if it matches; else truncated monospace id; else "Unknown" (logic already in the aside). | "Unknown". |
| **Kind** | `knowledgeStrategyFabric.kind` (route already joins + returns it). May be null when no strategy layer classified it. | "—" rather than the literal string "unknown". |
| **Topic** | `item.topic` (already returned via `...item`). | breadcrumb omits the topic segment when null (existing behavior). |
| **Confidence** | `knowledgeStrategyFabric.confidence` (already returned). | "n/a" (existing `formatConfidence`). |

**Honesty rule (spec constraint):** any field the route cannot source is **removed from the UI**, not shown as a permanent placeholder. Access count and Backlinks are sourceable (above), so they stay and get real data.

**Signature:** every number in the aside is a real number.

---

## Did we consider (rejected directions)

- **A toast on triage validate** — rejected. The list grammar is silent relocation, not toasts (no optimistic-UI bragging, per TRACK-L scope rules). The item moving tabs is the feedback.
- **Auto-switching to the Curated tab after validate** — rejected. Yanking the user out of Triage mid-queue breaks the keyboard triage flow (`j`/`k` through a batch). The item appears in Curated; the user stays in Triage to keep working.
- **Reordering topic *groups* by sort** — rejected. Groups carry topic-health semantics; reordering them by row-level signals muddies that. Sort reorders rows within groups only.
- **A full scope dropdown with all 7 kinds + nice labels** — rejected. The 3-pill create vocabulary is the locked AD6/AE1 contract; the dialog must match it, not invent a parallel richer picker (scope creep + vocab fork).
- **Making `factory` editable to fix the create→edit dead-end** — rejected. That breaks the deliberate "agent-curated org knowledge is read-only" rule and the amendable-under-review flow. We fix it at the author-check / default-scope lever instead.
- **Adding a `knowledge_relations` table for real backlinks** — rejected. Out of scope (AF9 / net-new surface). Topic-derivation is the established, sufficient source.
- **Server-side sort (`?sort=` query param honored by the route)** — considered, deferred. The list is already fully fetched client-side and small; client sort is simpler, has zero round-trip, and the URL param still drives it. If list size grows past pagination, revisit server sort — noted as an architecture open question, not built now.

## Open questions for the architect

1. Editability predicate exact form: `isFactory && updatedBy !== userId` vs default-scope-to-practice. Pick one; the design accepts either.
2. Where the optimistic status-override map lives (KnowledgeList local state) and whether the list `useFetch` needs a merge of the PATCH response (it returns the updated row) to make the override durable across the next fetch.
3. Team-selectability signal source until `currentUser.teamId` exists.
4. Whether `ScopeChangeDialog` re-reads latest version on open or simply receives the live `version` prop (minimum bar).
