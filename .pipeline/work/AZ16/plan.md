# AZ16 — Every design token is enforced

## What we need

Every token family in `tokens.css` needs a build gate at `error` in app and design-system code: typography (font size, family, weight, line height, tracking), motion (duration, easing), border width, and raw Tailwind palette names. A builder who reaches for an off-token value should fail verification the same way a type error fails — the token system total, not partially, enforced.

AZ7 closed radius, color vocabulary, controls and status, and in doing so proved the disease: rules registered at `warn` never ran (`npm run lint --quiet` skips warn-level rules entirely), and rules wired nowhere read as healthy forever. Typography, motion and border sat exactly where AZ7's population sat before it — `no-off-scale-font-size` at warn for core-ui, `no-hardcoded-tracking` and `no-off-scale-duration` unwired, `no-raw-tailwind-color` at warn, and no rule at all for font family, weight, line height, easing completeness or border width. Every surface built until this closed drifted on those axes, invisibly.

Done means: each typography, motion and border-width family fails verification when used off-token, with the existing off-token population cleared in the same change; raw Tailwind palette names fail at `error`; a token family in `tokens.css` with no enforcement gate fails verification, so the gate set is total over the token file; and every gate runs under `npm run lint` as actually invoked — no warn tier, no rule wired nowhere — asserted mechanically rather than by inspection. Surviving sites carry a documented exemption citing a reason. Proof is by computed style on the shipped app: each measured count equals the size of its token family.

The boundary: this enforces the token vocabulary that already ships, it does not redesign the type scale, motion curve or border system. No new rule duplicates a job an existing design-lint rule already does. Every rule lands at `error` with zero survivors in the same change — no baseline, no severity dial. Spacing and elevation belong to AZ15 (audited and recorded here, not reimplemented); page geometry to AZ11; radius, color, controls and status to AZ7.

## How it works

Public typography is a closed set of named, complete definitions — never a public size ladder. Each binds family, size, line height, weight and tracking. Children with no authored typography inherit normally; raw five-field definitions are legal only in the central registry.

| Public role | Complete definition |
|---|---|
| `type-label` | sans / 11px / 1.25 / 600 / .06em |
| `type-metadata` | sans / 12px / 1.4 / 500 / 0 |
| `type-small` | sans / 13px / 1.4 / 400 / 0 |
| `type-copy` | sans / 15px / 1.55 / 400 / 0 |
| `type-control` | sans / 13px / 1.25 / 500 / 0 |
| `type-input` | sans / 13px / 1.4 / 400 / 0; mobile 16px with the other fields unchanged |
| `type-avatar-initial` | sans / stacked 9px, sm 10px, md 12px, lg 13px / 1 / 600 / 0 |
| `type-subheading` | sans / 15px / 1.4 / 600 / 0 |
| `type-lead` | sans / 17px / 1.25 / 600 / -.01em |
| `type-title` | sans / 20px / 1.4 / 600 / -.01em |
| `type-display` | sans / 24px / 1.25 / 600 / -.01em |
| `type-metric` | sans / 24px / 1 / 600 / -.01em / tabular numerals |
| `type-data` | mono / 12px / 1.4 / 500 / 0 |
| `type-inline-code` | mono / 13px / 1.55 / 400 / 0 |

Structural meaning wins over visual similarity: controls and inputs map to their control roles; avatar identity to `avatar-initial`; headings by hierarchy (h1/h2/h3 to display/title/lead, h4–h6 to subheading); KPI values to `metric`; uppercase structural captions to `label`; block code to `data`; inline code to `inline-code`; the rest to data, metadata, copy or small. Count is not a separate role — it normalizes to `data`, and visual-size-only roles were removed. Avatar variants are container-driven. Profiles own emphasis: strong/b is fixed at 600, em/i is italic while inheriting the other fields. Syntax is `type-copy` in JSX, `@apply type-copy` in owned CSS, or `TYPE_STYLE.metric` where inline style is required.

Motion follows the same purpose-profile rule — seven profiles, each with one exact job.

| Motion profile | Exact job |
|---|---|
| `motion-feedback` | opacity/filter, 120ms, `cubic-bezier(.25,.1,.25,1)` |
| `motion-move` | transform, 240ms, standard curve |
| `motion-spring` | transform, 240ms, `cubic-bezier(.34,1.56,.64,1)` |
| `motion-enter` | opacity+transform, 120ms, `cubic-bezier(0,0,.2,1)`, once |
| `motion-activity` | opacity pulse, 1.4s, in-out, infinite |
| `motion-loading` | skeleton opacity pulse, 1.8s, in-out, infinite |
| `motion-busy` | rotation, 750ms, linear, infinite |

Everything else snaps: color, background, border, shadow, width, max-width and `all`. Card lift animates only transform; shadows and presses snap. Reduced motion is global and unconditional — `animation:none!important`, `transition:none!important`, `scroll-behavior:auto!important` on every element and pseudo, including foreign previews; WAAPI and smooth scrolling are forbidden. Exactly four production rAF calls remain, all structural scheduling, and lint binds those exact call identities so any added, moved or structurally changed call fails. Borders are `--bw-thin:1px`, `--bw-default:1.5px`, `--bw-strong:2px`, spelled explicitly per side; Toast keeps the sole 1.5px status rail and fourteen other conditional state rails were removed, while normal outlines, separators and action borders remain. Foreign input is limited to the two literal `data-token-subject="foreign"` roots.

The enforcement topology has three layers. `framework/design-system/src/token-profiles.ts` owns the typed inline profiles and `tokens.css` the matching utilities and keyframes. ESLint rules `typography-profile-only`, `motion-profile-only` and `border-width-profile-only` enforce production `.ts/.tsx` at error, and root lint promotes the raw Tailwind palette checks to error. `tools/eslint-plugin-design/src/token-family-owners.ts` is the shared fail-closed classification and owner registry used by both ESLint and the CSS gate: it classifies all 78 token names / 143 declarations exactly once across thirteen value families plus the explained `component-geometry` non-family, and the CSS gate parses `tokens.css` so an unknown token name, an ownerless family, or an unexplained non-family fails and names the token. On top, a live census dynamically scans discovered production `.ts/.tsx/.css`, rejects raw survivors and unknown profiles, and compares measured values against the approved expansion — it never substitutes receipt totals for measured values.

Three things were rejected along the way. An extractor heuristic was rejected as the semantic API in favour of the reviewed per-source manifest, because heuristic censuses produced exact but semantically wrong maps. A broad runtime scanner was rejected in favour of a static census plus focused computed/painted proof, unless implementation evidence showed one was necessary. And `component-geometry` stayed an explained non-family rather than gaining an invented rule to make the registry look uniform.

## How we work on this

This folder is not reduced to plan-plus-retro, deliberately. Most of what it holds are live build inputs wired into `npm run lint`, not run artefacts:

- `lint:az16-audit` runs `audit-checksum-gate.mjs`, which SHA-256 checksums the six frozen manifest/decision snapshots against `audit-checksums.sha256` and fails if any changed.
- `lint:az16-receipts` runs `tools/repo-gates/src/az16-migration-receipt-gate.ts`, which reads the three site manifests and the 1,383 receipts across `migration-receipts-wave-*.tsv` to prove every audited destination was migrated.

So `audit-checksum-gate.mjs`, `audit-checksums.sha256`, `migration-receipt.schema.json`, the seven wave TSVs and the six frozen TSVs must stay exactly as they are — editing any of them breaks lint. The folder can only be reduced once these gates are re-homed under `tools/`, alongside the other repo gates that already live there.

The item shipped. Procedure was one combined refine/design/architecture round, one founder concept approval, one builder session across nine sub-1,000-line waves, then exactly one implementation review; that review found four blockers, the same builder repaired each red-first, and no second review or further human gate was permitted. Final verification: lint, typecheck 55/55 packages, the named Playwright profile matrix 3/3, and verify all pass. The affected unit lane passes 573 files / 6,266 tests but retains two watcher timing failures in `layers/agent-orchestration/run-orchestration`; both reproduce alone and the package has no branch diff or commits, so this is accepted non-blocking baseline evidence, not an AZ16 defect.
