# Design Critique: AI3 — One clock

DESIGN-CRITIQUE: variant=approved (routine ratification) score=8/10  rounds=0  axes: H:n/a S:n/a T:n/a C:n/a Co:9 St:8 A:n/a AS:9 PP:8

**Mode.** Routine, single-table vocabulary ratification — no UI surface, no mockup. The 9 visual-hierarchy dimensions (H/S/T/C/A) do not apply; this formatter only changes the *string*, not the wrapping span (call-site classNames already satisfy PRINCIPLES.md §timestamps — mono, tabular, dimmed). Scored on the dimensions that bind a vocabulary decision: **coherence** (Co — register/threshold consistency), **states/fallbacks** (St — invalid/future/null handling), **anti-slop** (AS — does the vocabulary avoid noise), **premium polish** (PP — does it respect the house type/timestamp conventions). Overall = mean of applicable dims.

**Verdict: APPROVED** (score ≥7, no CRITICAL). The vocabulary is complete over every register actually in use, thresholds are coherent, and AC-1..AC-4 are satisfiable from this table. Two WARNINGs the architect/builder must carry, several NOTES.

## Inventory verified against code (not trusted blindly)

Grepped every `Date.now()`/`getTime()`/`Date.parse()` arithmetic site and every `toLocale*` call across `packages/web/src` + `packages/design-system/src`. The design's 17-row table is **accurate** on the formatting sites:
- Items 1–8 relative impls: all confirmed at the cited locations (format-time.ts, relative-time.ts, WorkTask:37, WorkBet:111, ArtifactThreadsSummary:33, NotificationPopover:51, useConversationsThreads:96, ArtifactTimestamp:17-19). The "`12s` seconds-granularity in NotificationPopover" claim is true (`diff` in ms, `Ns` bucket).
- Vocabulary swap claim ("the two files' names are semantically swapped") **verified**: `relative-time.ts` emits the compact `<1h`/`Nh`/`Nw` ladder; `format-time.ts` emits the prose `just now`/`Nm ago` ladder. Names are backwards. Killing both names is the right call.
- Invalid-safe audit verified: only `relative-time.ts` (→`—`), `useConversationsThreads` (→`""`), `CommentRow` (→`null`), `ArtifactTimestamp` (echoes raw `value`) guard today. The design's "only 5 of the surveyed impls handle invalid" is correct, and choosing `—` over the four divergent behaviors is sound.

## Coherence (Co: 9)

- One ladder, every relative register — exactly the bug AI3 fixes. R2 = R1 + " ago" (suffix only, same buckets) is the strongest decision in the artifact: it makes AC-1 ("two surfaces showing the same age render the identical label") provable by construction, not by test luck. A surface in R1 and a surface in R2 can never disagree on number+unit.
- Threshold ladder inherits the test-locked `relative-time.test.ts` week/month/year boundaries — proven, not invented.
- Floor-everywhere matches all 8 existing impls; no boundary shifts, no rounding-up surprises. Correct.
- The "considered and rejected" block (single-register, seconds, ISO, rounding, per-surface tuning) is genuine design-it-twice, not theatre — each rejection cites the spec constraint that kills it. This pre-empts `/architecture` re-litigation cleanly.

## States & fallbacks (St: 8)

- AC-3 covered: invalid→`—`, null→`—`, future→clamp-to-0→`just now` (relative) / real date (absolute). The future-absolute carve-out ("a future next-run must show its real date") is a correct, non-obvious catch.
- `—` (U+2014) over `""`/`"Invalid date"`/`"unknown"`: justified (dim, neutral, one-char, already in use). Good.
- **WARNING — CommentRow null-render contract drift.** Today `CommentRow.formatMessageTime` returns `null` on unparseable input and the time span is *hidden*. The new `clockTime` returns `"—"`, never null. The design's R3 register does not state whether CommentRow should now render `"—"` or keep hiding the span. AC-3 says "every surface shows the graceful placeholder" — which argues for rendering `"—"` and contradicts preserving the hide-behavior. The architecture plan resolves this (gate the span on `!== TIME_PLACEHOLDER`), but the *design* left the behavioral question open, and the two answers are user-visibly different. → The design should state the rule explicitly: comment rows with an unparseable time **hide the chip** (AC-3's "graceful" = absence here, not a dangling em-dash in a sender header). Flag carried to architecture-critique.

## Anti-slop (AS: 9)

- Killing the `12s` seconds register is the right anti-noise call and correctly tied to the spec's "no ticking" out-of-scope (a static `12s` is stale-on-render). Strong reasoning.
- Killing `<1h` (which hid all sub-hour ages in one bucket) and restoring `Nm` is a real legibility win — "agent started 4m ago" is actionable; "<1h" is not.

## Premium polish (PP: 8)

- `MMM D, YYYY` over ISO for calendar dates: correct — human-facing dates read friendlier than `2026-06-12`, and the mono/tabular-alignment argument genuinely doesn't apply to prose dates. Consistent with PRINCIPLES §timestamps (mono is for the *compact relative* register, which R1 keeps).
- **WARNING — R3 register internal inconsistency (12h vs 24h).** The R3 table specifies CommentRow as `h:mm a` (12-hour, "2:34 PM") and Session activity as `HH:mm:ss` (24-hour, "14:32:07"). These are *different clock conventions* inside one register. That is defensible (comment = casual, activity-log = precise/disambiguating), but it means R3 is not "one register parameterized by precision" as the artifact claims (§R3 decision note) — it is one register parameterized by **both precision and hour-cycle**. The architecture plan encodes this correctly (`clockTime(seconds:false)` → `hour:"numeric"` locale-12h; `seconds:true` → `hour12:false` 24h) but the design's framing ("same register, parameterized by precision — not a fork") understates it. Note for the architect: the seconds variant hard-codes `hour12:false` while the minute variant inherits locale — so on a 24h-locale machine the two are consistent, but on a 12h-locale machine they diverge in hour-cycle, not just precision. Acceptable (it matches today's behavior — SessionActivityPanel already uses `2-digit` 24h-ish), but the design's own claim of register purity is slightly overstated. Not blocking.

## NOTES

- **NOTE** — Inventory row 17 (SessionActivityPanel) maps to R3 `clockTimeSeconds`, but the design table (§R3) lists session activity as `HH:mm:ss` while the *current* code (`SessionActivityPanel.tsx:45`) uses `toLocaleTimeString(undefined, {hour:"2-digit",minute:"2-digit",second:"2-digit"})` — which is locale-default hour-cycle, **not** guaranteed `HH` 24h. The migration to `clockTime(seconds:true)` with hard `hour12:false` is a *behavior change* on 12h locales (e.g. en-US would have shown "02:34:07 PM"-ish → becomes "14:34:07"). The spec says "only how it is formatted" may change, so this is in-scope, but it IS a visible change, not a pure consolidation. Worth a line in the design's decision notes so the builder doesn't treat it as a no-op.
- **NOTE** — KnowledgeList uses `relativeTime` at **two** call sites (lines 699 and 797), both → R1 `relativeShort`. The design table row 6 (KnowledgeList implicit) and the architecture migration row 6 say "uses of relativeTime" without enumerating both. Completeness only — both want the same register, so no decision risk.
- **NOTE** — `ArtifactTimestamp` default register: design picks `relativeLong` (it rendered `N min ago` prose). Reasonable. Its protected test asserts only `/2026/` for absolute and non-empty for relative — survives. But the test's *name* ("renders an absolute ISO-style date") becomes a lie after R4 drops ISO. Cosmetic; flag to architecture for a rename.

## What's working well

- The R2 = R1 + " ago" construction makes AC-1 a structural guarantee rather than a test-coverage hope. This is the single highest-leverage decision in the artifact.
- The "considered and rejected" section is real design-it-twice with spec-cited kills — it will save the architect from re-opening settled questions.
