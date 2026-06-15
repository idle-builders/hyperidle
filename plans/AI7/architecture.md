# AI7 — Page anatomy: architecture

**Layer:** Human Interface only. Two new DS Tier-1 primitives + page migrations + two static gates + snapshot-guard bump. No Meta/Agent layer touched. No data, route, or process change.

**Fixed inputs:** `plans/AI7/concept.md`, `plans/AI7/design/approved.md`. Visual contract, slot APIs, scroll rule, migration list, rejected directions — all locked; not re-litigated here.

## Plan reconciliation (spec ⇆ reality)

| Spec/design assumption | Reality | Plan handling |
|---|---|---|
| SectionLabel caps tracking = literal `tracking-[0.06em]` (design doc) | `design/no-hardcoded-tracking` is **error** on `design-system/src/**/*.tsx` (eslint.config.ts:203–225); it forbids positive-em `tracking-[Nem]` and requires `tracking-[var(--tracking-caps-sm)]`. | **Primitives use the token form** `tracking-[var(--tracking-caps-sm)]` (= 0.06em) for SectionLabel caps. Title kerning `tracking-[-0.01em]` is **negative-em, allowlisted** — keep as-is. The rendered look is identical; the source uses the token. |
| `font-heading` is an undefined utility | Confirmed: `tailwind.config.ts` `fontFamily` has only `sans` + `mono`; no `heading`. CSS silently drops it. | Purge from WorkTeam, WorkRoutine, **AgentProfile** (3 files — design doc corrects spec's "2"). New `design/no-undefined-font-heading` rule. |
| `tracking-wider` deviation | Tailwind default 0.05em; off the Hearth caps scale; on WorkTeam, WorkRoutine. | Replaced by the token via SectionLabel/PageHeader adoption; covered by the same gate (rule flags both class fragments). |
| Snapshot enumeration guard `>= 56` | Two sites: `catalog-snapshot.test.tsx:73` and `:223`, plus comments at :4,:16,:71,:222. | Bump both to `>= 58` (two new root stories). Update the comments' "49 root" → "51 root" and "56 total" → "58 total". |
| `eslint-plugin-design` is the gate home | Confirmed: 22 rules, `index.ts` registry + `recommendedRules` map; precedents `no-handrolled-select`, `no-local-status-builder`, `no-dialog-boilerplate` (inline-pattern → use-the-primitive rules); web `pages/**` block at error (eslint.config.ts:144). | New rules land here following `no-local-status-builder`'s structure + `createRule` from `util.js`. |
| AppShell page-host forces internal scroll | Confirmed: `mainContent` (AppShell.tsx ≈573) is `flex-1 flex flex-col overflow-hidden ... min-w-0`. | Scaffold = `flex flex-col h-full` + `shrink-0` PageHeader + `flex-1 overflow-y-auto` body. Pinned-header is the only host-consistent pattern. |
| `SectionHeader` name | Private file-local component in `Sidebar.tsx` (nav cluster). | Use `SectionLabel` (concept-chosen) to avoid confusion. No DS export collision. |
| KnowledgeCreate title is inline-style on `<input>` | Confirmed (KnowledgeCreate.tsx:134–146 `style={{fontSize:20,...}}`). | Title slot takes the `<input>` node; title classes applied via className (`text-[20px] font-[600] tracking-[-0.01em] ...` + `bg-transparent border-none outline-none`); inline `style` font props removed. No new prop. |
| `dsProps` signature | `dsProps(name, "0"|"1"|"2")` from `ds-attrs.ts`. | Both primitives spread `dsProps("PageHeader"|"SectionLabel", "1")`. |
| `require-stories-sibling` + `require-ds-attribute` are error on DS src | Confirmed (eslint.config.ts:218–219). | Each primitive ships a sibling `.stories.tsx` + the `data-ds-*` marker — satisfied by design. |

No spec→codebase gap requires a migration/scaffold step beyond what's listed. No schema, route, or table involved.

## Acceptance criteria + verification

| # | Criterion | Verification method |
|---|---|---|
| AC1 | One title treatment + one section treatment across primary pages; no per-page font-size/tracking forks; no undefined utility classes. | (a) `npm run check` green. (b) `design/no-undefined-font-heading` lint rule = **error** on `packages/web/src/pages/**`: a unit test in `eslint-plugin-design/src/__tests__/` (RuleTester) asserts it flags `font-heading` and `tracking-wider` and passes clean code. (c) The two primitives' snapshot variants pin the exact treatment. |
| AC2 | One scroll rule (pinned header + scrolling body) on every primary page. | Component test (`PageHeader.test.tsx`) asserts the rendered `<header>` carries `shrink-0`; a page-scaffold structural assertion is covered by AC1(a) typecheck + AC4 page tests (each migrated page still renders its `data-testid` page root). Pinned-vs-scroll-away is a structural property → enforced by the migration (each page root = `flex flex-col h-full`) + reviewed in the diff; no behavioral test needed beyond AC4. |
| AC3 | Header anatomy as catalogued, story-backed DS primitives; repeated header class strings gone from page files; a new page composes the primitive. | (a) `PageHeader.tsx` + `SectionLabel.tsx` exported from `packages/design-system/src/index.ts` (typecheck proves importable). (b) `*.stories.tsx` siblings exist → `require-stories-sibling` (error) + auto-enumerated by the snapshot net. (c) `design/no-handrolled-page-header` lint rule (error on `pages/**`) flags inline title strings (`text-[20px] font-[600] tracking-[-0.01em]` outside a `PageHeader`) — RuleTester unit test. |
| AC4 | No regression to any page's content, actions, navigation. | Existing per-page component tests (`WorkBet.*.test.tsx`, `WorkTask.*`, `WorkRoutine.AA1.test.tsx`, `AppShell.*`, etc.) stay green unchanged. `data-testid`s preserved on every page root + every action. Run `npm run test` + `npm run test:integration`. |
| AC5 | Cross-page consistency proven by a visual sweep — **DOM-snapshot net, not Playwright**. | (a) `PageHeader` + `SectionLabel` stories auto-enumerate into `catalog-snapshot.test.tsx`; committed `.snap` is the canonical serialized treatment. (b) Enumeration guard bumped `>= 56` → `>= 58` at both sites; `npm run test` proves the new count. (c) `no-undefined-font-heading` + `no-handrolled-page-header` (both error on `pages/**`) prove adoption: zero forks remain. (d) Live TSX viewer at :8098 for the design-critique eyeball. |

## Type signatures / contracts

```ts
// packages/design-system/src/PageHeader.tsx
export interface PageHeaderProps {
  /** Page title. Rendered as <h2> with the canonical title treatment; truncates on overflow. */
  title: ReactNode;
  /** Orientation row above the title (Breadcrumb + NavHistoryCluster). Injected by the page. */
  leading?: ReactNode;
  /** Meta line below the title row (e.g. "Phase: build · Lead: Dana"). */
  subtitle?: ReactNode;
  /** Trailing cluster on the title row (StatusChip, Buttons). */
  actions?: ReactNode;
  /** Test hook passthrough on the <header>. */
  "data-testid"?: string;
}
export function PageHeader(props: PageHeaderProps): JSX.Element;

// packages/design-system/src/SectionLabel.tsx
export interface SectionLabelProps {
  /** Uppercase label text. */
  label: ReactNode;
  /** Heading element for the document outline. Default "h3" (PageHeader title is the page h2). */
  as?: "h2" | "h3" | "h4";
  /** Same-row trailing slot (count, "New"/"Create" button). */
  trailing?: ReactNode;
  /** Optional bottom rule. Default false (de-facto majority). */
  divider?: boolean;
  /** Test hook passthrough. */
  "data-testid"?: string;
}
export function SectionLabel(props: SectionLabelProps): JSX.Element;
```

**Encoded class strings (final, token-corrected):**
- PageHeader strip: `shrink-0 px-[24px] py-[18px] border-b border-[var(--border-subtle)]`
- PageHeader title: `text-[20px] font-[600] tracking-[-0.01em] text-[var(--text-primary)] min-w-0 truncate`
- PageHeader title row: `flex items-center justify-between gap-[12px]`
- PageHeader actions: `flex items-center gap-[9px] shrink-0`
- PageHeader subtitle: `mt-[3px] text-[13px] text-[var(--text-tertiary)]`
- PageHeader leading wrapper: `mb-[6px]`
- SectionLabel row: `flex items-center justify-between gap-[12px]` + (`mb-[9px]` | with divider `pb-[6px] mb-[9px] border-b border-[var(--border-subtle)]`)
- SectionLabel label: `text-[13px] font-[600] uppercase tracking-[var(--tracking-caps-sm)] text-[var(--text-tertiary)]`  ← **token form, not `tracking-[0.06em]`** (no-hardcoded-tracking is error on DS src)

Both spread `dsProps("PageHeader"|"SectionLabel", "1")` on the outermost element. PageHeader renders `<header>`; SectionLabel renders the `as` element (default `h3`).

## Ordered task list

**Phase A — primitives (red → green).**
1. `packages/design-system/src/PageHeader.tsx` — implement per contract. + `PageHeader.test.tsx` (component test: title renders as h2 with treatment; `shrink-0` present; leading/subtitle/actions slots render when passed, omitted when not; long title truncates; `data-testid` passthrough).
2. `packages/design-system/src/PageHeader.stories.tsx` — `default { title: "PageHeader", tier: "1" }`; variants: `TitleOnly`, `WithBreadcrumbAndActions`, `WithSubtitle`, `LongTitleTruncates`. (Stub Breadcrumb/Button as plain nodes, mirroring `Breadcrumb.stories.tsx`.)
3. `packages/design-system/src/SectionLabel.tsx` + `SectionLabel.test.tsx` (label renders; `as` controls element; `trailing` renders; `divider` toggles the border classes; caps token present).
4. `packages/design-system/src/SectionLabel.stories.tsx` — variants: `Default`, `WithTrailing`, `WithDivider`, `AsH2`.
5. `packages/design-system/src/index.ts` — export both types + components (alphabetical insertion near existing P/S entries).

**Phase B — snapshot net.**
6. `packages/design-system/src/__tests__/catalog-snapshot.test.tsx` — bump `>= 56` → `>= 58` at lines 73 + 223; update comments (49→51 root, 56→58 total) at 4,16,71,222. Run `npm run test`; review the two new `.snap` entries; `npm run ds:bless` to write them; commit `.snap` in the same change.

**Phase C — static gates (red → green, gates land in error AFTER migration).**
7. `packages/eslint-plugin-design/src/rules/no-undefined-font-heading.ts` — flags `font-heading` and `tracking-wider` class fragments in `className` strings within `packages/web/src` (scoped like `no-local-status-builder`). + RuleTester test in `__tests__/`.
8. `packages/eslint-plugin-design/src/rules/no-handrolled-page-header.ts` — flags the inline page-title fragment combo (`text-[20px]` + `font-[600]` + `tracking-[-0.01em]`) and inline-style page titles in `packages/web/src/pages/**` outside a `PageHeader` usage. + RuleTester test. (Heuristic: report a `className`/`style` carrying the 20px-title signature on a JSX element whose name is not `PageHeader`.)
9. `packages/eslint-plugin-design/src/index.ts` — register both in `rules` + `recommendedRules` (warn baseline).
10. `eslint.config.ts` — add both at **error** in the existing `pages/**` block (≈line 144) and `no-undefined-font-heading` at error for `packages/web/src/**`. (Do this LAST, after Phase D, so `npm run lint` is green.)

**Phase D — page migrations (one task per page; order: conformant-first to de-risk the primitive, then anomalies).**
11. `WorkPortfolio.tsx` — inline header → `<PageHeader title actions>`. Keep filter pills in body.
12. `WorkBet.tsx` — `<PageHeader>`; inline section titles → `<SectionLabel divider>`; 12px section variant (~L1170) → SectionLabel.
13. `WorkTask.tsx` — `<PageHeader>`; remove `SECTION_TITLE` const, replace usages with `<SectionLabel divider>`. Tile labels (11px) untouched.
14. `Conversations.tsx` — `<PageHeader title subtitle actions>` (two header sites: list + thread branch).
15. `KnowledgeList.tsx` — `<PageHeader title actions>`; filter pills stay.
16. `KnowledgeDetail.tsx` — `<PageHeader title actions>` (h1→h2 via primitive); sidebar 12px labels → `<SectionLabel as="h2">`.
17. `KnowledgeCreate.tsx` — `<PageHeader>` with the title `<input>` as the `title` node (title classes via className, drop inline font `style`); Cancel/Create in `actions`.
18. `WorkTeam.tsx` — root → scaffold (`flex flex-col h-full` + `flex-1 overflow-y-auto` body); `<PageHeader title={team.name} leading={Breadcrumb+NavHistoryCluster} subtitle={phase·lead} actions={StatusChip}>`; section `<h2>`s → `<SectionLabel>`. **Header only — AG1 owns body composition. Coordinate; do not restructure the body.**
19. `WorkRoutine.tsx` — same scaffold + PageHeader + SectionLabel migration.
20. `AgentProfile.tsx` — add scaffold + `<PageHeader title={agent name}>` (identity block stays in body); section h2s (`text-[11px] font-heading`) → `<SectionLabel>`.

**Phase E — verify.**
21. `npm run check && npm run lint && npm run test && npm run test:integration` all green. Confirm `git grep -nE "font-heading|tracking-wider" packages/web/src/pages` returns nothing. Confirm both gates fire (toggle-test in RuleTester already proves this).

## Design-it-twice — the static gate (non-trivial: 1 rule vs 2 rules vs test)

- **Option A: one rule** `no-page-anatomy-fork` covering font-heading + tracking-wider + inline title. Trade-off: one registration, but conflates two distinct concerns (undefined-utility purge vs primitive-adoption). Reject: harder messages, harder to scope (the font-heading purge applies to all web src; the inline-title gate applies only to `pages/**`).
- **Option B (chosen): two rules.** `no-undefined-font-heading` (web src, kills the undefined-utility class of bug — generalizes beyond AI7) + `no-handrolled-page-header` (pages only, enforces primitive adoption). Trade-off: two registrations. Reason to keep: matches the precedent (`no-local-status-builder` is its own concern; `no-handrolled-select` is the adoption gate) and each has a crisp scope + message.
- **Option C: a readFileSync test.** Rejected per CLAUDE.md — a static codebase property is a lint rule, not a test. Grepping the filesystem in a test is explicitly forbidden.

Synthesis: Option B. `no-undefined-font-heading` is the durable defect-class gate; `no-handrolled-page-header` is the AI7-specific adoption gate.

## Security & abuse cases
- Rate-limit on POST/PATCH: **N/A** — no endpoints touched.
- Input-trust boundary for agent-authored fields: **N/A** — presentational components; render existing page data unchanged.
- Secret handling: **N/A**.
- Path traversal: **N/A**.
- SSRF: **N/A**.
Presentational-only change; no new trust boundary. XSS surface unchanged — slots take `ReactNode` (React-escaped), no `dangerouslySetInnerHTML` introduced.

## route-checklist
**N/A** — no routes/middleware. (The migration "checklist" is the 10-page list in Phase D; the reviewer greps `font-heading`/`tracking-wider` against `packages/web/src/pages/**` per AC5.)

## Migrations (symbol renames/removals)
- Remove `SECTION_TITLE` const in `WorkTask.tsx` (line ~44–46) → replace all usages with `<SectionLabel divider>`. No other file imports it (file-local).
- Remove inline `style` font props on `KnowledgeCreate.tsx` title `<input>` → className.
- No testid renames. Every page root keeps its `data-testid` (`work-team-page`, `work-routine-page`, `agent-profile-page`, etc.) so existing component/e2e tests stay green. Breadcrumb testIds (`team-breadcrumb-back`, `routine-breadcrumb-back`) preserved (passed through `leading`).

## protectedTests
- `packages/web/src/__tests__/WorkRoutine.AA1.test.tsx`
- `packages/web/src/__tests__/AppShell.*.test.tsx` (all)
- Any existing `WorkBet`/`WorkTask`/`KnowledgeDetail`/`Conversations` component tests asserting page content/actions/nav.
These assert content/behavior that AC4 forbids regressing — their assertions must NOT change. New primitive tests + new RuleTester tests are additive.

## sharedFiles
- `packages/design-system/src/index.ts` (barrel — also touched by other AI/AG WPs adding components)
- `packages/design-system/src/__tests__/catalog-snapshot.test.tsx` + its `.snap` (guard bump — any WP adding a story touches the count)
- `packages/eslint-plugin-design/src/index.ts` + `eslint.config.ts` (rule registry — other AI WPs add rules)
- `packages/web/src/pages/WorkTeam.tsx` (**overlaps AG1** — AG1 owns body composition; AI7 owns header. Merge order: coordinate; whichever lands second rebases the header/body split.)

## Required reading (for /write-tests, /write-code)
- `plans/AI7/concept.md`, `plans/AI7/design/approved.md`.
- `packages/design-system/src/Breadcrumb.tsx` + `.stories.tsx` — slot/`dsProps`/router-agnostic node-injection pattern to mirror.
- `packages/design-system/src/ds-attrs.ts` — `dsProps`.
- `packages/eslint-plugin-design/src/rules/no-local-status-builder.ts` + `no-handrolled-select.ts` + `util.js` (`createRule`, `collectClassStringsFromJSXAttribute`) — rule-authoring pattern.
- `packages/eslint-plugin-design/src/__tests__/` — RuleTester test pattern.
- `eslint.config.ts` (blocks at ≈30, 144, 203) — where to register at error.
- `packages/design-system/src/__tests__/catalog-snapshot.test.tsx` (lines 4,16,71,73,222,223) — guard bump sites.
- `.claude/rules/visual-regression.md`, `.claude/rules/aesthetic-quality.md` (AQ-004 scale, AQ-007 caps tracking).
- The 10 page files in Phase D.

## Risks / ambiguities
- **R1 (highest):** `WorkTeam.tsx` overlap with AG1. If AG1 lands first with a recomposed body, AI7 wraps that body in the scaffold + PageHeader. If AI7 lands first, AG1 rebases its body changes inside AI7's `flex-1 overflow-y-auto`. Mitigation: AI7 touches only the header + scaffold root on WorkTeam; the body JSX is left structurally intact for AG1.
- **R2:** `no-handrolled-page-header` heuristic could false-positive on a legitimately different 20px heading elsewhere in `pages/**`. Mitigation: scope the signature to the *combination* (`text-[20px]`+`font-[600]`+`tracking-[-0.01em]`) which is uniquely the page-title; RuleTester includes a negative case (a 20px non-title heading without the full combo passes).
- **R3:** Conversations has two header render sites (list + thread); both must migrate or the gate flags one. Phase D task 14 covers both.
- **R4:** AgentProfile has no current page-title header; adding one changes its top structure. Mitigation: PageHeader title = agent name; the existing identity block (avatar + meta) stays as the first body section, not in the header. Verify against `AgentProfile` component test (AC4).
