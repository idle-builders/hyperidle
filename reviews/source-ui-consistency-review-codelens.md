> **Preserved source — pass B (code lens).** Superseded by
> [ui-audit-consolidated.md](ui-audit-consolidated.md), which merges this with the live pass and
> records where the two disagreed. Kept for provenance; read the consolidated doc first.
>
> Its original worktree and screenshots are gone.
> Findings #10 (`0mo` cause), #50 and §6 (dark theme, heading contract) were corrected on live
> verification — see the conflict ledger in the consolidated doc.

# UI / UX Consistency Review

Staff-frontend pass over every shipped screen, judged against the Hearth design
law (`docs/ui-design/*`, `framework/design-system/PRINCIPLES.md`,
`AESTHETICS.md`) and against itself (do similar things behave and look the
same everywhere?).

**Method.** Dedicated worktree `.worktrees/ui-review` (branch
`review/ui-consistency-audit`, cut from `origin/main`). Demo world seeded
(`npm run setup -- --demo`), server on port **3101**, web on **5273** (other
sessions own 3001/5173). Every route screenshotted in hearth-light and
hearth-dark at 1440×900 (`/tmp/ui-review-shots/*.png`), overlays driven with
Playwright, and each finding below cross-checked against the source.

Severity: **BUG** = broken interaction · **INCON** = same meaning, different
UI · **LEAK** = machine data shown to humans · **POLISH** = craft gap.

---

## 1. Interaction bugs (fix first)

1. **BUG — ⌘K global search opens dead.** `GlobalSearchPanel` renders its
   scrim + panel *inline inside `#root`*
   (`layers/core-ui/src/components/GlobalSearchPanel.tsx:141-313`) but uses
   `useDialogBehavior({ modal: true })`, and that hook sets `inert` on `#root`
   while open (`framework/design-system/src/useDialogBehavior.ts:117-126`).
   The panel inerts *itself*: the input accepts no typing, results are not
   clickable, Escape and scrim-click never fire (verified live:
   `elementFromPoint` returns `<body>` everywhere while open). Only pressing
   ⌘K again closes it (document-level toggle listener). Fix: portal the panel
   + scrim into `#overlay-root` like `Dialog` does
   (`framework/design-system/src/Dialog.tsx:288`), or make the inert target
   exclude the active overlay.
2. **BUG — mobile drawer is the same dead overlay.** The drawer div renders
   inline in `#root` with `modal: true`
   (`layers/core-ui/src/layouts/AppShell.tsx:778-795`) → on a real phone the
   opened drawer is inert: nav items untappable. Same fix as #1. A
   document-level Escape listener was added as a workaround
   (`AppShell.tsx:140-153`) — it papers over the symptom.
3. **BUG — `AppShell.tsx` contains raw control bytes.** The file is detected
   as binary by grep/ripgrep (NUL byte near offset 4756: a regex literal
   `/[\0-\037...]/` written with literal control characters instead of `\x00`
   escapes). Tooling, code search, and diff reviewers silently skip this
   file. Replace literal bytes with escape sequences.

## 2. Raw machine data shown to humans (LEAK)

4. **Conversation detail title is the thread id.** Team feed shows
   "demo-team-acme" as the page title and again in the subtitle
   (`layers/core-ui/src/pages/Conversations.tsx:442` falls back to `hostId`
   when the identity lookup misses — it always misses for teams). Show the
   team name ("Acme") and a human subtitle ("Team feed").
5. **WorkTask sessions list raw agent ids** ("demo-agent-pm") as the row
   subtitle, and session names are "Session 1/2/3". Resolve agent display
   names; name sessions by date or first prompt.
6. **KnowledgeDetail subtitle prints the raw ISO string**
   "2026-08-11T13:27:19.017Z" plus "by unknown"
   (`layers/core-ui/src/pages/KnowledgeDetail.tsx:313` passes `updatedAt`
   through unformatted). Use the relative-time formatter used everywhere
   else; resolve editor id → name, hide the clause when unknown.
7. **AgentProfile shows raw enums**: role `product_manager`, harness
   `builtin` in the CONFIGURATION card. Map to display labels
   ("Product Manager", "Built-in gateway" — the setup flow already has these
   labels).
8. **Settings → Org chart rows show raw team id** ("demo-team-acme") as the
   subtitle instead of the team name.
9. **ArtifactPermalink prints the artifact id** ("demo-art-pricing-page")
   top-right in mono. An id is not user information; drop it or move it to a
   tooltip/dev affordance.
10. **LEAK/edge — knowledge triage shows "0mo"** for items updated today.
    The relative formatter should say "now"/"today" below its smallest unit.

## 3. One meaning, several UIs (INCON)

11. **Three different message composers.** Conversations: textarea + attach
    "+" + icon send pill (`components/ConversationSurface.tsx:393+`).
    WorkTask / KnowledgeDetail / ArtifactPermalink: bare input + text "Send"
    pill that looks disabled when empty. Design-system `Composer`
    ("Reply to thread…") is a *third* one, used only in review/host threads.
    Pick one (the DS Composer) and use it on every thread surface.
12. **Two destructive-button styles on one screen.** Settings → Org chart
    uses solid red pill "Delete"; Settings → Agents uses outline red pill
    "Delete" (`layers/core-ui/src/settings/SettingsOrgChart.tsx` vs
    `SettingsAgents.tsx`). One destructive variant app-wide.
13. **Three breadcrumb/back patterns.** Circular back button + "Work/Acme"
    (work/knowledge detail), plain text "Work / New bet" (create pages),
    ALL-CAPS MONO chain (artifact permalink). One breadcrumb treatment.
14. **Status vocabulary collides on the same screen.** WorkTeam header chip
    says BLOCKED while the STATUS stat card says "Attention"; AgentProfile
    header says IDLE as a bare dot+mono label, not a `StatusChip`. Use
    `StatusChip` (or the documented dot mapper) everywhere and make the words
    match (`status-mapping.ts` exists for exactly this).
15. **Empty-state handling differs per section.** WorkTask: ARTIFACTS section
    renders label + hairline and *nothing*; DISCUSSION renders "No discussion
    yet."; KnowledgeDetail BACKLINKS renders "No related items."; the DS has
    `EmptyState compact` for this — use it in all four places.
16. **Conversations queue rows are hand-rolled** (title + kind tag + time)
    while global search renders the same threads with the DS `ThreadRow`
    (avatar + snippet + status). The queue loses avatars, last-message
    snippet and status — and looks visually poorer than the search results
    for the same data. Use `ThreadRow` in the queue.
17. **Label casing split personality.** Routine form uses caps micro-labels
    (NAME / PROMPT / AUTONOMY), setup and tables use sentence case
    ("Your name", "Task / Outcome / When"). Pick one (caps micro-labels are
    the DS `KeyValue`/`SectionLabel` voice) and apply consistently.
18. **WorkRoutine has two headers.** `PageHeader` ("Routine") plus a second
    full-width strip repeating the routine name + HEALTHY chip + Save
    (`layers/core-ui/src/pages/WorkRoutine.tsx:111+`). Merge name/status/save
    into the PageHeader (title / actions), like WorkBet does.
19. **Form-control chrome leaks native blue.** Setup harness picker uses raw
    `<input type="radio">` (`pages/SetupFlow.tsx:633,762,837`) and the name
    input shows a cool-blue focus ring — the only cold color in an otherwise
    warm app (AQ-002). Style radios/focus with the theme tokens like the DS
    Composer's focus ring (`--accent-deep` outline).
20. **Disabled primary buttons read as "muted lemon"** in three places
    (Create bet, Create knowledge, Send) but DS `Button` has a proper
    disabled treatment. Use `Button` with `disabled`.

## 4. Per-screen findings

### Sidebar / shell
21. POLISH — fast-nav history items truncate to uselessness ("Write the
    four-em…", "Acme Builder, Acm…") at 200px with no `title` tooltip. Add
    tooltips or two-line clamp.
22. INCON — sidebar has no brand wordmark; `AESTHETICS.md` AQ-014 and
    `docs/ui-design` still describe one. Either restore the mark or update
    the docs — the two sources of truth disagree.
23. POLISH — Notification popover rows truncate ("Review requested: N…")
    inside a popover that has room to be wider.
24. POLISH — Assistant overlay header shows two identical "F" avatars and a
    generic "Assistant" title; name the assistant ("Founder's Assistant")
    and show one avatar.

### Setup (`/setup`)
25. POLISH — large decorative skeleton-cards illustration adds nothing
    (AQ-019); the page is otherwise fine.
26. INCON — harness rows are cards with hairline dividers (good, matches
    Settings harnesses) but the selected row gets no selected treatment
    beyond the native radio dot.

### Work team (`/work/team/:id`)
27. POLISH — CAPACITY/STATUS stat cards are ~60% empty air; either add the
    second row of data they were designed for or shrink them (KpiStat exists
    in DS).
28. POLISH — routine rows truncate the schedule ("Every day a…") while the
    right half of the row is empty; let the schedule use the space, and make
    the hairline separators span the full row width (they stop mid-row).
29. POLISH — "Got it" dismiss on the agents-ready banner is a tiny ghost
    label; give it `Button size=xs`.

### Work bet (`/work/bet/:id`)
30. INCON — PITCH section repeats the page title as an h2 right under the
    "PITCH" label. Drop the duplicate heading; the pitch body can start
    directly.
31. POLISH — "Add knowledge" pill floats alone with uneven vertical rhythm
    above the PROGRESS/TEAM cards; align it into a section header's trailing
    slot (`SectionLabel trailing=`).
32. POLISH — kebab menu items ("Unblock / Kill") appear with no icons and
    uneven padding; use the DS `Menu`.

### Work bet create / knowledge create
33. POLISH — both create pages are a lone textarea on a vast empty canvas;
    the right rail holds one tiny card then nothing. Constrain the page
    width like the detail pages (max-w-[960px]) so the emptiness reads as
    margin, not as a broken layout.
34. INCON — "Untitled bet" / "Untitled" titles render in muted gray, reading
    disabled; an editable title should look editable (caret on focus,
    `pageTitleClassName` per the page-anatomy doc).

### Work task (`/work/bet/:id/task/:id`)
35. POLISH — OWNER stat cell renders blank when unassigned; show an
    `EmptyState`-style "Unassigned" placeholder.
36. POLISH — sessions score column ("0.75") is unexplained mono; label it
    ("score") or tooltip it.

### Routine (`/work/routine/:id`)
37. INCON — the form (inputs) and the read-only summary below it
    (AGENT / SCHEDULE / TRIGGER TYPE…) duplicate the same facts in two
    styles on one screen. Keep the form; drop or collapse the echo.

### Agent profile (`/agents/:id`)
38. POLISH — "Health warning — Required harness not available." banner has
    no icon and no action; AQ-017 wants icon + explanation + CTA
    ("Open Settings → Agent backends").
39. INCON — RECENT ACTIVITY table headers are sentence case while every
    other label on the page is caps; also duplicate identical rows
    ("Audit the current signup-to-activation path" ×2) suggest missing
    dedupe or missing distinguishing metadata (date).

### Conversations
40. POLISH — queue list is pinned to a ~800px column leaving a dead zone on
    the right at 1440px; center the content column like the work pages
    (max-w-[960px] mx-auto) or use the space for a preview pane.
41. POLISH — no date separators or day grouping in the thread view; long
    feeds blur together.

### Knowledge
42. POLISH — header carries its own Search field *and* the sidebar ⌘K search
    exists; two searches with different scopes confuse. Keep one (⌘K) or
    label the list one as "filter".
43. POLISH — triage rows' validate/reject/open are three bare icons; add
    visible labels on hover or tooltips (keyboard hint bar at the bottom is
    not discoverable by mouse).

### Artifact permalink
44. BUG-ish — HTML artifacts render "UNSUPPORTED BLOCK —
    PARSER-UNRECOGNISED" plus the raw HTML source as mono text. Either
    render the HTML in a sandboxed preview (the artifact kind *is* html) or
    show a designed `ErrorState` with "Open raw" — never a source dump.

### Settings
45. INCON — while settings is open the primary nav (Conversations/Work/
    Knowledge) disappears entirely; only the gear marks the way back. Keep
    the main nav visible above the settings nav (the shell has the room).
46. POLISH — "Save profile" disabled state is a muted lemon pill identical
    to create-page disabled primaries (see #20) — consistent at least, but
    the shared treatment needs fixing once.

### NotFound
47. POLISH — card hugs the top with a huge void below; vertically center it
    (error-states mockup shows a centered card).

## 5. Cross-cutting layout rhythm

48. INCON — content column strategy differs per page: centered 960px
    (WorkTeam/WorkBet), left-pinned ~800px (Conversations, Knowledge list),
    full-bleed form (Routine), centered narrow (create pages). Define one
    rule (e.g. "body content max-w-[960px] centered; lists may widen to
    1200") and apply it.
49. POLISH — several hairline separators stop mid-row (WorkTeam routines,
    WorkTask stat card) — hairlines should span their container or not
    exist.
50. POLISH — dark theme is consistent and warm (verified per screen); no
    dark-only defects found beyond the items above.

## 6. What holds up well (do not change)

- PageHeader/SectionLabel scaffold is used on every page; heading contract
  intact.
- StatusChip semantics in Settings match the documented color=meaning table.
- Hearth light/dark tokens, warm shadows, pill buttons, overlapping avatars
  all match the aesthetic law.
- Non-modal overlays (notifications, assistant) behave correctly (Escape,
  outside click).
- NotFound copy and actions are good; only placement nags.

---

**Suggested order:** #1–#3 (real bugs) → §2 leaks (cheap, high perceived
quality) → §3 unifications (composer, destructive button, breadcrumb,
ThreadRow in queue) → per-screen polish.
