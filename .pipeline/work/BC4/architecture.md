# BC4 — architecture: document as a module

Technical reading of `.pipeline/work/BC4/plan.md`. The plan owns what is wanted and how the program
works. This file owns the contracts, the schema, the block order and the verification.

Everything below is written against code read in this worktree (`feature/document-module`, based on
`2b1ef9b18`). `file:line` citations are load-bearing; anything I could not check is marked
`UNVERIFIED`.

---

## 0. Plan amendments proposed

Four. Each is a decision the plan does not settle and that I could not take without the founder.

**A1 — the three legacy bus events are DELETED, not renamed or kept.**
`knowledge_created · knowledge_updated · knowledge_archived` have exactly one subscriber:
the generic routine event matcher (`layers/core-api/routine/src/routine-scheduler.ts:484-506`). The
generic websocket forwarder for them was already dropped (`layers/core-api/src/ws-connection-hub.ts:43`
records it: *"had zero real frontend consumers (verified) and are dropped entirely"*). No routine in
any seed, plugin or demo world names them (searched `tools/setup`, `plugins/`, `tools/eval` — zero
hits), and there are no deployments. So there is **no live subscriber**, and the "a legacy event name
survives only because a live subscriber needs it" test fails for all three.
Consequence: **a routine can no longer trigger on a document change** until BC5's subscriptions read
`changes` rows. That is a capability removal the plan does not list.
Fallback if the founder says no: keep the three names, emit them from `edit_document` post-commit
(one extra emit site, `ports.knowledge.getItemById` survives as `ports.document.getById`) — that is
~40 lines kept, everything else in this file is unaffected.

**A2 — narrowing a document's scope is REFUSED when a child is wider, not cascaded.**
Today `cascadeScopeNarrowing` (`layers/core-api/knowledge/src/knowledge-repository.ts:167-203`)
silently rewrites every wider descendant. The plan's own words for the invariant are *"does a narrower
scope fit the children"* — a check, not a cascade — and a cascade writes N rows with no `changes` row
and no actor, which contradicts "one edit, one transaction, one change row". I read the plan as the
check and delete the cascade. This is a visible behaviour change: an edit that used to succeed now
returns problem `scope_narrows_past_children`.

**A3 — `edit_document` is an upsert on `id`.**
`edit_task` refuses a missing id with `not_found` because task ids are server-minted. Three live
document writers mint their own ids — the plugin installer (`<pluginId>/<dir>`), agent identity
(`ki_af_<agentId>`), routine prompts — and without a caller-chosen id on create they cannot go
through `edit_document` at all, which would force a fourth public action. So: `id` absent ⇒ new uuid;
`id` present and the row exists ⇒ edit; `id` present and the row does not exist ⇒ create with that id.
Cost: a typo'd id silently creates a document instead of erroring.

**A4 — `write_memory`'s default scope changes from team to private.**
Today `write_memory` defaults `scopeKind` to the agent's team
(`layers/agent-orchestration/tool-handlers/src/tool-definitions.ts:91-97`), so an agent "memory" is
team-wide. Founder ruling 4/5 says a memory is private to its writer, so `as: "memory"` forces
`scopeKind:'user'`, `scopeId = ctx.actor`, and an explicit scope alongside it is a problem. Memories
written before this item keep whatever scope they had; nothing rewrites them.

---

## 1. AC-to-obligation map

The plan states no numbered ACs; its gate list is the acceptance surface. Each row maps a gate line to
the blocks that satisfy it.

| Gate line (plan "Gate, before ship") | Blocks |
|---|---|
| Knowledge section lists, opens, creates, edits, moves, archives, triages through the list | B16–B21 |
| A second window updates live | B9, B18, B19 |
| A stale edit is refused with its reason | B7, B19 |
| An agent writes a memory and an artifact and reads a document through the three tools | B6, B7, B15, B33 |
| The governance rule is green with the document entries gone from the legacy lists | B24, B25 |
| Line count clearly negative | §14 |
| Verification: seam test, real-socket test, migration test, harness lane, full e2e | B7, B9, B2, B33, B34 |

---

## 2. Vocabulary, locked

| Old | New | Where |
|---|---|---|
| knowledge item | **document** | everywhere |
| `knowledge_items` (table) | `documents` | migration 0086 |
| `KnowledgeItem` (row type) | `DocumentRow` | `@hyperidle/db` `$inferSelect` |
| `knowledgeItems` (drizzle symbol) | `documents` | `framework/db/src/schema.ts` |
| `role` (column + vocabulary) | **`slot`** | see below |
| `parentKind` value `knowledge_item` | `document` | migration 0086 |
| `threads.host_kind` value `knowledge_item` | `document` | migration 0086 |
| `@hyperidle/knowledge` | `@hyperidle/document` | package name |
| `assembleSessionKnowledge` | `assembleSessionDocuments` | read model |
| events `knowledge_*` | deleted (A1) | — |

**`role` → `slot`.** The column's values (`ordinary · skill · rule · agent_file · prompt`) say *where
the document lands*, and the DB already calls it that (`ki_parent_slot_uq`,
`framework/db/src/schema.ts:934`). `role` collides with two live, different axes — `users.role` (what
an agent does) and `agent-roles.ts`'s `roleLabel`. `slot` removes the collision and matches the
invariant's own name ("is a named slot free"). Values are unchanged; `ordinary` means "no slot".

**The `Document` name collision.** `Document` is a DOM global in `layers/core-ui`. The data type is
therefore **never** called `Document`. Locked names:

- row type on the wire and in the UI: **`DocumentRow`** (`DocumentRowSchema`);
- list row: **`DocumentListRow`**;
- open's payload: **`DocumentView`**;
- component/page names keep the readable form (`DocumentDetail`, `DocumentList`, `DocumentCreate`) —
  a component is not a type, and `DocumentDetail` shadows nothing.

`DocumentRow` is also what the drizzle `$inferSelect` export is called, so there is one name for one
shape across framework, server and browser.

---

## 3. The declaration — `framework/domain-model/src/actions/document.ts`

Everything public about a document. The UI imports this file; `core-ui` may not import `core-api`.

### 3.1 Vocabulary (moves here from `framework/domain-model/src/knowledge.ts`)

```ts
export const DOCUMENT_STATUSES = ["proposed", "active", "stale", "archived"] as const;
export type DocumentStatus = (typeof DOCUMENT_STATUSES)[number];

export const DOCUMENT_SLOTS = ["ordinary", "skill", "rule", "agent_file", "prompt"] as const;
export type DocumentSlot = (typeof DOCUMENT_SLOTS)[number];

export const DOCUMENT_PARENT_KINDS = ["document", "task", "thread", "routine", "agent"] as const;
export type DocumentParentKind = (typeof DOCUMENT_PARENT_KINDS)[number];

/** The word an agent uses. Derived on read, never stored. */
export const DOCUMENT_AS = ["memory", "artifact", "document"] as const;
export type DocumentAs = (typeof DOCUMENT_AS)[number];

export const DOCUMENT_STATUS_LABEL: Record<DocumentStatus, string>;   // unchanged values
export const DOCUMENT_SLOT_LABEL: Record<DocumentSlot, string>;       // unchanged values
```

`framework/domain-model/src/knowledge.ts` (85 lines) is deleted; `KNOWLEDGE_SORT_OPTIONS`,
`KnowledgeAccessorKind` and `PropagationLevel` go with it — grep shows no production reader of any of
the three outside the deleted surfaces (`UNVERIFIED` only for `PropagationLevel`, which has no
production reader at all).

### 3.2 The row

```ts
export const DocumentRowSchema = z.object({
  id: z.string(),
  title: z.string(),
  body: z.string(),
  format: z.string(),                       // free text in the column; "markdown" in practice
  status: z.enum(DOCUMENT_STATUSES),
  slot: z.enum(DOCUMENT_SLOTS),
  scopeKind: z.enum(SCOPE_KINDS),           // factory | team | user
  scopeId: z.string().nullable(),
  parentKind: z.enum(DOCUMENT_PARENT_KINDS).nullable(),
  parentId: z.string().nullable(),
  position: z.number().int(),
  version: z.number().int(),
  updatedBy: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
  /** Derived, never stored — see §3.6. */
  as: z.enum(DOCUMENT_AS),
});
export type DocumentRow = z.infer<typeof DocumentRowSchema>;
```

`confidence` and `meta` are columns (§6.2) but are **not** on `DocumentRowSchema`: their only reader is
the session read model, which reads the table directly. Keeping them off the wire keeps the row the
UI sees exactly the row a person edits.

### 3.3 `search_documents`

```ts
export const SearchDocumentsInputSchema = z.object({
    ids:    z.array(z.string()).optional(),
    text:   z.string().min(1).optional(),      // ILIKE over title and body
    /** roots + document-parented rows only — the browsable tree. */
    inTree: z.boolean().optional(),
    parent: z.object({
      kind: z.enum(DOCUMENT_PARENT_KINDS),
      id:   z.string().min(1).optional(),
      ids:  z.array(z.string().min(1)).min(1).optional(),   // exactly one of id/ids
    }).optional(),
    slot:      z.enum(DOCUMENT_SLOTS).optional(),
    status:    z.enum(DOCUMENT_STATUSES).optional(),
    scopeKind: z.enum(SCOPE_KINDS).optional(),
    as:        z.enum(DOCUMENT_AS).optional(),
    limit:  z.number().int().min(1).max(500).optional(),   // default 200
    offset: z.number().int().min(0).optional(),
  }).strict();

export const DocumentListRowSchema = DocumentRowSchema;   // same shape; no extra join
export const searchDocuments: ActionDeclaration<SearchDocumentsInput, DocumentRow[]> = {
  name: "search_documents",
  sentence:
    "Search documents. No parameter lists the ones you can see; filter by text, parent, status, " +
    "scope, slot, or by what it is — a memory of yours, an artifact, or a document in the tree.",
  input: SearchDocumentsInputSchema,
  output: z.array(DocumentRowSchema),
};
```

### 3.4 `open_document`

```ts
export const OpenDocumentInputSchema = z.object({ id: z.string().min(1) }).strict();

export const DocumentViewSchema = z.object({
  document:  DocumentRowSchema,
  /** Root-first breadcrumb; stops at the first non-`document` parent. */
  ancestors: z.array(DocumentRowSchema),
  /** Direct children, `position` then `title`. */
  children:  z.array(DocumentRowSchema),
  /** Same parent, this one excluded, same order. */
  siblings:  z.array(DocumentRowSchema),
  /** Human-readable scope: "Factory" / a team name / a person's name. Response-only. */
  scopeName: z.string(),
});
export const openDocument: ActionDeclaration<OpenDocumentInput, DocumentView> = {
  name: "open_document",
  sentence: "Open a document: its text, where it sits, what is under it and what sits beside it.",
  input: OpenDocumentInputSchema,
  output: DocumentViewSchema,
};
```

`ancestors`/`children`/`siblings` carry full rows, not `{id,title}` pairs — the detail page renders
status and scope chips for each and would otherwise need a second call. All three are subject to the
same visibility filter as search (§5.1), which closes today's hole where a parent's page leaked a
team-scoped child's title (`knowledge-repository.ts:1296-1309` applies it; `{byParent}` at
`:1311-1329` does not).

### 3.5 `edit_document`

```ts
export const EditDocumentInputSchema = z.object({
    /** Absent ⇒ create with a new uuid. Present ⇒ edit, or create with that id (A3). */
    id: z.string().min(1).optional(),
    title:  z.string().min(1).optional(),
    body:   z.string().optional(),
    format: z.string().min(1).optional(),         // default "markdown" on create
    status: z.enum(DOCUMENT_STATUSES).optional(), // default "proposed" on create
    /** What this is. Create-only; on an edit it must match what the row already is. */
    as: z.enum(DOCUMENT_AS).optional(),           // default "document"
    /** Create-only. A slotted document may never change slot or parent (§4 I10). */
    slot: z.enum(DOCUMENT_SLOTS).optional(),      // default "ordinary"
    scopeKind: z.enum(SCOPE_KINDS).optional(),
    scopeId:   z.string().nullable().optional(),
    /** A move. `null` ⇒ to the top of the tree. Absent ⇒ no move. */
    parent: z.object({
      kind: z.enum(DOCUMENT_PARENT_KINDS),
      id:   z.string().min(1),
    }).nullable().optional(),
    position: z.number().int().nonnegative().optional(),
    /** Optimistic lock, compared against the stored `version`. */
    version: z.number().int().positive().optional(),
  }).strict();

export const editDocument: ActionDeclaration<EditDocumentInput, DocumentView> = {
  name: "edit_document",
  sentence:
    "Write a document, new or existing: its title, text, status, scope, where it sits. " +
    "Say `as: \"memory\"` for a private note only you get back, `as: \"artifact\"` for output of " +
    "the task or conversation you are in, `as: \"document\"` for the shared tree. " +
    "Pass the version you read to be told if someone else saved first.",
  input: EditDocumentInputSchema,
  output: DocumentViewSchema,     // same shape open_document returns
};

export const DOCUMENT_ACTIONS = {
  search_documents: searchDocuments,
  open_document: openDocument,
  edit_document: editDocument,
} as const;
```

Deliberately **not** on the input: `updatedBy` (it is `ctx.actor`), `merge`, `split`, `promote`,
`graduate`, `reason`, `conflict`. Archive is `status: "archived"`. Restore is `status: "active"`.
Graduate is `parent`. Validate/reject are `status`.

### 3.6 `as` — how it maps to columns, and how it is derived back

**Write.**

| `as` | scopeKind / scopeId | parent | slot |
|---|---|---|---|
| `memory` | `user` / `ctx.actor`, always | forced `null` | forced `ordinary` |
| `artifact` | input, else the actor's team (`team`/`teamId`), else `factory` | input, else stamped `{kind:"task", id: ctx.caller.taskId}` when the session has one, else `{kind:"thread", id: ctx.caller.threadId}` | input, default `ordinary` |
| `document` | input, else the actor's team, else `factory` | input (may be `null`) | input, default `ordinary` |

The team default reproduces today's `write_memory`/`create_artifact` rule
(`tool-definitions.ts:88-97`, `:735-745`), where `ctx.teamId` is the **agent's** baked team
(`provisioner.ts:1088` `agentConfig.teamId`), read here through `deps.users.getUserById(actor).teamId`
so the module needs no task read and no crossing to the task module.

The artifact stamp is the same server-side stamp `send_message` uses for `review.taskId`
(`framework/domain-model/src/actions/thread.ts:125-131`): it comes from `ctx.caller`, which
`actionsAsTools` fills from the session's `ToolContext` and nothing else
(`layers/core-api/src/actions/actions-as-tools.ts:25-31`). An HTTP caller has no `ctx.caller`, so a
person attaching an artifact names the parent explicitly.

**Read** — total, unambiguous, evaluated in order:

```ts
export function documentAs(row: { parentKind: string | null; scopeKind: string; slot: string }): DocumentAs {
  if (row.parentKind === "task" || row.parentKind === "thread") return "artifact";
  if (row.scopeKind === "user" && row.slot === "ordinary") return "memory";
  return "document";
}
```

`as` in a **search filter** is translated to the same predicates, never to a post-filter (a post-filter
shortens a paginated page — the mistake `ListFilters.role` already documents at
`knowledge-repository.ts:296-303`):

- `artifact` → `parent_kind IN ('task','thread')`
- `memory` → `scope_kind = 'user' AND slot = 'ordinary'`
- `document` → `NOT(parent_kind IN ('task','thread')) AND NOT(scope_kind='user' AND slot='ordinary')`

---

## 4. Invariants

Pure ones live in the declaration and run twice: in the browser to grey a control with its reason, and
on the server as the first pass. DB-dependent ones run inside `edit_document.run`. Every one has a
stable `code`; the red case named beside it is the assertion a test must make with exact equality on
`problems[0].code` — never `toContain` (BC3 retro: *"tests asserted too loosely to fail"*).

### 4.1 Pure — `editDocumentInvariants(input, prev, caller)`

`prev` is `DocumentRow | null`; `caller` is `{ hasCallingTask: boolean; hasCallingThread: boolean }`.

| # | code | message | red case |
|---|---|---|---|
| I1 | `title_required` | A document needs a title. | create with `title: "   "` |
| I2 | `empty_edit` | An edit must change something. | `{ id }` alone |
| I3 | `memory_scope_fixed` | A memory is private to you — it has no scope to set. | `as:"memory", scopeKind:"team"` |
| I4 | `memory_has_parent` | A memory sits on its own; it has no parent. | `as:"memory", parent:{kind:"document",id}` |
| I5 | `artifact_parent_kind` | An artifact hangs off a task or a conversation. | `as:"artifact", parent:{kind:"document",id}` |
| I6 | `artifact_no_parent` | Name the task or conversation this belongs to. | `as:"artifact"`, no parent, `caller` has neither |
| I7 | `scope_needs_id` | A team-scoped document needs a team. | `scopeKind:"team"` with no `scopeId` |
| I8 | `as_is_create_only` | What a document is cannot change after it is written. | `as:"memory"` on a row whose derived `as` is `document` |
| I9 | `slot_is_create_only` | A document's slot cannot change after it is written. | `slot:"skill"` with `prev.slot === "ordinary"` |
| I10 | `slotted_document_cannot_move` | A skill, rule, identity or prompt stays where it was attached. | `parent:{…}` with `prev.slot !== "ordinary"` |
| I11 | `self_parent` | A document cannot be its own parent. | `parent.id === input.id` |
| I12 | `status_from_archived` | Reopen the document before changing anything else on it. | `prev.status==="archived"` and a field other than `status` changes |

I8 needs `prev`'s derived `as`; the browser has it from `open_document`, the server derives it from the
loaded row. I12 replaces today's `ItemDeletedError` semantics and is the only place archive is special.

### 4.2 DB-dependent — inside `edit_document.run`

| # | code | message | red case |
|---|---|---|---|
| D1 | `not_found` | Document `<id>` not found. | open/edit a visible-to-nobody id |
| D2 | `parent_not_found` | No `<kind>` with id '`<id>`'. | `parent:{kind:"task", id:"nope"}` |
| D3 | `cycle` | That would put the document inside itself. | move a root under its own grandchild |
| D4 | `depth_exceeded` | Documents nest 32 deep at most. | a 32-deep chain, then one more |
| D5 | `slot_taken` | That `<slot>` place on this `<kind>` is already taken. | a second `prompt` on one routine |
| D6 | `scope_too_wide` | This document reaches further than the one it would sit under. | factory child under a team parent |
| D7 | `scope_narrows_past_children` | Something inside this reaches further than that; move or rescope it first. | narrow a parent to `user` with a `team` child (A2) |
| D8 | `stale` | The document changed since you read it — open it again and retry. | two edits, second carries version 1 |
| D9 | `forbidden_parent` | You cannot see the document you named as a parent. | parent is another person's memory |

`not_found` covers invisibility too: a memory that is not yours answers `not_found`, never
`forbidden`, so its existence does not leak — today's rule
(`layers/core-api/src/routes/knowledge.ts:386-395`), kept.

### 4.3 The combined cases, written out

The BC3 retro's second lesson: two rules that each look right and together do the wrong thing. Each of
these gets its own test with its own exact-code assertion.

1. **scope change + children (A2/D7).** Narrowing `factory → team` on a parent with a `factory` child
   is refused; the parent is not written and the child is not touched. Assert both: `problems[0].code
   === "scope_narrows_past_children"` **and** a re-read of the parent shows the old `scopeKind` and the
   old `version`.
2. **move + slot uniqueness (I10/D5).** A move of a `prompt` document is refused by I10 before D5 is
   ever consulted — so the `slot_taken` path can only be reached at create. Assert the code is
   `slotted_document_cannot_move`, not `slot_taken`.
3. **`as:"artifact"` + an explicit parent (I5).** An explicit `task`/`thread` parent wins over the
   stamp; an explicit `document` parent is refused. Assert that with a calling task in `ctx.caller`
   **and** an explicit thread parent, the stored `parentId` is the explicit thread, not the session's
   task.
4. **stale version + a partial edit (D8).** A stale edit writes nothing at all — not the fields that
   would not have conflicted. Assert the code **and** that `title` still holds the first writer's value.
5. **memory + `slot` (I3/I9).** `as:"memory", slot:"skill"` on create: the slot is forced to
   `ordinary`; assert the stored row's `slot === "ordinary"` and that no problem is raised (the forcing
   is silent, the scope forcing is not — scope is a thing a caller can mean, a slot on a memory is not).
6. **upsert-with-id + stale (A3/D8).** `{ id: "brand-new", version: 3 }` — the row does not exist, so
   `version` has nothing to compare against. Locked: a `version` on a create is **ignored**, not an
   error. Assert the row is created.

---

## 5. Read models

### 5.1 The one search query

One statement, one `WHERE`, no N+1, no post-filter. Built from three parts:

```
SELECT * FROM documents
WHERE  <visibility>              -- always
  AND  <shape>                   -- inTree / parent / as
  AND  <fields>                  -- text, slot, status, scopeKind, ids
ORDER BY position, title         -- when inTree or parent is given
      or updated_at DESC, id     -- when text is given
LIMIT  <limit ?? 200> OFFSET <offset ?? 0>
```

**`<visibility>`** — one predicate, replacing today's three (`visibleToViewer`,
`scopeVisibleCondition`, `humanVisibleCondition`, `knowledge-repository.ts:1072-1203`) and the
unfiltered `{byParent}` hole:

```
(scope_kind <> 'user' OR slot <> 'ordinary' OR scope_id = ANY(:subjects))
AND (scope_kind <> 'team' OR scope_id = :viewerTeamId)
```

`:subjects` = `[ctx.actor, ...ids of agents whose users.ownerUserId = ctx.actor]`, resolved once per
call through `deps.users.listOwnedBy` (the same dep `thread` already declares,
`layers/core-api/thread/src/thread-actions.ts:77`). This is founder ruling 5 stated once.

Two deliberate changes from today: the subject is **`scope_id`**, not `updated_by`. Today
`visibleToViewer` keys on `updated_by` (`knowledge-repository.ts:1076`), so a private note becomes
*someone else's* the moment they edit it; and an agent's memory (`scope_id = agentId`) is visible to
nobody at all, because `updated_by` is `agent:<id>` and no one's viewer id equals it. `scope_id` is
what "whose is this" actually means.

**`<shape>`**

| input | predicate |
|---|---|
| `inTree: true` | `parent_kind IS NULL OR parent_kind = 'document'` |
| `parent: {kind, id}` | `parent_kind = :kind AND parent_id = :id` |
| `parent: {kind, ids}` | `parent_kind = :kind AND parent_id = ANY(:ids)` |
| `as` | §3.6 |
| none | no parent predicate |

`inTree` and `parent` together is a `two_shapes` pure problem.

### 5.2 Who calls search, with what

| Surface | file | call |
|---|---|---|
| Documents list page | `pages/DocumentList.tsx` | `search_documents({ inTree: true })` |
| Triage filter on that page | same | client filter on `status` of the same result |
| "Memories" filter on that page | same | `search_documents({ as: "memory" })` — a filter, no new page |
| Sidebar fast-nav | `shell/Sidebar.tsx`, `layouts/AppShell.tsx:624` | `search_documents({ inTree: true, limit: 50 })` |
| Parent picker | `pages/document/ParentPicker.tsx` | `search_documents({ inTree: true })` |
| Move dialog | `pages/document/MoveDialog.tsx` | reuses the picker |
| Settings skills & rules | `settings/DocumentSlotList.tsx` | `search_documents({ slot: "skill" })` + `({ slot: "rule" })` |
| Artifacts section | `components/ArtifactSection.tsx` | `search_documents({ parent: { kind, id } })` |
| Global search | `routes/search.ts` | `search_documents({ text, limit: 5 })` in-process |
| Agent identity list | `routes/agents.ts` | `search_documents({ parent: { kind:"agent", ids }, slot:"agent_file", status:"active" })` |
| Routine prompt list | `routes/routines-routes.ts` | `search_documents({ parent: { kind:"routine", ids }, slot:"prompt" })` |
| Plugin contributions | `routes/plugins.ts` | `search_documents({ ids })` |
| Task/thread attachments | `actions/compose.ts` | `search_documents({ parent: { kind:"task", id } })` |

### 5.3 The session read model

`assembleSessionDocuments(db, { teamId?, agentRole, taskDescription, agentId })` →
`readonly SessionDocument[]`. This is `session-knowledge-assembler.ts` (399) + `token-budget.ts` (74)
+ `scoring-config.ts` (52) folded into **one** file `layers/core-api/document/src/session-documents.ts`,
behaviour-preserving, with the projection LEFT JOINs dropped (the two columns are on the table now,
§6.2) — about 380 lines, −145.

Its callers are unchanged in shape: both already inject it.

- `layers/core-api/src/services/task-run-resolver-bindings.ts:15,29` — `assembleSessionKnowledge`
  becomes `assembleSessionDocuments` in `taskRunResolverDeps`.
- `layers/core-api/src/services/routine-scheduler-bindings.ts:29` — same, in the routine ports bag.

It is **not** reachable through `search_documents`: it ranks and budgets, it ignores viewer visibility
(it is the agent's own bundle), and it returns `parentChain` per item. Keeping it a named read model
inside the module is exactly what the plan asks for ("it becomes a read model inside the document
module that the two run resolvers call").

---

## 6. Persistence

### 6.1 The table

```ts
export const documents = pgTable("documents", {
  id: text("id").primaryKey(),
  scopeKind: text("scope_kind").notNull().default("factory"),
  scopeId: text("scope_id"),
  title: text("title").notNull(),
  body: text("body").notNull(),
  format: text("format").notNull(),
  status: text("status").notNull(),
  version: integer("version").notNull().default(1),
  slot: text("slot").notNull().default("ordinary"),
  parentKind: text("parent_kind"),
  parentId: text("parent_id"),
  position: integer("position").notNull().default(0),
  /** Ranking signal, read only by `session-documents.ts`. */
  confidence: text("confidence"),
  /** `{tags:[…]}` — read only by `session-documents.ts`'s tag match. */
  meta: text("meta"),
  updatedBy: text("updated_by").notNull(),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
}, (t) => [
  index("doc_scope_idx").on(t.scopeKind, t.scopeId),
  index("doc_status_idx").on(t.status),
  index("doc_updated_desc_idx").on(t.updatedAt),
  index("doc_slot_idx").on(t.slot),
  index("doc_parent_idx").on(t.parentKind, t.parentId),
  index("doc_parent_position_idx").on(t.parentKind, t.parentId, t.position),
  uniqueIndex("doc_parent_slot_uq").on(t.parentKind, t.parentId, t.slot).where(sql`${t.slot} <> 'ordinary'`),
  check("doc_slot_ck", sql`${t.slot} IN ('ordinary','skill','rule','agent_file','prompt')`),
  check("doc_parent_kind_ck", sql`${t.parentKind} IS NULL OR ${t.parentKind} IN ('document','task','thread','routine','agent')`),
  check("doc_parent_pair_ck", sql`(${t.parentKind} IS NULL AND ${t.parentId} IS NULL) OR (${t.parentKind} IS NOT NULL AND ${t.parentId} IS NOT NULL)`),
]);
export type DocumentRow = typeof documents.$inferSelect;
```

### 6.2 Why `confidence` and `meta` survive and the rest of the projection does not

Derived by reading every production reader of `knowledge_app_projection`:

| column | production reader | verdict |
|---|---|---|
| `scope_id` | `mergeWithProjection` (`knowledge-repository.ts:376`) — `projection.scopeId ?? item.scopeId` | duplicate of the kernel column. **Dropped**, after a one-time reconcile in the migration. |
| `confidence` | `computeConfidence` (`session-knowledge-assembler.ts:117-131`), a real term in the weighted score | **folded onto `documents`** |
| `meta` | `extractItemTags` (`session-knowledge-assembler.ts:50-71`) | **folded onto `documents`** — see note |
| `relevance_score` | none | **dropped** |
| `citation_count` | none (only the demo seed writes it) | **dropped** |
| `last_cited_at` | none | **dropped** |

Note on `meta`: today's only caller passes `taskTags: []`
(`session-knowledge-assembler.ts:373`), and `computeTagMatch` returns 0 before ever reading tags
(`:78-81`), so `meta` contributes nothing *in practice*. Deleting the column would mean deleting
`computeTagMatch`, which changes `totalWeight` (`:150`) and therefore every score an agent's bundle is
ranked by. That is a ranking change nobody asked for, for the sake of one `text` column. Both columns
ride along; the scoring math is byte-identical.

### 6.3 `changes`

`changes.object` already admits `'document'` (`framework/db/src/schema.ts:591`) and
`changes.kind` already admits `'created'`/`'changed'` (`:596`). No schema work.

One row per `edit_document`, in the write's transaction, shaped exactly like task's and thread's:
`{ id, object:'document', objectId, kind, actor, before, after, at }`, with `before`/`after` carrying
**only the fields that differ plus `id`** (`task-actions.ts:190-208`, reused verbatim).

**The body rides the row.** `body` is a field like any other, so an edit that changes text puts the old
and the new text in the row. That is deliberate and is what makes the plan's "the change rows hold it
if one is ever wanted" true, and what lets the edit log be deleted. Cost, stated: the `changes` table
grows by roughly twice the size of every body edit. The `conversations` precedent
(`thread-actions.ts:251-259`) stripped bodies from the **shared websocket topic**, not from the row —
and that is exactly what §7 does here.

### 6.4 Migration `0086_document_module.sql`

Hand-written, plus an entry in `framework/db/drizzle/meta/_journal.json`
(`idx: 86`, `version: "7"`, `tag: "0086_document_module"`). Old migration files are not edited.
Steps are ordered; each depends on the one before.

```sql
-- 1. the table and its column
ALTER TABLE "knowledge_items" RENAME TO "documents";
ALTER TABLE "documents" RENAME COLUMN "role" TO "slot";
ALTER TABLE "documents" RENAME CONSTRAINT "knowledge_items_pkey" TO "documents_pkey";

-- 2. constraints and indexes (drop-and-recreate for the checks, rename for the indexes)
ALTER TABLE "documents" DROP CONSTRAINT "ki_role_ck";
ALTER TABLE "documents" DROP CONSTRAINT "ki_parent_kind_ck";
ALTER TABLE "documents" DROP CONSTRAINT "ki_parent_pair_ck";
ALTER INDEX "ki_scope_idx"            RENAME TO "doc_scope_idx";
ALTER INDEX "ki_status_idx"           RENAME TO "doc_status_idx";
ALTER INDEX "ki_updated_desc_idx"     RENAME TO "doc_updated_desc_idx";
ALTER INDEX "ki_role_idx"             RENAME TO "doc_slot_idx";
ALTER INDEX "ki_parent_idx"           RENAME TO "doc_parent_idx";
ALTER INDEX "ki_parent_position_idx"  RENAME TO "doc_parent_position_idx";
ALTER INDEX "ki_parent_slot_uq"       RENAME TO "doc_parent_slot_uq";

-- 3. the parent-kind value, then the new checks
UPDATE "documents" SET "parent_kind" = 'document' WHERE "parent_kind" = 'knowledge_item';
ALTER TABLE "documents" ADD CONSTRAINT "doc_slot_ck"
  CHECK ("slot" IN ('ordinary','skill','rule','agent_file','prompt'));
ALTER TABLE "documents" ADD CONSTRAINT "doc_parent_kind_ck"
  CHECK ("parent_kind" IS NULL OR "parent_kind" IN ('document','task','thread','routine','agent'));
ALTER TABLE "documents" ADD CONSTRAINT "doc_parent_pair_ck"
  CHECK (("parent_kind" IS NULL AND "parent_id" IS NULL)
      OR ("parent_kind" IS NOT NULL AND "parent_id" IS NOT NULL));

-- 4. fold the projection's two live columns; the projection's scope_id WON on read,
--    so it wins here too (mergeWithProjection: `projection.scopeId ?? item.scopeId`).
ALTER TABLE "documents" ADD COLUMN "confidence" text;
ALTER TABLE "documents" ADD COLUMN "meta" text;
UPDATE "documents" d SET "confidence" = p."confidence", "meta" = p."meta"
  FROM "knowledge_app_projection" p WHERE p."knowledge_item_id" = d."id";
UPDATE "documents" d SET "scope_id" = p."scope_id"
  FROM "knowledge_app_projection" p
  WHERE p."knowledge_item_id" = d."id" AND p."scope_id" IS NOT NULL;

-- 5. the four tables that go
DROP TABLE "knowledge_app_projection";
DROP TABLE "knowledge_conflicts";
DROP TABLE "knowledge_access_log";
DROP TABLE "knowledge_edit_log";

-- 6. the task provenance FK
ALTER TABLE "tasks" RENAME COLUMN "source_knowledge_item_id" TO "source_document_id";
ALTER TABLE "tasks" RENAME CONSTRAINT
  "tasks_source_knowledge_item_id_knowledge_items_id_fk" TO "tasks_source_document_id_documents_id_fk";

-- 7. the thread host kind. Same trigger-suspend window migration 0085 steps 7/8 used
--    (`threads_host_immutable_trg`, migration 0007) — this writes host_kind.
ALTER TABLE "threads" DISABLE TRIGGER "threads_host_immutable_trg";
UPDATE "threads" SET "host_kind" = 'document' WHERE "host_kind" = 'knowledge_item';
ALTER TABLE "threads" ENABLE TRIGGER "threads_host_immutable_trg";

-- 8. inline refs stored inside message payloads: {"kind":"knowledge_item","id":…}
UPDATE "messages" SET "payload" = jsonb_set(
    "payload"::jsonb, '{refs}',
    (SELECT COALESCE(jsonb_agg(
        CASE WHEN r->>'kind' = 'knowledge_item' THEN jsonb_set(r, '{kind}', '"document"') ELSE r END),
      '[]'::jsonb)
     FROM jsonb_array_elements(("payload"::jsonb)->'refs') r))::text
WHERE "payload"::jsonb ? 'refs'
  AND ("payload"::jsonb)->'refs' @> '[{"kind":"knowledge_item"}]';

-- 9. the plugin contribution kind
ALTER TABLE "plugin_contributions" DROP CONSTRAINT "plugin_contributions_kind_ck";
UPDATE "plugin_contributions" SET "kind" = 'document' WHERE "kind" = 'knowledge';
ALTER TABLE "plugin_contributions" ADD CONSTRAINT "plugin_contributions_kind_ck"
  CHECK ("kind" IN ('agent','routine','document','configuration_default'));

-- 10. historical change rows name the renamed task column in their JSON diffs
UPDATE "changes" SET
  "before" = replace("before", '"sourceKnowledgeItemId"', '"sourceDocumentId"'),
  "after"  = replace("after",  '"sourceKnowledgeItemId"', '"sourceDocumentId"')
WHERE "before" LIKE '%sourceKnowledgeItemId%' OR "after" LIKE '%sourceKnowledgeItemId%';

-- 11. a baked bundle written before this migration carries `contextBundle.knowledge`
--     with `role` on each entry; the drain iterates the new shape. Same treatment
--     migration 0080 step 11 gave the same table — fail the row, never rewrite a body.
UPDATE "agent_work_intents" SET "status" = 'failed',
  "last_error" = '0086: baked contextBundle predates the document vocabulary; re-emit this intent'
WHERE "status" IN ('pending','claimed')
  AND "baked_request_json" IS NOT NULL
  AND ("baked_request_json"::jsonb) -> 'contextBundle' ? 'knowledge';
```

`plugin_contributions_kind_ck` is the real constraint name for `framework/db/src/schema.ts:1343`
— `UNVERIFIED`; the worker reads the live name with `\d plugin_contributions` on a migrated PGlite
database and uses whatever it finds, rather than guessing. Same for `knowledge_items_pkey` and
`tasks_source_knowledge_item_id_knowledge_items_id_fk`.

**Not touched, and why.** `sessions.source_correlation_json` can carry `knowledgeItemId` only for a
`knowledge_action` session, and nothing in production emits a `knowledge_action` work intent
(searched: the only occurrence of `kind: "knowledge_action"` outside type declarations is
`framework/domain-model/src/work-intent.ts:589`). `routines.event_type` can name a deleted event; no
seeded, plugin or demo routine does (A1). Old migration SQL and `meta/` snapshots are never edited.

### 6.5 The brownfield test

`framework/db/src/__tests__/migration-0086-brownfield.integration.test.ts`, copying the shape of
`migration-0085-brownfield.integration.test.ts`: apply migrations `0..85` to a fresh PGlite, hand-seed
a row in **every affected table**, then apply the real pending `0086` and assert.

Seeded pre-state, one row each: `knowledge_items` (a root, a `knowledge_item`-parented child, a
`role='prompt'` routine slot, a `role='agent_file'` identity, a `scope_kind='user'` memory);
`knowledge_app_projection` (one with `confidence`+`meta`+a non-null `scope_id` where the kernel's is
null, one with all nulls); `knowledge_edit_log`, `knowledge_access_log`, `knowledge_conflicts` (one row
each, to prove the DROPs are not blocked by their `ON DELETE RESTRICT` FKs); a task with
`source_knowledge_item_id`; a thread with `host_kind='knowledge_item'`; a message whose payload has
`refs:[{kind:"knowledge_item",id}, {kind:"task",id}]`; a `plugin_contributions` row with
`kind='knowledge'`; a `changes` row whose `after` names `sourceKnowledgeItemId`; a pending
`agent_work_intents` row with `contextBundle.knowledge`.

Assertions, each exact: the child's `parent_kind` is `'document'`; the folded `confidence`/`meta`
match; the reconciled `scope_id` is the projection's; the four tables no longer exist
(`to_regclass IS NULL`); `tasks.source_document_id` holds the id; the thread's `host_kind` is
`'document'`; the message's ref kinds are `["document","task"]` (the task ref untouched); the
contribution kind is `'document'`; the change row's `after` names `sourceDocumentId`; the intent's
status is `'failed'`.

---

## 7. The websocket nudge

Copied from thread (`thread-actions.ts:261-311`), same envelope, same nudge-and-refetch contract.

**Topics.** `document:<id>` (one document) and `documents` (global list topic, the twin of
`conversations`).

**Envelope**, per `changes` row, post-commit:

```json
{ "type": "update", "topic": "<topic>", "kind": "document.created" | "document.changed",
  "data": { "id": "<change row id>", "object": "document", "objectId": "<document id>",
            "kind": "<same>", "actor": "<user id>", "before": …, "after": …, "at": "<iso>" } }
```

**Redaction.** On `document:<id>` the frame carries the real `before`/`after`. On `documents` both are
replaced by `null` — no field values at all, not just no body. A document's **title** is as private as
its body when the document is a memory, and `documents` is a topic any signed-in identity may
subscribe to. The hooks re-run their own `call()` on any frame, so nothing needs the values. This is
stricter than `conversations` (which carries `after` for thread rows) and deliberately so.

**Authorizer** (`layers/core-api/src/ws-subscribe-authorizer.ts`):

- `GLOBAL_TOPICS` gains `"documents"`.
- `document:<id>` is allowed exactly when the subscriber could `open_document` it — the §5.1
  visibility predicate. That needs one new port on `SubscribeAuthorizerDeps`:
  `document: { getForSubscribe(db, id): Promise<{scopeKind, scopeId, slot} | undefined> }`, plus the
  owned-agent subject list. Mirror `canReadThread`'s shape: the predicate itself is a **pure exported
  function** in the declaration — `canReadDocument(subjects, viewerTeamId, row)` — imported by both
  `document-actions.ts` and the authorizer, so the socket and the read can never diverge. BC3's own
  bug report on this file (`ws-subscribe-authorizer.ts:42-52`) is exactly the divergence this avoids.

**Hooks.** `useDocument(id)` subscribes `document:<id>`; `useDocuments(filter)` subscribes `documents`.
Both `setTick(n => n+1)` on any matching frame and re-run their `call()` — verbatim `useThread.ts` /
`useThreads.ts` shape.

---

## 8. Layers, ports and the neighbours

### 8.1 The module and its deps

New package `layers/core-api/document` (`@hyperidle/document`), created by `git mv` from
`layers/core-api/knowledge` so no second copy ever exists. Files after the item:

| file | what |
|---|---|
| `src/document-store.ts` | the SQL: one search builder, one get, the tree walks, the write. Replaces `knowledge-repository.ts` (2,206). |
| `src/document-actions.ts` | `createDocumentActions(deps): readonly Action[]` — the three runs. |
| `src/session-documents.ts` | the session read model (§5.3). |
| `src/action-types.ts` | the local structural mirror of `ActionContext`/`Action`, as `thread`/`task` each have. |
| `src/index.ts` | barrel: `createDocumentActions`, `DocumentActionsDeps`, `assembleSessionDocuments`, `SessionDocument`. **Four exports.** (30-odd today.) |

```ts
export interface DocumentActionsDeps {
  readonly changes: { appendChange(exec: WriteExecutor, row: NewChange): Promise<unknown> };
  readonly users: {
    getUserById(exec: WriteExecutor, id: string): Promise<User | undefined>;
    /** agents owned by this person — founder ruling 5. */
    listOwnedBy(exec: WriteExecutor, ownerId: string): Promise<readonly User[]>;
  };
  readonly org: { getTeam(exec: WriteExecutor, q: { id: string }): Promise<Team | undefined> };
  /** Existence of a `task`/`thread` parent, asked of the module that owns it. */
  readonly parentExists: (
    ctx: ActionContext, kind: "task" | "thread", id: string,
  ) => Promise<boolean>;
  readonly wsPush?: (topic: string, envelope: unknown) => void;
}
```

`parentExists` is injected as a function, not an import — the same "a module reaches another only
through that module's actions" rule `task` obeys for `adjustThread`
(`task-actions.ts:76-89`). In `compose.ts` it is bound to `open_task` / `open_thread` runners via
`runnerFor` (`layers/core-api/src/actions/compose.ts:126-133`).

### 8.2 Build order in `compose.ts`

`document` needs `open_task`/`open_thread`; `task` needs `search_documents`; `thread` needs
`open_document`. That is a cycle if each bag is built from concrete values. It is not a cycle in
practice, because `runnerFor` returns a closure and the bags are arrays:

```
1. threadActions  = createThreadActions(… document: lazy(() => docActions) …)
2. taskActions    = createTaskActions(… document: lazy(() => docActions) …)
3. documentActions = createDocumentActions(… parentExists via runnerFor(taskActions|threadActions) …)
```

`lazy` is one line — `(ctx, input) => runnerFor(documentActions, name)(ctx, input)` closing over a
`let documentActions: readonly Action[] = []` assigned at step 3. State it in a `@lore` comment so
nobody "fixes" it into a real cycle. Returned list: `[...taskActions, ...threadActions,
...documentActions]`.

### 8.3 Every neighbour, and the exact call it makes after this item

**The rule:** a neighbour reaches documents only through the three actions, in-process, as the same
actor, through an injected runner. No neighbour imports `document-store.ts`.

| Neighbour | today | after |
|---|---|---|
| `routes/plugins.ts:113,135` — contributed ids | `contributedEntityIds(exec, id, "knowledge")` | unchanged (a settings read); the literal becomes `"document"` |
| `routes/plugins.ts` install — `upsertKnowledgeDocument` | one upsert preserving `body` | `search_documents({ids:[id]})`; absent ⇒ `edit_document({id, title, body, slot, scope, parent, status:"active"})`; present ⇒ the same **without `body`**. The "your edit wins" rule becomes a caller decision, not a hidden `onConflictDoUpdate` set. |
| `routes/plugins.ts:495` — disable/uninstall | `setKnowledgeStatus(tx, ids, "archived")` | `for (const id of ids) await editDocument(ctx, { id, status: "archived" })` — N edits, N change rows, each with the acting person as actor |
| `routes/plugins.ts:634-663` — restore | `restorePluginDocumentBody` + `clearDetached` | `edit_document({ id, body })` then `clearDetached` unchanged |
| `routes/plugins.ts` — detach on human edit | `markDetached(db, {kind:"knowledge", entityId})` at `routes/knowledge.ts:672-674` | **unresolved — §13 O1.** The route that carried this bridge is deleted, and the module may not know about plugins. B10 implements whichever answer the founder gives; my recommendation is O1(b). |
| `routes/agents.ts:31-34` | `getAgentIdentityIds`, `listItemIdsByParent`, `setKnowledgeStatus`, `upsertAgentIdentity` | `search_documents({parent:{kind:"agent",ids},slot:"agent_file",status:"active"})`; `search_documents({parent:{kind:"agent",id}})`; a loop of `edit_document({id,status})`; `edit_document({id:`doc_af_${agentId}`, title, body, slot:"agent_file", as:"document", scopeKind:"user", scopeId:agentId, parent:{kind:"agent",id:agentId}})` — **create-only semantics preserved by reading first** (identical to the plugin case) |
| `routes/org.ts:23`, `routes/users.ts:12`, `routes/teams-routes.ts:35` | `upsertAgentIdentity` | same as above, one shared local helper `seedAgentIdentity(editDocument, searchDocuments, ctx, …)` in `layers/core-api/src/routes/agent-identity.ts` (new, ~30 lines, replaces four call sites + the 41-line repository function) |
| `routes/agent-profile.ts:46` | `getAgentIdentityIds` | `search_documents({parent:{kind:"agent",ids},slot:"agent_file",status:"active"})` |
| `routes/routines-routes.ts:13-21` | `create`, `getParentedItem`, `getRoutinePrompt`, `getRoutinePromptBodies`, `listItemIdsByParent`, `setKnowledgeStatus`, `update` | `search_documents({parent:{kind:"routine",id|ids},slot:"prompt"})` for all three reads; `edit_document({parent:{kind:"routine",id}, slot:"prompt", …})` for create/update; a loop for the delete archive |
| `services/routine-scheduler-bindings.ts:28-34` | `assembleSessionKnowledge`, `getAgentIdentity`, `get`, `getRoutinePrompt`, `sweep` | `assembleSessionDocuments`; the other four become one injected `openDocument`/`searchDocuments` pair in the ports bag. **`sweep` is deleted** (unreachable — facts.md, `ports.ts:76,85`), and `ports.knowledge.getItemById` is deleted with A1. |
| `services/task-run-resolver-bindings.ts:15` | `assembleSessionKnowledge`, `getAgentIdentity` | `assembleSessionDocuments`; `getAgentIdentity` → an injected `searchDocuments({parent:{kind:"agent",id},slot:"agent_file",status:"active"})` reading `[0].body` |
| `actions/compose.ts:63-74` (thread's narrow read) | `getKnowledgeItem`, `findParent` | `openDocument` runner; `hostTitle` for a `document`-hosted thread becomes `open_document(hostId).document.title` |
| `actions/compose.ts:106-112` (task's narrow read) | `listItemIdsByParent`, `getItemById` | `searchDocuments({parent:{kind:"task",id}})` → ids; `searchDocuments({ids:[id]})` for the `sourceDocumentId` existence check |
| `routes/search.ts:29,112,292` | `search(db, query, …)` | injected `searchDocuments({ text, limit })`; the route keeps its own shape until the user module |
| `routes/knowledge.ts` (948) | eleven routes | **deleted** |

`getRoutinePrompt`'s "no status filter, on purpose" note (`knowledge-repository.ts:2045-2048`) carries
over: the routine reads pass **no** `status`, the agent-identity reads pass `status:"active"`. A test
pins each.

### 8.4 Agent side

**Deleted from `layers/agent-orchestration/tool-handlers/src/tool-definitions.ts` (808 lines):** the
six live tools `write_memory · create_artifact · promote_knowledge · create_conflict_review ·
merge_knowledge · split_knowledge`, their schemas and helpers. What is left is four tools
(`create_team · add_agent · create_routine · update_routine`) — the file drops to roughly 330 lines.
`ports.ts`'s `ToolHandlersKnowledgeAccessor` goes with them, and `tool-handlers-bindings.ts` loses its
knowledge block.

**Deleted from `framework/api-contract/src/core-api-port.ts`:** the whole `CoreApiKnowledgePort`
(`:351-383`) — all ten methods — plus its request/response types (`:213-345` region) and the
`knowledge` field on the composed port. `layers/agent-orchestration/src/services/core-api-port-composition.ts`
loses its knowledge implementation block (~90 lines).

**The three tools appear with no new code:** `actionsAsTools` loops the composed list
(`layers/core-api/src/actions/actions-as-tools.ts:12`), so `search_documents`/`open_document`/
`edit_document` become MCP tools the moment they are in `buildCoreActions`. That is how an agent gets
a *read* of a document for the first time.

**Writeback.** `layers/agent-orchestration/run-orchestration/src/writeback-processor.ts` may not
import core. It already receives core's composed action list as a **value**:
`create-server.ts:403` passes `coreApi.actionTools` into `bootAgentOrchestration`, which hands it to
`buildSessionLifecyclePorts` (`run-orchestration-composition.ts:553-566`). The same route serves the
writeback. Locked shape — one new field on `CoreApiBoot`, threaded exactly like `actionTools`:

```ts
// layers/core-api/src/boot.ts, beside `actionTools`
readonly editDocument: (
  caller: { actor: string; sessionId: string; taskId: string | null; threadId: string | null },
  input: EditDocumentInput,
) => Promise<ActionResult<DocumentView>>;
readonly openDocument: (
  caller: { actor: string },
  input: { id: string },
) => Promise<ActionResult<DocumentView>>;
```

built from the composed list with `runnerFor`, typed only through `@hyperidle/domain-model` (which
every role may name). `run-orchestration-composition.ts:571-576`'s
`buildKnowledgeWritebackPort(coreApiTransport)` and the seam it dials are **deleted**; the writeback's
`knowledge` port becomes `{ editDocument, openDocument }` bound from that value.

Writeback behaviour after the conflicts table is gone:

- **create** (`handleCreate`, `handleDirectoryChain`) → `edit_document({ title, body, format, status:"proposed", as:"document", scopeKind, parent })` as the session's agent.
- **move** (`handleCreate`'s suffix branch) → `edit_document({ id, parent })`.
- **modify** → `edit_document({ id, body, version: manifestEntry.version })`.
- **stale refused** (`problems[0].code === "stale"`) → the agent's text is **discarded**, not stored.
  The processor calls `openDocument({id})`, writes the server's `version` into the manifest entry, and
  logs one structured line through the observability adapter. The next save from the same session then
  wins. Today it wrote a `knowledge_conflicts` row that nothing ever read or resolved
  (facts.md: *"nothing ever resolves one — `status` never leaves `open`"*), so this is strictly less
  hidden state, not less capability.
- **deleted file** (`handleDelete`) → the manifest entry is dropped and **nothing is written**. A file
  removed from a sandbox is not a document deletion. `WritebackResult.conflicts` and the whole
  `recordConflict` path go (−28 lines).

`create_artifact`'s server-side task stamp moves into `edit_document` (§3.6); the writeback does not
need it (it passes an explicit parent or none).

### 8.5 Governance registries — exactly which

- **`tools/governance/table-owners.json`** — delete the five `knowledge*` rows; add
  `"documents": "document"`. `totals.tables` 33 → 29, `owned` 33 → 29.
- **`tools/governance/architecture.json`** — **no edit.** The file contains zero occurrences of
  "knowledge" (checked); package roles come from the `workspaces` globs, and `layers/core-api/document`
  matches `layers/*/*` exactly as `layers/core-api/knowledge` did.
- **`package.json` (root) `workspaces`** — no edit, same glob.
- **`tools/governance/src/rules/actions-projected.ts`** —
  - `LEGACY_ROUTES`: delete the eleven `layers/core-api/src/routes/knowledge.ts|…` rows (`:165-175`).
    `routes/search.ts|GET /` stays.
  - `LEGACY_TOOLS`: delete `create_artifact`, `create_conflict_review`, `merge_knowledge`,
    `promote_knowledge`, `split_knowledge`, `write_memory` (`:227-235`). Five entries remain.
  - `LEGACY_EVENTS`: delete `knowledge_created`, `knowledge_updated`, `knowledge_archived`
    (`:257-259`) (A1).
  - `OBJECT_EVENTS` already holds `document.created`/`document.changed` (`:102-103`) — no edit.
  - Clause 1 will then demand a `call("search_documents"…)`, `call("open_document"…)` and
    `call("edit_document"…)` site under `layers/core-ui/src/` — satisfied by the hooks (§9).
- **`tools/governance/src/rules/retired-surfaces-absent.ts`** — `:60-79`: four entries name
  `attention-score`, `recomputeAttentionScoreForKnowledgeItem`, `makeRunKnowledgeSweepTool`,
  `countKnowledgeItems`. All four still hold after this item (nothing re-creates them) — **no edit**,
  and none of their tokens is in the rename map.
- **`tools/governance/src/rules/artifact-is-not-a-storage-concept.ts`** — its six `why` strings say
  "knowledge item"; the rename wave rewrites the prose, not the tokens. Its `token` regexes name
  `artifacts`, not knowledge — no behavioural edit.
- **`tools/governance/src/lib/governance-attacks.ts`** — the Ruling-13 companion fixture
  (`:635-666`) exists *because* `knowledgeItems`+`knowledgeAppProjection` were a companion pair. With
  the projection gone the pair is gone: that attack case must be **re-pointed at a surviving companion
  pair** (derive one by scanning the owners' own writers, as the rule's own note says) or deleted if
  none exists. `:781-803` and `:1249-1257` name `@hyperidle/knowledge` /
  `layers/core-api/src/routes/knowledge.ts` and must be re-pointed at a surviving package and a
  surviving `LEGACY_ROUTES` file. **A worker must run `npm run lint` here — the attack suite is what
  proves the rule can still go red.**
- **`tools/governance/src/lib/crossing-detectors.ts:381-401`** — the companion-group comment names the
  three deleted tables. Comment only; the groups are derived.
- **`tools/governance/misplaced-files.json`** — delete the single
  `layers/core-ui/src/fixtures/knowledge-data.ts` row. The file is deleted (B22), so the entry becomes
  a finding if left.
- **`tools/repo-gates/mock-inventory/inventory.json` + `inventory.md`** — delete the five rows for
  `fixtures/knowledge-data.ts` and `KnowledgeDetail.tsx` (`LEGACY_DETAILS`, `LEGACY_SOURCES`,
  `FALLBACK_DETAIL`). Run `npm run mock-inventory:check` to regenerate rather than hand-editing.
- **`knip.json`** — contains no knowledge entry (checked). The four-export barrel may surface new
  unused-export findings; the fix is to delete the export, never to add an ignore.

---

## 9. The browser

`core-ui` imports the declaration and calls `call()`. No new UI, no rebuild — the plan's "screens
follow, not rebuilt".

### 9.1 Shared types replace the four hand-copied shapes

Deleted: `pages/KnowledgeList.tsx:110` `ApiKnowledgeItem`, `:135` `ApiKnowledgeListResponse`,
`settings/KnowledgeRoleList.tsx:48` `ApiKnowledgeItem`, `hooks/useKnowledgeItem.ts:16`
`KnowledgeItemData`. All four become `DocumentRow` / `DocumentView` from `@hyperidle/domain-model`.

### 9.2 Every file in facts.md §UI

| file | what happens |
|---|---|
| `pages/KnowledgeList.tsx` (879) | `git mv` → `pages/DocumentList.tsx`; `useFetch("/api/knowledge")` → `useDocuments({inTree:true})`; the archive `apiFetch` at `:737` → `call("edit_document",{id,status:"archived",version})`; the client-side `role !== skill/rule` filter is already server-side |
| `pages/KnowledgeDetail.tsx` (1,271) | `git mv` → `pages/DocumentDetail.tsx`; **the fixture import at `:63` and `LEGACY_DETAILS`/`LEGACY_SOURCES`/`FALLBACK_DETAIL` are deleted** — an honest empty state replaces them; `useAutoSave({endpoint:"/api/knowledge/:id"})` → `call("edit_document", …)`; archive `apiFetch` → the same; version-clash banner is driven by `problems[0].code === "stale"` |
| `pages/KnowledgeCreate.tsx` (295) | `git mv` → `pages/DocumentCreate.tsx`; POST → `call("edit_document", {…})` |
| `pages/knowledge/*` (7 files + 7 stories) | `git mv` the directory → `pages/document/`; `KnowledgeBody`→`DocumentBody`, `KnowledgeTreeList`→`DocumentTreeList`, `build-knowledge-tree.ts`→`build-document-tree.ts`; `MoveDialog`/`ScopeChangeDialog`'s `apiFetch` PATCH → `call("edit_document", …)`; `ParentPicker`'s `useFetch("/api/knowledge")` → `useDocuments({inTree:true})` |
| `settings/KnowledgeRoleList.tsx` (265) | `git mv` → `settings/DocumentSlotList.tsx`; three `apiFetch` sites → `useDocuments({slot})` + `call("edit_document", …)` |
| `settings/SettingsSkillsAndRules.tsx` | re-point the import/name only |
| `components/ArtifactSection.tsx` | `useParentedKnowledgeItems` → `useDocuments({parent:{kind,id}})` |
| `hooks/useParentedKnowledgeItems.ts` (29) | **deleted** — `useDocuments` covers it |
| `hooks/useKnowledgeItem.ts` (61) | **deleted** → `hooks/useDocument.ts` (new, ~75 lines, `useThread.ts` shape) |
| `hooks/useAutoSave.ts` | endpoint-shaped; takes a `save: (body) => Promise<ActionResult>` instead of a URL. ~15 lines changed |
| `layouts/AppShell.tsx:624` | `useFetch<…>("/api/knowledge")` → `useDocuments({inTree:true, limit:50})` |
| `shell/Sidebar.tsx` | label **stays "Knowledge"** (founder ruling 3); the route it links to becomes `/documents`; `knowledgeItems` local names renamed |
| `shell/AssistantOverlay.tsx:326-335` | `apiFetch("/api/knowledge", POST)` → `call("edit_document", { as:"artifact", parent:{kind:"thread", id} , …})` |
| `contexts/AssistantContext.tsx:35` | comment only |
| `components/GlobalSearchPanel.tsx`, `hooks/useGlobalSearch.ts` | bucket label and kind string `knowledge` → `document`; the route they call is unchanged |
| `components/parts/part.ts:310-320`, `components/parts/embeds.tsx:41` | `entityRef.kind === "knowledge_item"` → `"document"`; `ReferenceChip kind="knowledge"` → `"document"` |
| `block/types.ts:24` | `BLOCK_HOST_KINDS` `knowledge_item` → `document` |
| `ds/KnowledgeRow.tsx` | **collision decided:** `DocumentRow` is the wire type, so the DS component may not take that name. Locked: `git mv` → **`ds/DocRow.tsx`**, exporting `DocRow`. Its stories and tests move with it. |
| `ds/index.ts`, `ds/Tag.tsx`, `ds/tag-kinds.tsx`, `ds/ReferenceChip.tsx`, `ds/status-mapping.ts`, `ds/ScopePicker.tsx`, `ds/Menu.tsx`, `ds/Row.tsx`, `ds/PageHeader.tsx`, `ds/SectionLabel.tsx`, `ds/SplitView.tsx`, `ds/ItemList.tsx`, `ds/RowDeleteAction.tsx`, `ds/block/*` | token rename only |
| `navigation/parentPathFor.ts`, `services/host-route.ts`, `services/object-presentation.ts`, `services/open-handler.ts` | `/knowledge/` → `/documents/`, kind strings |
| `router.tsx:96-98` | `knowledge` → `documents`, `knowledge/new` → `documents/new`, `knowledge/:knowledgeId` → `documents/:documentId` |
| `fixtures/knowledge-data.ts` (217) | **deleted** |
| `pages/AgentProfile.tsx`, `settings/AgentEditor.tsx`, `pages/AgentAddDialog.tsx`, `pages/work/AgentDetailPane.tsx`, `pages/SetupFlow.tsx`, `pages/WorkTaskPage.tsx`, `pages/WorkTeam.tsx`, `pages/WorkOverview.tsx`, `pages/WorkTaskCreate.tsx`, `pages/Conversations.tsx`, `shell/HostThreadSection.tsx`, `shell/shell-types.ts`, `settings/settings-types.ts`, `settings/SettingsPlugins.tsx`, `settings/SettingsAgents.tsx`, `settings/SettingsHarnesses.tsx`, `utils/*`, `hooks/useNavShortcuts.ts`, `hooks/useFetch.ts`, `index.css` | token rename only |

"Memories" is a **filter chip** on `DocumentList` (`as: "memory"`), not a page — the plan's "kept
minimal".

---

## 10. Security

Reasoned from the surfaces this change actually reaches, within `ETHOS.md` §2 (security is earned, not
preemptive) and `.pipeline/rules/security.md`. The security ledger is empty, so nothing here cites an
earned control; what follows is the ownership and honest-default reasoning the plan already implies.

**A state-changing action with agent-authored text.** `edit_document` takes a body an agent wrote and
stores it; a later session reads it back as a sandbox file. That is the product working: an agent
writing what it learned and reading it next time. No scrubbing, no approval, no classifier. The body
is rendered in the browser through the same `deriveBlocks`/`sanitize-html` path a knowledge body
already took, and an artifact's interactive HTML through the existing sandboxed iframe
(`ds/artifact-frame/build-srcdoc.ts`) — **unchanged, and not extended**. The one real risk is
accidental scope: an agent writing a memory that lands team-wide. That is why `as:"memory"` forces
`user` scope rather than defaulting to it (A4).

**Memory visibility.** The only ownership rule in this item. It is a read filter in the query, not a
gate in front of one: a memory belongs to its subject (`scope_id`) and to the person who owns that
subject when the subject is an agent. Answering `not_found` rather than `forbidden` is today's
behaviour and stays — not for secrecy theatre, but because "you can't see it" and "it isn't there" are
the same fact to the caller. Abuse case closed: nothing lets one person enumerate another's memories,
including through a parent's `children`/`siblings` (§3.4 closes today's `{byParent}` hole).

**The websocket topic.** `documents` is global and un-scoped by design (the twin of `conversations`).
The abuse case is a private memory's title arriving in every browser. Closed by carrying **no field
values at all** on that topic (§7), which costs nothing because the hooks refetch anyway.

**Document bodies in change rows.** The `changes` table is not an audit control and is not gated; the
new fact is that it now holds document text. `changes` is read by `listChanges` and by the push, both
already scoped. The honest statement is the cost, not a threat: the table grows.

**Surfaces this change does not touch:** no credential, no outbound request, no filesystem path
outside the existing sandbox writeback, no new authentication, no new route (the action loop mounts
generically), no change to who may call what — authorization stays an invariant, and every actor gets
every action (`actions-as-tools.ts:8-10`). The three facilitator-only tools that *did* filter by role
(`promote_knowledge`, `create_conflict_review`, and formerly `score_attention`) are deleted, not
re-gated: their capability is now a plain status edit anyone can make, which is the plan's ruling.

---

## 11. The rename wave — a mechanical procedure

Runs **after** all code blocks, as its own ordered sequence (B26–B31). Each step is a token map plus a
verification command; a worker runs it without judgement. Every step must leave
`npm run check && npm run lint` green before the next begins.

### 11.1 The EXCLUDE list (applies to every step)

Never rewritten:

- `framework/db/drizzle/*.sql` — every migration file except the new `0086`, and `drizzle/meta/**`.
- `framework/db/drizzle-sqlite-archive/**` (if present).
- `.pipeline/**` — including this file.
- `docs/archive/**`.
- The sidebar label string `"Knowledge"` in `shell/Sidebar.tsx` (founder ruling 3) and the nav view id
  behind it — changing the view id buys nothing and breaks stored nav state.
- `knowledge_action` (session kind, source kind, DB check constraints on `sessions` and
  `agent_session_requests`, `EVENT_TYPES`). It names a kind of **run**, not the object, and renaming it
  means a second migration on two orchestration tables for zero product gain. See §13 O2.
- The English word *knowledge* where it means the place or the idea — "the team's knowledge", the
  Knowledge section, `docs/knowledge-architecture/` as a folder name. Rewrite the sentence only when it
  names the **object** ("a knowledge item").
- `@lore` blocks and `.pipeline/` references may keep historical work-item ids; nothing else may.

### 11.2 The ordered token map

Applied with `rg -l <from> | xargs sed -i ''` per step, longest token first within a step.

| step | from → to | scope |
|---|---|---|
| R1 | `@hyperidle/knowledge` → `@hyperidle/document` | all `package.json`, `tsconfig.json`, `*.ts(x)` |
| R2 | `knowledgeItems` → `documents`; `KnowledgeItem` → `DocumentRow`; `knowledgeAppProjection`/`knowledgeEditLog`/`knowledgeAccessLog`/`knowledgeConflicts` → (deleted; any survivor is a finding) | all `*.ts(x)` |
| R3 | `knowledge_items` → `documents`; `knowledge_item` → `document`; `knowledge-item` → `document` | all `*.ts(x)`, `*.json`, `*.md` outside EXCLUDE |
| R4 | `KnowledgeStatus`→`DocumentStatus`, `KNOWLEDGE_STATUSES`→`DOCUMENT_STATUSES`, `KnowledgeRole`→`DocumentSlot`, `KNOWLEDGE_ROLES`→`DOCUMENT_SLOTS`, `KnowledgeParentKind`→`DocumentParentKind`, `KNOWLEDGE_PARENT_KINDS`→`DOCUMENT_PARENT_KINDS`, `KNOWLEDGE_ROLE_LABEL`→`DOCUMENT_SLOT_LABEL`, `KNOWLEDGE_STATUS_LABEL`→`DOCUMENT_STATUS_LABEL` | all `*.ts(x)` |
| R5 | `sourceKnowledgeItemId` → `sourceDocumentId`; `knowledgeItemId` → `documentId`; `knowledgeId` → `documentId` | all `*.ts(x)` |
| R6 | `/api/knowledge` → (deleted route; any survivor is a finding); `"/knowledge"` → `"/documents"`; `/knowledge/` → `/documents/` | `*.ts(x)`, `*.spec.ts` |
| R7 | file and directory `git mv`: the UI pages and DS component in §9.2; `layers/core-api/knowledge` → `layers/core-api/document` (done in B3); `framework/domain-model/src/knowledge.ts` → deleted; test file names `knowledge*.test.ts` → `document*.test.ts` | `git mv` only |
| R8 | prose sweep in `docs/` and `*.md` — the object sense only | see §12 |

After each step: `npm run check && npm run lint:biome && npm run test -- --changed=origin/main`.
After R7: `npm run test:full` once, because a file rename invalidates `--changed`.

### 11.3 Collision checks, run before R2 and R4

```bash
rg -n '\bDocument\b' layers/core-ui/src --glob '!**/__tests__/**'   # DOM global — must stay DOM
rg -n '\bDocumentRow\b' layers/core-ui/src                          # must resolve to the wire type only
rg -n '\bdocuments\b' framework/db/src/schema.ts                    # one pgTable, no local shadow
rg -n 'DocumentSlot|DocumentStatus' --glob '!**/dist/**'            # no pre-existing symbol
```

`DocRow` (the DS component) and `DocumentRow` (the type) must both appear and must never be imported
from the same module under one name — a `rg -n 'DocumentRow' layers/core-ui/src/ds` must return zero.

---

## 12. Documentation made false

The rename makes prose wrong in two ways: the object's name, and facts about surfaces that no longer
exist. Only the second needs judgement.

| doc | what is now false |
|---|---|
| `docs/knowledge-architecture/sync-and-conflict-resolution.md` | describes conflicts, `create_conflict_review`, the conflicts table — **all deleted**. Rewrite to the one rule: an edit may carry its version; a stale edit is refused. |
| `docs/knowledge-architecture/the-canonical-store.md` | names the projection table and the edit log | 
| `docs/knowledge-architecture/relevance-and-attention.md` | names projection columns that are dropped |
| `docs/knowledge-architecture/the-knowledge-fabric-how-knowledge-moves.md` | same |
| `docs/architecture/as-implemented-domain-architecture.md` | lists the knowledge service, its routes and the six tools |
| `docs/process-layer/artifact-primitive.md` | `create_artifact` is gone; an artifact is `edit_document({as:"artifact"})` |
| `docs/product/how-knowledge-compounds.md`, `docs/product/product-decisions.md` | projection/attention references |
| `docs/requirements/functional-requirements.md` | the knowledge routes |
| `docs/human-interface-layer/content-examples-for-design-reference.md` | projection fields |
| `docs/guides/developer/*` (project structure, commands) | the package name |
| `framework/db/drizzle/README.md` | no change (generic) |

`docs/knowledge-architecture/` keeps its folder name — it is the place, not the object (§11.1).

---

## 13. Open decisions I could not settle

- **O1 — plugin detach on a human edit.** Today `routes/knowledge.ts:672-674` calls
  `markDetached(db, {kind:"knowledge", entityId:id})` whenever a PATCH carries a `body`, and the route
  comment says plainly *"The route is the legal bridge — knowledge does not know about plugins"*. With
  the route gone there is no bridge: `edit_document` must not know about plugins, and `settings` cannot
  react to a `changes` row until BC5's subscriptions exist. Three options, none free:
  (a) `DocumentDetail`'s save calls a new plumbing route `POST /api/plugins/contributions/:id/detach`
  after a successful edit (one small route, the browser owns the second call, an agent's edit never
  detaches — a real behaviour change);
  (b) `edit_document` takes an injected `onBodyChanged(id)` hook bound to `markDetached` in
  `compose.ts` (keeps behaviour exactly, costs one dep that is plainly a plugin concern);
  (c) accept the loss until BC5 (a plugin reinstall then silently overwrites a person's edit —
  the exact bug `@lore BA9g` records as already fixed once).
  **My recommendation: (b).** It is one injected function, it preserves behaviour for both humans and
  agents, and BC5 deletes it when the subscription lands. But it puts a plugin word inside the document
  module's deps, which is the kind of thing the founder has ruled on before — so it is flagged, not
  taken.
- **O2 — `knowledge_action`.** Excluded from the rename (§11.1). It is also **unreachable**: nothing in
  production emits a `knowledge_action` work intent, so `agent-run-admission-reactions.ts:234` and its
  `host_kind:'knowledge_item'` thread creation are dead. This item re-points that literal to
  `'document'` (one line, forced by the host-kind rename) and deletes nothing. If the founder wants it
  gone, that is a separate deletion touching two orchestration check constraints.
- **O3 — `changes` growth.** Accepted above (§6.3) on the plan's own words. If the founder would rather
  the body not ride, the change is one line in the diff builder and the plan's "no version history
  screen — the change rows hold it" stops being true.

---

## 14. Line budget

Counted as production lines only (no tests, no `.pipeline/`, no prose docs), from `wc -l` of the
files named above.

**Deleted**

| what | lines |
|---|---|
| `layers/core-api/knowledge/src/knowledge-repository.ts` | 2,206 |
| `…/promotion-pipeline.ts` (the two unreachable sweeps) | 426 |
| `…/session-knowledge-assembler.ts` + `token-budget.ts` + `scoring-config.ts` (replaced by 380) | 525 |
| `…/knowledge-conflicts.ts` | 83 |
| `…/errors.ts` | 51 |
| `…/index.ts` (30-odd exports → 4) | 94 |
| `…/types.ts` | 12 |
| `layers/core-api/src/routes/knowledge.ts` | 948 |
| six tools out of `tool-definitions.ts` | ~480 |
| `tool-handlers/src/ports.ts` knowledge accessor | ~90 |
| `tool-handlers-bindings.ts` knowledge block | ~45 |
| `core-api-port.ts` `CoreApiKnowledgePort` + types | ~150 |
| `core-api-port-composition.ts` knowledge block | ~90 |
| `run-orchestration-composition.ts` writeback seam port | ~75 |
| `writeback-processor.ts` conflict paths | ~40 |
| `framework/domain-model/src/knowledge.ts` | 85 |
| `core-ui/src/fixtures/knowledge-data.ts` | 217 |
| `KnowledgeDetail.tsx` fixture fallback + `LEGACY_*` blocks | ~150 |
| `hooks/useKnowledgeItem.ts` + `useParentedKnowledgeItems.ts` | 90 |
| 17 raw fetch blocks across the UI (net of their replacements) | ~200 |
| routine `sweep` ports + scheduler `itemId` branch + three event types (A1) | ~120 |
| **total deleted** | **≈ 6,177** |

**Added**

| what | lines |
|---|---|
| `framework/domain-model/src/actions/document.ts` (declaration + pure invariants + `canReadDocument`) | ~430 |
| `layers/core-api/document/src/document-store.ts` | ~520 |
| `…/document-actions.ts` | ~560 |
| `…/session-documents.ts` (folds three files) | ~380 |
| `…/action-types.ts` + `index.ts` | ~55 |
| `compose.ts` wiring + `runnerFor` lazies | ~70 |
| ws authorizer document branch | ~40 |
| `boot.ts` / `create-server.ts` / orchestration composition threading | ~60 |
| `core-ui` `useDocument.ts` + `useDocuments.ts` | ~180 |
| neighbour re-points (plugins, agents, org, users, teams, agent-profile, routines, search, compose) | ~350 |
| `routes/agent-identity.ts` (shared identity seed helper) | ~30 |
| writeback re-point | ~60 |
| migration `0086_document_module.sql` | ~110 |
| governance registry edits | ~10 |
| **total added** | **≈ 2,855** |

**Net ≈ −3,300 production lines.** The rename wave adds and removes the same line (a token change), so
it is net zero; test and doc churn is excluded from the number the gate shows, per the plan. Added
lines exceed 1,000, which the founder accepted up front (plan, "Size, confirmed 2026-09-21").

---

## 15. Verification

### 15.1 The named end-to-end evidence

One per cross-process wire. BC3's lesson — *"each end tested against a fake"* — is closed by naming the
real-end test for every wire here.

| wire | test | where |
|---|---|---|
| browser → HTTP → action → DB | `document-actions.integration.test.ts` (the seam test) | `layers/core-api/src/__tests__/` |
| agent → MCP tool → action → DB | same file, driven through the tool projection | same |
| action → `changes` → websocket → browser | `document-ws-e2e.integration.test.ts`, a **real socket** | `applications/remote-server/src/__tests__/` |
| old database → migration → new schema | `migration-0086-brownfield.integration.test.ts` | `framework/db/src/__tests__/` |
| sandbox file → writeback → `edit_document` | `document-writeback-e2e.integration.test.ts` | `layers/core-api/src/__tests__/` |
| real agent → real harness → the three tools | `document-tools-live-harness.integration.test.ts` | `layers/core-api/src/__tests__/` |

### 15.2 The seam test (B7) — the parity contract

`layers/core-api/src/__tests__/document-actions.integration.test.ts`. Every case runs **twice** — once
as a human (`ctx.actor` = a human user, no `ctx.caller`) and once as an agent (`ctx.actor` = an agent,
`ctx.caller` = a session) — and the two answers must be **identical objects** except where the
difference is the point (the artifact stamp, memory ownership). Written as a table so a missing arm is
a compile error, not a silent gap:

```ts
const ACTORS = [
  { name: "human", actor: humanId, caller: undefined },
  { name: "agent", actor: agentId, caller: { sessionId, taskId, threadId: null } },
] as const;
```

Cases, each asserting `result.ok` or `problems[0].code` with **exact equality**:

1. create a document, read it back with `open_document`, assert every field;
2. create `as:"memory"`, assert `scopeKind==='user'`, `scopeId===actor`, `parentKind===null`;
3. the owner of an agent sees that agent's memory; a third person gets `not_found`;
4. create `as:"artifact"` with no parent — agent arm stores the session's task, human arm returns
   `artifact_no_parent`;
5. a three-level tree: `open_document` returns `ancestors` root-first, ordered `children`, `siblings`
   excluding self;
6. `search_documents({inTree:true})` excludes artifacts and slotted documents;
7. `search_documents({as:"memory"})` returns only the caller's own;
8. `search_documents({parent:{kind:"routine", ids:[a,b]}, slot:"prompt"})` returns one row per routine;
9. every invariant in §4.1 and §4.2, one case each, exact code;
10. the six combined cases in §4.3;
11. every successful edit appends exactly one `changes` row with `object:'document'` and the right
    `kind`; an edit that fails appends none;
12. version bumps by exactly 1 on **every** successful edit including an archive (today's archive does
    not bump — `knowledge-repository.ts:1766-1769`; this is the fix).

### 15.3 The real-socket test (B9)

`applications/remote-server/src/__tests__/document-ws-e2e.integration.test.ts`, copied from
`thread-ws-e2e.integration.test.ts`: a real server, a real `ws` client, a real subscribe, a real
`edit_document`. Asserts (a) a frame arrives on `document:<id>` with the full `after`; (b) a frame
arrives on `documents` with `after === null`; (c) subscribing to another person's memory topic is
refused. (c) is the one that must be shown red by removing the authorizer branch.

### 15.4 Existing lanes

`npm run check`, `npm run lint`, `npm run test:full`, `npm run test:integration:service` after every
block; `npm run test:integration:harness` once at the end (the tool list changes — obligated by
`.pipeline/rules/testing.md`); `npm run test:e2e` once in full (affected-only passes with zero tests);
`npm run verify` as the final block.

### 15.5 The desktop gate walk

From the plan, in the packaged desktop app on demo data: list · open · create · edit · move · archive ·
triage through the Knowledge section; a second window updating live; a stale edit refused with its
reason; an agent writing a memory and an artifact and reading a document through the three tools;
`npm run lint` green with the document rows gone from the three legacy lists; the line count.

---

## 16. Blocks

Each block: the paths it owns (disjoint from anything that can run beside it), what it implements, the
one failing test it starts from, one verification command, and what it waits for. A worker implements a
block with **no design decisions**. `∥` marks blocks that may run at the same time.

**Builder note, every block:** work-item ids (BC4 and any other) never appear in code, comments, tests,
commit messages or PR text. They belong under `.pipeline/` and inside `@lore` blocks only. Commit with
an explicit pathspec and check `git show --stat` before moving on — BC3 lost commit messages to a
shared index.

### Phase A — the vocabulary and the schema

**B1 — the declaration.**
Owns `framework/domain-model/src/actions/document.ts` (new), `framework/domain-model/src/index.ts`
(exports only), `framework/domain-model/src/__tests__/document-invariants.test.ts` (new).
Implements §3 and §4.1 and `canReadDocument`/`documentAs`. `knowledge.ts` is **not** deleted yet.
Red first: `document-invariants.test.ts` asserting every §4.1 code by exact equality.
Verify: `npm run check && npx vitest run framework/domain-model`.
Depends on: nothing.

**B2 — the migration and the schema rename.**
Owns `framework/db/src/schema.ts`, `framework/db/src/index.ts`,
`framework/db/drizzle/0086_document_module.sql` (new), `framework/db/drizzle/meta/_journal.json`,
`framework/db/src/__tests__/migration-0086-brownfield.integration.test.ts` (new), **and the mechanical
re-point of every reader of the renamed symbols** — the 29 production files and 53 test files that name
`knowledgeItems` / `knowledgeEditLog` / `knowledgeAccessLog` / `knowledgeConflicts` /
`knowledgeAppProjection` (derive the list with `rg -l`, do not work from this count). Inside
`knowledge-repository.ts` and `session-knowledge-assembler.ts` this means **deleting** the projection
join machinery (`getProjectionRow`, `mergeWithProjection`, the projection insert in `create`, the
projection branch in `update`, the joins in `listBase`/`list`/`search`) and reading `confidence`/`meta`
off the row. `tools/setup/src/demo-world/knowledge.ts`, `tools/setup/src/demo-fixture.ts` and
`tools/eval/src/seeding.ts` stop writing projection rows.
Implements §6.
Red first: `migration-0086-brownfield.integration.test.ts` (§6.5).
Verify: `npm run check && npm run lint && npx vitest run --project service framework/db`.
Depends on: nothing (parallel with B1). **Cannot be split** — the rename breaks typecheck until every
reader moves.

### Phase B — the module

**B3 — move the package.**
Owns `git mv layers/core-api/knowledge layers/core-api/document`, its `package.json` (name
`@hyperidle/document`), `tsconfig.json`, `vitest.config.ts`, and the `@hyperidle/knowledge` →
`@hyperidle/document` specifier in every `package.json` and import (R1 of the rename map, pulled
forward because it is a package identity, not prose).
Implements: nothing behavioural. Symbol names inside the package are untouched.
Red first: none — this block is a move. Its proof is the gate.
Verify: `npm run check && npm run lint && npm run test:full`.
Depends on: B2.

**B4 — the store.**
Owns `layers/core-api/document/src/document-store.ts` (new), `…/src/__tests__/document-store.integration.test.ts` (new).
Implements §5.1's one query builder, the get, `resolveParentChain`, the ancestor walk, the slot/scope/
cycle/depth checks as pure-SQL helpers, and the transactional write. Moved, not reinvented:
`walkKnowledgeItemAncestorChain`, `assertParentInvariants`, `nextPositionForParent`,
`resolveParentChain` come across from `knowledge-repository.ts:61-158,1153-1183` with the names in §2.
`cascadeScopeNarrowing` is **not** moved (A2); its replacement is a "is any descendant wider" read.
Red first: a test asserting `search` with `{inTree:true}` excludes a `task`-parented row and a
`user`-scoped ordinary row belonging to someone else — exact ids, exact length.
Verify: `npx vitest run --project service layers/core-api/document`.
Depends on: B1, B3.

**B5 — search and open.**
Owns `layers/core-api/document/src/document-actions.ts` (new, read half),
`…/src/action-types.ts` (new).
Implements §3.3, §3.4, §5.1's visibility resolution through `deps.users`.
Red first: `open_document` on a memory belonging to another person returns exactly
`[{code:"not_found"}]`.
Verify: `npx vitest run --project service layers/core-api/document`.
Depends on: B4.

**B6 — edit.**
Owns the write half of `document-actions.ts`, `…/src/index.ts`.
Implements §3.5, §3.6, §4.2, §6.3's change row, and the post-commit push call shape (the push
function itself is `deps.wsPush`, bound later).
Red first: the stale case — two edits, the second carrying version 1, asserting
`problems[0].code === "stale"` **and** that `title` still holds the first writer's value (§4.3 case 4).
Verify: `npx vitest run --project service layers/core-api/document`.
Depends on: B5.

**B7 — compose, mount, and the seam test.** ⟵ the spine
Owns `layers/core-api/src/actions/compose.ts`, `layers/core-api/src/app.ts` (the `buildCoreActions`
call and the `/knowledge` mount removal is **not** here — only the compose wiring),
`layers/core-api/src/__tests__/document-actions.integration.test.ts` (new).
Implements §8.1, §8.2. The three actions become HTTP routes and MCP tools by the existing loops.
Red first: the whole §15.2 table — it is this block's definition of done.
Verify: `npx vitest run --project service layers/core-api/src/__tests__/document-actions.integration.test.ts`
then `npm run check && npm run lint`.
Depends on: B6.

**B8 — the session read model.** ∥ B9
Owns `layers/core-api/document/src/session-documents.ts` (new; folds
`session-knowledge-assembler.ts` + `token-budget.ts` + `scoring-config.ts`, which are deleted here),
`layers/core-api/src/services/task-run-resolver-bindings.ts`,
`layers/core-api/src/services/routine-scheduler-bindings.ts` (the `assembleSessionDocuments` line only).
Implements §5.3.
Red first: re-point the existing `session-knowledge-assembler-ranking-parity.integration.test.ts` and
assert the **same ranked order** as before the fold — a parity test, not a new contract.
Verify: `npx vitest run --project service layers/core-api/src/services/__tests__`.
Depends on: B3, B4.

**B9 — the websocket nudge.** ∥ B8
Owns `layers/core-api/src/ws-subscribe-authorizer.ts`, the `wsPush` binding in `compose.ts`/`app.ts`,
`applications/remote-server/src/__tests__/document-ws-e2e.integration.test.ts` (new).
Implements §7.
Red first: §15.3 (c) — a subscribe to another person's memory topic is refused; shown red by deleting
the authorizer branch.
Verify: `npx vitest run --project service applications/remote-server`.
Depends on: B7.

### Phase C — neighbours (all ∥ with each other, all after B7)

**B10 — plugins.** Owns `layers/core-api/src/routes/plugins.ts` and its tests. Implements the
§8.3 plugins rows (read-then-edit upsert, the archive loop, restore) and O1's chosen answer.
Red first: `plugin-skill-reinstall.integration.test.ts` re-pointed — a reinstall over a
person-edited body leaves the body alone, asserted by exact string.
Verify: `npx vitest run --project service layers/core-api/src/routes/__tests__`.

**B11 — agent identity.** Owns `layers/core-api/src/routes/agent-identity.ts` (new),
`routes/agents.ts`, `routes/org.ts`, `routes/users.ts`, `routes/teams-routes.ts`,
`routes/agent-profile.ts`. Implements the four `upsertAgentIdentity` call sites and the two
`getAgentIdentityIds` reads.
Red first: `BA9f-identity-visibility.integration.test.ts` re-pointed — an agent identity is visible to
a non-owner (slot ≠ ordinary), asserted by exact id.
Verify: `npx vitest run --project service layers/core-api/src/routes/__tests__`.

**B12 — routines.** Owns `layers/core-api/src/routes/routines-routes.ts`,
`layers/core-api/routine/src/ports.ts`, `layers/core-api/routine/src/routine-scheduler.ts`,
`layers/core-api/src/services/routine-scheduler-bindings.ts` (the rest of it). Implements the prompt
slot reads/writes, **deletes** `ports.knowledge.runAutoPromotionSweep`/`runStaleSweep`/`getItemById`
and the scheduler's `itemId` subject branch (A1).
Red first: a routine's prompt read returns an **archived** prompt (no status filter — today's
behaviour, pinned).
Verify: `npx vitest run --project service layers/core-api/routine layers/core-api/src/services/__tests__`.

**B13 — task, thread, search.** Owns the `document` deps in `compose.ts`'s task/thread bags,
`layers/core-api/task/src/task-actions.ts` (the `deps.knowledge` → `deps.document` rename and the two
calls), `layers/core-api/thread/src/thread-actions.ts` (same), `layers/core-api/src/routes/search.ts`.
Red first: `open_task` returns the ids of documents parented to it, exact array.
Verify: `npx vitest run --project service layers/core-api/task layers/core-api/thread`.

### Phase D — the agent side

**B14 — delete the six tools and the seam.** Owns
`layers/agent-orchestration/tool-handlers/src/tool-definitions.ts`, `…/ports.ts`,
`layers/agent-orchestration/src/services/tool-handlers-bindings.ts`,
`layers/agent-orchestration/src/services/core-api-port-composition.ts`,
`framework/api-contract/src/core-api-port.ts`, and the tool-handler tests that drive them
(`create-artifact.integration.test.ts`, `merge-split-knowledge.test.ts`,
`promote-knowledge-status-collapse.test.ts`, `tool-handlers-completeness-contract.test.ts` — the last
one is re-pointed, the first three are **deleted with their subjects**).
Implements §8.4's first two paragraphs.
Red first: `tool-registry.integration.test.ts` asserting the registered tool names are exactly the
four survivors plus the six actions — an exact set equality, not a `toContain`.
Verify: `npm run check && npx vitest run --project service layers/core-api/src/__tests__/tool-registry.integration.test.ts`.
Depends on: B7.

**B15 — the writeback.** Owns `layers/core-api/src/boot.ts` (the two new `CoreApiBoot` fields),
`applications/remote-server/src/create-server.ts`,
`layers/agent-orchestration/src/services/run-orchestration-composition.ts`,
`layers/agent-orchestration/run-orchestration/src/writeback-processor.ts`,
`layers/core-api/src/__tests__/document-writeback-e2e.integration.test.ts` (re-pointed from
`knowledge-writeback-e2e.integration.test.ts`).
Implements §8.4's writeback paragraph.
Red first: a stale writeback — the server's body is unchanged, the manifest holds the server's version,
and `result.conflicts` no longer exists (the field is deleted, so its absence is a type error, which is
the point).
Verify: `npx vitest run --project service layers/core-api/src/__tests__/document-writeback-e2e.integration.test.ts`.
Depends on: B7, B14.

### Phase E — the browser (B16 ∥ B17 ∥ B18 ∥ B19, all after B7)

**B16 — hooks and shared types.** Owns `layers/core-ui/src/hooks/useDocument.ts` (new),
`…/useDocuments.ts` (new), `…/useAutoSave.ts`, deletes `useKnowledgeItem.ts` and
`useParentedKnowledgeItems.ts`, and `layers/core-ui/src/services/call.ts` (the `Actions` union gains
`DOCUMENT_ACTIONS`).
Red first: `useDocuments` re-runs its `call` when a `documents` frame arrives — asserted against the
existing fake ws client, **plus** the real-socket proof already owned by B9.
Verify: `npx vitest run layers/core-ui/src/hooks`.

**B17 — the list page.** Owns `pages/DocumentList.tsx` (moved), its stories and tests,
`layouts/AppShell.tsx`, `shell/Sidebar.tsx`.
Red first: the triage filter shows exactly the `proposed` rows the search returned.
Verify: `npx vitest run layers/core-ui/src/pages layers/core-ui/src/__tests__`.

**B18 — the detail page and its dialogs.** Owns `pages/DocumentDetail.tsx` (moved),
`pages/document/*` (moved), their stories and tests.
Red first: with the API returning nothing, the page renders an honest empty state and **no fixture
title** — assert the old fixture strings are absent by exact equality on the rendered text.
Verify: `npx vitest run layers/core-ui/src/pages`.

**B19 — create, settings, artifacts, overlay, search, router.** Owns `pages/DocumentCreate.tsx`
(moved), `settings/DocumentSlotList.tsx` (moved), `settings/SettingsSkillsAndRules.tsx`,
`components/ArtifactSection.tsx`, `shell/AssistantOverlay.tsx`, `components/GlobalSearchPanel.tsx`,
`hooks/useGlobalSearch.ts`, `router.tsx`, `navigation/parentPathFor.ts`, `services/host-route.ts`,
`services/open-handler.ts`, `services/object-presentation.ts`, `ds/DocRow.tsx` (moved),
`components/parts/part.ts`, `components/parts/embeds.tsx`, `block/types.ts`, and the e2e specs that
name `/knowledge`.
Red first: the version-clash banner renders when `edit_document` answers
`problems[0].code === "stale"` — assert the exact message.
Verify: `npx vitest run layers/core-ui && npx playwright test --grep document`.

### Phase F — deletions (each its own block)

**B20 — delete the knowledge routes.** Owns `layers/core-api/src/routes/knowledge.ts`,
the `/knowledge` mount in `app.ts`, and every test under `layers/core-api/src/routes/__tests__/` and
`layers/core-api/src/__tests__/` that drives those routes (`knowledge.integration.test.ts`,
`knowledge.*.integration.test.ts`, `R7-knowledge-e2e`, `knowledge-graduation`, `knowledge-signals`,
`knowledge-scope-name`, `promote-knowledge`, `create-conflict-review`, `create-artifact-*`,
`write-memory`, `human-agent-parity` — re-point the last one, delete the rest; the seam test replaces
their coverage).
Verify: `npm run check && npm run lint && npm run test:integration:service`.
Depends on: B10–B13, B16–B19.

**B21 — delete the legacy store.** Owns `layers/core-api/document/src/knowledge-repository.ts`,
`promotion-pipeline.ts`, `knowledge-conflicts.ts`, `errors.ts`, `types.ts`, the old `index.ts` exports,
and the package's own `__tests__` that drive them.
Verify: `npm run check && npm run lint && npm run knip`.
Depends on: B20.

**B22 — delete the fixtures and the events.** Owns `layers/core-ui/src/fixtures/knowledge-data.ts`,
`framework/domain-model/src/knowledge.ts`, `framework/event-bus/src/events.ts` (the three event
interfaces and their `EVENT_TYPES` rows), `framework/domain-model/src/work-intent.ts` (the
`kind:"knowledge-item"` subject arm), `layers/agent-orchestration/run-orchestration/src/context.ts:520`
(its branch).
Verify: `npm run check && npm run lint`.
Depends on: B12, B18, B21.

**B23 — registries.** Owns `tools/governance/table-owners.json`,
`tools/governance/src/rules/actions-projected.ts`, `tools/governance/src/lib/governance-attacks.ts`,
`tools/governance/src/lib/crossing-detectors.ts` (comment), `tools/governance/misplaced-files.json`,
`tools/repo-gates/mock-inventory/inventory.json` + `.md`.
Implements §8.5.
Red first: the governance attack suite — a re-pointed companion-pair case must still go red when its
companion write is removed.
Verify: `npm run lint && npx vitest run tools/governance && npm run mock-inventory:check`.
Depends on: B20, B21, B22.

### Phase G — the rename wave (strictly sequential)

**B24 = R2+R3**, **B25 = R4**, **B26 = R5**, **B27 = R6**, **B28 = R7 (git mv)**, **B29 = R8 (prose)**.
Each owns "whatever `rg -l <token>` returns minus the EXCLUDE list", runs the collision checks in
§11.3 first, and verifies with `npm run check && npm run lint:biome && npm run test -- --changed=origin/main`
(B28 uses `npm run test:full`). R1 already ran in B3.

### Phase H — the edges

**B30 — plugin and personas.** ∥ B31
Owns `plugins/knowledge-management/` (rename the plugin directory and `name` to
`document-management`; rewrite the two sweep routines' prompts to name `search_documents` +
`edit_document`; rewrite `skills/knowledge-promotion/SKILL.md` and `skills/knowledge-decay/SKILL.md`
against the three actions; `skills/post-task-retro/SKILL.md` needs only the noun),
`plugins/role-personas/personas/{facilitator,product-manager,qa-engineer}.md` (drop
`create_conflict_review`, `write_memory`, `create_artifact`; name `edit_document`).
Verify: `npm run lint && npx vitest run --project service layers/core-api/src/routes/__tests__` (the
plugin install tests read these files).

**B31 — evals.** ∥ B30
Owns `tools/eval/src/scenarios/`, `tools/eval/src/seeding.ts`, `tools/eval/src/judges.ts`,
`tools/eval/src/provision-harness.ts`.
- **Rewritten against the three actions:** `write-memory.ts` → a memory through `edit_document`;
  `create-artifact.ts` → an artifact through `edit_document`; `knowledge-writeback.ts` (the writeback
  still exists, its port changed); `assembled-knowledge.ts` and `poc-session-notes.ts` (they read the
  bundle, which survives); `tool-authorization.ts` (its tool list changes).
- **Deleted with their subjects:** `promote-knowledge.ts`, `create-conflict-review.ts`.
- **New:** one scenario where an agent *reads* a document through `open_document` — the capability that
  did not exist before.
Verify: `npm run check && npm run lint` (evals are not a gate lane).

**B32 — docs.** Owns `docs/` per §12.
Verify: `npm run lint`.

**B33 — the harness lane.** Owns
`layers/core-api/src/__tests__/document-tools-live-harness.integration.test.ts` (new): a real agent on
each of the four harnesses writes a memory, writes an artifact, and reads a document back, gated with
`requireHarness(<name>)` — **all four lanes, no `skipIf`**, per `.pipeline/rules/testing.md`.
Verify: `npm run test:integration:harness -- layers/core-api/src/__tests__/document-tools-live-harness.integration.test.ts`.
Depends on: everything.

**B34 — full gates.** `npm run verify`, `npm run test:all`, `npm run test:e2e` (full, not affected),
then the desktop build and the §15.5 gate walk.
Depends on: everything.

### Dependency summary

```
B1 ─┐
B2 ─┴→ B3 → B4 → B5 → B6 → B7 ─┬→ B8 ∥ B9
                                ├→ B10 ∥ B11 ∥ B12 ∥ B13
                                ├→ B14 → B15
                                └→ B16 ∥ B17 ∥ B18 ∥ B19
                                        ↓
                        B20 → B21 → B22 → B23
                                        ↓
                    B24 → B25 → B26 → B27 → B28 → B29
                                        ↓
                                B30 ∥ B31 ∥ B32 → B33 → B34
```
