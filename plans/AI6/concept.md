# AI6 — Concept

**Verdict: no new nouns.** This workpackage introduces and reshapes zero domain primitives. It ratifies three pre-existing design-system *conventions* and adds the *semantic tokens* the system already forces contributors to hardcode. No founder concept work needed.

## Phase 0 — Nouns in the spec, classified

| Noun | Classification | Why |
|---|---|---|
| Focus ring / focus treatment | **Stable convention** | Already defined in `clickable.ts:15` (`outline-1 outline-[var(--accent-primary)]`). WP picks the one true treatment, doesn't invent it. |
| Hover-tint scale | **Stable convention + missing tokens** | Hover tinting already practiced everywhere (e.g. `clickable.ts` color-mix, `--accent-primary-dim`); WP adds the *recurring* tint values (`rgba(217,119,6,0.08)` ×5, `rgba(46,125,186,0.08)` ×4) as named tokens. Token, not concept. |
| Uppercase tracking | **Stable convention** | `--tracking-caps` (0.08em) and `--tracking-caps-sm` (0.06em) already in `tokens.css:89-90`. WP enforces their use; the convention exists. |
| Scrim | **Stable concept** | `--scrim` token already exists (`tokens.css:187`). WP only makes AppShell consume it instead of hardcoding. No new noun. |
| Motion scale | **Stable convention** | `--motion-fast/default/slow` + `--motion-ease` exist (`tokens.css:47-55`). WP enforces consumption. |
| Renderer-family container treatment | **Stable convention (reconciliation rule)** | `block/` payload renderers and `kinds/` artifact renderers both already render content; WP settles which container chrome (radius/border/empty-state) both use. Composition rule, not a new primitive. |

Every noun is **stable** or a **token addition**. None is a new or reshaped primitive.

## Why no concept work

A concept exists to distinguish *kinds of things* (Thread vs Message, Bet vs Task). AI6 changes no kinds of things. It enforces that existing atoms obey the rules the system already wrote for itself: one focus treatment, one tracking token per size, no off-palette color, one container chrome per content kind. These are **consistency contracts on existing concepts**, owned by `DESIGN.md`/`tokens.css` — the design-system single source — not founder-level domain nouns.

Token additions (per the AI6 contract) flow through `DESIGN.md`/`tokens.css`; components consume, never define. That is a design-system bookkeeping act, settled in `/design` (which token name, which value) and `/architecture` (which file:line), not `/concept`.

## Conventions being ratified (handoff to `/design`)

1. **Focus** — reconcile the 5 divergent treatments to one. Candidate: the documented `clickable.ts` convention (`focus-visible:outline outline-1 outline-[var(--accent-primary)]`, 1px, no offset).
2. **Hover-tint scale** — name the recurring tints (`rgba(217,119,6,0.08)` amber/secondary ×5, `rgba(46,125,186,0.08)` info/blue ×4) and the Button hover hexes (`#c53e30`, `#b86305`) as semantic tokens. Scrim already tokenized — WP only wires AppShell to it.
3. **Tracking** — which token (`--tracking-caps` vs `--tracking-caps-sm`) for which uppercase-label size, applied across Artifact* family, RichMessageCard, ThreadShell, StatusChip, CommentRow.
4. **Renderer container reconciliation rule** — one container chrome (radius, border, empty-state) shared by `block/` payload renderer and `kinds/` artifact renderer for the same content kind.

## Existing tokens involved (no rename)

- `--tracking-caps: 0.08em`, `--tracking-caps-sm: 0.06em` (`tokens.css:89-90`)
- `--motion-fast/default/slow`, `--motion-ease` (`tokens.css:47-55`)
- `--accent-primary` (focus ring color), `--accent-primary-dim` (`tokens.css:165`)
- `--scrim` (`tokens.css:187`) — exists; AppShell must consume it

New tokens are *additions* (hover-tint scale + Button hover colors), not redefinitions of any concept. Exact names/values settled in `/design`.

## Required reading (for `/design`, `/architecture`)

- `packages/design-system/AESTHETICS.md` — the aesthetic the conventions must serve.
- `packages/design-system/DESIGN.md` — component budget + token doc (single source).
- `packages/design-system/src/tokens.css` — existing tokens; where additions land.
- `packages/design-system/src/clickable.ts` — the documented focus convention.
- The 2026-06-12 review (cited in spec lines 221-223) — the file:line divergence inventory.

## Phase 6 — self-critique

- Rejection list real? Yes — each noun maps to an existing token/convention; nothing folds a new primitive in disguise.
- Vocabulary collision? None. No new term coined.
- Hand-waving on contracts? Contracts here are design-system consistency rules, deferred to `/design` + `/architecture` per the WP's own "Token additions go through DESIGN.md/tokens.css" constraint. Correct ownership.
- Right files touched? No `docs/<topic>` ground-truth update needed — DESIGN.md/tokens.css are the source and are owned by `/architecture`'s token additions.

**Concept locked: consolidation only, no new nouns. Proceed to `/design`.**
