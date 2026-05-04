# Track B: Knowledge Fabric

See `docs/work-packages/SHARED.md` for tech stack, shared contracts, and dependency graph.

---

### B1 — Knowledge Items CRUD + Search

**Story.** As an agent or human, I want to create, read, update, and search knowledge items from a canonical SQLite store, with optimistic versioning and full-text search, so that knowledge can be queried and modified reliably.

**Depends on.** A2.

**Acceptance criteria.**
- Create, read, update operations succeed with version control.
- Update with stale version throws `VersionConflictError` with current version.
- FTS5 search on 10 items returns matching items ranked by relevance.
- Every update creates `knowledge_edit_log` entry.
- `knowledge_item_updated` event fires on every write.
- Pagination works: limit 5, offset 0 returns first 5.
- List by layer, scope_id, kind, topic filters correctly.

**Validation scenarios.**
- Given knowledge item, when updated with correct version, then version increments and new row appears in edit log.
- Given 10 knowledge items, when searched for keyword, then matching items returned with relevance ranking.
- Given stale version, when update attempted, then error thrown with current version in response.

**Contracts / constraints.**
- `version` column for optimistic concurrency (per-field last-writer-wins strategy lives in B5).
- FTS5 virtual table required for search.

**Effort.** M (~2d)

---

### B2 — Materialization Engine

**Story.** As an agent starting a session, I want a workspace directory materialized with relevant knowledge (context/, knowledge/, work/ zones), so that I have exactly what I need for the task without wasting context tokens.

**Depends on.** B1, B3.

**Acceptance criteria.**
- Materialized workspace contains context/, work/, knowledge/ zones with correct permissions (context/ read-only).
- `.fabric/manifest.json` exists with version tracking per item.
- Role-filtered practices: growth practices NOT materialized for a Builder.
- Materialization of 200 items completes in <10 seconds.
- Re-materialization overwrites workspace cleanly.
- `session.toon` context pack in context/ contains task state and bet context.

**Validation scenarios.**
- Given task for Builder agent, when materialization runs, then workspace contains only building-relevant practices in context/.
- Given 200 knowledge items, when materialization runs, then completes within time budget.

**Contracts / constraints.**
- Workspace layout must match KNOWLEDGE_ARCHITECTURE.md §4.2 exactly.
- Materialization budget applied via B6 (relevance + token budget).

**Effort.** M (~2d)

---

### B3 — TOON Codec

**Story.** As a materialization engine, I want to encode/decode TOON format for compact context packs, so that agent context windows can hold more knowledge.

**Depends on.** A1.

**Acceptance criteria.**
- Round-trip encode/decode identical for 10 test cases.
- TOON-encoded practice ≥30% smaller than JSON (by token count).
- Nested objects (3 levels, arrays, nulls) encode/decode correctly.
- Malformed TOON throws descriptive `ToonParseError`.
- 1000 items encode/decode in <100ms.

**Validation scenarios.**
- Given complex nested object, when round-trip encode/decode, then result is identical.
- Given practice and JSON version, when token count compared, then TOON is ≥30% smaller.

**Contracts / constraints.**
- Follows spec at github.com/toon-format/toon.

**Effort.** S (~1d)

---

### B4 — File Watcher + Continuous Writeback

**Story.** As an agent writing files in a session workspace, I want changes automatically synced back to SQLite with conflict detection and versioning, so that knowledge persists across session boundaries without manual checkpoints.

**Depends on.** B2, B1.

**Acceptance criteria.**
- New file in knowledge/ creates knowledge_items row with status CAPTURED within 2 seconds.
- Modified file updates corresponding row, version increments.
- Deleted file flags for facilitator review (item created), NOT auto-deleted.
- 10 files written in 200ms debounce collapses to ≤10 writeback operations.
- Version conflict: external update + agent file change creates knowledge_conflicts row.
- stopWatcher() final pass completes, subsequent writes not recorded.
- Manifest updated after each writeback.
- work/session-notes.md changes reflected in sessions.notes.
- Polling fallback detects changes within 3 seconds.
- Last-writer-wins: agent writes T=0, human patches T=250ms (within 500ms window) → human change wins, conflict flagged.

**Validation scenarios.**
- Given file written to knowledge/ directory, when 2 seconds elapse, then corresponding row exists in knowledge_items.
- Given version conflict, when manifest checked after writeback, then version bumped and conflict record created.
- Given human update within 500ms window, when file also updated by agent, then human change takes precedence.

**Contracts / constraints.**
- Uses `Bun.watch()` with 500ms debounce; polling fallback for environments without native watcher.
- Workspace layout: context/ (read-only), knowledge/ (read-write), work/ (read-write), .fabric/manifest.json (metadata).
- E4 contract: B4 unblocks E4 for workspace file serving.

**Effort.** M (~3d)

---

### B5 — Conflict Resolution

**Story.** As the knowledge system, I want concurrent edits to same items to resolve automatically for structured data (per-field LWW) and escalate to humans for prose, so that knowledge updates don't block each other.

**Depends on.** B4, B1.

**Acceptance criteria.**
- Two edits to different fields of structured practice: both apply, no conflict record.
- Two edits to same field of structured practice: last writer wins for field, conflict record created.
- Two edits to prose item: both versions stored, conflict record with status 'open', older version remains active.
- Conflict record contains version_base, version_current, proposed_body, proposed_by.
- Open conflict prevents promotion to VALIDATED status.
- Resolving conflict (status 'resolved') allows promotion.

**Validation scenarios.**
- Given two concurrent edits to different fields, when writeback runs, then both changes apply without conflict.
- Given two concurrent edits to same field, when writeback runs, then last writer wins and conflict record created.

**Contracts / constraints.**
- Per-field merge only for structured items (practices, decisions, failures).
- Prose conflicts require facilitator review.

**Effort.** S (~1d)

---

### B6 — Materialization Budget + Relevance Scoring

**Story.** As materialization, I want to score knowledge relevance and enforce a token budget, so that agents load exactly what they need without wasting context.

**Depends on.** B1, B2.

**Acceptance criteria.**
- Practice tagged "file-handling" scores higher than "email-marketing" for file-upload task.
- Recently updated practice scores higher than stale one (same relevance).
- Budget enforcement: 200 items, 40K token budget → only top-scoring items returned.
- L4 factory items always included (non-negotiable context).
- 200K context window allocates ~40K for knowledge (verify math).
- Scoring weights overridable via factory_settings (no code changes).

**Validation scenarios.**
- Given task about file handling, when relevance scoring runs, then file-handling practice ranked higher.
- Given 200 items, 40K token budget, when materialization runs, then items within budget returned.

**Contracts / constraints.**
- Scoring factors: task tag match, role match, recency, confidence, usage frequency, layer proximity.
- Budget allocation: 40% task, 30% L0 session, 20% L2+L3, 10% L4.
- Token counting via whitespace-split approximation.

**Effort.** S (~1d)

---
