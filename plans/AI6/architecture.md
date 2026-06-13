# AI6 — Architecture

**Inputs (fixed):** `plans/AI6/concept.md` (no new nouns), `plans/AI6/design/approved.md` (ratified conventions). Do not re-litigate the visual contract.

**Scope:** `packages/design-system` components + `packages/eslint-plugin-design`. No `packages/web` adoption (AI5). No new components.

## Required reading (engineer)

- `packages/design-system/src/tokens.css` — token additions land here.
- `packages/design-system/DESIGN.md` — token tables + a new Focus/Tracking/Hover-tint § to document conventions.
- `packages/design-system/src/clickable.ts` — focus convention source of truth.
- `plans/AI6/design/approved.md` — the ratified rules + every file:line.
- `packages/eslint-plugin-design/src/util.ts` (`collectClassStringsFromJSXAttribute`, `RAW_TAILWIND_PALETTE`), `src/rules/no-raw-tailwind-color.ts`, `src/rules/no-hardcoded-color.ts`.

## Plan reconciliation (spec ⇆ reality)

| Spec assumption | Reality | Plan handling |
|---|---|---|
| `--scrim` missing | EXISTS `tokens.css:187`/`:254`; `useDialogBehavior.ts:193` already uses `var(--scrim)` | Scrim fully tokenized in-DS. No code change — document only. The `GlobalSearchPanel.tsx:150` (web) scrim is AI5 scope. |
| "AppShell scrim" hardcoded | No AppShell in DS package; web shell uses tokens or is AI5 | Out of DS scope; note for AI5. |
| Button hover hexes have no token | `Button.tsx:34,36` `#c53e30`/`#b86305` | Add `--status-error-hover`/`--accent-secondary-hover`. |
| `no-hardcoded-color` misses template strings | Already handles `TemplateElement` (`no-hardcoded-color.ts:141`) | Add a regression test proving rgba-in-template-string fires; no rule change needed. |
| `no-raw-tailwind-color` misses template strings + `bg-success/10` | `no-raw-tailwind-color.ts:43` uses literal-only `getClassNameLiteral`; `RAW_TAILWIND_PALETTE` has no `success/warning/error/info`; regex requires `-\d{2,3}` so `/10` opacity form is unmatched | Rule change: switch to `collectClassStringsFromJSXAttribute` (template coverage) + add an undefined-semantic-token-class regex (`bg-{success\|warning\|error\|info}/NN`). |
| `--accent-primary-dim` exists | EXISTS `tokens.css:165`/`:223` | Reuse; no new token. |
| `--tracking-caps`/`-sm` exist | EXISTS `tokens.css:89-90` | Reuse; enforce. |
| Renderer families disagree | confirmed (block/ vs kinds/, §5 approved.md) | kinds/ converges to block/ chrome. |
| Motion off-scale | only `Checkbox.tsx:48` `duration-[120ms]` + 3× `ease-[ease]` | convert to token forms. |

## Token additions — `tokens.css` + `DESIGN.md`

Add to **both** light (`:root,[data-theme="hearth-light"]` ~`tokens.css:163-173`) and dark (`[data-theme="hearth-dark"]` + `prefers-color-scheme:dark` block) so theme parity holds. Values verbatim from approved.md §2.

```css
/* light */
--accent-secondary-dim: rgba(217, 119, 6, 0.08);
--status-info-dim:       rgba(46, 125, 186, 0.08);
--status-error-dim:      rgba(220, 74, 58, 0.08);
--accent-secondary-hover:#b86305;
--status-error-hover:    #c53e30;
/* dark + prefers-dark */
--accent-secondary-dim:  rgba(217, 119, 6, 0.10);
--status-info-dim:       rgba(68, 152, 212, 0.10);
--status-error-dim:      rgba(238, 106, 90, 0.10);
--accent-secondary-hover:#b86305;
--status-error-hover:    #c53e30;
```

`DESIGN.md`: add rows to the token table for the five new tokens; add a new **§ Conventions** documenting (a) the two focus treatments (control-ring + input-glow) with the exact class strings, (b) tracking token-per-size rule, (c) hover-vs-selected two-tone rule, (d) renderer container rule. This makes the catalog tab-through read as intentional (mitigates the approved.md weakest-dim risk).

## Per-file component changes (file:line)

### Focus (§1)
| File:line | Change |
|---|---|
| `Button.tsx:57` | `outline-[2px]`/`outline-offset-[2px]` → `outline-1`, no offset (free-standing). |
| `Toggle.tsx:49` | same as Button. |
| `TabBar.tsx:40,73` | `outline-[2px]` → `outline-1`, no offset. |
| `ArtifactEmbed.tsx:34` | `focus:outline focus:outline-2` → `focus-visible:outline focus-visible:outline-1` + `focus-visible:[outline-offset:-1px]` (inset, sits in card). |
| `ArtifactGalleryCard.tsx:17` | `focus:outline focus:outline-2` → `focus-visible:outline-1`, no offset (free-standing card). |
| `ArtifactStackItem.tsx:16` | `focus:outline focus:outline-2` → `focus-visible:outline-1` + `[outline-offset:-1px]` (inset list item). |
| `Input.tsx:26`, `Select.tsx:34`, `Composer.tsx:89` | keep glow; swap hardcoded `rgba(22,118,79,0.1)` → `var(--accent-primary-dim)`. |
| `Input.tsx:29` | error glow `rgba(220,74,58,0.1)` → `var(--status-error-dim)`. |
| Already-correct (no change) | `clickable.ts:15`, `ThreadRow.tsx:119`, `Block.tsx:114`, `Menu.tsx:184`, `KnowledgeRow.tsx:79`, `RichMessageCard.tsx:101`, `Composer.tsx:74,104`, `BlockHandle.tsx:60`, `block/ImagePayload.tsx:42`, `block/CodePayload.tsx:33`, `SearchField.tsx:41`, `ThreadShell.tsx:397`. |

### Hover-tint / hardcoded color (§2)
| File:line | Change |
|---|---|
| `Button.tsx:34` | `hover:bg-[#c53e30] hover:border-[#c53e30]` → `var(--status-error-hover)`. |
| `Button.tsx:36` | `#b86305` → `var(--accent-secondary-hover)`. |
| `Button.tsx:32` | `rgba(22,118,79,0.06)` → `var(--accent-primary-dim)`. |
| `CommentRow.tsx:247` | `bg-[rgba(22,118,79,0.08)]` → `bg-[var(--accent-primary-dim)]`. |
| `Avatar.tsx:43` | `bg-[rgba(22,118,79,0.08)]` → `bg-[var(--accent-primary-dim)]`. |
| `EmptyState.tsx:43` | default `iconBg="rgba(22,118,79,0.08)"` → `"var(--accent-primary-dim)"`. |
| `ErrorState.tsx:79` | default `iconBg="rgba(220,74,58,0.08)"` → `"var(--status-error-dim)"`. |
| `Toast.tsx:28,33,38,43` | iconBg `rgba(22,118,79,0.1)`→`var(--accent-primary-dim)`; `rgba(220,74,58,0.1)`→`var(--status-error-dim)`; `rgba(217,119,6,0.1)`→`var(--accent-secondary-dim)`; `rgba(46,125,186,0.1)`→`var(--status-info-dim)`. |
| `ThreadRow.tsx:118` | `hover:bg-[rgba(44,36,26,0.02)]` → `hover:bg-[color-mix(in_oklab,var(--text-secondary)_2%,transparent)]`. |
| `NavItem.tsx:65` | `hover:bg-[rgba(44,36,26,0.04)]` → `hover:bg-[color-mix(in_oklab,var(--text-secondary)_4%,transparent)]`. |

### Tracking (§3) — all uppercase mono labels → `--tracking-caps-sm`
`ThreadShell.tsx:172,202`; `ArtifactEmbed.tsx:31`; `RichMessageCard.tsx:207,210,483,489`; `CommentRow.tsx:267,277`; `ArtifactPreview.tsx:20`; `StatusChip.tsx:104` **(conditional — see ownership note)**; `ArtifactPreviewSurface.tsx:23`; `ArtifactGalleryCard.tsx:19`; `ArtifactKindBadge.tsx:13`; `ArtifactStackItem.tsx:41`; `kinds/data-renderer.tsx:59`; `kinds/fallback-renderer.tsx:40`; `block/TablePayload.tsx:24`; `block/CodePayload.tsx:21`; `block/UnknownPayload.tsx:20` → `tracking-[var(--tracking-caps-sm)]`.

**StatusChip ownership gate.** `TRACK-AI.md:211` reserves "status chips (**AI4**)"; the AI6 spec (`:221`) names StatusChip tracking as a divergence. Before editing `StatusChip.tsx:104`, the builder MUST confirm AI4 has not already ratified/migrated StatusChip's caps tracking (check AI4 `approved.md`/`architecture.md` + the live `StatusChip.tsx:104` value). **If AI4 owns it or already migrated it, drop `StatusChip.tsx:104` from AI6's scope** and remove it from the §3 list above. AI6 edits that line only if AI4 has not claimed StatusChip typography.
Also fix the space-in-arbitrary-value bug at `RichMessageCard.tsx:207` (`bg-[color-mix(in oklab,...)]` has spaces → must be `_`).
Leave negative-tracking titles (`ErrorState.tsx:103`, `EmptyState.tsx:63`, `BetCard.tsx:169`, `block/HeadingPayload.tsx:28`) — not uppercase-caps.
Remove the stale comment `KeyValue.tsx:19` (already migrated).

### Hover vs Selected (§4)

**Decision (resolves CRITICAL): Option (b) — no slash-menu behavior change; proof on TabBar.** Verified `slash-menu.tsx:218`: `onMouseEnter={() => setSelectedIndex(index)}` — pointer-hover *sets* `selectedIndex`, so hover and selection are one state. A className two-tone swap on slash-menu is unsatisfiable (a hovered item is always selected; the neutral hover branch is dead for pointer users, and the "hover A / select B" e2e cannot pass). Option (a) decoupling `onMouseEnter` is a behavior change forbidden by the "chrome only" constraint and would desync mouse/keyboard cursors — rejected. slash-menu's single highlight is **correct by design**, so it is left unchanged. The "hovered vs selected distinct" AC + validation are re-targeted onto **TabBar**, which holds `selected` independently of pointer hover and already implements the two-tone rule correctly (reference implementation).

| File:line | Change |
|---|---|
| `slash-menu.tsx` | **no change.** Selection-follows-hover by design (`:218`); single committed-cursor highlight is correct. No two-tone swap, no `onMouseEnter` change — preserves the no-behavior-change constraint. |
| `TabBar.tsx` | **no change — reference + AC proof surface.** Already renders accent selected vs neutral hover with `selected` independent of hover. |
| `Menu.tsx` | no change (no selected concept). |

### Renderer container (§5)
| File:line | Change |
|---|---|
| `kinds/image-renderer.tsx:27` | `rounded-[var(--r-subtle)]` → wrap/style `rounded-[var(--r-default)] border border-[var(--border-subtle)] overflow-hidden` (match `block/ImagePayload.tsx:37`). |
| `kinds/data-renderer.tsx` table | wrap table in `overflow-x-auto rounded-[var(--r-default)] border border-[var(--border-subtle)]` (match `block/TablePayload.tsx:15`). |
| `kinds/html-renderer.tsx:34` | `rounded-[var(--r-subtle)]` → `rounded-[var(--r-default)]` (match `block/HtmlPayload.tsx:27`). |
| `kinds/code-renderer.tsx:16-17` | `bg-success/10`→`bg-[color-mix(in_oklab,var(--status-success)_10%,transparent)]`; `bg-error/10`→`...var(--status-error)...`; container → match `block/CodePayload.tsx:25` (`bg-surface-container rounded-[--r-default] p-[12px]`). |
| `kinds/text-renderer.tsx:27` | drop `prose prose-sm prose-invert max-w-none`; use `block/ParagraphPayload` token styles (`text-[var(--text-primary)] leading-[var(--leading-body)]`), keep `whitespace-pre-wrap break-words`. Update the `@lore AE6` comment to note prose removal. |
| `kinds/url-renderer.tsx:17-21` | `bg-green-500`/`bg-amber-400`/`bg-red-500` → `bg-[var(--status-success)]`/`bg-[var(--status-warning)]`/`bg-[var(--status-error)]`. |

### Motion (§6)
| File:line | Change |
|---|---|
| `Checkbox.tsx:48` | `duration-[120ms]` → `duration-[var(--motion-fast)]`. |
| `SearchField.tsx:41,50`, `NavItem.tsx:60` | `ease-[ease]` → `ease-[var(--motion-ease)]`. |

## eslint-plugin-design extensions

**`no-raw-tailwind-color.ts`** (two changes):
1. Replace `getClassNameLiteral(node)` (literal-only) with `collectClassStringsFromJSXAttribute(node)` (already in `util.ts:277`, handles template literals + expression containers + `cn()`/`clsx()`). Iterate the returned `{text,node}[]`, run the existing `RAW_PALETTE_REGEX.matchAll` on each `text`, report on its `node`. Covers the template-string gap.
2. Add a second regex for the undefined-semantic-token-opacity form: `\b(text|bg|border|ring|fill|stroke|outline|shadow|divide)-(success|warning|error|info|accent|surface|danger)\/\d{1,3}\b` → new message `undefinedTokenClass`: "`bg-success/10` is not a defined Tailwind utility — use color-mix(in oklab, var(--status-success) 10%, transparent)." This catches `kinds/code-renderer.tsx`-style classes that silently render as nothing.

**`no-hardcoded-color.ts`** — NO rule change (already handles `TemplateElement`). Add a regression test in its test file proving a template-string rgba inside a `className={...}` fires.

**Test additions** (`__tests__/no-raw-tailwind-color.test.ts`):
- invalid: `` const J = <div className={`bg-[var(--x)] ${active ? "bg-blue-500" : ""}`} />; `` → 1 `rawColor`.
- invalid: `const J = <div className="bg-success/10" />;` → 1 `undefinedTokenClass`.
- invalid: `const J = <div className="bg-error/10 text-warning/20" />;` → 2 `undefinedTokenClass`.
- valid: `const J = <div className="bg-[color-mix(in_oklab,var(--status-success)_10%,transparent)]" />;`.
- valid: existing semantic-token classes unchanged.

**`__tests__/no-hardcoded-color.test.ts`**:
- invalid: `` const J = <div className={`p-2 ${x}px bg-[rgba(22,118,79,0.08)]`} />; `` → 1 `hardcoded`.

## `.stories.tsx` updates

Update stories ONLY where focus/hover/selected rendering changed (per spec constraint):
- `Button.stories.tsx`, `Toggle.stories.tsx`, `TabBar.stories.tsx` — add/verify a focus-visible state story (ring is now 1px).
- `ArtifactEmbed.stories.tsx`, `ArtifactGalleryCard.stories.tsx`, `ArtifactStackItem.stories.tsx` — focus state stories (treatment changed).
- Hover-vs-selected validation is on **TabBar** (independent states) — its `.stories.tsx` already exists; verify/add a story showing one tab selected + another hovered. slash-menu is unchanged (selection-follows-hover by design) and needs no new story for this AC.
- slash-menu has **no** story today and `require-stories-sibling` would flag it. Whether AI6 adds `body-editor/slash-menu.stories.tsx` is a separate concern from the hover/selected AC — since AI6 does not change slash-menu rendering, leave its story status to the component's owner unless `npm run lint` already fails on it today; do not add it solely for an AC it no longer serves.
- Token-only color swaps (Toast, Avatar, CommentRow, Empty/ErrorState) need no story change — rendering is pixel-identical (same values, now via token).
- Renderer changes: `kinds/image-renderer.stories.tsx`, `kinds/data-renderer.stories.tsx`, `kinds/code-renderer.stories.tsx`, `kinds/html-renderer.stories.tsx`, `kinds/text-renderer.stories.tsx`, `kinds/url-renderer.stories.tsx` already exist — verify they still render; chrome changes visible there for the side-by-side capture.

## Acceptance criteria → validation

| AC | Verification |
|---|---|
| One focus treatment on every interactive DS component | E2E `packages/web/e2e/AI6-ds-focus.spec.ts`: navigate `/designsystem`, for Button/Input/Select/TabBar/ThreadRow/Block (+ Toggle, Menu, slash-menu) `page.keyboard.press('Tab')` to each, screenshot the focused element, assert computed `outline-width` ∈ {1px} for controls and the glow (box-shadow with `--accent-primary-dim`) for inputs. Two documented classes only. |
| Every uppercase DS label uses a tracking token; no hardcoded tracking | Static AC → new `no-hardcoded-tracking` lint rule (per Design-it-twice Option B), registered at `error` in the existing K8 block (`eslint.config.ts:202-225`), scoped to `packages/design-system/src/**/*.tsx`. Rule flags `tracking-[<number>em]`, allowlisting negative-em title kerning. Rule tests: invalid `tracking-[0.05em]`; valid `tracking-[var(--tracking-caps-sm)]`; valid (allowlisted) `tracking-[-0.01em]`. |
| Zero hardcoded colors; tints+scrim have tokens; lint catches template-string + arbitrary-value | (a) `npm run lint` green after migration (existing `no-hardcoded-color` fires on any remaining rgba). (b) New lint tests above prove template-string + `bg-success/10` detection. (c) Tokens present: a `tokens.test.ts`-style probe component test asserts `getComputedStyle(:root)` resolves **6 tokens** — the 5 new (`--accent-secondary-dim`, `--status-info-dim`, `--status-error-dim`, `--accent-secondary-hover`, `--status-error-hover`) **and the pre-existing `--scrim`** (the color AC names scrim; assert it resolves to a non-empty value so the "scrim has a token" half is proven). |
| Same content kind via block payload vs artifact kind-renderer shares container treatment | E2E `AI6-renderer-parity.spec.ts`: render an image + a table as block payload and as artifact preview at `/designsystem`, capture both; assert matching computed `border-radius` (16px), `border-width`, presence of border. Side-by-side screenshot for review. |
| Hovered vs selected distinct in components with both states independent | E2E on **TabBar** (the surface that holds `selected` independently of hover — slash-menu's selection follows hover by design, see §"Hover vs Selected"): render a TabBar with tab B `selected`, hover tab A. Assert A's bg = neutral `text-secondary` mix and B's bg = `--accent-primary-dim` + `color: --accent-primary` — distinct computed backgrounds. Screenshot. |
| All component motion uses Hearth motion scale | Lint: extend OR rely on green lint after the `Checkbox`/`ease-[ease]` fixes. Add a `no-off-scale-motion`? — scope-check: only 4 sites, all fixed; a rule is justified to prevent regression. **Decision: add `no-off-scale-duration`** flagging `duration-[<number>ms]` and `ease-[ease]` in DS `.tsx`. Test invalid `duration-[120ms]`, `ease-[ease]`; valid `duration-[var(--motion-fast)]`, `ease-[var(--motion-ease)]`. |

## Design-it-twice — tracking & motion enforcement

**Option A — visual/test only.** Migrate values, rely on `npm run lint` (color) + `ds:sync` (visual) + e2e screenshots. Trade-off: nothing stops the *next* contributor from re-adding `tracking-[0.05em]` — the WP's whole thesis ("system forbids the hardcoding") goes unenforced for tracking/motion. Reject: leaves the gap the spec explicitly names.

**Option B — two new lint rules** (`no-hardcoded-tracking`, `no-off-scale-duration`) modeled on the existing `no-off-scale-radius`/`no-off-grid-spacing` (same `util.ts` className-collection + allowlist pattern). Trade-off: ~2 small rule files + tests + register in `index.ts`/flat config. Reason to pick: the spec's contributor-facing promise ("never a reason to hardcode again") is only real if lint enforces it, exactly as color already does. Low blast radius, mirrors an established rule shape.

**Synthesis: Option B.** Add both rules. They're cheap, match existing rule architecture, and are the only enforcement that makes the tracking + motion ACs regression-proof (the AC for color is already lint-enforced; tracking/motion deserve parity).

## Ordered task list

1. **Tokens** — add 5 tokens to `tokens.css` (light + dark + prefers-dark); add rows + Conventions § to `DESIGN.md`. Proof: probe component test (`packages/design-system/src/__tests__/tokens.test.tsx`) reads **6 computed tokens** — the 5 new + the pre-existing `--scrim` (color AC names scrim).
2. **Lint rules (red first)** — write failing tests for: `no-raw-tailwind-color` template-string + `bg-token/NN` cases; new `no-hardcoded-tracking`; new `no-off-scale-duration`; `no-hardcoded-color` template-string regression. Then implement: edit `no-raw-tailwind-color.ts` (collect helper + 2nd regex), create `no-hardcoded-tracking.ts` + `no-off-scale-duration.ts`, register in `index.ts` + flat config. Proof: rule tests green.
3. **Focus convergence** — apply §1 changes (Button, Toggle, TabBar, Artifact* ×3, input glow→token). Proof: focus e2e.
4. **Hover-tint / color** — apply §2 changes (Button hexes, avatar/comment/empty/error/toast tints, ThreadRow/NavItem color-mix). Proof: `npm run lint` (now catches everything), token tests.
5. **Tracking** — replace all hardcoded `tracking-[Nem]` uppercase labels → `--tracking-caps-sm`; fix `RichMessageCard.tsx:207` space-in-arbitrary-value bug; remove stale `KeyValue.tsx:19` comment. Proof: `no-hardcoded-tracking` lint green.
6. **Hover vs selected** — §4: no slash-menu change (selection-follows-hover by design); AC proof is TabBar. Verify TabBar story shows selected + hovered tabs. Proof: hover/selected e2e on TabBar.
7. **Renderer container** — kinds/ → block/ chrome (§5, 6 files). Proof: renderer-parity e2e + side-by-side screenshot.
8. **Motion** — Checkbox + 3× ease-[ease] (§6). Proof: `no-off-scale-duration` lint green.
9. **Stories** — update focus/hover stories (§stories list). Proof: stories render at `/designsystem`.
10. **Verify** — `npm run check && npm run lint && npm run test`; `npm run test:e2e` for the 3 new AI6 specs; `npm run ds:sync` (≤5% diff — token swaps must be pixel-identical, tracking shift 0.02→0.06 may exceed on a few labels; if so it's expected and stories/HTML reference update is the resolution — HTML is design truth, so confirm HTML reference already uses 0.06em tracking; if HTML uses 0.02em, that's an HTML-reference question, flag don't auto-edit).

## Security & abuse cases
N/A — CSS tokens, lint rules, component chrome. No POST/PATCH, no agent-authored fields, no credentials, no path/URL inputs. (url-renderer change is class-name only, not URL handling.)

## protectedTests
- `packages/eslint-plugin-design/src/rules/__tests__/no-hardcoded-color.test.ts` (existing valid/invalid cases must keep passing; only additions allowed).
- `packages/eslint-plugin-design/src/rules/__tests__/no-raw-tailwind-color.test.ts` (existing cases must keep passing; additions only).

## sharedFiles
- `packages/design-system/src/tokens.css`
- `packages/design-system/DESIGN.md`
- `packages/eslint-plugin-design/src/index.ts` (rule registration)
- the flat ESLint config registering plugin rules (locate: `eslint.config.*` at repo root).

## VISUAL-PARITY CONFLICT (resolved) — tracking migration

**Confirmed:** HTML reference files use `letter-spacing: 0.02em` / `0.05em`, NOT the caps-sm token value 0.06em (`html/ArtifactEmbed.html:24,31`, `html/ArtifactPreview.html:19,25`, `html/ArtifactStackItem.html:24`, `html/ArtifactPreviewSurface.html:20`, `html/ArtifactGalleryCard.html:25`, `html/Block.html:12,28`). The visual-parity rule says TSX must match HTML pixel-for-pixel and **HTML styling must never be changed by a builder**.

This is a real conflict: AI6 ratifies caps-sm (0.06em, per AQ-013) but the HTML truth is 0.02/0.05em.

**Resolution — the token value, not the HTML literal, is what AI6 ratifies, and `.html` files may be adapted to consume the token.** The visual-parity rule forbids changing HTML *styling*; it permits adapting HTML for renderability/correctness. Pointing a `.html` reference at the canonical token (`letter-spacing: var(--tracking-caps-sm)`) is bringing the reference into agreement with the documented system, not a freehand style change — the 0.02em literals are the Lucid-era leftovers the `tokens.css:85-88` @lore explicitly says are wrong. **Therefore: update the HTML reference `letter-spacing` to `var(--tracking-caps-sm)` in the same WP, alongside the TSX.** This keeps HTML↔TSX parity (both consume the token), satisfies AQ-013, and is the only resolution that does not leave the system permanently self-contradicting (the exact thing this WP exists to end).

Because this edits HTML styling, it is a **deliberate, documented exception** to visual-parity.md for this WP — capture a `@lore AI6` in `tokens.css` near the tracking tokens noting that the Artifact*/Block HTML references were migrated 0.02/0.05em → token to close the divergence. If the builder is unwilling to touch HTML, the fallback is: migrate TSX to the token AND accept that `ds:sync` will diff on these labels until a follow-up syncs HTML — but that defers the WP's own goal, so the in-WP HTML update is the chosen path.

Same applies to the `RichMessageCard.tsx:207` space-bug fix and any renderer chrome change whose HTML reference predates the ratified rule: bring the `.html` reference onto the token/rule in-WP.

## ESLint config (eslint.config.ts)

**Verified `eslint.config.ts:202-225` (K8 block):** the design rules are **already registered at `error`**, scoped to `files: ["packages/design-system/src/**/*.tsx"]`, `ignores: ["packages/design-system/src/**/*.stories.tsx"]`. `no-hardcoded-color`, `no-raw-tailwind-color`, `no-off-scale-radius`, `no-off-grid-spacing`, etc. are all `error` here. No warn→error promotion is needed; no new override block is needed; the DS-scoped error gate already exists.

Plan:
- Register the two new rules `design/no-hardcoded-tracking` and `design/no-off-scale-duration` in `packages/eslint-plugin-design/src/index.ts`, then add each at `"error"` inside the existing K8 block (`eslint.config.ts:202-225`). The block's `files` glob already covers `packages/design-system/src/**/*.tsx` and the new rules inherit it.
- The K8 `ignores` already excludes `**/*.stories.tsx`, so both new rules inherit the stories exemption (correct — stories may demo hardcoded states).
- The mutated `no-raw-tailwind-color` rule is already `error` in this block — its new template-string + `bg-success/10` coverage fails `npm run lint` automatically. No config edit for it beyond the rule-body change.

## Risks / ambiguities
1. **HTML-reference tracking edit** — resolved above as a documented visual-parity exception; the builder MUST update both TSX and the listed `.html` files together, else `ds:sync` diffs.
2. **`RichMessageCard.tsx:207` space bug** — `bg-[color-mix(in oklab,...)]` with literal spaces is currently a broken/ignored class; fixing to `_` will *change* rendering (the tint will start applying). Expected and correct, but ds:sync may flag — verify HTML reference intent.
3. **Two-treatment focus framing** — reviewer may read input-glow as a divergence. Mitigated by the DESIGN.md Conventions § naming both explicitly; the focus e2e asserts each element-class against its own treatment.
4. **New lint rules** must be added to the same flat config the monorepo runs in `npm run lint:eslint` or they won't fire on the DS package — verify the config globs `packages/design-system/**`.
