# AE6 — Artifact Extensibility: Concept

## Required reading for downstream agents

- `docs/process-layer/artifact-primitive.md` — canonical artifact shape and hard rules (updated by this concept)
- `docs/process-layer/canonical-shapes.md` — process-layer canonical shapes (Money, TokenUsage, Outcome Verdicts)
- `docs/blocks/canonical-shapes.md` — block canonical shapes (text kind uses the Block primitive for rendering)
- `packages/shared/src/types/artifact.ts` — current closed enum and types (to be reshaped)
- `packages/server/src/schemas/artifact-preview.ts` — current Zod preview schema (to be reshaped)
- `packages/web/src/shell/ArtifactView.tsx` — current renderer components (5 shapes)
- `packages/server/src/routes/artifacts.ts` — current create/read routes with closed-enum validation
- `packages/server/src/skill-tools/create-artifact.ts` — agent create-artifact skill tool

---

## Phase 0 — Nouns

| Noun | Classification | Working definition |
|---|---|---|
| **Artifact Kind** | Reshaped | The fundamental content type of an artifact's output. Determines the renderer. Reshaped from 12 business-domain labels to 6 content-type kinds. Vocabulary is open but the initial 6 cover 90%+. |
| **Artifact Label** | New | Business-domain tag on an artifact (e.g., "contract", "email", "test-report"). Provides context; does not determine rendering. |
| **Kind Definition** | New | Static configuration module that registers a kind with its preview schema, renderer, and display functions. The unit of extensibility for adding new fundamental kinds. |
| **ArtifactView shape** | Stable | The 5 current renderer primitives. These collapse into the 6 kind renderers — architecture decides the exact mapping. |
| **Artifact** | Reshaped (minor) | The primitive gains a `label` field alongside `kind`. Kind changes from business-domain enum to content-type enum. |
| **View family** | Stable | The 4 artifact layouts. Closed. Unchanged. |

---

## The core reframe: kind = content type, not business domain

The previous 12-kind model answered "what is this artifact about?" (contract, email, dashboard, decision...). The new model answers "what did the agent produce?" — the fundamental output format that determines how a human reviews it.

**Why this is better:**
1. **The agent barely decides.** Output format determines kind. "I wrote markdown" → `text`. "I made a diff" → `code`. No semantic judgment about whether this is a `contract` or a `comm_draft`.
2. **Kind = renderer.** No mapping layer between 12 domain kinds and 5 view shapes. Each kind IS a review experience.
3. **Business context lives where it belongs** — in labels, task titles, and metadata, not in the type system.
4. **`html` is the universal escape hatch.** LLMs are good at generating HTML. Dashboards, charts, slide decks, forms, interactive visualizations — anything rich renders as HTML. This absorbs most of the long tail.

---

## The 6 fundamental kinds

| Kind | What the agent produced | Preview data | Review experience |
|---|---|---|---|
| **`text`** | Markdown/prose | Markdown body (rendered via Block primitive) | Content preview — read and approve prose |
| **`code`** | Source code diff or file | Diff hunks (file, additions, deletions, context) | Diff viewer — line-by-line code review |
| **`image`** | Visual asset | URL + dimensions | Visual comparison — see what was produced |
| **`data`** | Structured metrics/tables | Key-value pairs, table rows | Metrics/table view — scan numbers and results |
| **`html`** | Rich rendered content | HTML string (sandboxed) | Rendered preview — see the output as the user would |
| **`url`** | Reference to something external | Link + status + label | Action summary — check status of deployed/created thing |

### How the current 12 map to fundamental kinds

| Current kind | Fundamental kind | Business label |
|---|---|---|
| `code_diff` | `code` | — |
| `contract` | `text` | `contract` |
| `drafted_email` | `text` | `email` |
| `decision` | `text` | `decision` |
| `data_analysis` | `text` | `analysis` |
| `comm_draft` | `text` | `communication` |
| `deck` | `html` (or `text` for simple) | `deck` |
| `dashboard` | `html` | `dashboard` |
| `screenshot` | `image` | — |
| `design` | `image` | `design` |
| `verification` | `data` | `test-results` |
| `running_service` | `url` | `service` |

Six of the twelve were just "text with different metadata."

---

## Artifact Kind primitive (reshaped)

**Definition.** The fundamental content type of an artifact's output. Determines the renderer used for review. Open vocabulary with 6 initial kinds that cover 90%+ of agent output.

**Essential properties.**
- Every Artifact has exactly one kind (string, required, immutable after creation).
- Kind strings are `lowercase_snake_case`.
- Kind determines the preview schema and the renderer — it IS the rendering decision.
- The vocabulary is open (DB stores `text`). Adding a new fundamental kind is rare but possible via Kind Definitions.
- At the application level, kinds are either *registered* (has a Kind Definition) or *unregistered* (renders via fallback).

**What it is not.**
- **Not a business-domain label.** "Contract", "email", "dashboard" are labels, not kinds. Kind is about output format, not business context.
- **Not a closed enum.** The vocabulary is open. The initial 6 are expected to cover 90%+, but the system doesn't prevent new kinds. The previous 13-member `ARTIFACT_KINDS as const` is retired.
- **Not a taxonomy.** Kinds are flat. No hierarchy, no grouping. Each kind is independent.
- **Not a plugin identifier.** Open means open to contributors adding code, not runtime injection or marketplace.

**Composition.** Kind is carried by the Artifact's `kind` field. A Kind Definition binds the string to its preview schema and renderer. Labels (see below) provide the business-domain context that kind deliberately does not carry.

**Lifecycle.** Kind strings are values, not entities. No lifecycle.

**Authority.** The agent determines kind at artifact creation time based on what it produced. The Kind Definition registry determines rendering.

**Vocabulary.**

| Term | Definition | Aliases not to use |
|---|---|---|
| **Artifact Kind** | Fundamental content type determining renderer. | artifact type, artifact category |
| **Registered Kind** | A kind with a Kind Definition. Full renderer support. | known kind, built-in kind |
| **Unregistered Kind** | A kind with no Kind Definition. Renders fallback. | unknown kind (retired) |

**Contracts.**
- **Cardinality:** One kind per artifact. Required. Immutable.
- **Closure: OPEN.** Adding a kind = creating a Kind Definition module. No core file edits. Contrasts with BlockKind (closed — structural decomposition of prose, kind set IS the rendering vocabulary).
- **Mutability:** Immutable after creation.
- **Identity:** String value, case-sensitive, `lowercase_snake_case`.

**Hard rules.**
1. Kind determines the renderer. No secondary dispatch on label or metadata for renderer selection.
2. Adding a new kind MUST NOT require editing any file outside the new kind's definition module(s).
3. Unregistered kinds MUST render a sensible fallback — never crash, never blank.
4. The DB stores kind as `text`. No migration needed for new kinds.
5. The initial 6 kinds (`text`, `code`, `image`, `data`, `html`, `url`) ship as the registered set.

---

## Artifact Label (new)

**Definition.** A business-domain tag on an artifact that provides contextual meaning without affecting the fundamental rendering. Labels answer "what is this about?" while kind answers "what format is it?"

**Essential properties.**
- Optional. An artifact can have zero or one label.
- Freeform `lowercase_snake_case` string. Not enumerated.
- Does not determine the renderer — kind does that. Labels may influence minor UI affordances (e.g., an `email` label on a `text` artifact could show To/Subject in a metadata strip) but never the core review experience.

**What it is not.**
- **Not a kind.** Labels don't determine rendering. A `text` artifact labeled `contract` and one labeled `email` use the same text renderer.
- **Not a tag system.** One label per artifact, not many. It's a categorization hint, not a folksonomy.
- **Not required.** Many artifacts won't need a label — the task title provides enough context.

**Composition.** Label is carried as an optional field on the Artifact primitive. It is orthogonal to kind.

**Lifecycle.** Set at creation. Immutable (same as kind).

**Authority.** The agent sets the label at creation time, based on task context.

**Vocabulary.**

| Term | Definition | Aliases not to use |
|---|---|---|
| **Artifact Label** | Business-domain tag for context. | artifact type (ambiguous with kind), artifact category, artifact tag |

**Contracts.**
- **Cardinality:** Zero or one label per artifact.
- **Closure: OPEN.** Any string. No enumeration. No concept-doc update to add a label.
- **Mutability:** Immutable after creation.
- **Identity:** String value, freeform.

**Hard rules.**
1. Labels MUST NOT affect renderer selection. Kind is the sole renderer discriminant.
2. Labels are optional. The system must function identically with or without them.

---

## Kind Definition (new)

**Definition.** A static configuration module that binds a kind string to its preview schema, renderer, and display functions. The unit of extensibility for adding new fundamental content types.

**Essential properties.**
- Identified by its kind string (primary key of the registry).
- Exports: preview schema (Zod), renderer component, display-title extractor, summary function.
- Statically discoverable at build time.
- Split across packages: schema + display logic in `packages/shared`, renderer in `packages/web`.

**What it is not.**
- **Not a database entity.** Code modules, not stored data.
- **Not a runtime registration.** Build-time discovery, no `registerKind()`.
- **Not frequently needed.** The 6 initial kinds cover 90%+. Adding a new kind is a rare, deliberate act — closer to adding a new BlockKind than to adding a new label.

**Composition.** A Kind Definition bundles:
- `kind`: string identifier
- `previewSchema`: Zod schema for the kind's preview data
- `renderer`: React component for the review experience
- `displayTitle(preview)`: extract display title (or null → fall back to task title)
- `summarize(preview)`: one-line summary

**Contracts.**
- **Cardinality:** One Kind Definition per kind string. Uniqueness enforced at build time.
- **Closure:** The Kind Definition *interface* is closed. The *set of definitions* is open.
- **Mutability:** Immutable at runtime.

**Hard rules.**
1. Every Kind Definition MUST export all five members.
2. Kind Definitions are the ONLY mechanism for registering kinds.
3. Build discovers definitions automatically — no manual import list.
4. Renderers MUST be lazy-loadable.

---

## Rationale

The original artifact-primitive.md said kind was "illustrative, not enumerated." The initial architecture closed it to 13 business-domain labels for pragmatic reasons. AE6 corrects this with two moves:

1. **Kind = content type, not domain.** Six fundamental kinds (`text`, `code`, `image`, `data`, `html`, `url`) map directly to review experiences. Business-domain labels (`contract`, `email`, `dashboard`) become metadata tags. This eliminates the semantic judgment call agents had to make ("is this a `contract` or a `comm_draft`?") and replaces it with a format-determined choice ("I wrote prose" → `text`).

2. **Open vocabulary with low extension pressure.** `html` is the universal escape hatch — LLMs are good at generating HTML, and anything rich (dashboards, charts, visualizations, interactive previews) renders as HTML. This absorbs most of the long tail, so new fundamental kinds are rare. But the Kind Definition mechanism exists for when they're genuinely needed.

The contrast with BlockKind remains deliberate: blocks decompose prose structure (closed vocabulary, concept-doc gated), artifact kinds classify output format (open vocabulary, extension by file creation).

---

## Design tensions for /architecture to resolve

1. **Migration path.** How to migrate existing artifacts with old kinds (`code_diff` → `code`, `contract` → `text` + label `contract`, etc.). DB-level migration vs. read-time normalization.

2. **Label influence on UI.** The concept says labels don't affect renderer selection. But do they affect metadata strips, gallery card subtitles, or filter facets? Architecture defines the boundary.

3. **HTML sandboxing.** The `html` kind needs a security model — CSP, iframe sandbox, script policy. Architecture defines the sandbox contract.

4. **Preview schema per kind.** Six schemas instead of twelve. Architecture defines the exact Zod shapes.

5. **Kind Definition module structure.** File convention, cross-package split, lazy loading strategy.

6. **`unknown_kind` retirement path.** The sentinel value exists in the DB and in tests. Architecture plans the migration.

7. **Agent guidance.** How does the agent harness communicate the 6 kinds to agents? Tool parameter schema, documentation, examples.
