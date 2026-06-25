# AL5 — Concept: Review surfaces (code, registry-distributed, deliberately adopted)

**Workpackage:** AL5 (Track AL). Per-WP concept act. **Level:** per-workpackage — inherits the AL1 track concept (`plans/AL1/concept.md`) and the AN track concept (`plans/AN/concept.md`) as **fixed inputs**.
**Date:** 2026-06-25
**Status:** LOCKED (founder redirect #2, 2026-06-25 — see Rationale). Supersedes two earlier drafts: (1) MCP-Apps `ui://` supplier UIs, and (2) declarative-config "templates" with runtime auto-apply. Both rejected. This draft is **code-first, registry-distributed, deliberately-adopted** — the model every healthy OSS component ecosystem actually uses.

> **The founder redirect (2026-06-25).** Two corrections that reshape the noun: **(a) it's CODE, not config** — "our review canvas is just a bit of React; in an age where code is cheap and AI-written, why force declarative configuration?" A contributed review surface *is* a React component specializing a base canvas. **(b) NO runtime auto-apply** — "imagine thousands of surfaces for the same tool/task; auto-picking one at render is mad." Selection is a **deliberate, owned, adopt-time choice**, never a runtime competition. The frame is still the **two humans**: the **contributor** who writes a surface and the **team** who adopts one.

> **Research base (codebase + web, 2026-06-25, mechanism-level; transcript has full cites).** How OSS templating *actually* works as code — shadcn/ui registry, Docusaurus swizzling, Radix/MUI slots, Grafana/Backstage/VS-Code code-plugins, Tailwind `@layer`. The load-bearing findings: **(1)** the contribution unit is **code + a small manifest**, distributed via a **registry anyone can host** (shadcn `registry-item.json`; adopt by URL/namespace, deps resolved transitively); **(2)** you **adopt exactly one, at build/setup time, and own it** (shadcn copies source *into your repo*; npm install; swizzle) — the registry is a *catalog of availables*, the running app reflects *deliberate adoptions* — **no ecosystem does runtime auto-match among competitors**; **(3)** layering has two declared modes — **WRAP** (compose over the base via slots: upgrade-safe) vs **EJECT** (fork the base source: total control, you own upgrades) — Docusaurus's per-component **Safe/Unsafe/Forbidden** taxonomy; **(4)** "declarative is safer" is an argument about *untrusted runtime plugins in end-user installs* (Grafana signing, VS-Code verification), **NOT** about an OSS repo of reviewable component code adopted at build time — our threat model is code review + ownership, not a runtime sandbox. So: pay no DSL-ceiling tax to solve a sandbox problem we don't have.

---

## Required reading (downstream `/design`, `/architecture`, `/pipeline` must read these)

- `.pipeline/work-packages/TRACK-AL.md` — AL5 spec (reshaped 2026-06-25 to the code/registry/adoption model).
- `.pipeline/work-packages/TRACK-AN.md` — **AN4** — boundary peer; a Connector may *reference* a review surface registry item.
- `plans/AL1/concept.md` — the track concept (Subject, Review, the §1.5 parts). Fixed input.
- `plans/AL1/design/tool-ecosystem-and-canvases.md`, `plans/AL1/design/review-system.md` §2 — the per-tool-surface-over-floor idea this formalises as code.
- `plans/AN/concept.md` — locks **Trust tier** `{vetted, community}` + **Connector**. Reused, not redefined.
- `docs/human-interface-layer/review-primitive.md` — the ground truth this act extends.
- Code seam: `packages/web/src/pages/review/` — the **base canvases** (the nine AL2 React components + `canvas-registry.ts` + `ReviewComposition.tsx`) a surface specializes; `packages/shared/src/kinds/registry.ts` — the existing definition+registry pattern to echo; `packages/shared/src/connection.ts` — `TrustTier`.

---

## Phase 0 — The nouns

| Noun | Classification | One-line working definition |
|---|---|---|
| **Review surface** | **New** (central) | A **React component** that specializes a base review canvas for a specific app/tool/task (a "Stripe refund review", a "campaign review"). The contribution unit — **code**, plus a small manifest descriptor — authored by HyperIdle *or* the community. |
| **Base canvas** | **Stable** (input, AL2) | One of the nine generic per-proof-family review components. The **floor** a surface specializes (via slots) and the **always-present fallback**. Exposes the review's universal slots; AL5 makes its extension points explicit. |
| **Registry** | **New** (satellite) | The **catalog of available review surfaces** (HyperIdle-published + community-published), shadcn-style: anyone can host/publish; a surface is fetched by URL/namespace with its deps. A catalog of *availables*, not a set of *actives*. |
| **Adoption** | **New** (satellite) | The **deliberate, owned, committed choice** to use a surface for a review situation — a reviewable mapping `(situation → adopted surface)` the team authors. **Build/setup-time, never runtime auto-match.** |
| **Wrap / Eject** | **New** (satellite, the layering axis) | The two ways a surface layers over a base canvas: **wrap** (compose over it through slots — upgrade-safe) or **eject** (fork its source — total control, you own upgrades). Per Docusaurus swizzle. |
| **Trust tier / Provenance** | **Stable** (input, AN) + reshaped | `vetted \| community` (AN, reused) + who authored (first-party vs community). The adopt-time review/consent signal — **not** a runtime sandbox. |

Concept work below covers **Review surface** (central) and its satellites **Registry**, **Adoption**, **Wrap/Eject**. Base canvas and Trust tier are inputs.

**Dropped:** declarative-config templates + the resolver that "auto-applies" among them (redirect #2); the MCP `ui://` sandboxed supplier UI (redirect #1, deferred). A review surface is **reviewable source the team adopts and builds** — so there is **no untrusted-runtime-code problem to sandbox**, and no DSL.

**Human design review forecast (advisory).** **Yes.** Two new user-facing experiences are central: the **registry/adoption** surface (browse, preview, adopt-for-a-situation, see provenance/trust) and the **base-canvas slot model** the contributor authors against. `/design`'s `DESIGN-CLASS` stays authoritative.

---

## Phase 1 — Essence (the two humans)

### Review surface — the central noun (it is code)

**Identity.** A review surface is **a React component (plus a small manifest) that specializes a base canvas** for a recognizable kind of work. It is **code**, because a review surface is open-ended UI — arbitrary layout, logic, interaction — and any declarative schema hits a ceiling the moment a contributor wants what it didn't anticipate. The base canvases are already React; a specialization is just more React. AI writes one cheaply; a maintainer (or AI) reads, diffs, and audits it like any PR. The contribution unit mirrors a **shadcn registry item**: the component file(s) + a descriptor naming its base canvas (`registryDependencies`), its npm `dependencies`, and its provenance/trust.

**Essential properties.**
- **It specializes exactly one base canvas** — it builds *on* a floor (the action-receipt, the field-change-set, …), inheriting that family's structure and its graceful fallback. Not a freeform from-scratch screen.
- **It is distributed through the registry** — published by HyperIdle or the community through the **same** mechanism; addressable, versioned, fetchable with its deps.
- **It is adopted, owned, and committed** to be active — a surface in a registry is *available*, not *running*. A running surface is one a team deliberately adopted.
- **It layers by wrap or eject** — declared, so upgrade-safety is explicit.
- **It carries provenance + a trust tier** — the adopt-time review signal.

**For the contributor (who WRITES one).** You write a React component that fills a base canvas's slots for your tool/task — or **fork an existing surface** as the starting point (shadcn "copy the source, it's yours" / Docusaurus eject). You **publish it to a registry** (HyperIdle's, your own, or a community one) with a descriptor. HyperIdle's *own* surfaces are authored and published through the **identical** path — a first-party surface is just a maintainer-authored community surface. It's code, reviewable as code; AI-authoring it is expected and cheap.

**For the team (who ADOPTS one).** You **browse the registry**, preview a surface against sample data, and **adopt** the one you want for a situation — a **deliberate, owned, committed mapping** `(this tool / this task → this surface)`, reviewable like any change. HyperIdle ships a sensible default adoption (the base canvases, plus first-party surfaces for marquee tools); you change it explicitly. The system then renders the **adopted** surface — by that explicit mapping, **never** by scoring thousands of candidates at render time. If a situation has no adoption, you get the base canvas.

### Registry — catalog of availables

**Identity.** The distribution catalog. Like shadcn: **anyone can host one**; a surface is published with a manifest and fetched by URL or namespace (`@team/stripe-refund-review`), its `registryDependencies` (base canvas + siblings) resolved transitively. First-party and community publish to the **same** kind of registry. The registry holds *hundreds of availables*; a deployment runs only its *adoptions*. (Exactly the shadcn/npm split: catalog ≠ active set.)

### Adoption — the owned, deliberate choice (what replaces auto-apply)

**Identity.** The committed decision that a given review situation uses a given surface. It is **configuration the humans own** — a reviewable mapping, pinned to a surface version — **not** a runtime competition the system arbitrates. This is the direct answer to "thousands of surfaces for the same tool": they **coexist passively in registries**; a team **adopts one**, on purpose, and can audit/change it. Selection is human + build/setup-time, deterministic and accountable: you can always answer "which surface rendered this review, and who chose it."

### Wrap / Eject — the layering axis

**Identity.** How a surface sits on its base canvas (Docusaurus's swizzle taxonomy):
- **Wrap** — render the base canvas and compose *around/into* it through its **slots** (Radix `asChild` / MUI `slots` / children). Smaller to maintain, **upgrade-safe** (you never copied the base's internals). The default; right when the specialization is *additive*.
- **Eject** — copy the base canvas's source and own it fully. Total control; **you own upgrades** (a base change must be hand-migrated). Right when the specialization is *structural* and slots can't express it.
A base canvas declares, per extension point, **wrap = supported / eject = allowed-you-own-it / forbidden** — so upgrade-safety is a property the floor states, not a surprise.

### Lifecycle

```
contributor writes a React surface (or forks one) → publishes to a registry (descriptor: base canvas, deps, provenance, trust)
  → it is AVAILABLE in the catalog (one of many, possibly competing)
  → a team browses + previews + ADOPTS it for a situation  (committed, owned, version-pinned mapping)
  → a review of that situation renders the ADOPTED surface, layered over its base canvas (wrap | eject)
  → no adoption, or surface fails to load → the BASE CANVAS renders (the floor always works)
  → upstream surface/base improves → surfaced as a diff; wrap rides along, eject is hand-migrated (shadcn `diff`)
```

No new *review* lifecycle — a surface is presentation under AL1's `open → … → resolved` and AL7's execution-on-approve. It never mutates the Subject, the verdict, the staged action, or the gate.

### Authority

- **The contributor** owns the surface's **code**.
- **The team/deployment** owns **which surface is adopted** for each situation (committed, reviewable, version-pinned) and **owns the adopted copy** if ejected.
- **HyperIdle (host/core)** owns the **base canvases** (the floor + slot contracts), the registry mechanism, the default adoptions, and the deterministic layering. It is not a runtime arbiter of competing surfaces.

---

## Phase 2 — Rejection list (what a review surface is NOT)

- **…declarative config / a DSL.** It is a React component. *Reason: review surfaces are open-ended UI; a schema ceilings out; contributors are devs and AI writes components cheaply; the base canvases are already React. Declarative DSLs exist for cross-host portability and untrusted-runtime sandboxing — neither is our problem.*
- **…runtime-auto-selected among candidates.** It is **adopted** — a deliberate, owned, committed choice. *Reason: no OSS ecosystem auto-matches among thousands at render; doing so means unreviewed third-party code decides the UI per request (the exact untrusted-runtime problem build-time adoption avoids) and makes "which surface ran?" unaccountable.*
- **…an untrusted sandboxed plugin.** It is reviewable source adopted at build/setup time and built into the app. *Reason: the trust boundary is code review + ownership + supply chain at adopt time, not a runtime iframe/sandbox. (The Grafana/VS-Code signing model addresses a different threat: code executing in end-user installs.)*
- **…an opaque dependency you can't change.** You **own the adopted surface** (fork/eject = your code; even a wrap is your composition). *Reason: the shadcn lesson — owning editable source beats a version-pinned black box for UI you must tailor.*
- **…a freeform from-scratch screen.** It **specializes one base canvas** and degrades to it. *Reason: inheriting the floor gives structure, the universal slots, and a guaranteed fallback; freeform surfaces fragment and can't fall back.*
- **…the work, the verdict, the action, or the gate.** It changes *presentation only*. *Reason: a surface is the lens; the decision and the AL7 gate are untouched — adopting/ejecting a surface never moves a real approval.*
- **…HyperIdle-only or community-only.** One registry mechanism; provenance + trust tier distinguish. *Reason: HyperIdle ships surfaces through the same path it invites the community to use — one ecosystem, not two.*
- **…a Connector (AN boundary).** A connector **integrates a tool** (MCP server + auth); a surface **specializes a review**. *Reason: distinct nouns — a "Stripe refund review" surface is publishable by someone who doesn't own the Stripe connector; a connector may merely *reference* a preferred surface.*

---

## Phase 3 — Vocabulary lock

| Term | Definition | Aliases not to use |
|---|---|---|
| **Review surface** | A React component (+ manifest) specializing a base canvas for an app/tool/task; the contribution unit; code, registry-distributed, adopted. | template *(if "template" is used, it means a review surface — never "a config blob")*, plugin, widget, canvas override |
| **Base canvas** | One of the nine AL2 generic review components; the floor a surface specializes (via slots) and the always-present fallback. | family canvas *(ok descriptively)*, default canvas |
| **Registry** | The catalog of available review surfaces (first-party + community); anyone can host; fetch by URL/namespace. | store, marketplace *(ok loosely; not the noun)* |
| **Adoption** | The deliberate, owned, committed, version-pinned mapping `(situation → surface)`. Build/setup-time, never runtime auto-match. | selection, resolution, routing *(those imply runtime arbitration — rejected)* |
| **Wrap / Eject** | Compose-over-the-base (upgrade-safe) vs fork-the-base (own it). | extend/override *(ok loosely); "swizzle" (Docusaurus term, don't leak it into product vocab)* |
| **Trust tier** | *(reuse AN)* `vetted \| community` adopt-time review/consent signal. | sandbox tier, security tier |

Collision checks: "template" already means system-prompt/Strategy template — so the locked product noun is **review surface** (not "review template"). `Trust tier`/`Connector` reused from AN. `Base canvas` extends the AL2 review vocab.

---

## Phase 4 — Contracts (concept-level; schema/precedence-mechanics deferred to `/architecture`)

- **Cardinality.** A review renders through **exactly one surface**: the **adopted** surface for the situation if one is adopted, else the **base canvas** (≥1 always — the floor guarantees it). A surface **specializes exactly one base canvas**, carries **one provenance + trust tier + version**. A situation may have **0..N available** surfaces in registries but **0..1 adopted**. A base canvas exposes **N declared slots**.
- **Closure.** Base canvases = the AL2 **closed** set (nine). Available surfaces are an **OPEN** set (anyone publishes). Adopted surfaces are a **deliberately-bounded** set (what a deployment committed). **Trust tier CLOSED** `{vetted, community}` (AN). Layering modes **CLOSED** `{wrap, eject}`; per-slot permission **CLOSED** `{wrap, eject, forbidden}`.
- **Mutability.** Surfaces are **versioned**; adoptions **pin** a version; an upstream change surfaces as a **diff** (wrap rides along; eject is hand-migrated). Adoption is **freely changeable** by the owning team (reviewable). A surface **never mutates** the Subject, verdict, staged action, or gate.
- **Authority/identity.** Contributor owns surface code; team owns adoption (+ ejected copies); host owns base canvases, slot contracts, registry, default adoptions, layering. A surface's identity = registry item id + version + provenance.
- **Hard rules.**
  1. **A review surface is code that specializes a base canvas — never declarative config, never an untrusted runtime plugin.** Trust comes from **adopt-time code review + ownership + supply chain**, not a runtime sandbox.
  2. **No runtime auto-apply.** A surface runs only where a team **deliberately adopted** it (a committed, owned, version-pinned mapping). The registry is a catalog of availables; the running app reflects adoptions. "Which surface rendered this, and who chose it" is always answerable.
  3. **The base canvas is the floor and the always-present fallback.** Every surface specializes one; no adoption, or a failed surface, degrades to the base canvas. "Review for anything" holds for anything nobody surfaced.
  4. **Two declared layering modes — wrap (upgrade-safe) and eject (you own it).** Each base canvas declares per-slot `wrap | eject | forbidden`. Default contributors to wrapping.
  5. **A surface is the lens, never the decision.** It changes presentation only; it never moves the verdict, the staged action, or the AL7 gate.
  6. **One registry mechanism for first-party + community**, distinguished by **provenance + trust tier** (AN-locked, reused). Provenance certifies identity, not correctness; a surface is reviewable/previewable before adoption.
  7. **Boundary (AL5 ⟂ AN4).** AL5 owns the **Review surface** (the code unit, the slot contracts, the registry, adoption, the floor fallback). AN4 owns the **Connector** (tool integration) registry. A connector **may reference** a preferred surface; a surface is independently publishable. Shared: trust tier. No `ui://` shipped UI in scope.

---

## Phase 5 — Ground-truth updates

- `plans/AL5/concept.md` — this file (reshaped to code/registry/adoption).
- `docs/human-interface-layer/review-primitive.md` — the AL5 section rewritten to **"Review surfaces"**: code specializing a base canvas, registry-distributed, **adopted not auto-applied**, wrap/eject layering, inert-fallback to the floor.
- **AN reconciliation:** `plans/AN/concept.md` + `.pipeline/work-packages/TRACK-AN.md` AN4 — a Connector's optional field references a **review surface** (registry item), not a `ui://` UI or a config template.
- `.pipeline/work-packages/TRACK-AL.md` AL5 — title + ACs reshaped to the code/registry/adoption model.

---

## Phase 6 — Self-critique (1 round)

- **Right altitude + the founder's two corrections honoured?** Yes — **(a)** the noun is **code** (a React component specializing a base canvas), not config; **(b)** **adoption** (deliberate, owned, build/setup-time) replaces runtime auto-apply, with the registry as catalog-of-availables. Schema, slot API, precedence mechanics, registry transport, and the diff/migration tooling are `/architecture`.
- **Research-grounded this time (the real mechanics)?** Yes — every essential property traces to a cited mechanism: shadcn registry-item + own-the-source; Docusaurus wrap/eject + Safe/Unsafe/Forbidden; Radix/MUI slots; the catalog-≠-active-set adoption model; the declarative-is-for-untrusted-runtime distinction; Tailwind layered precedence.
- **Rejection list distinct?** Yes — eight rejections (config, auto-select, sandbox-plugin, opaque-dependency, freeform, the-decision, one-sided, connector), each with a reason.
- **AN4 boundary reconciled?** Yes — distinct nouns; connector references a surface; `ui://` removed; trust tier AN-owned.
- **Vocabulary collision?** "template" is taken → the locked noun is **review surface**.
- **Deferred to `/architecture`?** The manifest/registry-item schema, the base-canvas slot API, the adoption store + default adoptions, version-pinning/diff/migration, and how layering precedence resolves.

**Concept LOCKED.** `/design` (registry/adoption + slot-authoring surfaces) then `/architecture` explore inside it.

## Rationale (why this shape, and why two redirects)

Draft 1 led with tool-shipped `ui://` UIs (a sandboxed-runtime bet — deferred). Draft 2 over-corrected into declarative-config "templates" with a runtime resolver that *auto-applied* one — wrong twice over: it paid a DSL-ceiling tax to dodge a sandbox threat we don't have, and it invented runtime auto-selection no OSS ecosystem uses. The founder cut through both: our review canvas is **already React**, code is cheap and AI-written, so a contributed review surface should simply **be a component**; and with thousands of surfaces per tool, the system must **never auto-pick** — a team **adopts** the one it wants, on purpose. The mechanism-level research shows this is exactly how the healthy ecosystems work: **code + a manifest, published to a registry anyone can host (shadcn); adopted and owned at build/setup time (you copy the source, it's yours); layered by wrap (extend, upgrade-safe) or eject (fork, you own it) (Docusaurus); with the floor always beneath** so "review for anything" never breaks. The "declarative is safer" instinct is real but **mis-scoped** — it guards *untrusted runtime plugins in end-user installs*, not an OSS repo of reviewable component code a team adopts and builds; our safety is code review + ownership at adopt time. The two expensive-to-change locks: **a review surface is owned, registry-distributed code that specializes a base canvas**, and **it runs only by deliberate adoption, never runtime auto-match**. Get these right and the long tail of domain-specific review — the thing the founder calls a key to agentic business — is covered by HyperIdle and the community through one honest, code-native, accountable mechanism.
