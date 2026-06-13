# AI3 — One clock — Architecture plan

Input contracts (do NOT re-litigate): `plans/AI3/design/approved.md` (vocabulary, thresholds, registers, placeholder). This plan decides *where the source lives*, *its API*, and *the exact migration of all 17 call sites*.

## Required reading

- `plans/AI3/design/approved.md` — the vocabulary table + four registers + `"—"` placeholder rule. Implement verbatim.
- `packages/shared/src/format/money.ts`, `bet.ts` — the established shared-formatter pattern this module mirrors (pure fns, `now?`/null-safe, exported via index barrel).
- `packages/design-system/PRINCIPLES.md` §timestamps (mono, tabular, dimmed) — already satisfied by existing call-site classNames; formatter only changes the *string*, not the wrapping span.

## Package-boundary decision (forced — the spec's open question)

Constraint: `design-system` cannot import `web`; the source must be consumed by both. Dependency graph (verified in `package.json`):
- `@hyperidle/shared` — zero UI deps, depended on by **both** `design-system` and `web`.
- `design-system` already imports `@hyperidle/shared` (`exhaustiveAssert`, `verdictDecisionLabel`, types).
- `shared/src/format/` already hosts `money.ts`, `bet.ts`, `artifact-cost.ts` — same kind of pure cross-package formatter.

**Decision: `packages/shared/src/format/time.ts`**, exported from `@hyperidle/shared`. This is the only home satisfying the boundary without a new package or an inverted dependency. The dying `packages/web/src/utils/{format-time,relative-time}.ts` are deleted (contract: misleading names do not survive); their logic moves up to `shared` where the design system can reach it.

Design-it-twice not run: the decision is forced (single sane home, existing pattern). No alternative respects the boundary.

## The module — `packages/shared/src/format/time.ts`

Five named exports (per approved.md open-question recommendation — greppable, tree-shakeable, self-documenting). All accept `string | number | Date | null | undefined`; all return `string`; relative registers take an injectable `now?: number` test seam (matches existing `relative-time.ts`).

```ts
/** Shared placeholder for invalid / missing timestamps (em-dash U+2014). AC-3. */
export const TIME_PLACEHOLDER = "—";

/** Internal: parse any accepted input to finite epoch ms, or null. */
// (not exported) function toEpoch(input: TimestampInput): number | null

export type TimestampInput = string | number | Date | null | undefined;

/**
 * R1 — compact relative age, no "ago" suffix. Default register for dense
 * rows/chips/columns. just now / Nm / Nh / Nd / Nw / Nmo / Ny.
 * Future → clamped to "just now". Invalid/null → TIME_PLACEHOLDER.
 */
export function relativeShort(input: TimestampInput, now?: number): string;

/**
 * R2 — prose relative age = relativeShort + " ago". Same threshold ladder,
 * suffix only (guarantees AC-1 register agreement). Future → "just now"
 * (no suffix on the clamp case). Invalid/null → TIME_PLACEHOLDER.
 */
export function relativeLong(input: TimestampInput, now?: number): string;

/**
 * R3 — wall-clock time-of-day via Intl.DateTimeFormat.
 * seconds=false → locale hour-cycle minute clock "2:34 PM" (h:mm a on 12h locales);
 * seconds=true → forced 24h "14:32:07" (HH:mm:ss, hour12:false — intentional, see site-15 note ‡).
 * R3 is parameterized by BOTH precision and hour-cycle, by design.
 * Invalid/null → TIME_PLACEHOLDER.
 */
export function clockTime(input: TimestampInput, opts?: { seconds?: boolean }): string;

/** R4a — calendar date, one app-wide format "Jun 12, 2026" (MMM D, YYYY). */
export function absoluteDate(input: TimestampInput): string;

/** R4b — calendar date + minute clock "Jun 12, 2026, 2:34 PM". */
export function absoluteDateTime(input: TimestampInput): string;
```

### Implementation contract (verbatim from approved.md)

Shared internal `toEpoch(input)`:
1. `null`/`undefined` → `null`.
2. `Date` → `input.getTime()`; `number` → `input`; `string` → `Date.parse(input)`.
3. If result not `Number.isFinite` → `null`.

Relative registers (`relativeShort`/`relativeLong`):
- `toEpoch` null → return `TIME_PLACEHOLDER`.
- `diff = Math.max(0, (now ?? Date.now()) - epoch)` (future clamps to 0 → `just now`). AC-3 no-negative.
- Ladder (floor everywhere), thresholds in ms:
  - `< 60_000` → `just now`
  - `< 3_600_000` → `${floor(diff/60_000)}m`
  - `< 86_400_000` → `${floor(diff/3_600_000)}h`
  - `< 604_800_000` (7d) → `${floor(diff/86_400_000)}d`
  - `< 2_419_200_000` (28d) → `${floor(diff/604_800_000)}w`
  - `< 31_536_000_000` (365d) → `${floor(diff/2_592_000_000)}mo` (30d month)
  - else → `${floor(diff/31_536_000_000)}y`
- `relativeLong`: call `relativeShort`; if result is `just now` or `TIME_PLACEHOLDER` return as-is, else append `" ago"`. (Keeps the two registers a guaranteed 1:1 number/unit match — AC-1.)

Absolute registers use a module-level memoized `Intl.DateTimeFormat(undefined, options)` (locale = runtime default; i18n out of scope, but the *options* are fixed app-wide → AC-4):
- `absoluteDate`: `{ year:"numeric", month:"short", day:"numeric" }` → `Jun 12, 2026`.
- `absoluteDateTime`: `{ year:"numeric", month:"short", day:"numeric", hour:"numeric", minute:"2-digit" }` → `Jun 12, 2026, 2:34 PM`.
- `clockTime(seconds:false)`: `{ hour:"numeric", minute:"2-digit" }`.
- `clockTime(seconds:true)`: `{ hour:"2-digit", minute:"2-digit", second:"2-digit", hour12:false }` → `14:32:07`.
- Each absolute register: `toEpoch` null → `TIME_PLACEHOLDER`. Future absolute timestamps render their real date (legitimate for next-run) — no clamp on absolute registers.

`@lore AI3:` comment in the module: collapsed 8 relative-time impls + 4 absolute-date shapes into one source; `format-time.ts`/`relative-time.ts` names were semantically swapped and are deleted; seconds-granularity (`12s`) register intentionally killed (static seconds are stale-on-render, spec bars ticking).

### Barrel export — `packages/shared/src/index.ts`

Add to the existing `format/` export block (after line 112):
```ts
export type { TimestampInput } from "./format/time.js";
export {
	TIME_PLACEHOLDER,
	absoluteDate,
	absoluteDateTime,
	clockTime,
	relativeLong,
	relativeShort,
} from "./format/time.js";
```

## Plan reconciliation (spec ⇆ codebase)

| Spec assumption | Reality | Plan handling |
|---|---|---|
| "eight relative-time implementations" | Confirmed 8 (items 1–8 + 10 absolute in CommentRow) | All absorbed/rewired; see migration table |
| `relative-time.ts` is the compact one, `format-time.ts` the prose one | Confirmed names semantically swapped | Both deleted; registers named by role, not file |
| design-system has 2 (ArtifactTimestamp, CommentRow) | Confirmed; ArtifactTimestamp has BOTH relative + absolute(UTC ISO) | ArtifactTimestamp absolute changes from UTC-ISO to R4 `MMM D, YYYY` — its test only asserts `/2026/`, survives |
| `AgentProfile.tsx` "two formats in one file" | Confirmed: line 118 `{month:short}`, line 392 default `toLocaleDateString()` | Both → `absoluteDate` |
| Only 1 of 8 handles invalid dates | Confirmed (relative-time.ts; CommentRow/useConv also guard) | New source makes all 17 safe |
| `relative-time.test.ts` locks the week/mo/y ladder | Confirmed at `packages/web/src/__tests__/relative-time.test.ts` | Test is **moved+rewritten** to `packages/shared/src/__tests__/time.test.ts` against `relativeShort`; ladder thresholds preserved (now bare `Nw`/`Nmo`/`Ny` — same as relative-time already emitted) |
| Stories hardcode "2h ago" strings | Confirmed (props, not formatters) | **Out of scope** — they pass display strings as props; no arithmetic |

## Migration list — all 17 sites (file:line → replacement)

Builder applies verbatim. Register chosen per the surface's reading task (approved.md).

### Deletions (2 files + import rewires)
| File | Action |
|---|---|
| `packages/web/src/utils/format-time.ts` | **delete** |
| `packages/web/src/utils/relative-time.ts` | **delete** |
| `packages/web/src/__tests__/relative-time.test.ts` | **delete** (logic moves to `packages/shared/src/__tests__/time.test.ts`) |

### Web — relative registers
| # | File:line | Today | Replace with | Import |
|---|---|---|---|---|
| 1 | `pages/WorkTask.tsx:36-46` (`formatRelativeTime`) + `:325` call | inline | delete fn; `:325` → `relativeLong(task.startedAt)` | add `import { relativeLong } from "@hyperidle/shared"` |
| 2 | `pages/WorkBet.tsx:108-122` (`formatTaskRelativeTime`) + its call sites | inline | delete fn; calls → `relativeLong(...)` | add `relativeLong` |
| 3 | `components/ArtifactThreadsSummary.tsx:31-41` (`relativeTime`) + calls | inline | delete fn; calls → `relativeShort(...)` | add `relativeShort` |
| 4 | `shell/NotificationPopover.tsx:50-59` (`formatRelativeTime`) + `:310` | inline (`Ns`) | delete fn; `:310` → `relativeShort(row.createdAt)` (kills `12s` → `just now`) | add `relativeShort` |
| 5 | `hooks/useConversationsThreads.ts:95-107` (`formatRelative`) + `:121` | inline | delete fn; `:121` → `relativeShort(row.lastActiveAt)` | add `relativeShort` |
| 6 | `pages/KnowledgeList.tsx:48` import + **both** call sites `:699` and `:797` | `relativeTime(item.updatedAt)` (×2) | rewire **both** call sites → `relativeShort(item.updatedAt)`; swap import to `import { relativeShort } from "@hyperidle/shared"`. Note: current import at `:48` lacks the `.js` extension other shared imports carry — the new import follows the workspace convention (bare `@hyperidle/shared` package import, no `.js`, matching sites 1–5) | replace import |
| 7 | `pages/WorkTeam.tsx:51` import + `:689` | `formatRelativeTime` | `:689` → `relativeShort(routine.lastRunAt)` (compact meta) ; swap import | replace import |
| 8 | `pages/AgentProfile.tsx:41` import + `:335` | `formatRelativeTime` | `:335` → `relativeLong(session.startedAt)` (prose "Started …") ; swap import | replace import |

> Register choice rationale: WorkTask/WorkBet/AgentProfile session lines are inline "Started Nh ago" prose → `relativeLong`. NotificationPopover badge, thread list, knowledge list, ArtifactThreadsSummary chips, WorkTeam routine meta are dense scan columns → `relativeShort`. Both share one ladder so AC-1 holds.

### Web — absolute registers
| # | File:line | Today | Replace with |
|---|---|---|---|
| 9 | `pages/AgentProfile.tsx:118` `createdDate` | `toLocaleDateString({month:short})` | `absoluteDate(data.createdAt)` |
| 10 | `pages/AgentProfile.tsx:392` `VerdictDot` title | `toLocaleDateString()` | `absoluteDate(createdAt)` |
| 11 | `pages/WorkRoutine.tsx:168` `lastRunLabel` | `toLocaleString()` | `absoluteDateTime(routine.lastRunAt)` (keep the ` — outcome` concat) |
| 12 | `pages/WorkRoutine.tsx:220` Next run | `toLocaleString()` | `absoluteDateTime(routine.nextRunAt)` (keep `: "On next event"` fallback) |
| 13 | `pages/WorkRoutine.tsx:227` Created | `toLocaleDateString()` | `absoluteDate(routine.createdAt)` |
| 14 | `pages/WorkRoutine.tsx:415` run-row startedAt | `toLocaleString()` | `absoluteDateTime(run.startedAt)` |
| 15 | `components/SessionActivityPanel.tsx:45` `time` | `toLocaleTimeString(undefined,{hour:"2-digit",minute:"2-digit",second:"2-digit"})` — **locale hour-cycle** | `clockTime(entry.timestamp, { seconds: true })` — forces 24h `HH:mm:ss`. **Intentional behavior change** (see note ‡). |

### Design-system — rewire to shared source (AC-5)
| # | File:line | Today | Replace with |
|---|---|---|---|
| 16 | `src/ArtifactTimestamp.tsx` `relative()` + `absolute()` (internal fns) | inline | delete both internal fns + the MIN/HOUR/DAY consts; `relative` path → `relativeLong(value)`, `absolute` path → `absoluteDate(value)`. Keep the component, props, `dsProps`, `BASE` className, `title={value}` unchanged | `import { relativeLong, absoluteDate } from "@hyperidle/shared"` |
| 17 | `src/CommentRow.tsx:formatMessageTime` (line 218) + use at `:243`/`:270` | inline `toLocaleTimeString` returning `string \| null` | delete `formatMessageTime`; at `:243` set `const timeRaw = showSenderHeader ? clockTime(message.createdAt) : null;` then `const timeString = timeRaw === TIME_PLACEHOLDER ? null : timeRaw;`. The `:270` render (`{timeString ? <span>…</span> : null}`) is unchanged. **Binding contract:** invalid time → no chip (see §"CommentRow null-render contract"). | add `clockTime, TIME_PLACEHOLDER` |

> `ArtifactTimestamp` default register choice: `relativeLong` (it rendered `N min ago` prose). Its test asserts only non-empty + `/2026/` for absolute → both still pass; **rename its absolute test case** (see WARNING 3 below). CommentRow hides the time chip on unparseable input — the binding AC-3 carve-out; see §"CommentRow null-render contract".

> ‡ **Site 15 — 24h normalization (intentional behavior change).** Today `SessionActivityPanel` uses `toLocaleTimeString` with no `hour12` override → the OS locale's hour-cycle (on a 12h locale, e.g. en-US, it renders `02:34:07 PM`-style). `clockTime(seconds:true)` hard-codes `hour12:false` → `14:34:07` app-wide. This is a **visible 12h→24h change on 12h-locale machines**, not a pure consolidation. It is in-scope (the spec permits "how it is formatted" to change) and deliberate: a high-frequency tool-call activity log reads cleaner and disambiguates adjacent events in 24h. The builder must NOT treat divergence from the old render as a regression, and the **AC-4 E2E expects `HH:mm:ss` (24h), not a locale-12h string**. The minute variant `clockTime(seconds:false)` (CommentRow) intentionally keeps locale hour-cycle (`hour:"numeric"`, no `hour12`) — so R3 is parameterized by *both precision and hour-cycle*, by design, not an oversight.

**Out of scope (confirmed not migrated):** `.stories.tsx` / `fixtures/*.ts` hardcoded display strings (`"2h ago"`, `"1d ago"`) — these are props passed *to* components, not local arithmetic; the spec's "no local date-difference arithmetic in components" search will find none. HTML mockup files under `design-system/html/` — static references, not code.

## CommentRow null-render contract (binding — resolves arch-critique WARNING 1 + design-critique St:8 WARNING)

**Decision: CommentRow hides the sender-header time chip on invalid/unparseable input. It does NOT render `"—"`.** This is an explicit, intentional **AC-3 carve-out** for the sender-header time chip — the single surface where the placeholder is *absence*, not the em-dash glyph.

Rationale: AC-3 mandates a "graceful placeholder on every surface." For a sender-header chip sitting inline beside a name + Agent badge, a dangling `—` reads as a broken/missing field, not as "no time available." Graceful here = the chip simply doesn't appear; the row still renders the name, avatar, badge, and body intact. Every *other* surface (dense rows, columns, calendar dates) renders `"—"` because there the placeholder occupies a known cell and reads as "no value." CommentRow's chip has no reserved cell — it is conditionally present already (`showSenderHeader` gate), so absence is its native "no value" state.

Mechanism (matches migration row 17): `clockTime` always returns a string; when that string is `TIME_PLACEHOLDER`, CommentRow coerces it back to `null` before the existing `{timeString ? <span> : null}` render. No other surface does this coercion — they render the placeholder verbatim.

**E2E assertion (added to `time-vocabulary.spec.ts`, AC-3 block):** seed a CommentRow with an unparseable `createdAt`; assert (a) the comment row renders, (b) no time chip is present in the sender header (`text-tertiary` time span absent), (c) the rendered row contains **no** `"—"` glyph, (d) no crash/console error. This is the negative-space assertion that locks the carve-out — distinct from the other surfaces' "renders `—`" assertion.

## AC-2/AC-5 static gate (split) — why, and the exempt sites

The original plan named one ESLint `no-restricted-syntax` rule banning both `toLocale*` *and* `Date.now()`/`getTime()` difference arithmetic. **The arithmetic half is undeliverable as a syntactic rule** and would break the lint merge gate: "subtract two parsed timestamps to *format an age*" and "subtract them to *sort / group / time a UI affordance*" are the **same AST** — no `no-restricted-syntax` selector distinguishes intent. The ban would false-positive on these legitimate, non-formatting sites (each verified in code), forcing per-line `eslint-disable` that defeats the gate's "empty allowlist surface" intent:

| Exempt site | Line(s) | What it is (NOT display formatting) |
|---|---|---|
| `packages/web/src/components/ThreadSections.tsx` | 54-55, 117, 141-142 | flat-list **sort comparators** (`Date.parse(a) - Date.parse(b)`) |
| `packages/web/src/components/ThreadSections.tsx` | 201 | `now = Date.now()` **default-param test seam** |
| `packages/design-system/src/ThreadShell.tsx` | 133, 138 | `computeSenderGrouping` **window check** (`tsMs - lastTimestampMs < WINDOW`) |
| `packages/design-system/src/BlockActionsPopover.tsx` | 66, 93 | copy-feedback **UI timer** (`Date.now() - copiedAt < COPY_FEEDBACK_MS`) |
| `packages/web/src/hooks/useSessionActivity.ts` | 131 | `Date.now()` **fallback default** for a missing timestamp |
| `packages/design-system/src/Composer.tsx` | 29 | `Date.now().toString(36)` **client-key ID** generation |

These six locations are **legitimately exempt** — the builder does NOT migrate them, does NOT add `eslint-disable` to them, and the lint rule must not touch them.

**Deliverable gate (task #7):** the rule bans only what is architecturally distinguishable as *display formatting*:
1. `toLocaleDateString` / `toLocaleTimeString` / `toLocaleString` member calls **on a `Date` receiver** (`new Date(...).toLocale*()` shape) in `packages/web/src` + `packages/design-system/src`. (Narrowed to `Date` receivers so `Number.prototype.toLocaleString` number-formatting is never flagged.)
2. Imports of the deleted `../utils/format-time` / `../utils/relative-time` (any depth) — dead-import ban, keeps the deleted names from resurrecting.
3. Allow-list: `packages/shared/src/format/time.ts` (the one module permitted to format).

**Relative-arithmetic half → review-checklist + AC-3 E2E.** AC-2's "no surface computes time *for display* locally" is not statically enforceable without semantic intent. It is verified by: (a) a `/review` checklist line — "no migrated formatting surface retains inline age arithmetic"; and (b) the AC-3 E2E, which renders every migrated surface and asserts the shared label / `—` placeholder. If a surface still computed age locally and diverged, the AC-1/AC-3 E2E would catch the mismatch.

## Test plan (per AC)

New test file: `packages/shared/src/__tests__/time.test.ts` (unit, `<1s`). Migrates the deleted `relative-time.test.ts` ladder cases onto `relativeShort` + new register/fallback cases.

| AC | Verification |
|---|---|
| **AC-1** identical age → identical label across surfaces | (a) Unit: `relativeShort(t, NOW)` and `relativeLong(t, NOW)` for the same `t` agree on number+unit (`relativeLong` === `relativeShort + " ago"` for non-`just now`). (b) **E2E** `packages/web/e2e/time-vocabulary.spec.ts`: **reuse the existing `packages/web/e2e/fixtures.ts` seeding pattern** (`import { expect, test } from "./fixtures"` + per-test `page.route()` overrides — LIFO, last-registered wins — to inject one shared `createdAt` into the `/api/threads`, knowledge, and notification mock payloads; do NOT hand-roll a new fixture harness). Playwright captures notification popover row, a WorkTask/WorkBet row, KnowledgeList row, CommentRow; assert the relative labels match within their register (the 4-surface side-by-side the spec demands) |
| **AC-2** named variants, no local *display* formatting | **Split enforcement** (the arithmetic half is not statically expressible — see §"AC-2/AC-5 static gate (split)"). (a) Unit: each register exported & callable. (b) **Deliverable static gate (lint):** ESLint `no-restricted-syntax` forbidding `toLocaleDateString`/`toLocaleTimeString`/`toLocaleString` **on `Date` receivers** + forbidding imports of the deleted `utils/format-time`/`utils/relative-time` paths, in `packages/web/src` + `packages/design-system/src`, allow-listing `format/time.ts`. Proves "no surface formats absolute time locally" + "dead files stay dead". (c) **Relative-arithmetic half → review-checklist + AC-3 E2E:** "every formatting surface renders a shared-module label (or `—`)" is verified by the AC-3 E2E (each migrated surface shows the shared label / placeholder), not by lint. Sort/group/timer ms-arithmetic is **explicitly out of the rule's scope** — it is not display formatting. |
| **AC-3** invalid/future → placeholder, never NaN/negative/crash | Unit table: `relativeShort("not-a-date")` === `"—"`; `relativeShort(null)` === `"—"`; `relativeShort(future, NOW)` === `"just now"` (no `-`); `absoluteDate("garbage")` === `"—"`; `absoluteDateTime(undefined)` === `"—"`; `clockTime(NaN-input)` === `"—"`; assert no result contains `NaN` and no relative result starts with `-`. Plus **E2E**: inject unparseable timestamp into each surface's fixture, assert `"—"` rendered, no crash. **CommentRow carve-out** (per §"CommentRow null-render contract"): bad-time comment row renders with **no time chip** and **no `"—"`** — negative assertion, not the `"—"` assertion |
| **AC-4** one absolute format app-wide | Unit: `absoluteDate(t)` matches `/^[A-Z][a-z]{2} \d{1,2}, \d{4}$/`; `absoluteDateTime(t)` matches date + `, ` + clock; `clockTime(t,{seconds:true})` matches `/^\d{2}:\d{2}:\d{2}$/` (24h, no am/pm — locks the site-15 normalization). E2E: WorkRoutine "Created" and AgentProfile created-on render the same `MMM D, YYYY` shape; SessionActivityPanel entry renders `HH:mm:ss` 24h (not a locale-12h string) |
| **AC-5** design-system consumes the shared source | Static: `ArtifactTimestamp.tsx` + `CommentRow.tsx` import the registers from `@hyperidle/shared` and contain no local `Date`-receiver `toLocale*` (covered by the deliverable AC-2 lint gate, which already scopes `design-system/src`). The "no local diff arithmetic" claim is review-checklist, same split as AC-2. Existing `ArtifactTimestamp.test.tsx` still green |

Protected tests (assertions must not change semantics, may be relocated): `packages/design-system/src/__tests__/ArtifactTimestamp.test.tsx` (stays green; absolute output still contains `2026`).

**Authorized test rename (WARNING 3):** the absolute case is named "renders an absolute **ISO-style** date" — after R4 the output is `MMM D, YYYY`, no longer ISO, so the name becomes false (a latent `/review` slop finding). The builder is **explicitly authorized to rename this test case** to drop "ISO-style" (e.g. "renders an absolute calendar date"). **The assertion (`/2026/`) is unchanged** — this is a name-only edit, within the protected-test rule (name ≠ assertion semantics).

`protectedTests`: `["packages/design-system/src/__tests__/ArtifactTimestamp.test.tsx"]`

## Ordered implementation tasks

1. **RED** — Write `packages/shared/src/__tests__/time.test.ts`: ladder cases (port from old `relative-time.test.ts` → `relativeShort`), `relativeLong`=`+" ago"`, `clockTime` minute+seconds, `absoluteDate`/`absoluteDateTime` regex, full invalid/null/future fallback table. Fails (module absent).
2. **GREEN source** — Create `packages/shared/src/format/time.ts` per the implementation contract + `@lore AI3`. Export from `packages/shared/src/index.ts`. Tests 1 pass.
3. **Delete** `packages/web/src/utils/format-time.ts`, `relative-time.ts`, `packages/web/src/__tests__/relative-time.test.ts`.
4. **Migrate web relative** (sites 1–8): delete inline fns, rewire calls/imports to `relativeShort`/`relativeLong` per table.
5. **Migrate web absolute** (sites 9–15): replace `toLocale*` with `absoluteDate`/`absoluteDateTime`/`clockTime`.
6. **Migrate design-system** (sites 16–17): rewire `ArtifactTimestamp`, `CommentRow` to shared registers.
7. **AC-2/AC-5 deliverable static gate** — add ESLint `no-restricted-syntax` rule banning (a) `toLocaleDateString|toLocaleTimeString|toLocaleString` **on `Date` receivers** and (b) imports of `utils/format-time`/`utils/relative-time`, in `packages/web/src` + `packages/design-system/src`, allow-listing `packages/shared/src/format/time.ts`. Wire into `npm run lint`. **Do NOT ban `Date.now()`/`getTime()` difference arithmetic** — it is the same AST as the six exempt sort/group/timer sites listed in §"AC-2/AC-5 static gate (split)". Confirm `npm run lint` stays green on those six sites (no `eslint-disable` added). The relative-arithmetic half of AC-2 is carried by the `/review` checklist + AC-3 E2E, not lint.
8. **E2E** — `packages/web/e2e/time-vocabulary.spec.ts`: **import `{ expect, test }` from `./fixtures`** and override the core endpoints with `page.route()` (the established pattern — see `fixtures.ts` header `@lore M3`) to seed identical + invalid timestamps across the 4 surfaces. Assert: (a) label agreement within register, (b) `"—"` fallback on the non-CommentRow surfaces, (c) CommentRow bad-time → **no chip, no `"—"`** (the carve-out), (d) no crash. AC-4: assert SessionActivityPanel entry renders 24h `HH:mm:ss`.
9. **Verify** — `npm run check && npm run lint && npm run test && npm run test:e2e`. Side-by-side E2E screenshot is the AC-1 proof artifact.

## Security & abuse cases
- Rate-limit / POST surfaces — **N/A**: pure display formatter, no new endpoint, no mutation.
- Input-trust boundary for agent-authored fields — **Applicable, addressed**: timestamps may originate from agent/DB data; `toEpoch` rejects any non-finite parse → `TIME_PLACEHOLDER`. No string is rendered as HTML (text node only); no `dangerouslySetInnerHTML`. An adversarial timestamp string cannot inject — it's parsed by `Date.parse`, never echoed (the old `ArtifactTimestamp` echo-of-raw-value is removed).
- Path traversal / SSRF / secrets — **N/A**: no paths, no outbound URLs, no credentials.

## sharedFiles
`["packages/shared/src/index.ts", "packages/shared/src/format/time.ts"]` — barrel + new module. Other AI-track WPs touching `shared/index.ts` need merge-order coordination (append-only block, low conflict risk).

## Risks / ambiguities
- **CommentRow null-time contract** (resolved, not a risk): the sender-header time chip **hides on invalid input** — see §"CommentRow null-render contract" for the binding decision and its AC-3 carve-out. Not reviewer's-choice.
- **ESLint rule scope** (resolved by the split): the deliverable rule bans only `Date`-receiver `toLocale*` + dead-import paths, allow-listing `format/time.ts`. It does **not** attempt to ban ms-difference arithmetic (undeliverable — see §"AC-2/AC-5 static gate (split)"). No false positives on `Number.prototype.toLocaleString` (Date-receiver scope) and none on the six exempt arithmetic sites (not in scope). No source `eslint-disable` should be needed; if one is, the rule is mis-scoped — fix the rule, not the call site.
- **Register assignment is a judgment call** per surface (short vs long). Table above is the contract; builder does not re-decide.
