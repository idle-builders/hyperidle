# Track Z: Vision & Documentation

Tell the HyperIdle story. Produce external-facing surfaces and documentation that communicate what HyperIdle is, why it exists, how it works, and how to get started. The track also audits the product against its stated vision and fixes contradictions.

**Key narrative.** HyperIdle is NOT "zero human companies." It is an operating system where humans and AI agents collaborate as equals, with AI amplifying human judgment — not replacing it. The CEO is human. Management is human. Knowledge is co-created. This is the core differentiator and must be woven through every external surface.

**Constraint.** Internal architecture docs in `docs/architecture/` etc. are reference material, not replaced. Product docs and the public site tell the story; the architecture docs contain the truth. No contradictions between them. `npm run verify` must pass after each work package merges.

**History.** Z0–Z8 were registered in the pre-0.8 shape. Shipped: Z1 (product story — `docs/product/`), Z2, Z4 and Z8, each with its record in `work/<id>/`. **Z0** (Documentation Site, VitePress) is superseded by Z9, which established the static-site foundation the founder directed — Z0's VitePress choice and its pre-docs-restructure assumptions are not carried forward. The four Z packages that were never built are registered below alongside Z9 and Z10.

---

## Work package registry

| ID | Title | Type | Complexity | Depends | Status |
|---|---|---|---|---|---|
| Z9 | Marketing landing page on a static-site foundation (cyberpunk marketing identity, `#FCEE0A` accent; static HTML generated at build time from sources incl. markdown; hosting-agnostic) | frontend/site | M | — | **SHIPPED, PR #470 merged (2026-08-09).** Astro 7 in `applications/website`; identity pivoted founder-directed from dark neon-noir to light neo-brutal (`proposals/b-neo-brutal.html` style authority) after founder review rejected the dark variant. |
| Z10 | Site content architecture: marketing landing, useful docs (founder-approved section structure from dev-landing research; docs area with top-level Installation + side-navigated User/Developer guides; quickstart moves landing → Installation) | frontend/site | M | — | implemented — all 5 ACs pass review (DONE); PR pending CI |
| Z3 | Feature documentation suite: reference documentation for each major feature area | docs | L | — | unbuilt — carried from the pre-0.8 track file. Getting started converts a visitor into an active user; feature docs convert an active user into a power user. Without them, users plateau after the tutorial and never discover knowledge curation or routine configuration — the features that justify the switch. Re-scope against Z10's shipped docs structure before starting. |
| Z5 | Architecture story: the architecture as a narrative — why the layers, why the fabric, why persistent teams, and what was rejected | docs | M | — | unbuilt — carried from the pre-0.8 track file. `docs/architecture/` contains the truth but not the argument; without the narrative, developers either misapply the system or dismiss it as over-engineered. **Re-scope before writing** — the legacy framing names the kernel/strategy split and the fabric, both of which have since been dissolved. |
| Z6 | Human+AI collaboration narrative: the collaboration model told through concrete scenarios, not abstract principles | docs | M | — | unbuilt — carried from the pre-0.8 track file. This is the track's key narrative made explicit. Without it HyperIdle reads as one more agentic workflow tool and gets evaluated on feature count rather than on the thesis that AI amplifying human judgment beats AI replacing it. |
| Z7 | Plugin & extensibility story: what is extensible, how to build an extension, and what the extensibility vision is | docs | M | — | unbuilt — carried from the pre-0.8 track file. When developers cannot find an extension point, they fork. **Load-bearing caveat from the original spec: this is only worth building if HyperIdle genuinely intends to support third-party extensions; if that goal has changed, cut it.** Also re-scope — the legacy spec grounds extensibility in the kernel/strategy split, which no longer exists; the live answer is the plugin surface. |

## Dependency graph

- `Z9` depends on nothing: the static-site foundation and landing page are built from already-shipped content (`docs/product/`, `docs/guides/`, `ETHOS.md`).
- `Z10` builds on Z9's shipped foundation (seam, identity, base-path contract): restructures the landing content and widens the seam to `docs/guides/**` + `docs/deployment/**` with side navigation. Supersedes the earlier unnamed "docs-rendering follow-up" note.
- `Z3`, `Z5`, `Z6` and `Z7` declare no dependencies on each other. All four now land inside the docs structure Z10 establishes, so sequence them after Z10 rather than beside it.
- `Z5` and `Z7` both need a re-scope pass first: each was written against the kernel/strategy architecture that has since been dissolved.
