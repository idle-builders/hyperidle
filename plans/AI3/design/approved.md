DESIGN-CLASS: routine  ref=ArtifactTimestamp  pattern=none (pure formatter, no new UI surface)

# AI3 — One clock — Approved time vocabulary

Routine, single-table decision per the spec's plan call. No UI surface invented — this ratifies the *vocabulary* (label strings, thresholds, registers, fallbacks) that one shared formatter emits. No mockups: the artifact is the threshold table below, which the architecture and code phases implement verbatim.

## Phase 0b — Reuse inventory (what exists, what survives)

Eight relative-time implementations + scattered absolute-date calls. Surveyed every `.tsx`/`.ts` call site (HTML mockup files excluded — static, not code).

| # | Location | Vocabulary today | Invalid-safe? | Fate |
|---|---|---|---|---|
| 1 | `packages/web/src/utils/format-time.ts` `formatRelativeTime` | `just now` / `Nm ago` / `Nh ago` / `Nd ago` | no | **deleted** (name dies per contract) |
| 2 | `packages/web/src/utils/relative-time.ts` `relativeTime` | `<1h` / `Nh` / `Nd` / `Nw` / `Nmo` / `Ny` | yes (`—`) | **deleted** (name dies per contract) |
| 3 | `WorkTask.tsx` inline `formatRelativeTime` | `just now` / `Nm ago` / `Nh ago` / `Nd ago` | no | absorbed |
| 4 | `WorkBet.tsx` inline `formatTaskRelativeTime` | same + null-guard | partial (`NaN`→`""`) | absorbed |
| 5 | `ArtifactThreadsSummary.tsx` inline `relativeTime` | `just now` / `Nm ago` / `Nh ago` / `Nd ago` | no | absorbed |
| 6 | `NotificationPopover.tsx` inline `formatRelativeTime` | `Ns` / `Nm` / `Nh` / `Nd` (seconds!) | no | absorbed |
| 7 | `useConversationsThreads.ts` inline `formatRelative` | `just now` / `Nm` / `Nh` / `Nd` | yes (`""`) | absorbed |
| 8 | `design-system/src/ArtifactTimestamp.tsx` `relative()` | `just now` / `N min ago` / `N hr ago` / `N d ago` | yes (echoes raw) | **rewired** to shared source |
| 9 | `design-system/src/ArtifactTimestamp.tsx` `absolute()` | `YYYY-MM-DD HH:MM` (UTC) | yes | **rewired** to shared `formatAbsoluteDate`/`...DateTime` |
| 10 | `design-system/src/CommentRow.tsx` `formatMessageTime` | `2:34 PM` (clock only) | yes (`null`) | rewired to shared `formatClockTime` |
| 11 | `AgentProfile.tsx` `createdDate` | `toLocaleDateString(short month)` | no | rewired to `formatAbsoluteDate` |
| 12 | `AgentProfile.tsx` `VerdictDot` title | `toLocaleDateString()` (default) | no | rewired to `formatAbsoluteDate` |
| 13 | `WorkRoutine.tsx` `lastRunLabel` | `toLocaleString()` | no | rewired to `formatAbsoluteDateTime` |
| 14 | `WorkRoutine.tsx` `Next run` | `toLocaleString()` | no | rewired to `formatAbsoluteDateTime` |
| 15 | `WorkRoutine.tsx` `Created` | `toLocaleDateString()` | no | rewired to `formatAbsoluteDate` |
| 16 | `WorkRoutine.tsx` run-row `startedAt` | `toLocaleString()` | no | rewired to `formatAbsoluteDateTime` |
| 17 | `SessionActivityPanel.tsx` `time` | `toLocaleTimeString(HH:MM:SS)` | no | rewired to `formatClockTime` (see register T3) |

Three distinct vocabularies collapse to **one source, four named registers**. Only items 2, 7, 8, 9, 10 were invalid-safe today; the new source makes all 17 safe.

## The decision — one source, four registers

One module emits four *registers*. A register is a named display mode (a function or a string param), never a separate file. Architecture picks the surface (function vs. enum) — design fixes the **vocabulary each register emits**.

### Register R1 — `relativeShort` (compact, the default)

Dense rows, chips, notification badges, knowledge list, thread list, task/bet meta. Monospace, tabular-nums, `text-tertiary` (per PRINCIPLES.md §timestamps — dim chrome, mono for precision/alignment). **No "ago" suffix** — the compact register is for scanning columns where the word "ago" is pure noise.

| Age | Label |
|---|---|
| `< 60s` | `just now` |
| `60s – 59m` | `Nm` |
| `1h – 23h` | `Nh` |
| `1d – 6d` | `Nd` |
| `7d – 27d` | `Nw` (floor, 7→1w) |
| `28d – 364d` | `Nmo` (floor by 30d, 28d→1mo) |
| `≥ 365d` | `Ny` (floor by 365d) |

Decision notes:
- **`just now`, not `Ns`.** The seconds-granularity register (`12s`) from NotificationPopover is **killed**. Sub-minute precision is noise the user can't act on and reads as jitter; the spec's out-of-scope "no ticking" makes seconds actively misleading (a static `12s` is stale the instant it renders). One threshold below a minute: `just now`.
- **`<1h` is killed.** relative-time.ts's `<1h` floor hid all sub-hour ages behind one bucket. Minutes are useful ("agent started 4m ago"); we restore `Nm`. `just now` covers only the true sub-minute case.
- Thresholds inherit relative-time.ts's week/month/year ladder (already test-locked in `relative-time.test.ts`) — proven, and the only register that went past days.
- Floor everywhere (`Math.floor`), matching every existing impl. `89m` → `1h` only at the 60-min boundary; `90m` is still `1h`. No rounding-up surprises.

### Register R2 — `relativeLong` (prose)

Tooltips, single high-prominence "Started …" lines, anywhere a sentence reads better than a column cell. Same thresholds as R1, **with the "ago" suffix and spelled-out unit boundaries kept terse**.

| Age | Label |
|---|---|
| `< 60s` | `just now` |
| `60s – 59m` | `Nm ago` |
| `1h – 23h` | `Nh ago` |
| `1d – 6d` | `Nd ago` |
| `7d – 27d` | `Nw ago` |
| `28d – 364d` | `Nmo ago` |
| `≥ 365d` | `Ny ago` |

Decision notes:
- R2 is **R1 + " ago"**. It is *not* a different threshold ladder. This guarantees AC-1: two surfaces showing the same age in different registers agree on the number and unit — they differ only by a suffix word, never by bucket. (The old `N min ago` / `N hr ago` spelled-out forms are dropped — `Nm ago`/`Nh ago` is the house style, matching 5 of the 8 implementations.)
- Two registers survive (R1, R2). Justified by AC-2: compact column scanning (R1) and inline prose (R2) are genuinely distinct reading tasks. They are named variants of one source with one threshold ladder — not forks.

### Register R3 — `clockTime` (time-of-day, absolute)

Comment rows, session activity entries — where the *wall-clock time today* matters, not age. Locale clock.

| Context | Format | Example |
|---|---|---|
| Comment rows (CommentRow) | `h:mm a` | `2:34 PM` |
| Session activity (per-event) | `HH:mm:ss` | `14:32:07` |

Decision note: two precisions inside R3 — `clockTime` (minute) and `clockTimeSeconds` (second). Session activity is a high-frequency tool-call log where seconds disambiguate adjacent events; comment rows don't need them. Architecture exposes this as a `seconds?: boolean` param or two thin named exports.

R3 is parameterized by **both precision and hour-cycle** (not precision alone — correcting this artifact's earlier "same register, parameterized by precision" framing):
- `clockTime` (minute, CommentRow) inherits the **locale hour-cycle** (`h:mm a` on a 12h locale).
- `clockTimeSeconds` (session activity) forces **24h `HH:mm:ss`** (`hour12:false`). This is an **intentional behavior change** on 12h-locale machines: today `SessionActivityPanel` uses locale-default hour-cycle (would show `02:34:07 PM`-style on en-US); R3 normalizes the activity log to 24h, which reads cleaner and disambiguates adjacent tool-call events. In-scope (the spec permits "how it is formatted" to change), not a no-op — the builder must not treat divergence from the old render as a regression.

**CommentRow invalid-time contract (binding):** a comment row whose `createdAt` is unparseable **hides the time chip entirely** — it does NOT render `"—"`. This is the one AC-3 carve-out: "graceful placeholder" for a sender-header chip means *absence*, not a dangling em-dash beside the sender name (which reads as a broken field). The chip is already conditionally present (gated on the sender header), so absence is its native "no value" state. Every other register/surface renders `"—"`; only CommentRow's chip hides. (Resolves this artifact's previously-open behavioral question — see St:8 WARNING in design-critique.)

### Register R4 — `absoluteDate` / `absoluteDateTime` (calendar date)

Created-on, completed-on, last-run, next-run, scheduled timestamps. AC-4: **one format app-wide.** Today these are 4 different `toLocaleString`/`toLocaleDateString` shapes.

| Register | Format | Example | Used for |
|---|---|---|---|
| `absoluteDate` | `MMM D, YYYY` | `Jun 12, 2026` | created-on, completed-on, "Created", verdict-dot tooltip |
| `absoluteDateTime` | `MMM D, YYYY, h:mm a` | `Jun 12, 2026, 2:34 PM` | last-run, next-run, run-row start (needs the clock) |

Decision notes:
- **`MMM D, YYYY`** (locale month-name short), not ISO `YYYY-MM-DD`. AgentProfile already uses `{month:"short"}` and it's the friendlier of the existing shapes; calendar dates are read by humans, not aligned in columns, so the precision-mono argument doesn't apply. (The design-system `ArtifactTimestamp` absolute mode used UTC ISO `YYYY-MM-DD HH:MM` — that's **changed** to match app-wide R4; its test only asserts the string contains `2026`, so it survives.)
- `absoluteDateTime` adds the R3 minute clock to the date. One concatenation, one source — not local arithmetic.
- Implemented via `Intl.DateTimeFormat` with fixed `options`, default locale (`undefined`). i18n is out of scope, so locale is the runtime default — but the *options* (which fields, which order) are fixed and app-wide. That is what AC-4 demands: one format, not one locale.

## Future & invalid handling (AC-3) — every register

Single rule, applied in the one source, inherited by all four registers:

1. Parse with `Date.parse` (or `new Date().getTime()`); if result is **not finite** (NaN) → return the **placeholder `"—"`** (em-dash, U+2014). Never echo the raw input (the old ArtifactTimestamp echoed `value` — that leaks garbage strings into the UI). Never `""` (invisible, indistinguishable from "no data"). Never `NaN`.
2. Null/undefined input → same placeholder `"—"`. (WorkBet/WorkRoutine pass nullable timestamps; the source accepts `string | null | undefined`.)
3. **Future timestamp** (parsed time > `now`): clamp age to 0 via `Math.max(0, now - ts)` → renders `just now` (relative registers) or the literal future calendar date (absolute registers — a future "next run" is legitimate and must show its real date). Never a negative number, never `-Nm`.

`"—"` chosen over "Invalid date" / "unknown": it's the same dim, neutral, non-alarming glyph the relative-time.ts source already used, reads as "no value" not "error", and is one character — fits any dense cell.

**One AC-3 carve-out:** the CommentRow sender-header time chip renders the placeholder as *absence* (hides the chip), not as `"—"` — see R3 decision note above. Every other surface renders the literal `"—"`. The formatter still returns `"—"` uniformly; CommentRow alone coerces that sentinel back to "no chip" at the render site.

## Why no compact-vs-prose proliferation beyond this

Considered and rejected (so `/architecture` doesn't re-litigate):
- **A single register only (compact, no prose).** Rejected: CommentRow and "Started Nh ago" inline lines genuinely read better with the suffix; forcing bare `Nh` into a sentence reads as a typo.
- **Seconds in the relative register (`12s`).** Rejected: static seconds are stale-on-render and the spec bars ticking. Killed.
- **ISO absolute dates (`2026-06-12`).** Rejected for calendar dates (R4) — human-facing, month-name is friendlier. Retained nowhere; the only ISO user (design-system absolute mode) moves to R4.
- **Rounding instead of floor.** Rejected: every existing impl floors; changing to round would shift every test boundary for no user gain.
- **Per-surface threshold tuning** (e.g. notifications stop at hours, knowledge goes to years). Rejected: that *is* the bug AI3 fixes. One ladder, every relative surface.

## Open questions for the architect

1. Surface shape: four named exports (`relativeShort`, `relativeLong`, `clockTime`, `absoluteDate`, `absoluteDateTime`) vs. two functions with a `register`/`variant` param. Recommend **named exports** — greppable, tree-shakeable, each register self-documenting; the seconds and date-time precisions are thin params on their parent register.
2. Package home: must be importable by both `design-system` and `web` and carry no UI deps. `@hyperidle/shared/src/format/` already hosts `money.ts`, `bet.ts`, `artifact-cost.ts` (same pattern). Recommend `packages/shared/src/format/time.ts`. (Architecture confirms the boundary.)
3. `now` injection: keep the existing `now?: number` test seam on relative registers (already used by `relative-time.test.ts`). Absolute registers don't need it.
