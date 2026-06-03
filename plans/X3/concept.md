# X3 Concept — Agent Configuration (DB + UI)

## Required reading for downstream skills

- `docs/agent-layer/agent-identity.md` — current "three files" identity model (SOUL.md, SKILLS.md, IDENTITY.md)
- `docs/agent-layer/principles.md` — "Agent = soul + context + skills" decomposition
- `docs/agent-layer/the-two-categories.md` — central vs product-team agent roles
- `docs/agent-layer/model-routing-and-cost.md` — model tier vocabulary (closed: `reasoning | workhorse | fast`), routing logic, cost posture
- `docs/souls/product-manager.md`, `docs/souls/practice-facilitator.md`, `docs/souls/chief-of-staff.md` — existing soul prompt templates
- `packages/db/src/schema.ts` lines 28-53 — `users` table with `soulPromptPath` column
- `packages/db/src/seed.ts` — current seed data using `soulPromptPath` file references
- `packages/fabric/src/prompt-composition.ts` — X1 prompt composition module (reads soul file from disk)
- `packages/server/src/services/session-provisioning.ts` lines 40-73 — `validateSoulPromptPath` guard
- `packages/shared/src/harness/harness-adapter.ts` — `SessionConfig` with deprecated `soulPromptPath`
- `packages/server/src/harness/adapter-pool.ts` — current adapter selection (no harness-type preference)
- `packages/server/src/harness/model-tier-map.ts` — current static tier-to-model mapping

---

## Phase 0 — Noun classification

| Noun | Working definition | Classification |
|---|---|---|
| **Agent** (AI User) | An AI participant in the system, stored as a `users` row with `kind = "ai"`. Has a name, role, team, status, concurrency limits. | **Stable.** X3 adds columns but doesn't change what an agent IS. |
| **Soul Prompt** | The system prompt text that defines an agent's persona, constraints, and role relationship. | **Reshaped.** Currently a file path reference (`soulPromptPath` pointing to `docs/souls/*.md`). X3 moves it to inline DB text content, eliminating the file-read-at-session-time indirection. |
| **Harness Type** | An agent-level preference for which harness adapter runs their sessions. | **Reshaped.** Currently implicit — `AdapterPool.select()` picks the least-loaded adapter with no agent preference. X3 makes it an explicit, stored preference on the agent row. |
| **Model Tier Preference** | The default model tier an agent's sessions should use. | **Reshaped.** Currently a parameter defaulting to `"workhorse"` at session-provision time. X3 stores it as an agent-level default. |
| **Soul Prompt Template** | A role-keyed library of default soul prompt texts, seeded from `docs/souls/` files, used to pre-fill new agents. | **New concept.** Not the same as the individual soul prompt on an agent — this is the factory default per role. |

Only Soul Prompt, Harness Type, Model Tier Preference (all reshaped), and Soul Prompt Template (new) enter deeper probing.

---

## Phase 1 — Probes

### Soul Prompt (reshaped: file path to inline text)

**Identity — settled.** A soul prompt is the persona section of an agent's composed prompt. It was always text; the file path was a storage mechanism, not an identity property. The reshape changes storage, not semantics.

**Essential properties — settled.** Every soul prompt has: text content (markdown), template variables (`{{product}}`, `{{community}}`), a version (implicit via DB update). The X1 prompt composition module already handles frontmatter stripping and variable substitution — those behaviors persist.

**Key probe: Mutability contract.** The current `docs/agent-layer/agent-identity.md` says "An agent is defined by three files" including `SOUL.md`. The codebase has already diverged: the DB `users.soulPromptPath` column and seed data are the real source of truth, not a file system directory per agent. X3 completes this migration by storing the content directly. The doc needs updating to reflect that agent identity lives in the DB, with `docs/souls/` files serving only as seed templates.

**CRITICAL: Doc contradiction.** `docs/agent-layer/agent-identity.md` describes a filesystem-based identity model (`agents/<name>/SOUL.md`, `SKILLS.md`, `IDENTITY.md`). This directory structure was never implemented — the codebase uses DB columns from day one. X3 widens the gap by storing soul prompt *content* in the DB. The doc must be updated to reflect the actual architecture: agent identity is defined by `users` table columns, with `docs/souls/` files serving as role-based seed templates only.

### Harness Type (reshaped: implicit to explicit)

**Identity.** Harness type is a *preference tag* on an agent, not a capability description. It says "when provisioning a session for this agent, prefer adapters that match this type string." It is NOT the adapter itself, NOT the adapter pool entry, NOT a harness capability.

**Key probe: Closure.** Is the harness type vocabulary closed or open?

My read: **open, but validated against registered adapters.** Unlike `ModelTier` (which is a closed enum in `@hyperidle/shared`), harness types should be open because new harness adapters (X5) are pluggable. The pool already has a registration mechanism. The agent's `harnessType` should be validated at session-provision time against actually-registered adapter IDs — not at write time, because adapters may be installed/removed between config and session.

The current `AdapterPool.select()` uses a requirements-based selection (model providers). X3 adds harness-type filtering. But the pool doesn't currently carry a "type" discriminator — entries are keyed by opaque ID strings (`"local"` for the built-in ClaudeAgentSdkAdapter). The adapter pool needs a `type` field on `AdapterMeta` for X3's selection to work.

**Key probe: What happens when the preferred harness is unavailable?** Two options: (a) fail provisioning, (b) fall back to any available adapter. My read: **fail.** If a founder configures an agent to use `"claude-code"` and that harness isn't installed, the session should not silently run on a different harness — the soul prompt and tooling may be tuned for a specific harness. Explicit failure > silent misrouting.

### Model Tier Preference (reshaped: param to stored default)

**Settled.** The `ModelTier` vocabulary is closed (`reasoning | workhorse | fast`), documented in `docs/agent-layer/model-routing-and-cost.md` and typed in `@hyperidle/shared`. X3 stores the agent's default preference. Session provisioning can still override per-session. The preference is a default, not a mandate.

No new probes needed. The reshape is purely a storage location change.

### Soul Prompt Template (new concept)

**Identity.** A soul prompt template is a role-keyed default text used to pre-fill the `soulPrompt` column when creating a new agent of that role. It is NOT the agent's soul prompt (which can diverge after creation). It is NOT a live reference (editing the template doesn't update existing agents).

**Essential properties.** A template has: a role key (from `USER_ROLES`), text content (markdown with `{{variables}}`), a version marker (from the frontmatter in `docs/souls/*.md`).

**Key probe: Where do templates live?** Three options:
1. DB table (a `soul_prompt_templates` table seeded from `docs/souls/` files)
2. In-memory constants derived from `docs/souls/` files at server startup
3. Read from `docs/souls/` files on demand

My read: **Option 1 (DB table).** Templates need to be accessible from the UI (to pre-fill the textarea). Reading files at runtime couples the server to a filesystem layout that may not exist in all deployment modes. A seed migration reads the file contents once and inserts them. The `docs/souls/` files become the version-controlled source, and the DB is the runtime source.

Wait — actually, re-reading the spec constraints: "docs/souls/ files remain as seed templates but are no longer read at session time." This aligns with Option 1. But a separate table adds schema complexity for what is essentially a small lookup. Alternative: store templates as `factorySettings` rows (key = `soul_template:<role>`, value = template text). This avoids a new table.

Revised read: **factorySettings rows**, keyed by role. Simpler. The 5-7 templates are small text blobs. No new table needed.

---

## Phase 2 — Rejection list

### Soul Prompt (the agent's inline text)

1. **NOT a versioned document.** Tempting to add version history, diffs, rollback. Rejected because: X3 spec explicitly lists "Soul prompt versioning or history" as out of scope. The soul prompt is a mutable text field, not a document with audit trail.

2. **NOT a live file reference.** After X3, `soulPromptPath` is deprecated. The DB `soulPrompt` column is the source of truth at session time. `docs/souls/` files are seed sources only. No runtime filesystem reads for soul prompt content.

3. **NOT a structured schema.** The soul prompt is plain text (markdown). It is not a JSON object, not a typed config, not a structured form with named fields. Template variable substitution (`{{product}}`) is a presentation concern handled by prompt composition, not a schema concern on the stored text.

### Harness Type

1. **NOT a harness capability description.** `harnessType` is a preference string, not a set of capabilities. Capabilities (MCP support, model providers, file editing) live on the adapter via `getCapabilities()`. The type is a selection key, not a feature flag set.

2. **NOT required.** An agent with `harnessType = null` means "no preference; use any available adapter." This preserves backward compatibility with all existing agents that have no harness preference.

3. **NOT a runtime binding.** The harness type on the agent row doesn't lock the session to that adapter once started. It's a selection input to `AdapterPool.select()`. If the preferred adapter crashes mid-session and is restarted, re-provisioning still checks the preference.

### Soul Prompt Template

1. **NOT a live link.** Editing a template does NOT update agents already created from it. The template is a one-time pre-fill at agent creation. Agents own their soul prompt independently after creation.

2. **NOT user-editable in X3.** Templates are seeded from `docs/souls/` files. The UI does not expose template editing (that would be "Soul prompt versioning" territory). Templates are read-only factory defaults.

3. **NOT per-agent.** Templates are per-role, not per-agent. A builder template applies to all new builders. There is no per-team or per-product template variant in X3.

---

## Phase 3 — Vocabulary

| Term | Definition | Aliases NOT to use |
|---|---|---|
| **soulPrompt** | The inline text content of an agent's persona prompt, stored on the `users` table. | `soulPromptPath` (deprecated file reference), `systemPrompt`, `persona`, `SOUL.md` |
| **harnessType** | Agent-level preference for which harness adapter type to use for sessions. | `harnessId`, `adapterType`, `runtime`, `harness` (too ambiguous) |
| **modelTierPreference** | Agent-level default model tier for sessions. | `modelTier` (already used for the session-level resolved tier), `defaultModel`, `preferredModel` |
| **soul prompt template** | Role-keyed default soul prompt text seeded from `docs/souls/` files. Used to pre-fill new agents. | `default prompt`, `role prompt`, `seed prompt`, `SOUL.md template` |

---

## Phase 4 — Contracts

### Cardinality
- Every agent has exactly zero or one `soulPrompt` (nullable text). Null means "no persona section in composed prompt."
- Every agent has exactly zero or one `harnessType` (nullable text). Null means "no preference; pool selects any eligible adapter."
- Every agent has exactly zero or one `modelTierPreference` (nullable text). Null means "use provisioning default (`workhorse`)."
- Every role in `USER_ROLES` has at most one soul prompt template. Not every role has a template (e.g., `builder` has no `docs/souls/builder.md` today — builders are code agents that use harness-native instructions). Roles without a template get an empty pre-fill.

### Closure
- `harnessType` vocabulary is **open**. New adapter types can be registered without concept-doc changes. Validated at session-provision time against the adapter pool's registered types.
- `modelTierPreference` vocabulary is **closed** (the `ModelTier` union: `reasoning | workhorse | fast`). Adding a tier requires concept-doc + shared types update per `docs/agent-layer/model-routing-and-cost.md` contract.
- Template role keys use the existing **closed** `USER_ROLES` vocabulary.

### Mutability
- `soulPrompt`: mutable by the founder via Settings UI. Changes take effect on next session (no restart, no migration).
- `harnessType`: mutable by the founder. Same next-session semantics.
- `modelTierPreference`: mutable by the founder. Same next-session semantics.
- Soul prompt templates: **immutable at runtime.** Seeded by migration. Updated only by re-running seed or a future admin feature (out of scope).

### Identity
- All three new columns are properties of the `users` row. The agent's identity is its `users.id` (opaque UUID). These columns don't affect identity.
- Soul prompt templates are identified by role key string (e.g., `"product_manager"`).

### Hard rules
1. **`soulPromptPath` is deprecated.** After X3, session provisioning reads `soulPrompt` (inline text) from the DB, not `soulPromptPath` (file path). The `validateSoulPromptPath` function and its path-traversal guard are removed. The path-traversal attack vector disappears because there is no filesystem read.
2. **Migration is additive.** New columns with null defaults. Existing agents continue to work. The migration also backfills `soulPrompt` from the template matching the agent's role (not from the file — the file content is read once during migration, not at runtime).
3. **Templates are pre-fill, not live link.** An agent's `soulPrompt` is independent after creation. Editing a template (future feature) does not propagate.
4. **Harness type validation is late.** Validated at session-provision time against the adapter pool, not at config-save time. An agent can be configured with a harness type that isn't currently registered — the config is valid, the session will fail to provision if no matching adapter exists.

---

## Phase 5 — Concept doc

The above IS the concept doc (this file, `plans/X3/concept.md`).

The ground-truth doc `docs/agent-layer/agent-identity.md` needs updating to reflect the DB-centric reality. However, per the spec constraints, X3 is additive — the doc update should note that agent identity is now defined by DB columns on the `users` table, with `docs/souls/` files serving as seed templates. The "three files" model is aspirational architecture that was never implemented and is now formally superseded by DB storage.

**Required doc update (for `/architecture` to specify):**
- `docs/agent-layer/agent-identity.md` — replace "three files" description with DB-column-based identity model. Note that `soulPromptPath` is deprecated in favor of `soulPrompt` (inline text).

---

## Phase 6 — Self-critique

**Is the rejection list distinct?** Yes. Soul Prompt rejections cover versioning (feature scope), file reference (storage mechanism), and structured schema (data model). Harness Type rejections cover capabilities (wrong abstraction), optionality (backward compat), and runtime binding (lifecycle). No overlaps.

**Vocabulary collisions?** Verified:
- `soulPrompt` vs `soulPromptPath`: clear deprecation path. The column rename in the DB schema avoids ambiguity.
- `harnessType` vs adapter pool IDs: these are distinct. The pool entry ID (`"local"`) is an instance identifier. The harness type (`"claude-code"`) is a category. Multiple pool entries can have the same type (e.g., two remote Claude Code workers). The adapter pool's `AdapterMeta` needs a `type` field to support this selection.
- `modelTierPreference` vs `modelTier` on sessions: the "Preference" suffix distinguishes the agent-level default from the session-level resolved value. No collision.

**Contracts complete?** Yes — cardinality, closure, mutability, identity, and hard rules are all specified. The open/closed distinction for harness type vs model tier is the most important decision and is clearly stated.

**Rationale concrete?** The reshape is driven by a concrete product need: founders configuring agents through UI requires DB-stored values, not filesystem references. The spec states "so that I can staff my team with agents tailored to specific roles instead of relying on static file-based definitions that require code changes." The rationale is the user story itself.

**Doc update scope correct?** Only `docs/agent-layer/agent-identity.md` needs updating. The model routing doc (`model-routing-and-cost.md`) is unaffected — X3 doesn't change the tier vocabulary or routing logic, only where the default preference is stored.

---

## Rationale

The "three files" agent identity model in `docs/agent-layer/agent-identity.md` was an aspirational design that the codebase never implemented. From the first seed data, agent identity has lived in DB columns on the `users` table. X1 (prompt composition) added the prompt assembly pipeline that reads soul prompts from files and composes them into session instructions. X3 completes the migration by moving the soul prompt content itself into the DB, eliminating the file-read indirection. This removes a filesystem dependency, a path-traversal attack surface, and the requirement to deploy `docs/souls/` alongside the server binary. The UI can now show and edit what was previously hidden in markdown files — making agent configuration a first-class founder activity rather than a developer task requiring code changes.
