# AL5 — Concept: Tool-tailored review canvases (override the family floor)

**Workpackage:** AL5 (Track AL). Per-WP concept act. **Level:** per-workpackage — inherits the AL1 track concept (`plans/AL1/concept.md`) and the AN track concept (`plans/AN/concept.md`) as **fixed inputs**; must not contradict either.
**Date:** 2026-06-25
**Status:** LOCKED (autonomous run; `PIPELINE_INTERACTIVE` unset → no recap gate). Downstream `/architecture` + `/pipeline` explore *inside* this concept; they do not reshape it.

> **Why this concept act exists.** "Review for anything across every tool" cannot scale if HyperIdle hand-builds every tool's canvas. AL2 shipped nine **family canvases** selected by `getReviewCanvas(kind)` — a closed, deterministic, override-less lookup. AL5 turns that one slot into a **resolved** slot: a tool can ship its own review canvas (MCP Apps `ui://`), the community can register a per-tool template, and the family canvas stays the always-present floor. The concept question is **what fills the per-artifact canvas slot, in what order, and under what safety + action-routing contract** — and **where the AL5/AN4 boundary sits**, since AN already locked the `Connector`, the ecosystem registry, and the `Trust tier`.

> **The reframing finding (AL1 §3, `plans/AL1/design/tool-ecosystem-and-canvases.md`):** MCP Apps (the first official MCP extension, 2026-01-26) lets a tool's MCP server return a `ui://` resource that the host renders in a sandboxed iframe over a JSON-RPC-postMessage bridge, and — load-bearing — the app **requests an action and the host routes it through the user's already-connected capabilities**. That host-routes-the-action model maps exactly onto HyperIdle's review→act loop (AL7). AL5 adopts it as the override substrate.

---

## Required reading (downstream `/architecture`, `/pipeline` must read these)

- `.pipeline/work-packages/TRACK-AL.md` — AL5 spec (+ the AL6–AL7 scope note).
- `.pipeline/work-packages/TRACK-AN.md` — **AN4** (Ecosystem integration registry) — the boundary peer; AN4 *depends on* AL5's `ui://` canvas mechanism.
- `plans/AL1/concept.md` — the track concept (Subject, Review, Canvas-as-examination-surface). Fixed input.
- `plans/AL1/design/tool-ecosystem-and-canvases.md` §3–§5 — the MCP-Apps `ui://` finding, the recommended canvas blend, the minimal manifest, mini-logo identity. **The core source.**
- `plans/AL1/design/review-system.md` §2 — the 3-tier canvas resolution already sketched at concept level (tool-shipped > per-tool template > family floor); §4 the dispatch-on-approve loop (now AL7).
- `plans/AN/concept.md` — **locks `Connector`, `Trust tier`, `Connection`, brokered/direct call** as fixed inputs. AL5 *reuses* these; never redefines them.
- `docs/human-interface-layer/review-primitive.md` — the ground truth this act extends (currently documents only the kind→family floor + AL7 execution-on-approve).
- `docs/agent-layer/tool-integration.md` — the Connection/Connector model (AN1); the AN2 broker seam an override's action routes through; `TrustTier` lives in `packages/shared/src/connection.ts`.
- `docs/process-layer/staged-operation.md` — the **Proposed Call** (AL7); an override's irreversible action is a Proposed Call routed to the gate.
- Code seam: `packages/web/src/pages/review/canvas-registry.ts` (`getReviewCanvas`), `review-artifact.ts` (`ReviewArtifact` carries `tool` + `kind`), `ReviewComposition.tsx` (the `<Canvas artifact={...} />` render site), `CanvasSourceHeader.tsx` / `ToolLogo.tsx`.

---

## Phase 0 — The nouns

| Noun | Classification | One-line working definition |
|---|---|---|
| **Canvas resolution** | **New** (central) | The deterministic precedence that fills one artifact's canvas slot: **tool-shipped canvas → community canvas template → family floor**. The thing AL5 introduces. |
| **Canvas override** | **New** (umbrella) | A non-family canvas that *can* fill the slot. Two sub-kinds: a **tool-shipped canvas** (the tool's own MCP server returns a `ui://` resource) and a **community canvas template** (a registered `(tool, kind)`→render-spec manifest). Additive; never the floor. |
| **Canvas sandbox** | **New** | The single render substrate every override runs in: a sandboxed iframe + a JSON-RPC-over-postMessage bridge. The host's safety boundary and its action-routing channel. |
| **Family canvas (floor)** | **Stable** (input, AL2) | The built-in per-proof-family canvas (`getReviewCanvas(kind)` → one of the nine). Always present; the terminal fallback. AL5 does not touch its content. |
| **Trust tier** | **Stable** (input, AN) | `vetted \| community` — locked in `plans/AN/concept.md` (CLOSED). Gates how an override may render/act. AL5 **reuses** `TrustTier` (`packages/shared/src/connection.ts`); does not redefine it. |
| **Artifact kind** | **Stable** (input, AL2) | The proof family the floor selects on; with `tool`, the override **match key** `(tool, kind)`. |
| **Connector** | **Stable** (input, AN) | The MCP-server-+-manifest unit (AN). A connector *may* carry a `ui://` review canvas; when it does, that canvas reaches the review surface **through AL5's resolution + substrate**. AL5 does not build the Connector or its registry. |

Only **Canvas resolution, Canvas override (+ its two sub-kinds), Canvas sandbox** are New and get concept work below. Family canvas, Trust tier, Artifact kind, Connector are inputs. The reshape is implicit: **canvas selection** moves from a closed kind-only lookup to a precedence resolution — captured under "Canvas resolution."

**Human design review forecast (advisory).** **No.** AL5 is an integration + resolution mechanism. The override *content* is supplied by the tool/community; the only host-authored surface is the existing canvas slot + a thin sandbox host frame (a trust-tier badge / "rendered by <tool>" chrome extending `CanvasSourceHeader`), not a new base component. `/design`'s `DESIGN-CLASS` stays authoritative; if `/design` later classifies the sandbox host frame `novel`, that gate fires regardless of this forecast.

---

## Phase 1 — Essence

### Canvas resolution — the central noun (the slot becomes resolved)

**Identity.** Canvas resolution is a **deterministic, pure precedence function** computed per artifact at review-render: `resolve(tool, kind, available-overrides) → Canvas`. It is not a registry HyperIdle must populate, not a risk policy, not a human choice. Today's `getReviewCanvas(kind)` *is* the degenerate one-tier case (floor only); AL5 widens it to three ordered tiers.

**Essential properties.** Every resolution (a) keys on `(tool, kind)` — `tool` already lives on `ReviewArtifact`; (b) walks tiers in **fixed order** tool-shipped → community template → family floor and returns the **first available** canvas; (c) **always terminates at the floor** — the floor is unconditionally present, so resolution can never return "nothing"; (d) is **side-effect-free** — picking a canvas never executes a tool action.

**Rejection — see Phase 2.** Resolution is *not* "look up every tool in a giant table." Tiers 1–2 are *enhancements*; tier 3 needs zero per-tool knowledge because the producing agent already declared the artifact's `kind` (AL1 review-system §2). A brand-new tool "just works" at the floor.

### Canvas override — the umbrella (two authoring paths, one slot)

**Identity.** An override is a **non-family canvas that may fill the slot for a specific `(tool, kind)`**, supplied by someone other than HyperIdle-core. Two sub-kinds, distinguished only by *who authors and how it's transported*, never by how it renders:

- **Tool-shipped canvas** — the tool's *own* MCP server returns a `ui://` resource (MCP Apps). The tool that reported the data brings its own review UI. Transported live over the Connector's MCP connection.
- **Community canvas template** — a registered **manifest** binding `(tool, kind/proofFamily)` → a render spec (`tool · proofFamily · field-bindings · logo · render.kind`). Declarative JSON preferred; `ui://` iframe if it ships code.

**Essential properties.** Every override (a) declares a **match key** `(tool, kind)`; (b) renders **only inside the Canvas sandbox** — never as host code; (c) carries a **trust tier** (`vetted`|`community`); (d) **requests** actions; the host routes them — an override never holds a credential or re-implements an integration.

### Canvas sandbox — the one substrate (safety + action channel)

**Identity.** A single render substrate — **a sandboxed iframe + a JSON-RPC-over-postMessage bridge** — shared by *both* override sub-kinds (one substrate, two authoring paths; AL1 §3). It is simultaneously the **security boundary** (an untrusted canvas cannot reach the host DOM/state, read a credential, or break sibling canvases or the review) and the **action channel** (the canvas posts an action request; the host decides).

**The action-routing contract (load-bearing).** When an override requests an action, the host routes it through HyperIdle's **existing connection to that tool** — the AN2 broker / the user's connected capabilities — *never* a re-implemented integration and *never* a credential handed to the canvas. An **irreversible** action becomes an **AL7 Proposed Call** routed to the review gate; a reversible one may flow per trust (AL8). This is precisely the MCP-Apps "host routes the action through the user's connected capabilities" model mapped onto HyperIdle's review→act loop. The credential-containment hard contract (`tool-integration.md`) holds unchanged: the sandbox is one more agent-visible surface a secret must never reach.

### Lifecycle

Resolution and an override move through:

```
review render
  → resolve(tool, kind, available) → pick highest-available tier
  → if override: mount in Canvas sandbox (trust-tier gated)
      → sandbox-load-fails / malformed / postMessage handshake times out → DEGRADE to family floor
      → override renders → user examines
      → override requests action → host routes via existing connection
          → reversible: flows per trust (AL8)   irreversible: AL7 Proposed Call → gate → on approve, executes once
      → result posts back to the review
  → if no override available → family floor renders (unchanged AL2 path)
```

No new review lifecycle — resolution is a render-time concern layered under AL1's `open → … → resolved` and AL7's execution-on-approve. The override is **stateless across reviews**; resolution recomputes each render (a tool may have disconnected, a template may have been unregistered).

### Authority

- **Resolution** is **host-owned** (HyperIdle): the precedence order and the degradation rule are core, never overridable by a contributor.
- **Tool-shipped canvas** is authored + served by the **tool vendor** (its MCP server); HyperIdle holds no copy.
- **Community canvas template** is authored by a **third party**, registered via a manifest; its trust tier and consent are **AN4-owned** (AL5 records/reads the tier, AN4 owns the registry + consent UX — see the boundary contract, Phase 4).
- **Family floor** is **HyperIdle-core** (AL2 built-in); the source of truth that always exists.

---

## Phase 2 — Rejection list (what these are NOT)

**Canvas resolution is NOT:**
- **…an exhaustive every-tool-on-earth registry.** The floor needs zero per-tool knowledge — the producing agent declares `kind`, the family vocabulary is ~9, a never-seen tool renders at the floor. *Reason: "review for anything" must hold for unknown tools; a mandatory registry would break it (AL1 review-system §2).* 
- **…a runtime risk/policy engine.** It is a fixed three-tier precedence, not thresholds, allowlists, or per-call evaluation. *Reason: a policy engine is the enterprise product HyperIdle is not — mirrors AN's Trust-tier rejection (`plans/AN/concept.md` rejection 6).* 
- **…a human-picks-the-canvas choice.** Selection is automatic and deterministic, like AL2's kind→family. *Reason: the reviewer judges the work, not the rendering; a canvas chooser is friction with no judgment value.* 

**Canvas override is NOT:**
- **…a replacement for the floor.** It is strictly **additive**; the floor is never removed, and a missing/failed/malformed/untrusted override **degrades to** the floor. *Reason: the floor is the "always works" guarantee; an override that could delete it would let one bad contributor break review for a whole tool.* 
- **…trusted host code / a HyperIdle plugin-SDK.** It renders only inside the sandbox; it is not a React component mounted in the host tree, not an npm plugin. *Reason: untrusted third-party/vendor code in the host context can exfiltrate or compromise (the HA-custom-card "no sandbox, real CVEs" lesson, AL1 §3).* 
- **…a re-implemented integration.** Its action *requests*; the host routes through the existing connection. The override never holds a credential or calls the service directly. *Reason: capability split (`plans/AN/concept.md`); a credential in the canvas is one injection away from an ungated irreversible call.* 

**Canvas sandbox is NOT:**
- **…a per-canvas bespoke security model.** **One** substrate, both authoring paths. *Reason: two render substrates = two attack surfaces to audit; convergence onto the MCP-Apps iframe+bridge is the standard (AL1 §3).* 
- **…an open `srcdoc` with host privileges.** Sandboxed iframe, no same-origin host reach, no credential. *Reason: the whole point of the override is untrusted content.* 

**AL5 is NOT (scope boundary):**
- **…the Connector ecosystem registry.** That is **AN4** — discovery, validation, two-tier consent, installing a whole MCP-server connector. *Reason: AN owns the Connector + Trust tier + registry; AL5 owns only the canvas resolution + substrate + canvas-template registration the registry feeds (Phase 4 boundary contract).* 
- **…specific tool canvases / per-tool MCP connectors.** No Stripe-refund canvas content, no GitHub connector — those are tool/community-supplied. *Reason: out of scope by the AL5 spec; building them is the very thing the mechanism exists to avoid.* 

---

## Phase 3 — Vocabulary lock

| Term | Definition | Aliases not to use |
|---|---|---|
| **Canvas resolution** | The deterministic precedence filling one artifact's canvas slot (tool-shipped > community template > family floor). | canvas selection (= AL2's kind-only lookup, the degenerate case), renderer routing, canvas picker |
| **Canvas override** | A non-family canvas that may fill the slot for a `(tool, kind)`; additive over the floor. | plugin, widget, custom renderer, extension |
| **Tool-shipped canvas** | A `ui://` review resource returned by the tool's own MCP server (MCP Apps). | MCP app, vendor canvas, embedded UI |
| **Community canvas template** | A registered `(tool, kind)`→render-spec manifest, third-party authored. | community plugin, custom card, theme |
| **Family canvas (floor)** | The AL2 built-in per-proof-family canvas; the always-present terminal fallback. | default canvas, generic canvas *(descriptive ok, not as a name)* |
| **Canvas sandbox** | The one sandboxed iframe + JSON-RPC-postMessage bridge every override renders in. | iframe, embed, host frame |
| **Trust tier** | *(reuse AN — do not redefine)* `vetted \| community` provenance gating an override. | trust level, security tier, permission level |

Collision checks (grep-verified, Phase 6): **`Connector`/`Trust tier`** intentionally aliased to the AN locks — same nouns, reused, not forked. **`Canvas`** already used in code (`ReviewCanvasKind`, `getReviewCanvas`) for the family floor — AL5's "Canvas resolution/override/sandbox" extend that vocabulary without collision (the floor *is* a canvas; an override *is* a canvas; resolution picks among canvases).

---

## Phase 4 — Contracts

- **Cardinality.** Per artifact slot: **exactly one** canvas renders (the highest-available tier). Per `(tool, kind)`: **0..1** tool-shipped canvas + **0..N** community templates may match, but **exactly one** wins by precedence, and the **family floor always exists** as the terminal fallback (cardinality ≥1 guaranteed). An override → **0..N** action requests, each routed individually (irreversible ones each a distinct AL7 Proposed Call).
- **Closure.** The **tier set is CLOSED and ordered**: `[tool-shipped, community-template, family-floor]` — no fourth tier, no reordering by a contributor. The **set of overrides is OPEN** (any tool/community may contribute, mirroring AN's open Connector vocab + AL2's open artifact-kind vocab). The **render substrate is singular (CLOSED)** — one sandbox. **Trust tier CLOSED** `{vetted, community}` (AN). The family-floor proof-family set is the AL2 closed set (the nine `ReviewCanvasKind`s).
- **Mutability.** Resolution is **recomputed every render** (not cached across reviews) — an override's *availability* is volatile (tool connects/disconnects; template registered/unregistered). The **floor's presence is immutable** — nothing can remove it. An override cannot mutate host state except by an **action request the host routes** (and gates if irreversible).
- **Identity.** A tool-shipped canvas = its `ui://` resource id on the Connector's MCP server. A community template = its manifest id, keyed by `(tool, kind)`. The floor = its `ReviewCanvasKind`. The match key for resolution = `(artifact.tool, artifact.kind)`.
- **Hard rules.**
  1. **The family floor is the terminal fallback, always present.** Every override is additive; a missing / failed-to-load / malformed / untrusted / sandbox-erroring override **degrades to the family canvas**. No override can remove or block the floor. *(The "review for anything" guarantee.)*
  2. **Deterministic precedence: tool-shipped > community template > family floor.** No ambiguity, no per-render human choice, no contributor reordering.
  3. **Every override renders only in the one Canvas sandbox** — sandboxed iframe, trust-tiered. An override **cannot** read a credential, reach the host DOM/state, compromise the host, or affect sibling canvases or the review.
  4. **An override's action routes through HyperIdle's existing connection** (AN2 broker / the user's connected capabilities). It is never a re-implemented integration; the canvas holds no credential. An **irreversible** action is an **AL7 Proposed Call** to the gate; **unknown reversibility fails safe to gated** (inherits AN2/AL7).
  5. **Trust tier is the AN-locked `{vetted, community}`** — reused, never redefined. A `community` override is sandboxed at-your-own-risk; its **consent step is AN4-owned**.
  6. **Boundary (AL5 ⟂ AN4).** AL5 owns the **canvas resolution + the sandbox substrate + the canvas-template registration/lookup** (the `(tool, kind)`→render-spec binding + its storage/resolution). **AN4 owns the Connector ecosystem registry** (discovery, validation, trust-tier consent, installing a whole connector). A Connector's optional `ui://` canvas **registers through AL5's mechanism** — there is **one** canvas resolution path, **no duplicate registry**. AL5 ships *before* AN4 and must stand alone; AN4 *reuses* AL5.

---

## Phase 5 — Ground-truth updates

- `plans/AL5/concept.md` — this file (per-WP concept lock).
- `docs/human-interface-layer/review-primitive.md` — **extended** with a "Canvas resolution and overrides (AL5)" section: the three tiers, the sandbox substrate, the action-routing contract, the floor-always-wins-fallback, and the AL5/AN4 boundary. (No change to the AL2 family-canvas table or the AL7 execution section.)
- *Cross-reference only* (no edit needed this act): `docs/agent-layer/tool-integration.md` already names AN4 "builds on `ui://` canvases" — the boundary is consistent; `/architecture` may add a back-reference when AL5 lands.

No new `canonical-shapes.md` — the human-interface-layer has no such file; `review-primitive.md` is the canonical home for what fills the canvas slot.

---

## Phase 6 — Self-critique (1 round)

- **Rejection list real & distinct?** Yes — resolution (not-a-registry / not-a-policy-engine / not-a-chooser), override (not-a-replacement / not-host-code / not-a-re-implemented-integration), sandbox (not-bespoke / not-open-srcdoc), and the scope boundary (not-AN4 / not-specific-canvases) name distinct traps, each with a reason.
- **Vocabulary collisions?** Grep-checked: `Connector`, `Trust tier` reused from `plans/AN/concept.md` (intentional, same nouns). `Canvas`/`getReviewCanvas`/`ReviewCanvasKind` already in `packages/web/src/pages/review/` for the floor — AL5's terms extend, don't collide. `TrustTier` type already exists in `packages/shared/src/connection.ts` — reuse confirmed.
- **Contracts complete?** Cardinality (one renders, floor guarantees ≥1), closure (tiers CLOSED+ordered, overrides OPEN, one sandbox, trust tier CLOSED), mutability (recompute per render, floor immutably present), identity (`ui://` id / manifest id / kind), and six hard rules incl. the AL5⟂AN4 boundary. Deferred to `/architecture`: the manifest schema, the postMessage bridge protocol, the iframe sandbox attributes, the resolution function signature, how a tool-shipped `ui://` is discovered over the Connector's MCP connection.
- **Boundary with AN4 sharp?** Yes — the load-bearing decision this act adds beyond AL1's sketch: **one** resolution path + substrate (AL5) vs. **one** Connector ecosystem registry (AN4); AL5 ships first and stands alone, AN4 reuses it; trust tier is AN-owned and reused. This prevents two parallel registries — the single highest-risk re-litigation downstream.
- **Did we avoid re-deciding AL7?** Yes — the action-routing contract *references* AL7 Proposed Call + AN2 broker as fixed inputs; it does not reshape execution-on-approve.
- **Rationale concrete?** Yes — cites the MCP-Apps standard (2026-01-26), the HA-custom-card CVE lesson, the AL1 review-system §2 3-tier sketch, and the AN capability-split/credential-containment locks.
- **Right files?** `review-primitive.md` extended (the canvas-slot ground truth); `tool-integration.md` already consistent; no spurious edits.

**Concept LOCKED.** `/architecture` and `/pipeline` explore inside it; they do not reshape it.

## Rationale (why this shape)

"Review for anything across every tool" forces a floor that needs **zero per-tool knowledge** (the agent-declared `kind` → family canvas) and an **additive** override path for the long tail, supplied by whoever already invested — the tool vendor (MCP Apps `ui://`) or the community (a manifest) — never HyperIdle hand-building each one. The standard converged (MCP Apps = OpenAI Apps SDK = MCP-UI) onto exactly the substrate HyperIdle needs: a sandboxed iframe whose actions the **host routes through the user's existing connections**, which is HyperIdle's review→act loop (AL7) verbatim. The expensive-to-change decisions locked here — **floor-always-wins**, **deterministic precedence**, **one sandbox**, **host-routes-the-action**, and **AL5 owns resolution+substrate while AN4 owns the Connector registry** — ripple through both AL5's architecture and AN4's. They are locked now so neither track builds a parallel registry or a second render substrate, and so a contributed canvas can never break "review for anything."
