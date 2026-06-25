# AL5 — Concept: Review templates (domain/tool/task-specific review surfaces)

**Workpackage:** AL5 (Track AL). Per-WP concept act. **Level:** per-workpackage — inherits the AL1 track concept (`plans/AL1/concept.md`) and the AN track concept (`plans/AN/concept.md`) as **fixed inputs**.
**Date:** 2026-06-25
**Status:** LOCKED (founder redirect 2026-06-25 — see Rationale). Reshapes the first draft of this concept (which centred on an MCP-Apps `ui://` override resolver) into a **review-template** model. Downstream `/architecture` + `/pipeline` explore *inside* this concept; they do not reshape it.

> **The founder redirect (2026-06-25).** *"Skip the supplier-shipped MCP UI for now — that's a long stretch. Allow the community (and us — we'll build templates too) to contribute review surfaces for specific apps/tools/tasks in a template style. This review experience is a key of the future of agentic business: properly structured review surfaces that are domain- or tool-specific. Templates are the easier start. The question is how do we make it easy to **build** templates and easy for users to **employ** them. Focus on app/tool/task-specific templates, not community-only."* This concept answers **what a review template IS** for the two humans it serves — the **end user who employs one** and the **contributor (HyperIdle or community) who builds one** — and reconciles the overlap with AN4. Syntax, schema, selection-precedence, and safety *mechanism* are deliberately deferred to `/architecture`.

> **Research base (codebase + web, 2026-06-25; full notes in the agent transcripts).** Codebase: the nine AL2 family canvases are typed, composable React components selected by a fallback-safe registry (`getReviewCanvas`); HyperIdle already uses declarative "definition + registry" patterns (`kinds/registry.ts` KindDefinition, `tool-registry.ts` ToolDefinition) and the AN trust-tier vocab. Web: across Grafana dashboards, Backstage software templates, Adaptive Cards / Block Kit, dbt/LookML, Notion/Zapier galleries — and the **Home Assistant / HACS** cautionary tale (custom *code* cards → real CVEs, abandonware) — the load-bearing lessons are: **declarative-data templates interpreted by a trusted host engine** (an unsafe one is *inert*, not dangerous); **author owns content, host owns look/feel/safety**; **author by example with live sample-data preview, or fork-an-existing-one**; **one catalog, two sources, distinguished only by provenance**; **"verified" certifies identity, not correctness**; **versioned + graceful fallback to the base family**; and the **universal review-slot skeleton** every domain review surface shares.

---

## Required reading (downstream `/architecture`, `/pipeline` must read these)

- `.pipeline/work-packages/TRACK-AL.md` — AL5 spec (acceptance criteria updated 2026-06-25 to the template model).
- `.pipeline/work-packages/TRACK-AN.md` — **AN4** (Ecosystem integration registry) — the boundary peer; reconciled here (a connector *references* a review template, it no longer ships a `ui://` UI).
- `plans/AL1/concept.md` — the track concept (Subject, Review, the §1.5 parts, the examine-vs-converse tension). Fixed input.
- `plans/AL1/design/tool-ecosystem-and-canvases.md` — the proof-family taxonomy + the minimal manifest sketch + mini-logo identity. (NB: §3's MCP-Apps `ui://` tier is now *deferred* — see Rationale.)
- `plans/AL1/design/review-system.md` §2 — the per-tool-template-over-family-floor idea this formalises.
- `plans/AN/concept.md` — locks **Trust tier** `{vetted, community}` and **Connector** as fixed inputs. AL5 *reuses* the trust tier; does not redefine it.
- `docs/human-interface-layer/review-primitive.md` — the ground truth this act extends.
- Code seam: `packages/web/src/pages/review/` (the nine family canvases, `canvas-registry.ts`, `ReviewComposition.tsx`, `review-artifact.ts`), `packages/shared/src/kinds/registry.ts` (the definition+registry pattern to echo), `packages/shared/src/connection.ts` (`TrustTier`).

---

## Phase 0 — The nouns

| Noun | Classification | One-line working definition |
|---|---|---|
| **Review template** | **New** (central) | A **declarative, named specialization of a generic review family**, scoped to a recognizable situation (an app/tool, a task/domain, an artifact kind), that fills the review surface's slots with domain-specific content; authored by HyperIdle *or* a contributor through **one** mechanism; degrades to its base family. |
| **Family floor** | **Stable** (input, AL2) | The nine generic per-proof-family review surfaces. A template's **base** (what it specializes) and the **always-present fallback**. AL5 does not touch its content. |
| **Binding** | **New** (satellite) | What ties a template to the situation it specializes — the recognizable `(app/tool · task/domain · artifact kind)` it applies to. A template is **inert until bound**; the binding is also where a user/agent sees *which lens is active* and can swap it. |
| **Provenance** | **New** (satellite) | Who authored a template — **first-party (HyperIdle)** vs **community** — surfaced as a precisely-scoped signal. Certifies *identity*, never *correctness*. |
| **Trust tier** | **Stable** (input, AN) | `vetted \| community` — locked in `plans/AN/concept.md` (CLOSED). Reused as the consent/risk axis for a template; not redefined. |

Only **Review template** (central), **Binding**, and **Provenance** get concept work below. Family floor and Trust tier are inputs.

**Dropped from the first draft (founder redirect):** the **tool-shipped `ui://` canvas** tier (MCP Apps) and the **Canvas sandbox / iframe substrate** are **out of AL5 scope** — deferred as a possible *future* tier (see Rationale). Because a review template is **declarative data interpreted by HyperIdle's own renderer**, AL5 introduces no untrusted-code execution surface and therefore no sandbox.

**Human design review forecast (advisory).** **Two surfaces, two answers.** The **employment** surface (how a user/agent sees the active lens, previews/swaps a template, sees its provenance) and the **authoring** surface (build-by-example with live sample-data preview, fork-an-existing-one) are **new user-facing experiences** central to the WP's value → forecast **Yes**. The selection/binding *internals* are runtime → No. `/design`'s `DESIGN-CLASS` stays authoritative.

---

## Phase 1 — Essence (framed around the two humans)

### Review template — the central noun

**Identity.** A review template is **a declarative specification of how to review a recognizable kind of work** — "a Stripe refund review", "a marketing-campaign review", "a data-migration review" — that **specializes one of the nine generic family floors** with domain-specific content, ordering, labels, the inline policy/standard, and the right decision framing. It is **data, not code**: HyperIdle's own trusted renderer interprets it. It is the *lens*, never the *work* and never the *decision*.

**Essential properties (every review template has):**
- **A base family it extends** — it is a specialization of one floor (e.g. the action/operation receipt), inheriting that family's interactions, safety, and graceful fallback. Not a freeform surface.
- **A binding** — the situation it applies to (`app/tool · task/domain · artifact kind`); inert until bound.
- **Filled slots** — it populates the *universal review skeleton* every good domain review surface shares (research, Part B): **{artifact · rationale · blast-radius/impact · judging-context · what-needs-me · policy/standard-inline · decision-options · coordination-state}**. The generic surface owns the slots; the template fills them per domain.
- **Provenance + trust tier** — who made it, and `vetted|community`.
- **A version** — it is a versioned artifact; an instance can pin it; a change surfaces as a diff.
- **Sample/fixture data** — it ships with example data so it *renders the instant it is authored* (build-by-example).

**For the contributor (who BUILDS one).** The authoring ergonomic *defines who can contribute*, so it is concept-load-bearing. A template is **authored by example** — you fill in a concrete instance and see it render live against sample data — or by **forking an existing template**. The author owns **content** (what to surface about this kind of review and how to interpret the change-set); HyperIdle owns **look, feel, interaction, safety, and lifecycle**. HyperIdle's *own* templates are authored through the *same* mechanism — a first-party template is just a maintainer-authored community template.

**For the end user (who EMPLOYS one).** A template is **inert until bound** to *this* agent/tool/task. HyperIdle **auto-suggests/auto-applies the lens** when it confidently recognizes the situation — safely, because the template only changes *presentation* (reversible, low-stakes); the **active lens is always visible and swappable**, and the user can **preview before committing** and **fork/override** after. The high-stakes gate is the **action under review**, never the choice of lens.

### Binding — the inert-until-bound tie

**Identity.** The relationship `template ⇄ situation`. A template declares the situation it specializes — some combination of **app/tool** (Stripe), **task/domain** (a refund, a campaign), and **artifact kind** (the proof family). Whether one axis dominates, how specificity is scored, and the match syntax are **`/architecture`**. Concept fixes only: a template is **selected by recognizing the situation, not chosen blindly by the reviewer**, and the selection is **transparent and overridable**.

### Provenance — identity, not correctness

**Identity.** The author signal (`first-party | community`, plus identity/adoption/recency signals at the point of choice). Locked lesson: a "verified/vetted" mark certifies **who made it**, not **that the review is right** — so for a surface that gates real agent actions, the template is **inspectable** (preview + visible content) before employ; the badge never substitutes for that.

### Lifecycle

```
authored (by example, with sample data) or forked  →  registered with provenance + trust tier + version
  →  discoverable in one catalog (first-party + community, filtered by provenance)
  →  bound to a situation (auto-recognized, or chosen) — inert until bound
  →  EMPLOYED: lens auto-applies on confident match, visible + previewable + swappable
       → fills the review's slots with domain content over its base family
  →  stale / abandoned / removed / malformed  →  DEGRADES to its base family floor (never breaks)
  →  upstream improves  →  re-offered as a diff; local overrides preserved (the open opportunity)
```

No new *review* lifecycle — the template is a presentation layer under AL1's `open → … → resolved` and AL7's execution-on-approve. The template never mutates the Subject, the verdict, the staged action, or the gate.

### Authority

- **The template author** (HyperIdle or community) owns the template's **content**.
- **HyperIdle (host)** owns **rendering, look/feel, interaction, safety, the catalog, selection, and the always-present floor** — and is the trusted interpreter of the declarative spec.
- **The end user** owns **which lens is active** for their review (visible, previewable, swappable) — but **never** has the lens change the decision or the action.

---

## Phase 2 — Rejection list (what a review template is NOT)

- **…shipped code / a plugin.** It is declarative data interpreted by HyperIdle's trusted renderer. *Reason: the HACS lesson — custom-code review surfaces inherit real CVEs and abandonware; a declarative template that's malformed/abandoned is **inert** (degrades to the floor), not dangerous. This is why we can defer the `ui://` supplier-UI path and start with templates.*
- **…a freeform new surface.** It **specializes a generic family** and degrades to it. *Reason: inheriting a base family gives every template the family's interactions, safety, and a graceful fallback; freeform surfaces fragment and can't fall back.*
- **…the work, the verdict, the action, or the gate.** It changes *presentation only*. *Reason: "auto-apply the lens, never the approval" — the lens is reversible/low-stakes; the action under review is the high-stakes human gate (AL7). Conflating them would let a presentation choice move a real decision.*
- **…a per-tool thing HyperIdle must exhaustively author.** First-party + community contribute through one mechanism; an **unrecognized** situation simply gets the floor. *Reason: "review for anything" must hold for tools/tasks nobody templated — the floor is the universal guarantee (AL1 review-system §2).* 
- **…a correctness guarantee because it's "vetted".** Provenance certifies *identity*, not that the review is right. *Reason: the VS Code verified-badge lesson — users conflate identity with safety; for action-gating surfaces, inspectability (preview + visible content) is the real trust primitive.*
- **…two systems (first-party vs community).** One mechanism, one shape, distinguished only by provenance. *Reason: every healthy ecosystem (Backstage `kind: Template`, Grafana library, Notion gallery) uses one catalog — HyperIdle's own templates ride the identical path.*
- **…a hidden auto-magic the user can't see or change.** The active lens is always visible, previewable, swappable. *Reason: a generic-surface mismatch breeds "subtle distrust"; transparency + easy override is what removes the "almost what we need" adoption tax.*
- **…a Connector (AN boundary).** A connector **integrates a tool** (MCP server + auth); a template **specializes a review surface**. *Reason: distinct nouns with distinct lifecycles — a "Stripe refund review" template is contributable by someone who does not own the Stripe connector; a connector may merely *reference* a preferred template.*

---

## Phase 3 — Vocabulary lock

| Term | Definition | Aliases not to use |
|---|---|---|
| **Review template** | A declarative, versioned specialization of a generic review family, bound to an app/tool/task, that fills the review surface's slots with domain content; authored first-party or community through one mechanism; degrades to its base family. | canvas override, plugin, widget, custom canvas, skin, theme |
| **Family floor** | The nine AL2 generic per-proof-family review surfaces; a template's base and the always-present fallback. | default canvas, generic canvas *(descriptive ok, not a name)* |
| **Binding** | The tie between a template and the situation it specializes (`app/tool · task/domain · kind`); inert until bound. | match rule, selector *(those are `/architecture` mechanism, not the noun)* |
| **Provenance** | Who authored a template (first-party vs community) + identity/adoption signals; certifies identity, not correctness. | verification, trust *(reserve "trust tier" for the AN axis)* |
| **Trust tier** | *(reuse AN — do not redefine)* `vetted \| community` consent/risk axis. | trust level, security tier |

Collision checks (grep-verified, Phase 6): "template" already means **system-prompt template** and **Strategy reference template** in the codebase — **"review template" is a new, non-colliding compound** (no review-surface usage exists). `Trust tier`/`Connector` reused verbatim from AN. `Family floor`/`canvas` extend the AL2 review vocabulary.

---

## Phase 4 — Contracts (concept-level; syntax/schema deferred to `/architecture`)

- **Cardinality.** A review renders through **exactly one surface**: the most-specific **bound** template if one applies, else the **family floor** (so cardinality is always ≥1 — the floor guarantees it). A template **extends exactly one base family**, carries **one provenance + one trust tier + one version**. A situation may have **0..N** candidate templates; **one** is active, and it is **visible + swappable**.
- **Closure.** Base families = the AL2 **closed** set (nine). The set of **templates is OPEN** (any first-party/community author contributes; echoes the open artifact-kind + open Connector vocab). **Trust tier CLOSED** `{vetted, community}` (AN). **Provenance CLOSED** `{first-party, community}`. The **universal slot skeleton a template fills is a fixed vocabulary** (the ~8 slots), so templates stay "expressive-enough, not a UI framework."
- **Mutability.** Templates are **versioned**; an instance may **pin** a version; a change surfaces as a **diff**. The active lens is **freely swappable** (presentation is reversible). A template **never mutates** the Subject, the verdict, the staged action, or the gate.
- **Authority/identity.** Author owns content; host owns rendering/safety/lifecycle/catalog/floor. A template's identity = its id + version + provenance. Selection is host-owned and transparent.
- **Hard rules.**
  1. **Declarative + inert-on-failure.** A template is declarative data interpreted by HyperIdle's trusted renderer. A malformed / abandoned / removed / untrusted template is **inert — it degrades to its base family floor**, never dangerous and never breaks the review. *(The HACS-avoidance + graceful-degradation rule; the reason `ui://` shipped-UIs can be deferred.)*
  2. **The family floor is the base and the always-present fallback.** Every template is additive; "review for anything" holds for any unrecognized situation.
  3. **Auto-apply the lens, never the approval.** A template changes presentation only; the active lens is always **visible + previewable + swappable**; it never changes the verdict, the staged action, or the gate (AL7).
  4. **One mechanism, one shape — provenance is the only difference.** First-party and community templates are the same noun; HyperIdle's own templates are authored and registered through the identical path.
  5. **Provenance certifies identity, not correctness.** For an action-gating surface, the template is **inspectable** (preview + visible content) before employ; a vetted/verified mark never substitutes for that.
  6. **Trust tier is the AN-locked `{vetted, community}`** — reused, never redefined; a `community` template's consent step rides AN's consent model.
  7. **Boundary (AL5 ⟂ AN4).** AL5 owns the **Review template** noun — authoring, the catalog, employment, and the floor fallback. AN4 owns the **Connector** (tool integration) registry. A connector **may reference** a preferred review template; a template is **independently contributable** without owning the connector. Shared, AN-owned vocabulary: **trust tier**. There is **no `ui://` shipped UI** in either track's current scope.

---

## Phase 5 — Ground-truth updates

- `plans/AL5/concept.md` — this file (per-WP concept lock; reshaped to the template model).
- `docs/human-interface-layer/review-primitive.md` — **reframed** "Canvas resolution and overrides" section to **"Review templates"**: declarative specialization of a family floor, the two-human framing, inert-on-failure degradation, provenance-not-correctness, and the AL5/AN4 boundary. No `ui://`/sandbox content.
- **AN reconciliation (the "relevant parts of `/concept AN4`" the founder asked for):**
  - `plans/AN/concept.md` — the Connector manifest's `ui://canvas` field reframed to an **optional review-template reference** (a connector points at a preferred declarative template, it does not ship a sandboxed UI); AN4 row + ride-the-standard rule updated to match.
  - `.pipeline/work-packages/TRACK-AN.md` AN4 — "ships its own `ui://` review canvas" reframed to "references a review template".
  - `.pipeline/work-packages/TRACK-AL.md` AL5 — title + acceptance criteria reshaped to the template model; `ui://` supplier-UI tier marked deferred.

---

## Phase 6 — Self-critique (1 round)

- **Right altitude?** Yes — the noun + the two humans (contributor authoring-by-example; end user employing/previewing/swapping). Syntax, match-precedence, schema, and the safety *mechanism* are explicitly pushed to `/architecture`. (This was the founder correction on the first draft.)
- **Research-grounded?** Yes — each essential property and hard rule traces to a cited lesson (HACS → declarative-inert; Adaptive Cards → author-owns-content/host-owns-look; Backstage/Grafana/Notion → one-catalog-two-sources; VS Code → identity≠correctness; dbt/LookML → versioned+pinnable; the BPM/RPA/code-review/moderation convergence → the universal slot skeleton).
- **Rejection list real & distinct?** Yes — eight rejections name distinct traps (code, freeform, the-action, exhaustive-authoring, correctness-badge, two-systems, hidden-magic, connector), each with a reason.
- **AN4 boundary sharp & reconciled?** Yes — distinct nouns (template specializes a review surface; connector integrates a tool); connector *references* a template; `ui://` shipped-UI removed from both tracks' scope; trust tier stays AN-owned. The reconciliation edits are listed in Phase 5.
- **Vocabulary collisions?** "review template" is new (no review-surface "template" usage today). Trust tier/Connector reused from AN.
- **Deferred correctly to `/architecture`?** The template schema, the binding/selection match + specificity scoring, the authoring/preview tooling, versioning/pinning/diff mechanics, the catalog storage, and *if/when* the `ui://` future tier returns.

**Concept LOCKED.** `/architecture` and `/pipeline` explore inside it.

## Rationale (why this shape, and why the redirect)

The first draft of this concept led with the MCP-Apps `ui://` override resolver — a tool's own MCP server shipping a sandboxed review UI. The founder redirected (2026-06-25): supplier-shipped UIs are a long stretch, and the durable, near-term value is **structured, domain/tool/task-specific review surfaces contributed in a template style — by the community *and* by HyperIdle**. The research makes the redirect not just expedient but *correct*: the single biggest determinant of an ecosystem's health is **declarative-data vs shipped-code** contribution. Declarative templates interpreted by a trusted host renderer turn the HACS/VS-Code **security-and-abandonware** problem into a far cheaper **quality-and-discovery** problem — an unsafe template is *inert*, degrading to the family floor, never dangerous. That single choice is why the `ui://` sandboxed-UI path can be safely deferred (and, if it ever returns, it returns as one more declarative-ish tier behind the same floor, with the iframe+CSP+consent machinery the MCP-Apps standard already specifies). The two expensive-to-change decisions locked here — **a review template is a declarative specialization of a family floor that degrades gracefully**, and **first-party + community contribute through one provenance-tagged mechanism** — ripple through AL5's architecture and AN4's registry, and are locked now so neither track builds shipped-code review surfaces or two parallel catalogs. The deeper bet, in the founder's words: *properly structured, domain-specific review surfaces are a key of the future of agentic business* — the generic floor makes "review for anything" true; templates make it **good** for the work that matters.
