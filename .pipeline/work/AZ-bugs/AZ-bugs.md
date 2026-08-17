# Track AZ — UI/UX bug list

Flat, chewable list. **No pipeline ceremony.** One agent picks the next unchecked item, fixes it, proves it, ticks it, moves on. Batch several per session where they touch the same file.

**Rules for working this list**
- Fix in list order within a batch; batches are ordered by severity.
- **Prove it in the running app**, not by reading source. Seed the demo world (`npm run setup -- --demo`), then look at the thing you changed.
- `npm run verify` green before you commit. One commit per batch is fine; one per bug is fine.
- Tick the box and add nothing else. If a bug turns out to need a decision, stop and say so — do not decide it inside a bug fix.
- If an item is already fixed when you get to it, tick it and note "already fixed".

**Not in this list:** anything owned by a work package in `AZ.md` (page scaffold + scroll, page geometry, the visual system's closed sets, open/edit rule, artifact rendering, sidebar composition). Those need a decision first. Items below that touch the same surfaces are still safe to do — they are defects, not design choices.

Evidence for every item: `plans/reviews/ui-audit-consolidated.md`.

---

## Batch A — dead or lying interactions

Highest severity. A user hits these and the product does nothing or the wrong thing.

- [ ] **UI-001** ⌘K search panel makes itself inert — *any route, press ⌘K* · Now: `#root` gets `inert`, hit-test at the input returns `<body>`, typing leaves the value empty, Escape and scrim-click dead; only a second ⌘K closes it · Done: panel + scrim render outside the inerted region (portal into `#overlay-root` as `Dialog.tsx:288` does); typing filters, Enter opens a result, Escape and outside-click close · **S**
- [ ] **UI-002** Mobile nav drawer makes itself inert — *375px viewport, open the drawer* · Now: same self-inerting shape; no drawer item can be tapped, so a phone has no navigation at all · Done: drawer items activate and navigate; the document-level Escape workaround at `AppShell.tsx:140-153` can be removed · **S** · same fix as UI-001
- [ ] **UI-003** Conversation stream renders newest-first — *any thread* · Now: seed order is 3d → 2d → 1d → 5h → 4h → 3h; the page paints 3h (newest) at the top. Composer is at the bottom, so you write at the bottom and your message appears at the top · Done: oldest at top, newest directly above the composer; the view opens scrolled to the newest message · **S**
- [ ] **UI-004** Blocking decision card cannot be answered — *thread `demo-thread-pricing-blocked`* · Now: the three options (10% / 15% / 20%) are plain `<li>`, no `button`, no `role`, `cursor: auto`; clicking does nothing, so a founder cannot answer an agent's blocking question · Done: options are real controls, keyboard-reachable; choosing one records the answer and the thread reflects it · **M**
- [ ] **UI-005** "Open review" silently does nothing — *thread `demo-thread-pricing-review`* · Now: full-contrast primary, not disabled, click produces no navigation and no message (`open-handler.ts:78` documents the no-op) · Done: when the destination can't be resolved the action is not rendered as available; when it can, it opens the review · **S**
- [ ] **UI-006** Conversation kebab injects unrelated fixture attachments — *thread header → "Conversation actions"* · Now: adds `auth/passkey.ts — TS · 3 lines` and `auth-flow.png — 82 KB` to the composer; demo content reachable from a normal control · Done: no fixture content in a normal session; the control's effect is discoverable from its label · **S**
- [ ] **UI-007** Scope filter pill is disabled but looks and behaves enabled — *`/knowledge/new`, "Team"* · Now: `disabled` yet styled identically to its siblings and keeps `cursor: pointer` · Done: reads as unavailable and does not respond · **S**

## Batch B — honest states

`empty ≠ loading ≠ failed`. The design system already ships `EmptyState` and `ErrorState`; this is adoption, not invention.

- [x] **UI-010** A 500 renders as "your knowledge base is empty" — *`/knowledge` with the API failing* · Now: confident empty state + "Create first item", and the header toolbar vanishes · Done: states the load failed and offers retry · **S**
- [x] **UI-011** Sidebar says "No teams yet" while still loading · Done: loading state, not an empty claim · **S**
- [x] **UI-012** Sidebar says "No knowledge yet" while still loading · **S**
- [x] **UI-013** Sidebar says "No threads yet" after a 429 · **S**
- [x] **UI-014** Agent profile error shows a raw status code — *"Agent profile fetch failed: 429"* · Done: user-facing sentence, no status code, with retry · **S**
- [x] **UI-015** No retry affordance on any failed surface · Done: retry re-issues the request and renders in place, no page reload · **S**
- [x] **UI-016** Skeleton doesn't resemble the content it replaces — *`/work/team/:id`* · Now: 16 identical bars stand in for 2 cards + 3 structured sections, inset 20px differently, so content jumps on arrival · Done: placeholder occupies the same regions as the real content · **S**
- [x] **UI-017** Page title shows placeholder "Team" then swaps to the real name · Done: title skeleton, or the real name on first paint · **S**
- [x] **UI-018** Empty section renders as a bare label and rule — *task detail, ARTIFACTS* · Done: `EmptyState compact` · **S**
- [x] **UI-019** Task detail DISCUSSION stacks two horizontal rules with a phantom gap · **S**
- [x] **UI-020** OWNER stat cell renders blank when unassigned · Done: "Unassigned" · **S**
- [x] **UI-021** Four different empty-state treatments across sections — *WorkTask ARTIFACTS / DISCUSSION, KnowledgeDetail BACKLINKS, knowledge list* · Done: all four use `EmptyState compact` · **S**

## Batch C — machine data out of the interface

An identifier, enum, ISO string or raw markup must never be the thing a user reads.

- [x] **UI-030** Thread title is the host id — *`Conversations.tsx:442` falls back to `hostId`; the lookup always misses for teams* · Done: resolves to the team/task name · **M**
- [x] **UI-031** Team feed shows the raw id twice — eyebrow *and* `<h1>` both read `demo-team-acme` · **S** — already fixed on main
- [x] **UI-032** In-thread artifact chip shows a raw artifact id · **S**
- [x] **UI-033** Artifact permalink prints the artifact id top-right · **S**
- [x] **UI-034** Settings → Org chart rows subtitle with the raw team id · **S**
- [x] **UI-035** Task sessions subtitle with the raw agent id · **S**
- [x] **UI-036** Sessions are named "Session 1 / 2 / 3" · Done: named by date or first prompt · **S**
- [x] **UI-037** Knowledge subtitle prints a raw ISO string (`2026-08-11T13:07:38.072Z`) · **S**
- [x] **UI-038** Knowledge subtitle reads "by unknown" · Done: resolve the editor, or drop the clause · **S**
- [x] **UI-039** Knowledge Editor field shows a truncated raw id (`seed-age…`) · **S**
- [x] **UI-040** Agent profile shows raw role enum (`product_manager`) — the setup flow already has display labels · **S**
- [x] **UI-041** Agent profile shows raw harness enum (`builtin`) · **S**
- [x] **UI-042** Settings agent rows subtitle with raw role slugs (`qa_engineer`) · **S**
- [x] **UI-043** `0mo` renders at 28–30 days — *`time.ts:82`: switches to months at `FOUR_WEEKS_MS` (28d) but divides by `MONTH_MS` (30d)* · Done: no zero-quantity relative age at any age · **S**
- [x] **UI-044** `1 items` — hardcoded plural at `KnowledgeTopicGroup.tsx:73`, 5× on one screen · **S**
- [x] **UI-045** Knowledge group headers are slugs (`PRODUCT-IDENTITY`, `ARCHITECTURE`) · Done: "Product identity" · **S**
- [x] **UI-046** Raw markdown in list previews (`# Pulse…`, `- **Starter** — 5 dashboards`) · **S**
- [x] **UI-047** `Access count` exposes internal telemetry as user metadata · Done: remove · **S**
- [x] **UI-048** "Add Edge" is graph-theory jargon · Done: user-facing verb · **S**
- [x] **UI-049** The same instant formatted two ways 300px apart — knowledge header vs metadata panel · **S**

## Batch D — adopt the primitives that already exist

`ThreadRow`, `Composer`, `KpiStat`, `EmptyState`, `Menu` and `status-mapping.ts` all ship in the design system and are bypassed. This batch is deletion, not construction.

- [ ] **UI-060** `Row`'s button branch has no `w-full` — *`Row.tsx:226-238`* · Now: interactive rows shrink-wrap (339 / 352 / 375px inside a 912px container) with ragged separators; the `li` branch got the fix, the `button` branch never did · Done: rows fill their container, separators span the full row · **S** · *do this first — several rows below depend on it*
- [ ] **UI-061** Conversation queue is hand-rolled `li > button` while global search renders the same threads through `ThreadRow` · Done: queue uses `ThreadRow` with avatar, snippet and status · **M**
- [ ] **UI-062** Three message composers — conversations (textarea + attach + icon send), task/knowledge/artifact (bare input + text Send), and the DS `Composer` used only in review threads · Done: DS `Composer` everywhere, no affordance lost · **M**
- [ ] **UI-063** Composer covers the last message — desktop · Done: last message fully readable above it · **S**
- [ ] **UI-064** Composer sits on top of the review card at 375px, cutting "Open review" in half · **S**
- [ ] **UI-065** Statistic cards are hand-rolled and ~60% empty air — `KpiStat` exists · **S**
- [ ] **UI-066** Two destructive button styles on one page — Settings Org chart filled red, Settings Agents outline red · Done: one destructive variant app-wide · **S**
- [ ] **UI-067** Disabled primaries are `opacity: 0.5` — still visually dominant, label drops to ~3:1 · Done: DS `Button` disabled treatment · **S**
- [ ] **UI-068** Bet page renders **two** `<h1>` — violates the documented one-per-page contract · **S**
- [ ] **UI-069** Artifact permalink, `/setup` and `/settings` render **zero** `<h1>` and no `PageHeader` · **M**
- [ ] **UI-070** Knowledge `<h1>` reads `Knowledge BaseKnowledge` — two text nodes concatenated · **S**
- [ ] **UI-071** Bet PITCH section repeats the page title as a heading directly beneath it · **S**
- [ ] **UI-072** Agent profile "Recent Activity" shows duplicate identical rows · **S**
- [ ] **UI-073** Agent profile "Recent Activity" is the only real table in the app · Done: shared list primitive, or keep the table and justify it in a `@lore` · **S**
- [ ] **UI-074** Bet kebab menu items have no icons and uneven padding — DS `Menu` exists · **S**

## Batch E — pointer, links and focus

Cheapest batch, largest effect on whether the product feels real.

- [ ] **UI-080** The app renders **zero** `<a href>` — every navigation is a button plus a programmatic call, so no new tab, no ⌘-click, no copy link, no URL preview · Done: anything that changes the address is a link; controls that act without navigating stay buttons · **M**
- [ ] **UI-081** 11 of 18 interactive elements report `cursor: default`, including all primary navigation · **S**
- [ ] **UI-082** Conversation queue rows have no hover response at all — background unchanged before and after · **S**
- [ ] **UI-083** Focus ring on a sidebar nav item overlaps the item below it · Done: offset · **S**
- [ ] **UI-084** Tab order starts in sidebar chrome; four tabs to reach content, no skip link · **S**
- [ ] **UI-085** Sidebar secondary list truncates to ~14 characters with no `title` or tooltip · **S**
- [ ] **UI-086** Notification popover truncates titles to ~18 characters inside a panel with room to be wider · **S**
- [ ] **UI-087** Notification popover covers its own trigger · **S**
- [ ] **UI-088** Notification row actions appear on only one of two rows · **S**
- [ ] **UI-089** Unread indicator uses `--status-error` red — unread is not an error · **S**

## Batch F — copy and formatting

- [x] **UI-100** Excerpts clip mid-word with no ellipsis — *knowledge list: "users respond to vi", "6 or 8 days depen"* · **S**
- [x] **UI-101** Truncation is inconsistent within one list — one row gets an ellipsis, its neighbours are hard-cut · **S**
- [x] **UI-102** Button label casing unsystematic — `+ New bet`, `+ Add agent`, `+ Add Edge`, `New thread`, `Create first item`, `Customize`, `Edit in Settings` · **S**
- [x] **UI-103** Field labels split between caps micro-labels (NAME / PROMPT / AUTONOMY) and sentence case ("Your name") · **S**
- [x] **UI-104** Message timestamps repeat on every message with no grouping and no day separators — six consecutive "3:07 PM" · **S**
- [ ] **UI-105** Agent profile health-warning banner has no icon and no action · Done: icon + a route to fix it · **S**
- [x] **UI-106** Session score column (`0.75`) is unexplained mono · Done: label it · **S**
- [x] **UI-107** Editable titles render in muted grey and read as disabled — "Untitled bet", "Untitled" · Done: reads editable, caret on focus · **S**
- [x] **UI-108** Unknown-artifact state is a shouty uppercase machine string with no explanation and no route to the source · **S**
- [ ] **UI-109** Setup illustration is three grey skeleton-cards — reads as content that failed to load · Done: remove or replace · **S**
- [ ] **UI-110** Setup shows four disabled harness rows ("Install to use") occupying more space than the one usable option · **S**

## Batch G — layout defects

Placement bugs, not design choices. Anything requiring a *decision* about layout belongs to a work package.

- [ ] **UI-120** Delete the onboarding coach-mark banners entirely — *3 surfaces: team, bet, thread* · Founder ruling 2026-08-11: useless, not to be relocated · Done: component and all usages removed · **S**
- [ ] **UI-121** "Add knowledge" pill floats alone above the bet's stat cards with no section context · **S**
- [ ] **UI-122** Settings rows clip their own container — white corner notches where the card behind the agent list peeks past the rows · **S**
- [ ] **UI-123** Opening Settings removes the primary navigation entirely, leaving one unlabelled gear as the way back · **S**
- [ ] **UI-124** Knowledge triage action icons (✓ ✕ →) wrap below the excerpt, unlabelled, no tooltips; row heights vary 69–78px · **S**
- [ ] **UI-125** Keyboard hint bar floats at the end of the list instead of being pinned, and is undiscoverable by mouse · **S**
- [ ] **UI-126** Two searches on one screen with different scopes — sidebar ⌘K and the knowledge page field · Done: label the page one "Filter", or remove it · **S**
- [ ] **UI-127** Create pages are a lone textarea on a vast empty canvas with one small right-rail card · **S**
- [ ] **UI-128** NotFound card is top-anchored with ~560px of void beneath · Done: optically centred · **S**
- [ ] **UI-129** Agent-profile error card is left-anchored in a 440px box — a second, different error layout · **S**
- [ ] **UI-130** Agent profile key-value rows stretch full width — label at x=260, value at x=690, 400px of nothing between; the two columns don't align to each other · **S**
- [ ] **UI-131** Routine detail duplicates itself — an editable form above a read-only echo of the same facts, with `SCHEDULE` appearing twice meaning two different things · **S**
- [ ] **UI-132** `/work/routine/:id` renders two headers — `PageHeader` plus a strip repeating name + chip + Save (`WorkRoutine.tsx:111`) · **S**
- [ ] **UI-133** Routine detail panel has two header rows — a floating ✕/expand pair above the Cancel/Save pair · **S**
- [ ] **UI-134** "Silent — don't post on each run" uses a circular checkbox — a circle means radio · **S**
- [ ] **UI-135** Native `<select>` chrome in the routine panel and setup flow · **S**
- [ ] **UI-136** Setup shows the browser's blue focus ring and a blue OS radio — the only cold colour in the app, on the first screen a user ever sees · **S**
- [ ] **UI-137** Setup's selected harness row has no selected treatment beyond the native radio dot · **S**
- [ ] **UI-138** Assistant overlay has no composer — you cannot reply to the assistant · **M**
- [ ] **UI-139** Assistant overlay clips mid-sentence at the bottom with no scroll indicator · **S**
- [ ] **UI-140** Assistant overlay has two stacked headers both titled "Assistant" and two identical "F" avatars · **S**
- [ ] **UI-141** Assistant overlay hangs over the shell's rounded card edge · **S**
- [ ] **UI-142** Search palette scrim covers only the content pane, leaving the sidebar and its own search field lit · **S**
- [ ] **UI-143** Search palette shows a stray `K` chip where `⌘K` belongs · **S**
- [ ] **UI-144** Mobile duplicates the page title — top bar and page header both say "Conversations", 60px apart · **S**
- [ ] **UI-145** Mobile thread top bar still says "Conversations", so the thread loses its identity · **S**
- [ ] **UI-146** All five team agents share "AC" avatar initials — derived from the team name, not the agent · **S**
- [ ] **UI-147** Avatar status dot is clipped by the avatar's own edge · **S**
- [ ] **UI-148** Overlapping avatar stacks clip their initials in every thread header · **S**
- [ ] **UI-149** Team-page artifacts list has no columns and no dividers; two title runs collide on one line and a long title wraps into the next row · **M**
- [ ] **UI-150** Curated knowledge shows an identical `ACTIVE` chip on 100% of rows — zero information · Done: remove it · **S**

## Batch H — theme

- [ ] **UI-160** Dark-mode borders dissolve — `--border-subtle` sits 8.9 L\* from the card surface in light but only **2.0 L\*** in dark; the surface ladder itself is fine (5.3 vs 5.2 L\*) · Done: dark border values separate at parity with light; fix in theme tokens, not components · **S**
- [ ] **UI-161** `--text-tertiary` (~3:1 in light) is documented as decorative-only but carries real data — every timestamp in the conversation queue and knowledge list, and the routine schedule text · **S**

## Batch I — repo hygiene

Not user-visible, but both actively mislead an agent working this list.

- [ ] **UI-170** `layers/core-ui/src/layouts/AppShell.tsx` is detected as binary (`file` reports `data`) — a literal control byte at line 92 inside a regex that rejects control characters. grep, ripgrep and code search silently skip the file, so searches into it return false negatives · Done: escape sequences instead of literal bytes; `file` reports text · **S**
- [ ] **UI-171** `.claude/rules/frontend.md` — a *binding* rule slot — still specifies a "forest green accent". Crème Lemon replaced it with lemon (fill) and cocoa (text); `tokens.css` is the truth · Done: rule file matches the shipped tokens · **S**
