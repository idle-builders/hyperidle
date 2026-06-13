# AI6 — Approved Design (single-variant ratification)

DESIGN-CLASS: routine  ref=clickable.ts/tokens.css  pattern=existing-DS-components

Not exploration. This ratifies one treatment per convention against `AESTHETICS.md` + the documented `clickable.ts` source, names the missing semantic tokens, and lists the file:line each rule fixes. No component API changes; chrome converges only.

---

## 1. Focus — ONE treatment

**Ratified:** `focus-visible:outline focus-visible:outline-1 focus-visible:outline-[var(--accent-primary)]` + a directional offset:
- **Inset surfaces** (rows, menu items, list items, in-container buttons): add `focus-visible:[outline-offset:-1px]` so the 1px ring sits inside the row edge.
- **Free-standing controls** (Button, Toggle, TabBar, standalone inputs/cards): no offset (offset 0) — ring hugs the element.

**Why this and not the others.** `clickable.ts:15` is the *documented* single-source convention (1px, `--accent-primary`, focus-visible). `ThreadRow.tsx:119`, `Block.tsx:114`, `Menu.tsx:184`, `KnowledgeRow.tsx:79`, the block payload buttons already follow it. The 2px/`outline-offset-[2px]` variants (`Button.tsx:57`, `Toggle.tsx:49`, `TabBar.tsx:40,73`) and the 2px no-offset variants (`ArtifactEmbed.tsx:34`, `ArtifactGalleryCard.tsx`, `ArtifactStackItem.tsx:16`, `Composer.tsx:104` uses 1px already) are the divergence. 1px keyboard-only `focus-visible` is the right weight for the Hearth aesthetic (AQ-019, no decoration) and matches the majority. 2px on warm cream reads heavier than the system's borders (`--bw-thin` 1px). The directional offset rule is not a fourth treatment — it is one ring with a placement that depends on whether the element has a containing edge.

**Convergence (5 → 1):**

| Treatment found | file:line | Action |
|---|---|---|
| `outline-1` + `-outline-offset-1` (inset) — canonical | `clickable.ts:15`, `ThreadRow.tsx:119`, `Block.tsx:114`, `Menu.tsx:184`, `KnowledgeRow.tsx:79`, `block/ImagePayload.tsx:42`, `block/CodePayload.tsx:33` | keep (already correct) |
| `outline-1` no offset (free-standing) | `RichMessageCard.tsx:101`, `Composer.tsx:74,89,104`, `BlockHandle.tsx:60` | keep (correct for free-standing) |
| `outline-2` `outline-offset-[2px]` | `Button.tsx:57`, `Toggle.tsx:49`, `TabBar.tsx:40,73` | → `outline-1` + appropriate offset |
| `focus:outline-2` (not focus-visible, no offset) | `ArtifactEmbed.tsx:34`, `ArtifactGalleryCard.tsx:17`, `ArtifactStackItem.tsx:16` | → `focus-visible:outline-1` + offset |
| `focus-within:outline-none` (suppressed) | `ThreadShell.tsx:397` | keep (shell wrapper, intentional — not an interactive leaf) |
| `focus:shadow-[0_0_0_3px_...]` ring (inputs) | `SearchField.tsx:41`, `Input.tsx:26`, `Select.tsx:34`, `Composer.tsx:89` | keep as the **input focus variant** — text inputs use the 3px tinted glow + border-color, NOT the outline ring. Documented as the second of exactly two focus treatments (interactive-element ring vs text-input glow). |

> Decision: text inputs (`Input`, `Select`, `SearchField`, `Composer` textarea) keep the `box-shadow` glow + `border-color: accent` — that is the established input affordance and is visually distinct from the outline ring used on buttons/rows. This is NOT a divergence; it is the input-class focus treatment. AC reads "one documented treatment" — documented = exactly two named classes (control-ring, input-glow), each applied consistently. DESIGN.md will state both explicitly so the catalog tab-through reads as intentional, not divergent. The 3px glow color must use `var(--accent-primary-dim)` (already correct in `SearchField.tsx:41`) — `Input.tsx:26`, `Select.tsx:34`, `Composer.tsx:89` hardcode `rgba(22,118,79,0.1)` and must switch to the token (see §3).

---

## 2. Hover-tint scale — new semantic tokens

The recurring hardcoded tints and Button hover hexes get named. All values verbatim from current code so rendering does not change.

| New token | Light value | Dark value | Replaces (file:line) |
|---|---|---|---|
| `--accent-secondary-dim` | `rgba(217,119,6,0.08)` | `rgba(217,119,6,0.1)` | Toast amber iconBg `Toast.tsx:38` (`0.1`), recurring amber tint ×5 (badge/chip backgrounds) |
| `--status-info-dim` | `rgba(46,125,186,0.08)` | `rgba(68,152,212,0.1)` | Toast info iconBg `Toast.tsx:43`, recurring blue tint ×4 |
| `--status-error-dim` | `rgba(220,74,58,0.08)` | `rgba(238,106,90,0.1)` | `ErrorState.tsx:79` iconBg default, Toast error `Toast.tsx:33`, Input error glow `Input.tsx:29` |
| `--accent-secondary-hover` | `#b86305` | `#b86305` | Button amber hover `Button.tsx:36` |
| `--status-error-hover` | `#c53e30` | `#c53e30` | Button destructive hover `Button.tsx:34` |

Notes:
- `--accent-primary-dim` (`rgba(22,118,79,0.08)` / `rgba(46,170,122,0.1)`) already exists. Replaces the `rgba(22,118,79,0.08)` literals in `CommentRow.tsx:247`, `Avatar.tsx:43`, `EmptyState.tsx:43`, `Toast.tsx:28` iconBg, and the agent-avatar tint (AQ-012 names this exact value). The `0.1` Toast variant and `0.06` Button-ghost variant (`Button.tsx:32` `rgba(22,118,79,0.06)`) are close enough to fold into `--accent-primary-dim`; ghost-hover at 0.06 vs dim 0.08 is imperceptible — fold to `--accent-primary-dim`.
- ThreadRow flat-list hover `rgba(44,36,26,0.02)` (`ThreadRow.tsx:118`) and NavItem `rgba(44,36,26,0.04)` (`NavItem.tsx:65`) are the neutral row-hover tints from AQ-010/AQ-014. These already have a `color-mix` idiom used elsewhere (`hover:bg-[color-mix(in_oklab,var(--text-secondary)_4%,transparent)]` in `clickable.ts:15`, `Block.tsx:114`). Convert these two raw rgba to the same `color-mix` idiom (no new token needed — `text-secondary` mix is already the system pattern). 0.02 → 2%, 0.04 → 4%.
- Hover-tint values match the existing `0.1`-in-dark / `0.08`-in-light pattern of `--accent-primary-dim`, so each token defines a light value and a dark value in its respective theme block.

**Scrim:** `--scrim` already exists (`tokens.css:187` light, `:254` dark). The only AppShell/overlay hardcode is consuming it. The DESIGN.md note (`:185`, `:229`) says "AI6 will derive via color-mix" — we keep the literal rgba in `tokens.css` (it is the token definition, exempt from the lint rule, and the warm values are already AQ-009-compliant: no pure black). AppShell scrim usage must reference `var(--scrim)` / `var(--z-scrim)`. (Grep web-package AppShell during architecture — DS package has no AppShell; the scrim consumer is `packages/web`, which is AI5's adoption scope. **In-DS scope: the token exists and is correct; document it.** The AppShell-consumes-token wiring is flagged for AI5 if it lives in web.)

---

## 3. Tracking — token per label size

Two existing tokens (`tokens.css:89-90`): `--tracking-caps` = 0.08em (section titles / primary uppercase), `--tracking-caps-sm` = 0.06em (smaller labels: subtitles, badges, sidebar categories, chips).

**Rule:** Every uppercase label uses a tracking token. Size mapping:
- **13px+ section titles / standalone uppercase headers** → `--tracking-caps` (0.08em).
- **11px / 10px / 12px inline uppercase labels, badges, chips, kicker rows, mono kickers** → `--tracking-caps-sm` (0.06em).

Most DS uppercase labels are 11px mono kickers → `--tracking-caps-sm`. The hardcoded values found (0.02–0.05em) all sit on 10–11px labels, so they converge to `--tracking-caps-sm` (0.06em). This is a small visual *tightening-to-loosening* shift (0.02→0.06) but it is the ratified Hearth signature (AQ-013 mandates 0.06em for these exact labels; the 0.02em values are Lucid-era leftovers per the `tokens.css:85-88` @lore).

**Convergence — hardcoded → token:**

| Hardcoded | file:line | → |
|---|---|---|
| `tracking-[0.05em]` (11px mono kicker) | `ThreadShell.tsx:172,202`, `RichMessageCard.tsx:210,489`, `CommentRow.tsx:277`, `StatusChip.tsx:104` †, `block/TablePayload.tsx:24`, `block/CodePayload.tsx:21` | `--tracking-caps-sm` |

> † **StatusChip ownership — RESOLVED: AI6 migrates `:104`.** `TRACK-AI.md:211` reserves "status chips (**AI4**)" out of AI5's scope; AI6's spec (`:221`) names StatusChip tracking among the divergences. AI4 is **merged** (#272) and owns the chip component, but migrated labels/casing only — `StatusChip.tsx:104` `tracking-[0.05em]` is **still hardcoded**. AI4 owns the component; AI4 did not ratify the tracking. **AI6 migrates `StatusChip.tsx:104` → `tracking-[var(--tracking-caps-sm)]`** — required because AI6's `no-hardcoded-tracking` rule (set to `error` over `packages/design-system/src/**`) would flag the un-migrated chip and break `npm run lint` the moment AI6 lands. Gate and rule must agree: dropping the line is NOT an option.
| `tracking-[0.02em]` (11px mono label) | `ArtifactEmbed.tsx:31`, `ArtifactPreview.tsx:20`, `ArtifactPreviewSurface.tsx:23`, `ArtifactGalleryCard.tsx:19`, `ArtifactKindBadge.tsx:13`, `ArtifactStackItem.tsx:41`, `block/UnknownPayload.tsx:20` | `--tracking-caps-sm` |
| `tracking-[0.03em]` (11px pill) | `RichMessageCard.tsx:207,483` | `--tracking-caps-sm` |
| `tracking-[0.04em]` (10px badge) | `CommentRow.tsx:267` | `--tracking-caps-sm` |
| `tracking-[0.06em]` (11px, already correct value, wrong form) | `kinds/data-renderer.tsx:59`, `kinds/fallback-renderer.tsx:40` | `--tracking-caps-sm` (token form) |
| Already token | `KnowledgeRow.tsx:104,118,125,134`, `KeyValue.tsx:20` | keep |

**Out of scope (NOT uppercase-caps tracking):** negative tracking on titles — `tracking-[-0.01em]` (`ErrorState.tsx:103`, `EmptyState.tsx:63`, `BetCard.tsx:169`), `tracking-[-0.005em]` (`block/HeadingPayload.tsx:28`). These are display-title optical kerning, a different concern; the spec's tracking AC is explicitly "uppercase label". Leave them. (Architecture may optionally note a `--tracking-title` token but it is not an AI6 AC — recommend leaving to avoid scope creep.)

---

## 4. Hovered vs Selected — must be distinct

**The two-tone rule** for any component that holds hover and selection as *independent* states:
- **Hover** (transient pointer): neutral tint `color-mix(in oklab, var(--text-secondary) 8%, transparent)` — the existing idiom.
- **Selected** (committed / current / active): accent tint `var(--accent-primary-dim)` + `text-[var(--accent-primary)]` (matches TabBar selected `TabBar.tsx:42`, NavItem active, AQ-011 green = active).

Selected = accent-colored; hover = neutral grey. Distinct hue, not just opacity.

**slash-menu is NOT the proof surface — and is correct as-is.** Verified `slash-menu.tsx:218`: `onMouseEnter={() => setSelectedIndex(index)}`. Pointer-hover *sets* `selectedIndex` by design — hover and selection are the **same state variable** in this component (keyboard arrow and mouse hover both drive the one cursor). A hovered item therefore *is* the selected item; there is no "hovered-but-not-selected" state to render differently. A single highlight is the **correct** treatment here, not a bug. The slash-menu's selected/hover highlight stays as one accent-or-neutral class (whichever the §2/§4 idiom dictates for a single committed cursor); we do NOT introduce a second tone it can never reach.

> **Decision (resolves design-critique WARNING §4):** Option (b). We keep slash-menu's hover-follows-selection behavior unchanged — no `onMouseEnter` decoupling, honoring the spec's "no behavior changes / chrome only" constraint. The "hovered vs selected are visually distinct" AC is **re-targeted onto a component that genuinely holds both states independently: TabBar** (and any list/menu that gains independent selection in AG5/AG6). Option (a) — decoupling `onMouseEnter` from `setSelectedIndex` — was rejected: it is a behavior change requiring a waiver, it would degrade slash-menu UX (mouse and keyboard cursors would desync), and it is unnecessary because TabBar already satisfies the AC.

**Convergence / proof targets:**

| Component | Independent hover + selected? | Action / role |
|---|---|---|
| `TabBar.tsx` | yes — `selected` prop is independent of pointer hover | **reference + AC proof surface.** Already correct. NOTE: TabBar expresses the two-tone via **text color + bg-presence**, not the row bg color-mix idiom — selected = `bg-[var(--accent-primary-dim)]` + accent text/border; hovered-inactive = transparent bg + `hover:text-[var(--text-secondary)]` (verified `TabBar.tsx:43,76`, no `hover:bg-`). The §4 `text-secondary` 8% bg-mix is the rule for **rows/list-items** (AG6), not TabBar. The hover-vs-selected validation runs here and asserts accent-bg/accent-text vs no-bg/neutral-text. |
| `slash-menu.tsx` | no — hover sets `selectedIndex` (`:218`) | selection-follows-hover by design; single highlight is correct. No two-tone change, no behavior change. |
| `Menu.tsx:184` | hover only (no selected/current concept) | no change — Menu has no selected state. |

(Dropdown AG5 and Row AG6 will introduce components with independent selection; the two-tone rule is documented for them.)

---

## 5. Renderer-family container reconciliation

`block/*Payload.tsx` (block payload renderers) and `kinds/*-renderer.tsx` (artifact kind renderers) render the same content kinds with **different container chrome**:

| Content kind | block/ chrome | kinds/ chrome | Divergence |
|---|---|---|---|
| Image | `figure` `rounded-[--r-default]` + `border-subtle` overflow-hidden (`block/ImagePayload.tsx:37`) | `img` `rounded-[--r-subtle]`, no border (`kinds/image-renderer.tsx:27`) | radius 16 vs 10; border vs none |
| Table | `rounded-[--r-default]` + `border-subtle` wrapper (`block/TablePayload.tsx:15`) | bare `<table>`, only row `border-t` (`kinds/data-renderer.tsx:73`) | container vs none |
| Code | `bg-surface-container` `rounded-[--r-default]` p-12 (`block/CodePayload.tsx:25`) | `bg-success/10` undefined class + raw palette (`kinds/code-renderer.tsx:16-17`) | broken classes |
| HTML | `bg-surface-container` `rounded-[--r-default]` (`block/HtmlPayload.tsx:27`) | `rounded-[--r-subtle]` + `border-subtle` (`kinds/html-renderer.tsx:34`) | radius 16 vs 10 |
| Text | paragraph payload, token styles | `prose prose-sm prose-invert` (undefined Tailwind-typography classes, `kinds/text-renderer.tsx:27`) | non-token prose plugin |

**Ratified container rule — same content kind = same chrome.** The canonical container for a rendered media/data block is:
> `rounded-[var(--r-default)]` (16px) + `border border-[var(--border-subtle)]` + `overflow-hidden` where content can overflow the radius (image/table). Code/HTML embedded panels use `bg-[var(--surface-container)]` + `rounded-[var(--r-default)]`. Empty-state inside either family is the same left-aligned `EmptyState` treatment (AQ-008).

The `block/` family is the reference (correct radius + border + surface tokens). `kinds/` renderers converge to it:
- `kinds/image-renderer.tsx:27` → `r-default` + `border-subtle` overflow-hidden (match `block/ImagePayload`).
- `kinds/data-renderer.tsx` table → wrap in `rounded-[--r-default]` + `border-subtle` `overflow-x-auto` (match `block/TablePayload:15`).
- `kinds/html-renderer.tsx:34` → `r-default` (match `block/HtmlPayload`).
- `kinds/code-renderer.tsx:16-17` → kill `bg-success/10`/`bg-error/10`; diff add/del lines use `color-mix(in oklab, var(--status-success) 10%, transparent)` / `var(--status-error) 10%`; container matches `block/CodePayload`.
- `kinds/text-renderer.tsx:27` → replace `prose prose-sm prose-invert` with the token-based paragraph styles used by `block/ParagraphPayload` (text-primary, leading-body); `prose-invert` is a dark-only Tailwind-typography class that breaks Hearth light-first and is undefined here.
- `kinds/url-renderer.tsx:17-21` → `bg-green-500/amber-400/red-500` status dots → `bg-[var(--status-success)]/[--status-warning]/[--status-error]` (semantic tokens).

The validation captures one image + one table as block payload and as artifact preview side-by-side; chrome must match.

---

## 6. Motion — already on the scale

Grep found **zero** off-token `duration-[...]` values except one: `Checkbox.tsx:48` uses `duration-[120ms]` (the literal value of `--motion-fast`). Convert to `duration-[var(--motion-fast)]`. All `ease-[ease]` usages (`SearchField.tsx:41,50`, `NavItem.tsx:60`) use the CSS keyword `ease` not `--motion-ease`; the spec's motion AC says "Hearth motion scale" — convert these three to `ease-[var(--motion-ease)]` for full coherence. Everything else already consumes `--motion-fast/default/slow` + `--motion-ease`. Low-volume; safe.

---

## Tokens to add (architecture wires into tokens.css + DESIGN.md)

```
--accent-secondary-dim     light rgba(217,119,6,0.08)   dark rgba(217,119,6,0.10)
--status-info-dim          light rgba(46,125,186,0.08)  dark rgba(68,152,212,0.10)
--status-error-dim         light rgba(220,74,58,0.08)   dark rgba(238,106,90,0.10)
--accent-secondary-hover   #b86305 (both)
--status-error-hover       #c53e30 (both)
```
(Existing & reused: `--accent-primary-dim`, `--scrim`, `--tracking-caps`, `--tracking-caps-sm`, `--motion-*`, `--motion-ease`.)

---

## 9-dimension rubric (in-session score)

| Dim | Score | Note |
|---|---|---|
| Hierarchy | 8 | Convention ratification; hierarchy untouched, only chrome converges. |
| Spacing | 9 | No spacing changes; 6px grid intact. |
| Typography | 9 | Tracking tokens enforce the Hearth caps signature (AQ-013) everywhere. |
| Color | 10 | Every off-palette literal mapped to a semantic token; zero new raw values; tints centralized. |
| Coherence | 10 | This WP IS coherence — one focus rule, one tracking rule, one container rule. |
| States | 9 | Hover/selected made distinct (slash-menu bug fixed); focus states unified; input-glow vs control-ring documented as two named treatments. |
| A11y | 9 | `focus-visible` everywhere (keyboard-only ring), reduced-motion already handled, 1px ring meets visibility on warm surface via accent color. |
| Anti-slop | 9 | No new shapes, no decoration; warm tokens; removes `prose-invert` AI-default. |
| Premium polish | 8 | Directional offset rule keeps inset rings clean; ratification is the polish. |

**Weakest:** States/A11y at 9 — the "two focus treatments" framing (control-ring + input-glow) must be documented crisply in DESIGN.md or a reviewer reads it as the divergence it's resolving. Mitigation: explicit DESIGN.md § naming both, with the catalog tab-through proving each class applies consistently within its element-class.

---

## Rejected (no re-litigation)

- 2px focus ring (heavier than `--bw-thin`, clashes with warm cream; minority usage).
- A single focus treatment that forces text inputs onto the outline ring (loses the established input-glow affordance; would be a regression).
- A new `--tracking-title` token for negative-tracking display titles (not an AI6 AC; scope creep).
- A new neutral-row-hover token (the `color-mix(text-secondary, X%)` idiom is the system's existing pattern; adding a token duplicates it).
- color-mix-derived `--scrim` (DESIGN.md floated it; the warm literal rgba is already AQ-009-compliant and is a token definition, not a component hardcode — no benefit, migration risk).
- Reconciling `kinds/` onto `r-subtle` instead of `r-default` (AQ-006: 16px is the container default; block/ family is already correct).

---

## Open questions for architecture

1. AppShell scrim consumer: confirm it lives in `packages/web` (AI5 adoption scope) vs DS package. If web-only, AI6 scope = token exists + documented; wiring is AI5. Grep to confirm.
2. `RichMessageCard.tsx:207,483` pills use `tracking-[0.03em]` on mono pills — confirm 0.06em (caps-sm) doesn't overflow the pill at min-width; if it does, that's the only place a visual-parity check is non-trivial.
3. Lint: extend `no-raw-tailwind-color` to (a) use `collectClassStringsFromJSXAttribute` (template-literal coverage) and (b) match the `bg-{success|warning|error|info|accent}/{NN}` undefined-token-opacity form. `no-hardcoded-color` already covers TemplateElement (`no-hardcoded-color.ts:141`) — verify it fires on the rgba-in-template-string repro.
