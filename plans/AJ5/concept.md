# AJ5 — Design annotation concept

**Workpackage:** AJ5 — First-party design annotation (replaces AJ3's deferred external-MCP loop).
**Level:** Per-workpackage concept. Inherits Track AJ (TSX is the single design source of truth; design medium = the live viewer at `:8098`).

## Why this exists (the reframe)

AJ3 shipped the *gate* (`designReviewDecision`) and the *isolation harness* (`MockProviders`) but **deferred the actual annotation loop** to external Chrome-extension MCP servers (Vibe Annotations, MCP Pointer) — documented in `packages/design-system/FEEDBACK.md`, never built. The founder calls that a hoax: a feature that exists only as a pointer to someone else's uninstalled tool. AJ5 builds the loop *into the viewer*: click an element, write a note, the agent reads the notes back as context. No extension, no external MCP, no copy-paste mandated.

## Required reading (downstream: `/architecture`, `/pipeline`)

- `.pipeline/work-packages/TRACK-AJ.md` — AJ3 (lines 97–144) for the deferred AC4/AC5 this supersedes; Track AJ frame.
- `packages/design-system/viewer/main.tsx` — viewer SPA entry, `useHashRoute`, `TsxComponentView`.
- `packages/design-system/viewer/discovery.ts` — `discoverStories()`, `StoryMeta` shape.
- `packages/design-system/vite.config.ts` — Vite dev server (`root: viewer`, port 8098). The dev-middleware hook lives here.
- `packages/design-system/src/ds-attrs.ts` — `dsProps` / `dsShellProps` (only the outermost element gets `data-ds-component`; this is *why* fiber resolution is needed).
- `packages/design-system/scripts/feedback-overlay.js` — the 427-line clipboard bookmarklet; prior art for the overlay UX, not the transport.
- `.claude/skills/human-design-review/SKILL.md` — the loop AJ5 makes real; its `read_annotations`/`watch_annotations` prose is replaced by file reads.

---

## Nouns

| Noun | Classification |
|---|---|
| **Annotation** | New primitive |
| **Review round** | New primitive |
| **Annotation target** | New primitive (satellite of Annotation) |

Stable inputs (no concept work): Story, Variant, the viewer, `data-ds-component`.

---

## Annotation primitive

**Definition.** A founder-authored note attached to one element in a rendered story variant, captured in the viewer and read back by the agent as design-review context.

**Essential properties.**
- `note` — the founder's free text (the actual feedback).
- `target` — which element it points at (see Annotation target).
- `round` — the review round it belongs to (see Review round).
- `story` + `variant` — the catalog title + variant name being viewed (from the hash route).
- `id` — opaque, stable within a round so the agent can reference "annotation 3".
- `createdAt` — timestamp; orders annotations within a round.

**What it is not.**
- **Not a comment thread.** One-way founder → agent. No replies, no resolution state stored in the file. The agent acts on it and the *next round* is the founder's response — we don't model conversation. (Why: the loop is "annotate → agent revises → re-inspect → new round", not a chat; threading would duplicate the round mechanism.)
- **Not a code edit / CSS tweak.** The clipboard bookmarklet let founders live-tweak CSS; AJ5 annotations carry *intent* ("move this control left", "this radius is too tight"), not patches. (Why: TSX is the single source of truth — AJ1; the agent edits TSX, the founder describes the goal. Tests must not drive behavior, and neither should hand-tweaked inline styles.)
- **Not persisted product data.** Lives in a gitignored dev file, never in the app DB, never bundled. (Why: this is design-medium tooling — AJ3 scope rule "never bundled in HyperIdle's bundle".)
- **Not a selector the agent must re-resolve.** The captured component name + element descriptor is a *human-readable pointer*, not a queryable CSS path the agent re-executes against a DOM. (Why: the agent reads markdown and edits TSX; it never re-renders to find the element.)

**Composition.** An Annotation *carries* a `note` and a `target`; *belongs to* exactly one Review round; *names* a Story + Variant.

**Lifecycle.** `drafted` (founder clicked an element, overlay open) → `saved` (written to the round file). That's it — no `resolved`/`acted` state in the file. An annotation the agent has addressed simply isn't carried into the next round; the founder starts a fresh round to continue.

**Authority.** The founder produces annotations through the viewer overlay. The viewer dev-middleware is the only writer to the file. The agent is read-only over annotations — it never writes the file, only acts on it by editing TSX.

---

## Review round primitive

**Definition.** A named, timestamped batch of annotations representing one pass of the founder over a design — the unit that lets the agent understand review *iterations* over time.

**Essential properties.**
- `round` — a monotonic ordinal (1, 2, 3…) and/or a timestamp label.
- `startedAt` — timestamp.
- ordered list of the annotations captured in this round.

**What it is not.**
- **Not per-component.** The founder explicitly rejected scoping the file by component (`Button.md`). Rounds are scoped by *time/iteration*, spanning whatever components the founder touched in that pass. (Why: the founder reviews a *screen*, touching many components; the agent needs "what did the founder say in pass 2", not "all notes ever on Button".)
- **Not auto-closed.** A round stays open and accumulating until the founder explicitly starts a new one via the UI control. (Why: the founder decides when a pass is done — "some way from the UI to tell that we are doing a new review iteration".)
- **Not the agent's to create.** Only the founder's "new iteration" action opens a round. The agent reading the file never starts one.

**Composition.** A round *contains* an ordered list of Annotations; rounds are *ordered* within one annotations file.

**Lifecycle.** `open` (current; new annotations append here) → `closed` (founder clicked "new iteration", a later round is now open). Closed rounds are immutable history.

**Authority.** Founder opens a round via the viewer control; the dev-middleware appends. Source of truth = the on-disk annotations file.

---

## Annotation target primitive

**Definition.** The human-readable pointer identifying *what* an annotation is about: the nearest React component name plus a short element descriptor and the story/variant context.

**Essential properties.**
- `component` — nearest component `displayName`, resolved by walking the React fiber from the clicked DOM node (works for any element, including inner spans and plain HTML that lack `data-ds-component`).
- `dsComponent` — the `data-ds-component` value when present (the design-system component name), for cross-checking.
- `element` — a terse descriptor of the clicked node: tag + key classes / text snippet, so the agent can disambiguate which element within the component.
- `story` + `variant` — from the viewer hash route.

**What it is not.**
- **Not a brittle CSS selector chain.** We capture a *name + descriptor*, not a re-runnable `nth-child` path. (Why: the agent edits TSX by component name; a deep selector would rot on the first markup change and isn't what the agent consumes.)
- **Not limited to design-system components.** Fiber resolution names any element. `data-ds-component` alone fails on inner/plain elements — that's the explicit reason fiber was chosen over the attribute-only approach.

**Composition.** Carried by exactly one Annotation.

**Authority.** Computed by the viewer at click time from the rendered fiber tree; immutable once saved.

---

## Vocabulary

| Term | Definition | Aliases not to use |
|---|---|---|
| **Annotation** | One founder note on one element in a rendered variant. | comment, feedback note, vibe annotation, pin |
| **Review round** | A timestamped batch of annotations = one review pass. | session, iteration file, batch, sweep |
| **Annotation target** | Component name + element descriptor + story/variant the note points at. | selector, anchor, locator |
| **annotations file** | The single gitignored on-disk file the agent reads. | export, dump, Button.md |

Note: "vibe annotation" is the retired external-tool concept — AJ5 deliberately does **not** reuse the name to avoid implying the Chrome-extension dependency.

---

## Contracts

- **Cardinality.** One Annotation → exactly one Annotation target, exactly one Review round, exactly one Story+Variant. One Review round → 0..N Annotations. One annotations file → 1..N Review rounds (newest open).
- **Closure.** The annotation/round shape is closed — adding a field requires updating this concept + the file format. The component-name vocabulary is open (any fiber `displayName`).
- **Mutability.** An Annotation is immutable once saved. The open Review round is append-only. Closed rounds are immutable. The founder's only mutations are "add annotation" and "start new round".
- **Identity.** Annotation `id` is opaque, unique within its round. A round is identified by its ordinal + `startedAt`.
- **Hard rules.**
  - The annotations file is **gitignored and never bundled** into any HyperIdle build — design-medium only.
  - The viewer dev-middleware is the **only writer**; the agent is **read-only** over annotations and acts solely by editing TSX (AJ1: TSX is the single source of truth).
  - Annotations carry **intent, not patches** — no inline CSS/style edits flow through this channel.
  - Rounds are scoped by **time/iteration, never by component**.
  - Component naming uses **fiber resolution**, with `data-ds-component` as a corroborating field, never the sole source.

---

## Rationale

The founder's two corrections shaped this concept. First: *don't scope by component, scope by review iteration* — because a design review is a pass over a whole screen, and the agent's real need is "what changed between my last revision and the founder's next look", which is a temporal/round axis, not a component axis. That promoted **Review round** from an implementation detail to a first-class primitive with its own UI control. Second: *`data-ds-component` isn't on every element, so use React fiber if it's more reliable* — because `dsProps` only stamps the outermost node, leaving inner spans and plain HTML unnamed; fiber walking names any clicked element, making **Annotation target** robust. The whole package is a deliberate de-hoaxing of AJ3: the loop it described in prose becomes a few hundred lines of first-party viewer code with an on-disk file as the agent interface — no external extension, no MCP server, no mandated copy-paste.
