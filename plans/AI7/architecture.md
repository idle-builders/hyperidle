# AI7 — Page anatomy: architecture

**Layer:** Human Interface only. Two new DS Tier-1 primitives + page migrations + two static gates + snapshot-guard bump. No Meta/Agent layer touched. No data, route, or process change.

**Fixed inputs:** `plans/AI7/concept.md`, `plans/AI7/design/approved.md`. Visual contract, slot APIs, scroll rule, migration list, rejected directions — all locked; not re-litigated here.

## Plan reconciliation (spec ⇆ reality)

| Spec/design assumption | Reality | Plan handling |
|---|---|---|
| SectionLabel caps tracking = literal `tracking-[0.06em]` (design doc) | `design/no-hardcoded-tracking` is **error** on `design-system/src/**/*.tsx` (eslint.config.ts:203–225); it forbids positive-em `tracking-[Nem]` and requires `tracking-[var(--tracking-caps-sm)]`. | **Primitives use the token form** `tracking-[var(--tracking-caps-sm)]` (= 0.06em) for SectionLabel caps. Title kerning `tracking-[-0.01em]` is **negative-em, allowlisted** — keep as-is. The rendered look is identical; the source uses the token. |
| `font-heading` is an undefined utility | Confirmed: `tailwind.config.ts` `fontFamily` has only `sans` + `mono`; no `heading`. CSS silently drops it. | Purge from WorkTeam, WorkRoutine, **AgentProfile** (3 files — design doc corrects spec's "2"). New `design/no-undefined-font-heading` rule. |
| `tracking-wider` deviation | Tailwind default 0.05em; off the Hearth caps scale; on WorkTeam, WorkRoutine — **but a VALID Tailwind utility used intentionally elsewhere** (e.g. SetupFlow, components). It is NOT an undefined class. | Replaced by the token via SectionLabel/PageHeader adoption on the migrated pages. The gate flags `tracking-wider` **only inside `pages/**`** (the `tracking-wider` arm is scoped to `pages/**`, never to all of web src) — flagging it web-wide would red-line legitimate intentional uses. |
| Snapshot enumeration guard `>= 56` | Two numeric guards (`:73`, `:223`) PLUS two count-bearing strings that lie if left stale: the assertion message template (`:71`, "Expected ≥56 … (49 root + 7 kinds)") and the test name (`:222`, "enumerates ≥56 … (49 root + 7 kinds)"). Doc comments at `:4`, `:16`. | Bump all four count sites to `58` (two new root stories): both numeric guards `>= 58`, the message template + test name to "≥58 / 51 root + 7 kinds", and the comments "49 root"→"51 root" / "56 total"→"58 total". |
| `eslint-plugin-design` is the gate home | Confirmed: 22 rules, `index.ts` registry + `recommendedRules` map; precedents `no-handrolled-select`, `no-local-status-builder`, `no-dialog-boilerplate` (inline-pattern → use-the-primitive rules); web `pages/**` block at error (eslint.config.ts:144). | New rules land here following `no-local-status-builder`'s structure + `createRule` from `util.js`. |
| AppShell page-host forces internal scroll | Confirmed: `mainContent` (AppShell.tsx ≈573) is `flex-1 flex flex-col overflow-hidden ... min-w-0`. | Scaffold = `flex flex-col h-full` + `shrink-0` PageHeader + `flex-1 overflow-y-auto` body. Pinned-header is the only host-consistent pattern. |
| `SectionHeader` name | Private file-local component in `Sidebar.tsx` (nav cluster). | Use `SectionLabel` (concept-chosen) to avoid confusion. No DS export collision. |
| KnowledgeCreate title is inline-style on `<input>` (editable title) | Confirmed (KnowledgeCreate.tsx:125–147 `style={{fontSize:20,fontWeight:600,letterSpacing:"-0.01em",...}}` on the title `<input>`). An editable title can't be an `<h2>`, and applying the raw `text-[20px] font-[600] tracking-[-0.01em]` literal to the page-owned `<input>` would trip `no-handrolled-page-header` (the combo on a non-`PageHeader` element). | **Affordance (chosen over a per-file lint exemption — cleaner, keeps the title treatment owned by the primitive):** `PageHeader.tsx` exports a `pageTitleClassName` const = the canonical title class string (`text-[20px] font-[600] tracking-[-0.01em] text-[var(--text-primary)] min-w-0 truncate`). The primitive's own `<h2>` is rendered with this exact const. KnowledgeCreate passes its `<input>` as the `title` node and sets `className={`${pageTitleClassName} bg-transparent border-none outline-none flex-1 p-0`}`; inline `style` font props removed. `no-handrolled-page-header` treats a `className` that references the imported `pageTitleClassName` identifier as compliant (it only flags the **literal** combo on a non-`PageHeader` element) — so the editable input composes the primitive's style without a literal fork and without a config exemption. See AC3(c) note + design/approved.md §KnowledgeCreate. |
| `dsProps` signature | `dsProps(name, "0"|"1"|"2")` from `ds-attrs.ts`. | Both primitives spread `dsProps("PageHeader"|"SectionLabel", "1")`. |
| `require-stories-sibling` + `require-ds-attribute` are error on DS src | Confirmed (eslint.config.ts:218–219). | Each primitive ships a sibling `.stories.tsx` + the `data-ds-*` marker — satisfied by design. |

No spec→codebase gap requires a migration/scaffold step beyond what's listed. No schema, route, or table involved.

## Acceptance criteria + verification

| # | Criterion | Verification method |
|---|---|---|
| AC1 | One title treatment + one section treatment across primary pages; no per-page font-size/tracking forks; no undefined utility classes. | (a) `npm run check` green. (b) `design/no-undefined-font-heading` lint rule: **error on `packages/web/src/pages/**`, `warn` on the rest of `packages/web/src/**`**. The `font-heading` arm (undefined utility — a real defect anywhere) fires across web src; the `tracking-wider` arm (valid utility, only a deviation on the title/section scale) fires **only inside `pages/**`**. A RuleTester unit test asserts: flags `font-heading`; flags `tracking-wider` for a `pages/**` filename and passes it for a non-`pages` filename; passes clean code. (c) The two primitives' snapshot variants pin the exact treatment. |
| AC2 | One scroll rule (pinned header + scrolling body) on **every primary page and every return branch of it** (loading / error / not-found / populated). | Component test (`PageHeader.test.tsx`) asserts the rendered `<header>` carries `shrink-0`. The multi-branch pages (WorkTeam 5 branches, WorkRoutine 4, AgentProfile 4) must adopt the scaffold on EVERY return branch (tasks 18–20) — not just the happy path. Verification: where existing per-page component tests already render the loading/error/not-found branch (e.g. WorkRoutine.AA1, AppShell tests), assert the branch root still mounts the scaffold + a pinned `<header>` / `data-testid` page root; add a branch-rendering assertion to the page test if absent. Pinned-vs-scroll-away is a structural property → enforced by the migration (each branch root = `flex flex-col h-full`) + reviewed in the diff. |
| AC3 | Header anatomy as catalogued, story-backed DS primitives; repeated header class strings gone from page files; a new page composes the primitive. | (a) `PageHeader.tsx` + `SectionLabel.tsx` exported from `packages/design-system/src/index.ts` (typecheck proves importable). (b) `*.stories.tsx` siblings exist → `require-stories-sibling` (error) + auto-enumerated by the snapshot net. (c) `design/no-handrolled-page-header` lint rule (error on `pages/**`, with `SettingsPage.tsx` + `SetupFlow.tsx` exempted via the block's `ignores` — see task 10) flags inline title strings (`text-[20px] font-[600] tracking-[-0.01em]` outside a `PageHeader`) — RuleTester unit test. |
| AC4 | No regression to any page's content, actions, navigation. | Existing per-page component tests (`WorkBet.*.test.tsx`, `WorkTask.*`, `WorkRoutine.AA1.test.tsx`, `AppShell.*`, etc.) stay green unchanged. `data-testid`s preserved on every page root + every action. Run `npm run test` + `npm run test:integration`. |
| AC5 | Cross-page consistency proven by a visual sweep — **DOM-snapshot net, not Playwright**. | (a) `PageHeader` + `SectionLabel` stories auto-enumerate into `catalog-snapshot.test.tsx`; committed `.snap` is the canonical serialized treatment. (b) Enumeration guard bumped `>= 56` → `>= 58` at both numeric sites AND the message-template string + test-name string updated to read "58 / 51 root" (see task 6); `npm run test` proves the new count. (c) `no-undefined-font-heading` (error on `pages/**`, warn elsewhere) + `no-handrolled-page-header` (error on `pages/**`, Settings/SetupFlow exempt) prove adoption: zero forks remain on the 10 migrated pages. (d) Live TSX viewer at :8098 for the design-critique eyeball. |

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

/**
 * Canonical page-title class string. The primitive renders its own <h2> with this.
 * Exported so a page that needs an EDITABLE title (KnowledgeCreate's <input>) can
 * compose the exact treatment instead of forking the literal — and so the
 * `no-handrolled-page-header` gate recognizes references to this identifier as compliant.
 */
export const pageTitleClassName: string;

// packages/design-system/src/SectionLabel.tsx
export interface SectionLabelProps {
  /** Uppercase label text. */
  label: ReactNode;
  /**
   * Heading element for the document outline. Default "h3".
   * RECONCILED: concept.md floated "h2" as the default; architecture sets the default to
   * "h3" because the PageHeader title is the page's single h2 — a section opener nests one
   * level below it. Pages where SectionLabel IS the top heading (KnowledgeDetail sidebar)
   * pass as="h2" explicitly. h3 is the canonical default; design/approved.md already agrees.
   */
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
- PageHeader title: `text-[20px] font-[600] tracking-[-0.01em] text-[var(--text-primary)] min-w-0 truncate` — exported as the `pageTitleClassName` const; the primitive's `<h2>` and KnowledgeCreate's editable `<input>` both use this identifier (no literal fork)
- PageHeader title row: `flex items-center justify-between gap-[12px]`
- PageHeader actions: `flex items-center gap-[9px] shrink-0`
- PageHeader subtitle: `mt-[3px] text-[13px] text-[var(--text-tertiary)]`
- PageHeader leading wrapper: `mb-[6px]`
- SectionLabel row: `flex items-center justify-between gap-[12px]` + (`mb-[9px]` | with divider `pb-[6px] mb-[9px] border-b border-[var(--border-subtle)]`)
- SectionLabel label: `text-[13px] font-[600] uppercase tracking-[var(--tracking-caps-sm)] text-[var(--text-tertiary)]`  ← **token form, not `tracking-[0.06em]`** (no-hardcoded-tracking is error on DS src)

Both spread `dsProps("PageHeader"|"SectionLabel", "1")` on the outermost element. PageHeader renders `<header>`; SectionLabel renders the `as` element (default `h3`).

## Ordered task list

**Phase A — primitives (red → green).**
0. (Red-phase precheck) Builder confirms `tracking-[-0.01em]` is on the negative-em allowlist of `design/no-hardcoded-tracking` (the rule forbids positive-em literals like `tracking-[0.06em]`, requiring the token, but negative-em title kerning is allowlisted). Verify by reading the rule's allowlist before writing `PageHeader.tsx`; if the allowlist is absent, the title kerning must move to a token — but per current rule source it is allowlisted, so the literal stays. This is the only literal-em the primitives carry; SectionLabel caps use `tracking-[var(--tracking-caps-sm)]`.
1. `packages/design-system/src/PageHeader.tsx` — implement per contract. Export `pageTitleClassName` const (W1) and render the `<h2>` with it. + `PageHeader.test.tsx` (component test: title renders as h2 with treatment; `shrink-0` present; leading/subtitle/actions slots render when passed, omitted when not; long title truncates; `data-testid` passthrough).
2. `packages/design-system/src/PageHeader.stories.tsx` — `default { title: "PageHeader", tier: "1" }`; variants: `TitleOnly`, `WithBreadcrumbAndActions`, `WithSubtitle`, `LongTitleTruncates`. (Stub Breadcrumb/Button as plain nodes, mirroring `Breadcrumb.stories.tsx`.)
3. `packages/design-system/src/SectionLabel.tsx` + `SectionLabel.test.tsx` (label renders; `as` controls element; `trailing` renders; `divider` toggles the border classes; caps token present).
4. `packages/design-system/src/SectionLabel.stories.tsx` — variants: `Default`, `WithTrailing`, `WithDivider`, `AsH2`.
5. `packages/design-system/src/index.ts` — export both types + components (alphabetical insertion near existing P/S entries).

**Phase B — snapshot net.**
6. `packages/design-system/src/__tests__/catalog-snapshot.test.tsx` — bump `56` → `58` at BOTH the numeric guards (`.toBeGreaterThanOrEqual(56)` at lines 73 + 223) AND the two human-readable string templates that embed the count, or the strings go stale and lie:
   - line 71 — the assertion message template: `` `Expected ≥56 DS story modules (49 root + 7 kinds), got ${modules.length}. ` `` → `≥58` / `(51 root + 7 kinds)`.
   - line 222 — the test name: `` test(`enumerates ≥56 story modules (49 root + 7 kinds)`, …) `` → `≥58` / `(51 root)`.
   - the doc comments at lines 4, 16 (49→51 root, 56→58 total).
   Run `npm run test`; review the two new `.snap` entries; `npm run ds:bless` to write them; commit `.snap` in the same change.

**Phase C — static gates (red → green, gates land in error AFTER migration).**
7. `packages/eslint-plugin-design/src/rules/no-undefined-font-heading.ts` — flags `font-heading` (undefined-utility defect, fires regardless of path) and `tracking-wider` (valid utility; flagged only when the linted file path is under `packages/web/src/pages/`). The rule reads `context.filename` and gates the `tracking-wider` arm on a `/pages/` path segment so it never fires outside `pages/**`. + RuleTester test in `__tests__/` exercising both arms across a `pages/` and a non-`pages/` filename.
8. `packages/eslint-plugin-design/src/rules/no-handrolled-page-header.ts` — flags the inline page-title fragment combo (`text-[20px]` + `font-[600]` + `tracking-[-0.01em]` **as string literals**) and inline-style page titles in `packages/web/src/pages/**` on a JSX element whose name is not `PageHeader`. + RuleTester test. Two compliance escape hatches the rule MUST honor (negative test cases):
   - a `className` whose value is or contains a reference to the imported `pageTitleClassName` identifier (a JSX expression, not a string literal) is compliant — this is the KnowledgeCreate editable-`<input>` path (W1). The rule only inspects **string-literal** class fragments; an identifier/expression reference is never the literal combo, so this falls out naturally as long as the rule does not attempt to resolve the identifier's value.
   - the combo appearing as the `<h2>` inside `PageHeader.tsx` itself is in `design-system`, not `pages/**`, so it is out of the rule's file scope.
   **The rule MUST NOT fire on the two non-migrated owners of this combo: `SettingsPage.tsx` (AG7) and `SetupFlow.tsx` (onboarding).** See task 10 for the config-level `ignores` that excludes them.
9. `packages/eslint-plugin-design/src/index.ts` — register both in `rules` + `recommendedRules` (warn baseline).
10. `eslint.config.ts` — (Do this LAST, after Phase D, so `npm run lint` is green.) Two scope decisions, both deliberate:
   - **`no-undefined-font-heading`** — add at **error** in the existing `pages/**` block (≈line 144) AND in a separate web-src block at **warn** (`files: ["packages/web/src/**/*.tsx"]`, same test/stories ignores). Error in pages, warn elsewhere: the rule fires `font-heading` everywhere but only red-lines it on the in-scope pages; the `tracking-wider` arm is already self-gated to `/pages/` paths (task 7), so the warn-level web-src block never warns on legitimate `tracking-wider`. Net: lint stays green on the ~8 out-of-scope files (ArtifactSection, ArtifactThreadsSummary, TaskSheet, BlockRefEmbed, ReasoningBlockView, ThreadSections, DesignSystem — AG/AH/content territory).
   - **`no-handrolled-page-header`** — add at **error** in the `pages/**` block (≈144) but with `SettingsPage.tsx` and `SetupFlow.tsx` added to that block's `ignores` (both carry the exact `text-[20px] font-[600] tracking-[-0.01em]` combo but are NOT in AI7's migration list — AG7 owns Settings, onboarding owns SetupFlow). Rationale for ignore-vs-allowlist: a two-entry `ignores` is the minimal, explicit, greppable exemption; scoping the rule to only the 10 migrated files would couple `eslint.config.ts` to the migration list and break as soon as another page adopts PageHeader. Re-evaluate the two exemptions when AG7 / onboarding migrate.

**Phase D — page migrations (one task per page; order: conformant-first to de-risk the primitive, then anomalies).**
11. `WorkPortfolio.tsx` — inline header → `<PageHeader title actions>`. Keep filter pills in body.
12. `WorkBet.tsx` — `<PageHeader>`; inline section titles → `<SectionLabel divider>`; 12px section variant (~L1170) → SectionLabel.
13. `WorkTask.tsx` — `<PageHeader>`; remove `SECTION_TITLE` const, replace usages with `<SectionLabel divider>`. Tile labels (11px) untouched.
14. `Conversations.tsx` — `<PageHeader title subtitle actions>` (two header sites: list + thread branch).
15. `KnowledgeList.tsx` — `<PageHeader title actions>`; filter pills stay.
16. `KnowledgeDetail.tsx` — `<PageHeader title actions>` (h1→h2 via primitive); sidebar 12px labels → `<SectionLabel as="h2">`.
17. `KnowledgeCreate.tsx` — `<PageHeader>` with the title `<input>` as the `title` node. Drop the inline font `style` block (L134–146); set `className={`${pageTitleClassName} bg-transparent border-none outline-none flex-1 p-0`}` on the `<input>` (import `pageTitleClassName` from the design system). Cancel/Create in `actions`. Preserve `data-testid="knowledge-create-title"` + `aria-label`. Per W1, the `pageTitleClassName` reference is an expression, not the literal combo, so `no-handrolled-page-header` does not fire.
18. `WorkTeam.tsx` — **EVERY return branch adopts the scaffold (`flex flex-col h-full` + `flex-1 overflow-y-auto` body), not just the happy path.** WorkTeam has 5 return branches: loading (≈L110), three error/not-found branches (≈L126, L149, L167), and the populated branch (≈L180). Each must root the scaffold so AC2 (pinned header + scrolling body) holds for loading/error/not-found, not only the happy case — otherwise those states render scroll-away/headerless and AC2 fails. The populated branch gets `<PageHeader title={team.name} leading={Breadcrumb+NavHistoryCluster} subtitle={phase·lead} actions={StatusChip}>`; the loading/error branches get a minimal `<PageHeader title="Team" />` (or the existing branch's title) inside the scaffold, with the EmptyState/spinner in the scrolling body. Section `<h2>`s → `<SectionLabel>`. **Header + scaffold only — AG1 owns body composition. Coordinate; do not restructure the populated body.** Preserve every branch's `data-testid` (AC4).
19. `WorkRoutine.tsx` — same scaffold + PageHeader + SectionLabel migration. **All 4 return branches adopt the scaffold:** loading (≈L67), error (≈L76), not-found (≈L84), populated (≈L176). Loading/error/not-found branches root the scaffold with a minimal PageHeader + body-hosted state; populated branch gets the full PageHeader. AC2 must hold for every branch.
20. `AgentProfile.tsx` — add scaffold + `<PageHeader title={agent name}>` (identity block stays in body); section h2s (`text-[11px] font-heading`) → `<SectionLabel>`. **All 4 return branches adopt the scaffold:** loading (≈L86), two error/not-found branches (≈L101, L119), populated (≈L150). Loading/error/not-found root the scaffold with a minimal PageHeader (title="Agent" or branch title) + body-hosted state; populated gets the agent-name PageHeader. AC2 must hold for every branch.

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
- **R2:** `no-handrolled-page-header` false-positives. Two known surfaces, both handled: (1) legitimately different 20px headings — mitigated by scoping the signature to the full *combination* (`text-[20px]`+`font-[600]`+`tracking-[-0.01em]`), uniquely the page-title; RuleTester negative case covers a 20px non-title heading. (2) `SettingsPage.tsx` (AG7) + `SetupFlow.tsx` (onboarding) carry the exact combo but are out of AI7's migration scope — exempted via `eslint.config.ts` block `ignores` (task 10). (3) KnowledgeCreate's editable `<input>` composes `pageTitleClassName` (an identifier expression, not the literal) → does not fire (W1, task 8 negative case). RuleTester covers all three negatives.
- **R3:** Conversations has two header render sites (list + thread); both must migrate or the gate flags one. Phase D task 14 covers both.
- **R4:** AgentProfile has no current page-title header; adding one changes its top structure. Mitigation: PageHeader title = agent name; the existing identity block (avatar + meta) stays as the first body section, not in the header. Verify against `AgentProfile` component test (AC4).
