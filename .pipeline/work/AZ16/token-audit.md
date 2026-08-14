# AZ16 — Design-token audit

Audit date: 2026-08-14. Base: `origin/main` at `a54c352d`.

Founder-approved contract: 14 complete typography roles, seven purpose motion profiles, global
reduced-motion shutdown, and 1/1.5/2px borders. Counts below come from the reproducible final manifests.

## Reproduction and definitions

Run from repository root:

```sh
node .pipeline/work/AZ16/token-audit-census.mjs
node .pipeline/work/AZ16/token-literal-census.mjs
node .pipeline/work/AZ16/typography-site-manifest.mjs > .pipeline/work/AZ16/typography-site-manifest.tsv
node .pipeline/work/AZ16/motion-site-manifest.mjs > .pipeline/work/AZ16/motion-site-manifest.tsv
node .pipeline/work/AZ16/border-site-manifest.mjs > .pipeline/work/AZ16/border-site-manifest.tsv
# Exact normalization/context slices used by the semantic mapping:
rg -n 'text-\[(9|14|16|17|18|20|24|30)px\]' layers/core-ui/src framework/design-system/src \
  -g '*.{ts,tsx}' -g '!*.test.*' -g '!*.spec.*' -g '!*.stories.*' -g '!**/__*/*'
rg -n 'font-(mono|\[family-name:var\(--font-mono\)\])' layers/core-ui/src framework/design-system/src \
  -g '*.{ts,tsx}' -g '!*.test.*' -g '!*.spec.*' -g '!*.stories.*' -g '!**/__*/*'
rg -o 'transition-(none|all|colors|opacity|shadow|transform|\[[^] ]+\])' \
  layers/core-ui/src framework/design-system/src -g '*.{ts,tsx,css}' \
  -g '!*.test.*' -g '!*.spec.*' -g '!*.stories.*' -g '!**/__*/*' | sed 's/.*://' | sort | uniq -c
npx eslint --no-config-lookup --config eslint.design.config.ts \
  'layers/core-ui/src/**/*.{ts,tsx}' 'framework/design-system/src/**/*.{ts,tsx}' \
  --ignore-pattern '**/*.test.*' --ignore-pattern '**/*.spec.*' \
  --ignore-pattern '**/*.stories.*' --ignore-pattern '**/__*/**' \
  --rule 'design/no-hardcoded-color:error' --rule 'design/radius-token-only:error' \
  --rule 'design/no-off-grid-spacing:error' --rule 'design/shadow-token-only:error' \
  --rule 'design/no-raw-overlay-z:error' --rule 'design/no-off-scale-font-size:error' \
  --rule 'design/no-hardcoded-tracking:error' --rule 'design/no-off-scale-duration:error' \
  --rule 'design/no-raw-tailwind-color:error'
```

The scripts discover `.ts`, `.tsx`, and `.css` below the two shipping package roots and apply the
AGENTS.md world rule. Result: 236 production files (68 `.ts`, 165 `.tsx`, 3 CSS) and 470 development
files. `_dev` is production under that rule; only `__*` path segments declare development.

These outputs are immutable pre-migration audit snapshots. Each script writes its unmapped report before
failing; the checked snapshots have header-only reports. Migration consumes the reviewed decisions into
checked per-wave receipts. Final correctness comes from receipt totality plus a separate live lint/profile
census that understands semantic profiles; the source extractors are not rerun after their sites mutate.

`tokens.css` has **78 unique token names across 143 declarations** (base/light/dark/media redeclarations
included). Tables below are unique-name ledgers; declaration count is separate and must not be called 143
tokens.

`production refs`/`development refs` below count exact `var(--token)` consumers, including composed
`calc()/var()` strings, not declarations or equivalent Tailwind aliases. “Raw/equivalent” is an authored
literal or canonical alias in the same property family. The literal census uses the TypeScript AST, so
comments are not counted; it includes class strings, inline styles, plain z utilities, and owned CSS.

Foreign counts are source inside exactly `RenderedPage()` in `ReviewBrowserPreview.tsx` and
`EmailRender()` in `ReviewRenderedInContext.tsx`: user/reference artifacts whose fidelity is the product.
Their raw values are reported but do not define Hearth ladders. TrafficLights is browser reference chrome,
not foreign user content, and is reported separately.

## Family audit and proposed decision

| Family | Names | Prod/dev token refs | Raw/equivalent and off-scale evidence | Current gate/owner | Proposed AZ16 decision |
|---|---:|---:|---|---|---|
| Color | 28 | 2,041 / 421 | Exact token refs shown here; literal census finds 28 exact foreign hex/rgb values, 4 owned appearance-preview hex instances, and 3 TrafficLights constants. | AZ7; error gate exists | Verify existing gate, replace whole-file carve-outs with the exact two foreign roots, retain one closed TrafficLights rule case; no color ladder work. `--accent-secondary-hover` is the only truly unused color token; leave to AZ7 ownership rather than reopen color here. |
| Radius | 4 | 422 / 112 | 50 owned authored forms: 48 token, Checkbox 6px once, CSS zero once; foreign: 6. | AZ7 | Verify only; do not reimplement. |
| Spacing | 8 | 19 / 9 | 808 production authored forms: 807 raw/canonical, 1 token-composed. | AZ15 | Verify existing `{0,3,6,9,12,18,24,36,48}` ladder/gate; no migration. |
| Shadow | 3 | 57 / 13 | 55 owned token forms, 0 raw production shadows; 18 dev raw aliases. | AZ15 | Verify existing subtle/default/elevated gate; no migration. |
| Overlay z-index | 7 | 7 / 11 | Raw production `1`, `2`, `50` once each. Current overlay rule catches only `50`; 1/2 are local stacking, not overlays. | AZ7 | Migrate 50 to `--z-scrim`; keep 1/2 explicitly outside overlay-family semantics; verify registry describes overlay ownership, not all stacking. |
| Typography (size/family/weight/line/tracking) | 19 token declarations | refs/raw populations at right | Exact census: 891 sites / 1,630 fields: size 824, family 146, weight 400, line 123, tracking 136, authored emphasis style 1. | partial | Fourteen approved profiles; avatar-initial owns 14 sites, subheading owns seven direct sites plus the heading-variant h4–h6 branch; seven glyph repairs and three authored emphasis removals; zero extractor-unmapped rows. |
| Motion (duration/easing/property/job) | 5 declarations | 179 / 11 | 146 authored jobs: SNAP 89, REMOVE 15, profile-bound 42. | partial | Seven exact profiles; dead transitions removed; global reduced mode disables all; zero unmapped. |
| Border width | 3 | 5 / 2 | 346 sites (339 owned/7 foreign): thin 228, default 25, strong 20, explicit none 44, remove 14, geometry 8. | no gate | Approved 1/1.5/2px; normal outlines/separators/actions preserved; Toast sole status rail; AQ-007 2px; only conditional rails removed. |
| Component geometry | 1 | 1 / 0 | `--card-max-h` has 70vh desktop and 60vh mobile declarations. | no gate | Fourteenth exact classification, explicitly non-family: component-specific responsive bound, not a reusable vocabulary. |

AZ7/AZ15 families are included above to prove the registry is total, but their value decisions and
existing gates are not AZ16 implementation work.

## Semantic typography mapping — all 891 authored sites

| Destination | Complete definition (family / size / line / weight / tracking) | Count |
|---|---|---:|
| label | sans / 11 / 1.25 / 600 / .06em | 116 |
| metadata | sans / 12 / 1.4 / 500 / 0 | 231 |
| small | sans / 13 / 1.4 / 400 / 0 | 232 |
| copy | sans / 15 / 1.55 / 400 / 0 | 48 |
| control | sans / 13 / 1.25 / 500 / 0 | 90 |
| input | sans / 13 (16 mobile) / 1.4 / 400 / 0 | 11 |
| avatar-initial | sans / stacked 9, sm 10, md 12, lg 13 / 1 / 600 / 0 | 14 |
| subheading | sans / 15 / 1.4 / 600 / 0 | 7 direct sites; heading variant also resolves h4–h6 here |
| lead | sans / 17 / 1.25 / 600 / -.01em | 11 |
| title | sans / 20 / 1.4 / 600 / -.01em | 10 |
| display | sans / 24 / 1.25 / 600 / -.01em | 2 |
| metric | sans tabular / 24 / 1 / 600 / -.01em | 7 |
| data | mono / 12 / 1.4 / 500 / 0 | 99 |
| inline-code | mono / 13 / 1.55 / 400 / 0 | 2 |
| glyph → SVG/icon, no typography | — | 7 |
| document-heading variant | h1 display; h2 title; h3 lead; h4–h6 subheading | 1 |
| authored strong/emphasis declaration → REMOVE; inherit | — | 3 |
| **Total** | | **891** |

The durable TSV gives path, line, element/selector, every authored declaration, and the one destination.
It supersedes the earlier 792 size-reference extrapolation. H1–H6 hierarchy remains markup; large
numbers normalize by meaning to title/data rather than creating a visual-size role.

The old line-height/tracking distributions remain useful evidence (104 raw line sites and 45 raw
tracking sites), but are no longer public ladders: their values are private fields of profiles.

## Motion and reduced motion

The targeted source audit found 39 uppercase structural labels/captions previously mapped as data (19), metadata (16), or small (4); all now map label. The dynamic heading receipt expands to display +1, title +1, lead +1, and subheading +3. Final live profile equality is label 116, metadata 231, small 232, data 99, display 3, title 11, lead 12, subheading 10, with other direct counts unchanged: **886 profile consumers** total. The 14 avatar rows use the deterministic context table: shared Avatar prop→sm/md/lg (1), overlapping BetCard/ThreadRow/ConversationSurface→stacked (4), dense standalone BetCard/ThreadHostBanner/PartList/review/WorkTeam→sm (7), CommentRow→md (1), and SessionAvatar→stacked in ParticipantGroup or sm in message/PartGroup (1). Owned emphasis has three REMOVE rows; the two floating-toolbar semantic tags author no local typography.

The exact motion manifest contains 146 source jobs: 89 snap, 15 remove, and 42 profile jobs.

| Profile | Bound property / timing | Jobs |
|---|---|---:|
| feedback | opacity/filter · 120ms · `cubic-bezier(.25,.1,.25,1)` | 9 |
| move | transform · 240ms · `cubic-bezier(.25,.1,.25,1)` | 15 |
| spring | transform · 240ms · `cubic-bezier(.34,1.56,.64,1)` | 2 |
| enter | transform+opacity · 120ms · `cubic-bezier(0,0,.2,1)` once/forwards | 1 |
| activity | opacity pulse · 1.4s · `cubic-bezier(.4,0,.2,1)` infinite | 7 |
| loading | skeleton pulse · 1.8s · `cubic-bezier(.4,0,.2,1)` infinite | 6 |
| busy | rotation · .75s linear infinite | 2 |

Activity remains because its seven sites mean “agent/session live”; loading is a separate product state,
not a duration variant.

Current reduced motion is insufficient: it changes three duration tokens to `1ms` and disables only
skeleton selectors. The new contract is `0s`, not “almost zero”:

- in `prefers-reduced-motion: reduce`, universal elements/pseudos use `animation:none !important`,
  `transition:none !important`, and `scroll-behavior:auto !important`;
- the motion lint rejects direct Web Animations API calls in production UI. Current audit found zero
  `.animate()`/`Animation`/`KeyframeEffect` calls; the four `requestAnimationFrame` calls are RoleCombobox
  focus, KnowledgeDetail render-ready auto-scroll, and AppShell route restoration start/retry. Lint allows
  only those named scheduling patterns; they are not animation APIs.

## Border evidence and approved contract

The proposed 1/1.5/2px ladder covers the coherent stroke roles without visual exception:

- 228 owned sites map to thin 1px;
- 25 owned sites map to default 1.5px;
- 20 owned sites map to strong 2px, including current strong-token uses normalized from 2.5px;
- 44 explicit-absence sites remain borderless, 14 conditional non-Toast rails are removed, and eight border-built glyphs become geometry;
- dynamic status/state left rails are removed rather than tokenized; neutral quote/callout rails use 2px;
- Select's 5/5/6px CSS chevron and Checkbox's 2px border checkmark become SVG/mask geometry so a stroke
  gate does not need a geometry exception.

Approved contract: `border-none` or explicit `border[-side]-[var(--bw-thin|default|strong)]`, with
`t/r/b/l/x/y` supported. CSS and inline style use width-token properties or token-first shorthand. Bare
aliases migrate. Toast uses explicit default 1.5px plus a separate status color; every other status rail
is removed. AQ-007 uses strong 2px. Tailwind `border-2` is counted as 2px.

## Every current declaration

`refs` are exact `var()` references; zero does not necessarily mean an unused value because canonical
aliases/literals consume several established ladders. The truly unused token is called out above.

| Family | Token | Current value(s) | Production refs | Development refs | Use status |
|---|---|---|---:|---:|---|
| color | `--accent-deep` | `#6f4d1e / #d9c9a3` | 122 | 12 | used |
| color | `--accent-deep-dim` | `rgba(111,77,30,.09) / rgba(217,201,163,.14)` | 1 | 0 | used |
| color | `--accent-primary` | `#f0c419 / #f5d33d` | 77 | 22 | used |
| color | `--accent-primary-dim` | `rgba(240,196,25,.14) / rgba(245,211,61,.14)` | 45 | 7 | used |
| color | `--accent-primary-hover` | `#d9ad0f / #e3c22e` | 6 | 2 | used |
| color | `--accent-secondary` | `#d97706` | 11 | 1 | used |
| color | `--accent-secondary-dim` | `rgba(217,119,6,.08) / rgba(217,119,6,.10)` | 12 | 1 | used |
| color | `--accent-secondary-hover` | `#b86305` | 0 | 0 | truly unused; AZ7-owned |
| color | `--border-default` | `#ded3a9 / #46453a` | 76 | 16 | used |
| color | `--border-strong` | `#c0b483 / #626050` | 18 | 6 | used |
| color | `--border-subtle` | `#ede6c8 / #33332a` | 184 | 35 | used |
| border width | `--bw-default` | `1.5px` | 2 | 2 | 22 raw equivalents |
| border width | `--bw-strong` | `2.5px` | 3 | 0 | proposed 2px |
| border width | `--bw-thin` | `1px` | 0 | 0 | 190 canonical aliases |
| non-family | `--card-max-h` | `70vh / 60vh` | 1 | 0 | used |
| easing | `--easing-expressive` | `cubic-bezier(0.34,1.56,0.64,1)` | 2 | 0 | used |
| font family | `--font-mono` | `ui-monospace,"SF Mono","Cascadia Code",monospace` | 33 | 15 | 83 canonical aliases |
| font family | `--font-sans` | `system-ui,-apple-system,"Segoe UI",sans-serif` | 15 | 24 | used |
| font weight | `--fw-bold` | `700` | 0 | 0 | 14 raw/alias equivalents |
| font weight | `--fw-medium` | `500` | 4 | 0 | 144 raw/alias equivalents |
| font weight | `--fw-normal` | `400` | 0 | 0 | 6 raw equivalents |
| font weight | `--fw-semibold` | `600` | 4 | 0 | 211 raw/alias equivalents |
| line height | `--leading-body` | `1.55` | 6 | 6 | used |
| line height | `--leading-normal` | `1.55` | 0 | 0 | duplicate; proposed 1.4 |
| line height | `--leading-relaxed` | `1.7` | 0 | 0 | 13 raw/alias equivalents |
| line height | `--leading-tight` | `1.25` | 4 | 0 | 8 raw/alias equivalents |
| duration | `--motion-default` | `240ms` (`1ms` reduced) | 8 | 2 | plus 1 foreign ref |
| easing | `--motion-ease` | `cubic-bezier(0.25,0.1,0.25,1)` | 57 | 4 | plus 1 foreign ref |
| duration | `--motion-fast` | `120ms` (`1ms` reduced) | 111 | 5 | used |
| duration | `--motion-slow` | `450ms` (`1ms` reduced) | 1 | 0 | used |
| radius | `--r-default` | `16px` | 85 | 28 | used |
| radius | `--r-none` | `0` | 0 | 0 | canonical zero alias |
| radius | `--r-pill` | `9999px` | 180 | 53 | used |
| radius | `--r-subtle` | `10px` | 157 | 31 | used |
| color | `--scrim` | `rgba(26,21,16,.45) / rgba(20,16,12,.62)` | 2 | 2 | used |
| shadow | `--shadow-default` | `0 4px 12px rgba(44,36,26,.08) / 0 4px 12px rgba(0,0,0,.4)` | 26 | 7 | used |
| shadow | `--shadow-elevated` | `0 8px 24px rgba(44,36,26,.1) / 0 8px 24px rgba(0,0,0,.5)` | 15 | 2 | used |
| shadow | `--shadow-subtle` | `0 1px 4px rgba(44,36,26,.06) / 0 1px 4px rgba(0,0,0,.3)` | 16 | 4 | used |
| spacing | `--space-1` | `3px` | 0 | 0 | 110 raw equivalents |
| spacing | `--space-12` | `36px` | 0 | 0 | 3 raw equivalents |
| spacing | `--space-16` | `48px` | 0 | 0 | no current composition consumer; AZ15-owned |
| spacing | `--space-2` | `6px` | 5 | 2 | 212 raw equivalents |
| spacing | `--space-3` | `9px` | 6 | 1 | 210 raw equivalents |
| spacing | `--space-4` | `12px` | 3 | 3 | 147 raw equivalents |
| spacing | `--space-6` | `18px` | 5 | 3 | 47 raw equivalents |
| spacing | `--space-8` | `24px` | 0 | 0 | 24 raw equivalents |
| color | `--status-error` | `#dc4a3a / #ee6a5a` | 120 | 13 | used |
| color | `--status-error-dim` | `rgba(220,74,58,.08) / rgba(238,106,90,.1)` | 11 | 3 | used |
| color | `--status-error-hover` | `#c53e30` | 2 | 0 | used |
| color | `--status-info` | `#2e7dba / #4498d4` | 16 | 3 | used |
| color | `--status-info-dim` | `rgba(46,125,186,.08) / rgba(68,152,212,.1)` | 4 | 1 | used |
| color | `--status-success` | `#16764f / #2eaa7a` | 48 | 5 | used |
| color | `--status-warning` | `#d97706` | 37 | 2 | used |
| color | `--surface-container` | `#f6f0d8 / #242418` | 129 | 32 | used |
| color | `--surface-elevated` | `#ffffff / #2f2f21` | 123 | 33 | used |
| color | `--surface-overlay` | `#ffffff / #3b3a2c` | 4 | 2 | used |
| color | `--surface-page` | `#fcf8e8 / #14140b` | 56 | 30 | used |
| font size | `--text-2xl` | `24px` | 2 | 0 | 2 raw equivalents |
| font size | `--text-3xl` | `30px` | 0 | 0 | 1 raw equivalent |
| font size | `--text-base` | `15px` | 6 | 1 | 47 raw equivalents |
| font size | `--text-lg` | `17px` | 0 | 0 | 10 raw equivalents |
| color | `--text-on-accent` | `#2a2415 / #221f0a` | 20 | 7 | used |
| color | `--text-placeholder` | `#b8b09a / #4a4735` | 6 | 3 | used |
| color | `--text-primary` | `#2a2415 / #ecead9` | 235 | 46 | used |
| color | `--text-secondary` | `#645c46 / #bdb9a2` | 267 | 43 | used |
| font size | `--text-sm` | `13px` | 3 | 8 | 212 raw equivalents |
| color | `--text-tertiary` | `#938b70 / #a8a58c` | 409 | 94 | used |
| font size | `--text-xl` | `20px` | 3 | 0 | 10 raw equivalents |
| font size | `--text-xs` | `12px` | 0 | 4 | 297 raw/alias equivalents |
| tracking | `--tracking-caps` | `.08em` | 20 | 7 | used |
| tracking | `--tracking-caps-sm` | `.06em` | 62 | 14 | 21 raw equivalents |
| z-index | `--z-base` | `0` | 0 | 0 | structural base |
| z-index | `--z-dialog` | `60` | 1 | 4 | used |
| z-index | `--z-drawer` | `30` | 2 | 3 | used |
| z-index | `--z-overlay` | `40` | 1 | 2 | used |
| z-index | `--z-scrim` | `50` | 2 | 2 | one raw equivalent |
| z-index | `--z-sticky` | `10` | 0 | 0 | no current ref; AZ7-owned |
| z-index | `--z-toast` | `70` | 1 | 0 | used |

## Context concentrations

- Typography: core-ui review/composition, SessionView, setup, and design-system block renderers contain
  most raw line-height/tracking work; `ArtifactSection`/`ArtifactThreadsSummary` own all six
  `font-heading` sites.
- Borders: 1.5px concentrates in Input/Select/Button/Toggle and page control shells; 2px in avatar
  overlaps, tabs, spinners, checkmarks, and rails; 3px only in NotificationRow and review callout rails.
- Motion: loops are confined to Skeleton, LiveDot, SearchField, Session/recipient/conversation activity,
  ToolPart, and ReviewActionOperation. No WAAPI animation exists.
- Foreign content: the two renderer functions contain 19 size, 13 weight, 7 line-height, 5 tracking,
  5 border, and 28 exact color-literal instances; none exempts surrounding Hearth chrome. TrafficLights'
  3 constants and the appearance preview's 4 hex instances are Hearth-owned and counted separately.
