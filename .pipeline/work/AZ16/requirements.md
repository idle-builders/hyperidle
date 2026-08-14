# AZ16 — Requirements

DOC-CLASS: update — public typography and motion use complete named profiles, never value fragments.

## Verified census

The checked-in scanners dynamically discover shipping packages and hard-fail on zero discovery, duplicate/stale decisions, conflicts, or unmapped rows. They scan production `.ts`, `.tsx`, and `.css`, parse typed Tailwind and real JSX style contexts, resolve same-file class construction including chained `.join().trim()`, and preserve CSS line numbers while stripping comments. IDs use path + named scope + element/kind + a normalized-source fingerprint; occurrence is only a duplicate suffix, and identical fingerprints must share a destination, so reorder cannot silently retarget a decision.

- Typography: **891 sites / 1,630 fields**: size 824, family 146, weight 400, line-height 123, tracking 136, authored emphasis style 1. Approved destinations: label 116, metadata 231, small 232, copy 48, control 90, input 11, avatar-initial 14, subheading 7, lead 11, title 10, display 2, metric 7, data 99, inline-code 2, heading-variant 1, glyph repair 7, REMOVE 3. Zero extractor-unmapped rows.
- Motion: **146 jobs**: SNAP 89, REMOVE 15, feedback 9, move 15, spring 2, enter 1, activity 7, loading 6, busy 2. Arbitrary `[transition:…]`, helper-returned class strings, and actual hover/active/conditional state properties are included. Zero unmapped. Production `.ts`, including `clickable.ts`, is covered.
- Border: **346 sites**: 339 owned and 7 foreign. Destinations: thin 228, default 25, strong 20, explicit NONE 44, REMOVE 14, geometry 8, FOREIGN 7. Generated `buildArtifactSrcdoc()` inline border is included. Normal card outlines, separators, and action borders are preserved; REMOVE is only a conditional non-Toast state/status rail.

Foreign color/typography/border content is exactly the two subtrees marked `data-token-subject="foreign"` at `RenderedPage()` in `ReviewBrowserPreview.tsx` and `EmailRender()` in `ReviewRenderedInContext.tsx`; siblings and TrafficLights remain owned. Reduced-motion CSS applies to the whole app document, including those subtrees.

## Typography contract

Every site that authors any typography field consumes exactly one complete profile. A child that authors none uses normal CSS inheritance and is not a manifest site. Raw five-field definitions are legal only in the central registry; there are no exceptions.

| Public role | Complete definition | Sites |
|---|---|---:|
| `type-label` | sans / 11px / 1.25 / 600 / .06em | 116 |
| `type-metadata` | sans / 12px / 1.4 / 500 / 0 | 231 |
| `type-small` | sans / 13px / 1.4 / 400 / 0 | 232 |
| `type-copy` | sans / 15px / 1.55 / 400 / 0 | 48 |
| `type-control` | sans / 13px / 1.25 / 500 / 0 | 90 |
| `type-input` | sans / 13px / 1.4 / 400 / 0; responsive variant is 16px with the other four fields unchanged | 11 |
| `type-avatar-initial` | sans / container variants stacked 9px, sm 10px, md 12px, lg 13px / 1 / 600 / 0 | 14 audit sites |
| `type-subheading` | sans / 15px / 1.4 / 600 / 0 | 7 direct sites; heading variant also resolves h4–h6 here |
| `type-lead` | sans / 17px / 1.25 / 600 / -.01em | 11 direct sites |
| `type-title` | sans / 20px / 1.4 / 600 / -.01em | 10 |
| `type-display` | sans / 24px / 1.25 / 600 / -.01em | 2 |
| `type-metric` | sans / 24px / 1 / 600 / -.01em / `font-variant-numeric: tabular-nums` | 7 |
| `type-data` | mono / 12px / 1.4 / 500 / 0 | 99 |
| `type-inline-code` | mono / 13px / 1.55 / 400 / 0 | 2 |

Approved roles are exactly the 14 above. Every owned uppercase structural label/caption maps label, including KpiStat, WorkTeam StatTile, SectionLabel, table/field captions, and uppercase badges; monospace styling does not make a caption data. Count is not a role; its one site normalizes to data. Precedence is structural contract first (control/input, avatar identity, heading, metric, uppercase structural label), then block code→data and inline code→inline-code, then other data, metadata, and copy/small. KPI captions map label and KPI values map metric. Frozen knowledge h4–h6 map to subheading. The dynamic HeadingPayload receipt expands to h1→display, h2→title, h3→lead, and h4/h5/h6→subheading. Final census equality therefore uses the expanded live expectations: label 116, metadata 231, small 232, copy 48, control 90, input 11, avatar-initial 14, subheading 10, lead 12, title 11, display 3, metric 7, data 99, inline-code 2 — **886 profile consumers**.

Avatar variant assignment is deterministic for all 14 audit rows:

| Audit source/context | Rows | Variant |
|---|---:|---|
| Shared `Avatar` primitive | 1 | exact public `size` prop: sm→sm, md→md, lg→lg |
| BetCard overlapping groups, ThreadRow group, ConversationSurface ParticipantGroup | 4 | stacked |
| BetCard lead, ThreadHostBanner participant + overflow chip, PartList author, review agent + human, WorkTeam routine agent | 7 | sm |
| CommentRow sender | 1 | md |
| SessionAvatar | 1 | ParticipantGroup→stacked; message/PartGroup→sm |

Container/context wins over the old raw font size. `stacked` is only an overlapping participant group; sm is dense standalone 22–28px chrome; md is ordinary 36px chrome; lg is the shared 48px primitive. This table is copied into every corresponding decision-map reason, so no avatar row has an unspecified variant.

Owned `<strong>/<b>` and `<em>/<i>` remain semantic markup. Three owned authored declarations are explicit REMOVE rows: `renderNode` strong's local weight, body-editor strong's local weight, and `renderNode` em's local `italic` class. Floating-toolbar `<strong>`/`<em>` author no local typography and inherit, so they are correctly not manifest sites. No other owned strong/em local class/style exists. Each central profile owns emphasis behavior: strong/b is fixed at 600 (never relative `bolder`); em/i is italic with family, size, line-height, weight, and tracking inherited from the parent profile; nesting does not compound. Foreign subjects retain authored markup/styles unchanged.

Public syntax is `className="type-copy"` in JSX, `@apply type-copy` for owned CSS/generated content, and `style={TYPE_STYLE.metric}` when an inline style is required. The registry owns the only raw definitions and exports the frozen inline objects.

## Motion contract

| Profile | Exact authored job | Jobs |
|---|---|---:|
| `motion-feedback` | opacity/filter; 120ms; `cubic-bezier(.25,.1,.25,1)` | 9 |
| `motion-move` | transform; 240ms; same standard curve | 15 |
| `motion-spring` | transform; 240ms; `cubic-bezier(.34,1.56,.64,1)` | 2 |
| `motion-enter` | opacity+transform; 120ms; `cubic-bezier(0,0,.2,1)`; once, both | 1 |
| `motion-activity` | opacity pulse; 1.4s; `cubic-bezier(.4,0,.2,1)`; infinite | 7 |
| `motion-loading` | skeleton opacity pulse; 1.8s; same in-out curve; infinite | 6 |
| `motion-busy` | rotation; 750ms; linear; infinite | 2 |

Keyframes are exact: enter `0%{opacity:0;transform:translateY(6px)} 100%{opacity:1;transform:none}`; activity `.45→1→.45`; loading `.55→1→.55`; busy `rotate(0deg)→rotate(360deg)`. Color, background, border, shadow, width, max-width, and `all` snap. BetCard, TaskCard, and ArtifactGalleryCard hover lifts migrate from `transition-all` to transform-only move; shadow snaps. Opacity hover uses feedback. Active press transforms snap: NeedsYouChip's button keeps feedback for its real hover opacity and snaps its press translate; its trailing span has only a color state, so its dead opacity transition is removed. AppShell's conditionally mounted drawer has no rendered transform delta, so its dead move transition is removed. DoneRow removes its transform transition. The full profiled-transition audit additionally confirms ReferenceChip group-hover opacity, Toggle checked translate, and both ReviewBatch conditional caret rotations have real matching states; no other profile row lacks a state change.

There are exactly **4** production `requestAnimationFrame` calls: RoleCombobox schedules one-frame input focus; KnowledgeDetail waits one frame for a rendered anchor before auto-scroll; AppShell starts route-state focus/scroll restoration and schedules its bounded retry from the named `restore` callback. All four are scheduling, not animation. Motion lint bans every other rAF shape plus WAAPI (`animate()`, `Animation`, `KeyframeEffect`) and smooth scrolling. Its only rAF allowances are these file+named-scope patterns, including AppShell's cleanup cancellation; moving or adding a call fails lint.

Public syntax is `motion-feedback` / `@apply motion-feedback` / `MOTION_STYLE.feedback`. Under `prefers-reduced-motion: reduce`, `*,*::before,*::after` get `animation:none!important`, `transition:none!important`, and `scroll-behavior:auto!important`. Lint bans WAAPI and smooth-scroll calls. No foreign-subtree exemption applies.

## Border contract

Approved widths are `--bw-thin:1px`, `--bw-default:1.5px`, and `--bw-strong:2px`. Legal Tailwind forms are explicit `border[-t|-r|-b|-l|-x|-y|-s|-e]-[var(--bw-…)]` or `border-none`. CSS supports physical, logical, block/inline, and start/end width properties with the token. Inline JSX uses the same token value or `BORDER_WIDTH_STYLE.*`. Token-first shorthands require explicit style and color. Bare `border`, numeric utilities, and raw widths migrate.

Toast alone keeps `border-l-[var(--bw-default)]` as its status rail. Fourteen conditional non-Toast status/state rails are removed; ordinary card outlines, separators, action borders, and explicit borderless forms remain. TaskCard keeps its normal thin outline and loses only the conditional blocked-state outline color; StatusChip remains the state signal. AQ-007 avatar seams use strong. Eight border-built glyphs migrate to SVG/mask and are not exceptions.

## Acceptance and proof

The original plan ACs remain exact: (1) all five typography families fail off-profile in app/design-system and the audited population is cleared with zero exception; (2) duration/easing fail off-profile and their population is cleared; (3) raw border width fails and its population is cleared; (4) raw Tailwind palette names are `error` in app code; (5) every value family declared by `tokens.css` has a non-empty gate-owner set; and (6) every gate runs under actual `npm run lint` at `error`, mechanically asserted.

`npm run lint` must execute typography, motion, border, raw palette, and totality gates at `error`. A shared owner registry is imported by ESLint configuration and the CSS gate; neither keeps a private copy. All **78 unique names / 143 declarations** classify exactly once into 14 classifications. Thirteen are governed value families: color, radius, spacing, shadow, z-index, font-size, font-family, font-weight, line-height, tracking, duration/easing, and border-width (duration and easing retain separate owner entries). `component-geometry` is the fourteenth exact classification but is explicitly non-family: `--card-max-h` is a component bound with responsive redeclaration, not a reusable value vocabulary. Totality fails for an unknown classification, a value family with no owner, or a non-family entry without its explicit rationale; no invented component-geometry lint rule is required.

Static gates are proven in `tools/eslint-plugin-design/src/rules/__tests__/{typography-profile-only,motion-profile-only,border-width-profile-only}.test.ts`, `tools/eslint-plugin-design/src/__tests__/hearth-config.test.ts`, and `tools/repo-gates/src/__tests__/design-css-verdict.test.ts`. The live gate is proven by actual `npm run lint`, not inspection.

Runtime proof is `layers/core-ui/__e2e__/AZ16-token-profiles.spec.ts` over seeded routes `/conversations/t-az16`, `/work/team/team-az16`, `/work/bet/bet-az16`, `/knowledge/k-az16`, `/conversations?settings=open`, and `/work/bet/bet-az16/review/review-az16`, including delayed loading and active review states. It asserts all five computed text fields (plus metric tabular numerals), exact computed motion properties/timing/keyframes, computed border widths, and painted light/dark desktop plus mobile input snapshots. Reduced mode asserts every element and pseudo, including `[data-token-subject=foreign]`, has `animationName:none`, `transitionProperty:none`, and `scrollBehavior:auto`.

Implementation updates `DESIGN.md`, `AESTHETICS.md`, and `.claude/rules/aesthetic-quality.md`. AZ7/AZ15 semantics remain owned and are not rewritten; only AZ7's broad foreign color disables narrow to the two exact roots.
