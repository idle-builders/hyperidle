# Track Z: Vision & Documentation

Tell the HyperIdle story. Produce external-facing surfaces and documentation that communicate what HyperIdle is, why it exists, how it works, and how to get started. The track also audits the product against its stated vision and fixes contradictions.

**Key narrative.** HyperIdle is NOT "zero human companies." It is an operating system where humans and AI agents collaborate as equals, with AI amplifying human judgment — not replacing it. The CEO is human. Management is human. Knowledge is co-created. This is the core differentiator and must be woven through every external surface.

**Constraint.** Internal architecture docs in `docs/architecture/` etc. are reference material, not replaced. Product docs and the public site tell the story; the architecture docs contain the truth. No contradictions between them. `npm run verify` must pass after each work package merges.

**Migration note.** Z0–Z8 were registered in the legacy shape (`.pipeline/work-packages/TRACK-Z.md` specs + `.pipeline/work-packages/pipeline-manifest.yaml` registry rows) and remain there until migrated. Only **Z9** uses the new shape (`.pipeline/work/<id>/plan.md` + this coordination file). Note on **Z0** (Documentation Site, VitePress): its site-foundation scope is superseded by Z9, which establishes the static-site foundation the founder directed (landing page first, docs rendering as the follow-up work package on the same foundation; hosting open among GitHub Pages / Cloudflare Pages / own infra). Z0's VitePresss choice and its pre-docs-restructure assumptions are not carried forward; the rendered-docs outcome it described returns as its own work package once Z9's foundation ships.

---

## Work package registry

| ID | Title | Type | Complexity | Depends | Status |
|---|---|---|---|---|---|
| Z9 | Marketing landing page on a static-site foundation (cyberpunk marketing identity, `#FCEE0A` accent; static HTML generated at build time from sources incl. markdown; hosting-agnostic) | frontend/site | M | — | implemented — Astro 7 in `applications/website`; all 6 ACs pass review; PR pending CI |

Legacy-registered (specs in `.pipeline/work-packages/TRACK-Z.md`): Z0 (superseded per migration note), Z1 (product story — shipped as `docs/product/`), Z2–Z8.

## Dependency graph

- `Z9` depends on nothing: the static-site foundation and landing page are built from already-shipped content (`docs/product/`, `docs/guides/`, `ETHOS.md`).
- The follow-up docs-rendering work package (not yet registered) will depend on `Z9`: it renders `docs/guides/` on the static foundation Z9 establishes.
