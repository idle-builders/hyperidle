# BC4 — Document as a module: search · open · edit

## What we need

**Why this exists.** The knowledge service is the largest package (4,441 lines, 26 public methods) and the most routes (15); merge, split, promote, conflict and status each have their own path and tool. The contract says one edit, and renames the object to *document* — the word users use.

**What exists today.** `layers/core-api/knowledge`, `routes/knowledge.ts` (1,053 lines) + `search.ts`; seven tools (`promote_knowledge · create_conflict_review · merge_knowledge · split_knowledge · run_knowledge_sweep · create_artifact · write_memory`); `knowledge_edit_log` and versions; the knowledge tree (`parentKind` over five primitives); context assembly (`session-knowledge-assembler.ts`) — a deliberate keep.

**Missing delta.** The `document` module with three actions; the rename knowledge item → document across schema, code and UI in this one change; tree and parent kinds kept; merge, split, status, promote, conflict as fields of edit with invariants; versions and the edit log folded into `changes`; context assembly becomes the read model `document.search` returns to the session baker. Deletes the package, the routes, the seven tools, the hooks.

**Depends on.** BC2 — copies the proven pattern and the loops. Independent of BC3.

**Dials (provisional).** complexity: suite · ambiguity: established context · exposure: public contract

## How it works

## How we work on this

## Confusions

## Proposed items
