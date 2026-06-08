# AD6 Concept Probe: Knowledge Cleanup & Scope Simplification

## 1. Does this reshape a domain concept?

**No.** The knowledge item model stays identical. The `knowledge_items` table, `knowledge_strategy_fabric` table, `SCOPE_KINDS` enum (7 values), and `KnowledgeKind` type (8 values) all remain unchanged. This workpackage is a **presentation-layer simplification** — the user-facing vocabulary shrinks while the backend vocabulary stays full.

What changes: the user sees 3 scope choices instead of 7. The user does not see `kind` badges. Dead action buttons are removed. Archive works end-to-end.

## 2. Scope mapping: 3 user-facing labels to 7 backend values

The 7 backend `scopeKind` values serve three audiences:

| Audience | Values | Purpose |
|---|---|---|
| **Shared** (visible to all agents + humans) | `factory`, `product`, `practice` | Company-wide, product-specific, or cross-cutting discipline knowledge |
| **Team-specific** | `team` | Knowledge scoped to a specific team |
| **Personal** | `user` | Private notes, scratch, personal findings |

The remaining two — `bet` and `task` — are contextual scopes. Items scoped to a bet or task are created by agents during execution, not by humans in the knowledge create flow. They should **not appear in the human scope picker**.

### User-facing scope labels

| User sees | Maps to backend values | When creating |
|---|---|---|
| **Shared** | `factory` (default) | No scopeId needed |
| **Team** | `team` | Requires teamId — but we can auto-fill from the user's current team |
| **Private** | `user` | scopeId auto-filled from userId (already works) |

**Decision: `product` and `practice` become sub-options under "Shared" in the future, but for AD6 the default shared scope is `factory`.** This is the simplest mapping that satisfies AC-1. The user picks one of three radio-style options. The backend receives `factory`, `team`, or `user`.

Why not show `product` and `practice` in the picker? Because:
- The current codebase has no product/practice entity browser to select from
- `scopeId` for product/practice is a free-text input today — UX is bad
- Most solo founders and small teams (target audience) have one product and no practices
- Items can be re-scoped later via the existing ScopeChangeDialog

### What about `bet` and `task` scoped items in the list view?

Bet/task-scoped items already appear in the knowledge list (the API returns them). They should continue to appear but with their scope displayed as context ("Bet: XYZ" or "Task: ABC") rather than being filterable by the scope pills. The scope pills become: All / Shared / Team / Private.

## 3. Kind classification: remove from user-facing surfaces

The 8 `KnowledgeKind` values (`pattern`, `anti_pattern`, `brief`, `principle`, `decision`, `failure`, `reflection`, `focus`) are strategy-layer metadata computed by agents. They live on `knowledge_strategy_fabric.kind`, not on the kernel table.

**Current state in UI:**
- KnowledgeList: `kind` badges show on each row (pattern, decision, failure — color-coded)
- KnowledgeDetail: `kind` shown in metadata bar as a `Tag` and in the aside Metadata card
- KnowledgeCreate: `kind` selector dropdown with 4 options (`pattern`, `decision`, `failure`, `brief`)
- KnowledgeCreateDialog: no kind selector (uses whatever the API assigns)

**Decision: Remove `kind` from all user-facing create/list surfaces.** Rationale:
- Kind is a strategy signal — it belongs to the fabric, not the kernel
- Most users do not know the difference between a "pattern" and a "principle"
- When creating, users write — they do not classify. Classification is what agents do.
- The KnowledgeCreate page sends `kind` in the payload but the server's `createKnowledgeSchema` does NOT validate or store it on the kernel table — it only exists on the fabric row
- Removing the kind selector from create actually aligns the UI with the data model

**Exception:** The KnowledgeDetail metadata aside can show kind as a read-only metadata field when present (agent-assigned). It is informational, not interactive.

## 4. Topic vs scope: keep separate

Topic (`knowledge_items.topic`) and scope (`knowledge_items.scope_kind`) answer different questions:
- **Scope = who can see it** (factory/team/user/bet/task)
- **Topic = what it's about** ("auth", "deployment", "onboarding", etc.)

These are orthogonal. A "deployment" knowledge item can be shared (factory scope) or private (user scope). Merging them into a single tagging model would lose information.

**Decision: Keep topic and scope as separate fields.** The KnowledgeList already groups by topic in Curated view. The scope pills filter by visibility. This separation is clear in the current UI — no change needed for AC-4 beyond the simplified scope picker (which makes scope self-evidently about visibility) and keeping topic as the grouping mechanism.

## 5. Dead buttons inventory

**KnowledgeDetail overflow menu currently has:**
1. **Flag** — calls `onFlag` which is `closeOverflow` (does nothing visible). Backend endpoint exists (`POST /:id/flag`) and works. The button click closes the menu without calling the endpoint.
2. **Archive** — calls `onArchive` which is `closeOverflow` (does nothing visible). Backend endpoint exists (`POST /:id/archive`) and works. Same dead-button problem.
3. **Change scope** — works end-to-end (opens ScopeChangeDialog).

**KnowledgeDetail action bar (from docs/information-architecture):**
- Flag, Archive, Move, Merge, Split — documented but only "Change scope" is wired

**Decision for AD6:**
- **Archive**: Wire to backend `POST /:id/archive`. Show confirmation. On success, navigate back to list. This satisfies AC-3.
- **Flag**: Keep in overflow menu but wire to backend `POST /:id/flag`. Needs a reason prompt (the API requires a reason string).
- **Merge/Split**: API endpoints exist and work, but these are agent operations. Remove from user-facing overflow menu. Endpoints stay for agent use. This satisfies AC-2.

## 6. Archive behavior (AC-3)

Current state: `KnowledgeOverflowMenu` has an "Archive" button that calls `closeOverflow` — a no-op. The backend `POST /:id/archive` endpoint works correctly (sets status to "archived", logs to knowledgeEditLog, emits event).

Required: clicking Archive should call the backend, then either:
- (a) Navigate back to the list (simple, clear)
- (b) Show an inline "Archived" state with an "Undo" action (more graceful)

**Decision: Option (a) with a brief toast/banner.** Archive calls `POST /:id/archive`, shows a brief success indicator, and navigates to `/knowledge`. "Undo" would require an unarchive endpoint (PATCH status back to "active") which exists implicitly (PATCH /:id can set status), but the undo UX adds complexity. For AD6, archive is a simple destructive action. The item remains in the database and can be found via filters or restored manually.

## 7. Summary of concept decisions

| Question | Decision |
|---|---|
| Backend model changes? | None. |
| User-facing scope options | 3: Shared (factory), Team (team), Private (user) |
| What about product/practice/bet/task? | Hidden from create picker. Bet/task items show in list with contextual labels. product/practice available via ScopeChangeDialog for power users. |
| Kind in UI? | Removed from create flow and list rows. Read-only in detail metadata when present. |
| Topic vs scope merged? | No. Keep separate — scope=visibility, topic=subject. |
| Dead buttons? | Archive wired to backend. Flag wired to backend with reason prompt. Merge/Split removed from UI. |
| Archive UX? | Call endpoint, navigate to list. No undo for AD6. |
| Data migration? | None needed. |
