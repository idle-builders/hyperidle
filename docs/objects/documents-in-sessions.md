# Documents in Sessions

How documents reach an agent: which sessions get them, how they are selected, the sandbox layout, and how writes sync back.

Source: `layers/core-api/document/src/session-documents.ts`, `layers/agent-orchestration/run-orchestration/src/context.ts`, `layers/agent-orchestration/run-orchestration/src/writeback-processor.ts`, `layers/agent-orchestration/run-orchestration/src/file-watcher.ts`.

## Which sessions get documents

Only `task_run` and `subscription_run` sessions get a `knowledge/` tree with documents.

`thread_turn` and `session_resume` sessions do not. They get only `context/session.toon` and an empty manifest.

## Selection

`assembleSessionDocuments` (`session-documents.ts`) fetches documents from three scope groups, each filtered by discipline:

1. Factory-scoped ordinary documents (always included, non-negotiable).
2. Team-scoped ordinary documents (the agent's team, if any).
3. User-scoped ordinary documents (the agent's own).
4. Capability documents (`skill`, `rule`, `agent_file` slot) — appended after ranking, not ranked themselves.

A document reaches an agent only if its own `discipline` is empty or matches the agent's, case-insensitively. `agent_file` is exempt — it is already about exactly one agent.

## Scoring

No budget or cutoff: every scope-and-discipline-selected item is returned. Documents are written as real files in the session sandbox, not inlined into a prompt, so there is nothing to fit into a token budget. Ranking (highest first) uses two factors:

- Recency: weight 0.20 — decays over 30 days.
- Confidence: weight 0.15 — from `documents.confidence` (0–1).

Factory-scoped items rank alongside team- and user-scoped items; none are held back.

Usage counters (`lastUsedAt`) are bumped in a batched update after selection.

## Sandbox layout

The assembled documents are written as files into `knowledge/` inside the session sandbox:

- Ordinary documents are materialised shaped like the real tree: a folder per document with `index.md` for the document itself and its children as nested files or folders.
- Rule and skill documents land in `knowledge/rules` regardless of tree position.
- Each file is named `<title>_<id8>.md` (8-char id suffix for move detection); an app is `<title>_<id8>.html`.
- Skill/rule/agent_file documents are written read-only (chmod 0444).

`context/session.toon` holds a flat key-value summary of task, ancestors, agent, and team. Written from the baked context bundle; no DB reads at session start.

`.fabric/manifest.json` records the document id, file path, version, and scope for every assembled item.

## Watcher and writeback

`fs.watch(dir, { recursive: true })` watches `knowledge/` and `work/` with a 500ms debounce. One `sandbox_writeback_changes_detected` event per flush.

Writeback rules by path:

| Path | Action |
|---|---|
| `knowledge/<file>` | Create or update document via `edit_document`; a new `.html` file becomes an app (`format: html`) |
| `knowledge/<dir>/` | Create folder document |
| `work/session-notes.md` or `work/task-notes.md` | Write `sessions.notes` directly |
| Anything else in `work/` | Ignored |

**Move detection.** A rename is detected by the `_<id8>` suffix in the filename. A file moved within `knowledge/` is a reparent of the document that carries that id, not a delete + create.

**Stale edit.** If the document's version in the DB is newer than the manifest entry, the edit is discarded and the manifest is fast-forwarded to the current version.

**Deletes.** Deleting a file from `knowledge/` does not delete the document. The watcher ignores delete events.

**Directory (folder) items.** Creating a directory in `knowledge/` materialises a document with no body (a folder node). Directory items get their own manifest entries.

## Ancestors

Each ordinary document in the assembled set has its parent chain resolved at bake time (`resolveParentChain`). The parent chain is used to build the `knowledge/` folder tree so an agent sees documents nested correctly.
