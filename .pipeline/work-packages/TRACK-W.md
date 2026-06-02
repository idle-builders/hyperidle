# Track W: Hearth Design Fidelity

The existing screens are bad. Users hated Lucid, and what replaced it is unfinished — wireframes dressed in the right color palette. The 03-hearth.html reference defines three complete screen mockups (Thread List, Thread Detail, Bet Overview) and a full component library. The running app matches almost none of it at the screen level.

This track treats 03-hearth.html as the only truth. Every existing screen is challenged. Nothing is sacred. The designer creates the visual target in HTML (the design system's native design medium), then the builder makes the TSX match using the existing visual parity pipeline (`ds:sync`, pixelmatch, ≤5% diff gate). Changes flow from foundation primitives upward — fix a component's HTML, the builder fixes its TSX, and every page consuming that component inherits the fix.

**Scope rules (apply to every story in this track):**
- **03-hearth.html is the only truth.** The three screen mockups and every component in that file define what Hearth FEELS like. The existing TSX is not a starting point — it's a failed attempt.
- **Read ETHOS.md before starting.** Boil the lake — do this thoroughly. First principles above all — what should the user FEEL, not what does the codebase currently do. User sovereignty — surface decisions, don't bury them.
- **Challenge every line.** No reverence for what exists in the HTML files. Delete and redesign from the inspiration. Big change or fail completely.
- **Design before build.** The designer produces HTML files. The builder makes TSX match via `ds:sync`. The visual diff checker is the gate — not code review.
- **Changes trickle up.** Fix a Tier 0 primitive's HTML → builder fixes its TSX → every Tier 1/2/3 component and page consuming it inherits the improvement. The existing component architecture stays in place where possible — radical design, surgical implementation.

**Reference docs:** `packages/design-system/03-hearth.html` (THE inspiration), `ETHOS.md` (read first), `packages/design-system/PRINCIPLES.md`, `.claude/rules/visual-parity.md`, `.claude/rules/design-system.md`, `plans/hearth-fidelity/concept.md`.

---

### W1 — Design Every Screen from the Hearth Inspiration

**Workpackage.** As the founder, I want the designer to start from 03-hearth.html, internalize its feeling (warm, tactile, inviting, organic, human), and produce HTML reference files for every screen in the app in every meaningful state — ignoring what the existing TSX looks like today — so that there is a pixel-perfect visual target the builder can implement against using the design system's existing HTML→TSX parity pipeline.

The designer MUST read `ETHOS.md` before starting. First principles: what should a user opening this app for the first time FEEL? Not what does the code currently render. Boil the lake: every screen, every state, every detail. No shortcuts.

**Depends on.** None.

**Complexity.** L

**Acceptance criteria.**
- HTML files exist in `packages/design-system/html/` for every screen in every state:
  - **Conversations:** empty (no threads yet — warm, inviting, not a bare card), populated thread list (matching "Screen — Thread List" from 03-hearth.html: unread dots, overlapping avatars, message counts, timestamps), thread detail (matching "Screen — Thread Detail": 36px avatars, agent badges, action blocks, composer with pill send button).
  - **Work:** empty (no bets yet — encouraging, not barren), populated bet grid (matching "Screen — Bet Overview": 2-col cards with status dots, descriptions, progress bars, team avatar groups, budget badges), bet detail.
  - **Knowledge:** empty, populated (topic groups, knowledge rows), detail (body, backlinks).
  - **Settings:** profile, teams, appearance (theme only — no density), credentials, notifications. All using Hearth form primitives (Input, Toggle, Checkbox, Select) from 03-hearth.html.
  - **Setup/Onboarding:** a welcoming first-run experience that uses Hearth cards, inputs, and buttons. Not a debug form.
  - **Error states:** 404, API error, empty-but-healthy. Each designed with warmth — Hearth cards, icons, inviting copy. Not raw red text.
- Foundation primitive HTML files are created or rewritten for every primitive in the 03-hearth.html component library: Avatar, AvatarGroup, Button, Input, Select, Toggle, Checkbox, TabBar, Toast, Progress, Tooltip.
- Existing component HTML files (StatusChip, Tag, BetCard, ThreadRow, CommentRow, NavItem, Composer, SearchField, etc.) are reviewed against 03-hearth.html and rewritten where they diverge from the inspiration's feeling.
- The sidebar in every screen mockup matches 03-hearth.html: brand wordmark, bet items with colored status dots, team items, dividers, active state.
- All HTML files use `_tokens.css` and follow the existing HTML component conventions (data-component, data-tier, theme switcher).
- The density system does not exist in any mockup. One size per component. No compact/default/comfortable.
- All mockups have a working Light/Dark theme switcher.
- The designer has run `/design-critique` scoring on each screen and iterated until quality genuinely matches the 03-hearth.html inspiration. Not one round — as many as it takes.
- Realistic content in every mockup: real thread titles, real bet names, real knowledge items. No Lorem ipsum.
- `DESIGN.md` rewritten — captures the Hearth feeling: layered depth (warm shadows creating tangible 3D surfaces), beautiful openness (generous whitespace, cream canvas breathing), simplicity (focus on what matters, strip everything else). Not a token spreadsheet — a design manifesto that makes a reader understand what Hearth IS.
- `AESTHETICS.md` rewritten — rules that protect the WOW. Density references removed. New rules for depth, layering, warmth, tactile shadows, focus. The kind of doc where every rule makes you nod "yes, obviously."

**Validation scenarios.**
- Given the Thread List screen HTML is opened in a browser and compared side-by-side with the 03-hearth.html "Screen — Thread List", then they are unmistakably from the same design family — same visual quality, same information density, same warmth.
- Given the Setup screen HTML is shown to someone who has never seen the app, then it communicates "welcoming onboarding" not "configuration form."
- Given any error state HTML is shown, then it uses Hearth styling (cards, warm colors, helpful copy) — not unstyled text.
- Given the Bet Overview HTML is compared with the 03-hearth.html "Screen — Bet Overview", then bet cards have descriptions, progress bars, team avatars, and budget badges at the same quality level.

**Plan calls.** Run `/design` for each screen group. The designer must deeply internalize 03-hearth.html before starting — open it in a browser, study every component, understand the warmth, the spacing, the typography, the way status dots and badges carry meaning without structural borders. Then design each screen from that feeling, not from the existing TSX. Every round gets `/design-critique`. Iterate until it's genuinely good.

*Design system documentation rewrite:*
- `DESIGN.md` rewritten from scratch. Not a token inventory — a design manifesto. Captures the Hearth feeling: the beautiful openness, the 3D layering that makes surfaces feel tangible (warm shadows lifting cards off the cream canvas, surfaces at different depths), the simplicity and focus on what matters. The density system is gone from the docs. What remains is clarity about the ONE way each element looks and feels.
- `AESTHETICS.md` rewritten to match the new design reality. The rules should make a reader go "yes, obviously" — not feel like bureaucratic lint config. Strip density references (AQ-002, AQ-003, AQ-016, AQ-017). Add rules that protect the WOW: the layered depth, the warmth, the generous whitespace, the tactile card shadows.
- Both docs are written by the designer as part of the design process — they capture decisions AS they're made, not after. The docs are design artifacts, not afterthoughts.

**Contracts / constraints.**
- Screen HTML mockups go in `packages/design-system/html/screens/`. Component HTML files stay in `packages/design-system/html/`.
- Styles derive from 03-hearth.html and `_tokens.css` only. No invented tokens.
- The designer does NOT look at existing TSX pages. Start from the inspiration.
- Mockups must work as standalone HTML files openable in any browser.
- DESIGN.md and AESTHETICS.md are deliverables of W1, not W2. The builder reads them as spec.

**Out of scope.**
- TSX implementation (W2).
- Backend/API changes.
- Mobile/responsive layouts (desktop first).
- JavaScript interactivity in mockups (static visual states only).

**Effort.** L (~3-5d of design iteration)

---

### W2 — Build to Match: TSX Parity via the Design System Pipeline

**Workpackage.** As a user of HyperIdle, I want every screen to look and feel exactly like the W1 HTML mockups. The builder uses the design system's existing visual parity pipeline — `ds:sync` runs Playwright + pixelmatch to enforce ≤5% pixel diff between HTML and TSX — to make the running app match the designer's HTML. Changes flow from the bottom up: fix a foundation primitive's TSX, and every component and page consuming it inherits the improvement. The existing component architecture stays in place where possible — radical design, surgical implementation.

**Depends on.**
- W1 — HTML mockups must be designed, reviewed, iterated, and approved.

**Complexity.** L

**Acceptance criteria.**

*Density removal (infrastructure prerequisite):*
- Density system completely removed: `[data-density]` blocks in tokens.css, useDensity/useAutoDensity hooks, density lint rules, density-allowlist.json, density tests, viewer density toggle, Settings density toggle.
- `_tokens.css` synced to `tokens.css` — zero drift.
- `--easing-expressive` token added.
- Token values locked to the Hearth-intended sizes from 03-hearth.html (card padding 18px, avatar 36px, page gutter 24px, etc.).

*Foundation primitives (Tier 0 — new TSX matching W1 HTML):*
- Avatar, AvatarGroup, Button, Input, Select, Toast, TabBar, Toggle, Checkbox, Progress built as TSX in `packages/design-system/src/`.
- Each has `.stories.tsx`.
- `npm run ds:sync` passes ≤5% pixel diff against its W1 HTML reference for each.

*Existing component updates (Tier 1/2/3 — TSX matches updated W1 HTML):*
- Every component whose HTML was updated in W1 gets its TSX updated to match.
- Changes trickle up: fixing Avatar's TSX means CommentRow, ThreadRow, BetCard, Sidebar all inherit correct 36px avatars.
- Fixing Button's TSX means Composer, RichMessageCard, ErrorState all inherit correct pill buttons.
- `npm run ds:sync` passes for ALL components — new and existing.

*Page-level assembly:*
- Every page matches its W1 screen mockup. The builder uses existing page architecture where possible — swapping components, adjusting layout, using the updated primitives. Full rewrites only where the existing structure can't produce the mockup's layout.
- Empty states, error states, and onboarding match the W1 mockups.
- Sidebar matches W1: status dots, brand wordmark, dividers.

*Verification:*
- `npm run ds:sync` passes for all components (≤5% pixel diff).
- `npm run verify` passes (typecheck + lint + tests).
- Playwright screenshots of every screen in light and dark mode.
- Side-by-side visual comparison with W1 mockups confirms match.

**Validation scenarios.**
- Given `npm run ds:sync` runs, then every component (new and existing) passes the ≤5% pixel diff threshold against its HTML reference.
- Given the Conversations page renders with mock data, then a screenshot compared with the W1 Thread List mockup shows visual match.
- Given a new user hits the setup flow, then it matches the W1 onboarding mockup — warm and inviting.
- Given any error occurs, then the error presentation matches the W1 error state mockups.

**Plan calls.** Full architecture pass. Order: (1) density strip — mechanical sweep, unblocks everything; (2) foundation primitives bottom-up — Avatar first (most consumers), then Button, Input, the rest; (3) existing component TSX updates to pass ds:sync against updated HTML; (4) page-level assembly — use the trickle-up from component fixes, add page-level layout adjustments. The builder should understand the component dependency graph and work bottom-up so each fix cascades.

**Contracts / constraints.**
- `npm run ds:sync` is the acceptance gate. If HTML and TSX don't match within 5%, the TSX is wrong.
- HTML files are NEVER changed to match TSX. TSX matches them. (visual-parity.md rule)
- Existing component architecture (Tier 0→1→2→3 hierarchy, props interfaces, composition patterns) is preserved where it can produce the mockup's output. Rewrite only when the structure fundamentally can't.
- All doc updates (DESIGN.md, AESTHETICS.md, our-components.md) happen in this workpackage.

**Out of scope.**
- New features not in the W1 mockups.
- Backend API changes (mock data where APIs don't exist).
- Mobile/responsive layouts.

**Effort.** L (~5-8d)

---

### W3 — Screen Implementation Parity: Make TSX Match the Revised Mockups

**Workpackage.** As a user of HyperIdle, I want every screen in the running app to match the revised HTML mockups from the W3 design branch (`feat/W3-screen-design-improvements`). The mockups were redesigned with: consistent sidebar navigation, max-width bounding, E2E-essential actions, team-based sub-nav, knowledge scopes as arbitrary tags, flat chronological thread list, and two new screens (task detail, knowledge edit mode). The builder makes the TSX implementation match these mockups screen-by-screen.

**Depends on.**
- W2 — TSX primitives and density removal must be in place.
- W3 design branch merged (HTML mockups are the source of truth).

**Complexity.** L

**Reference mockups.** All in `packages/design-system/html/screens/`:

| Screen | Mockup file | New/Updated |
|--------|-------------|-------------|
| Conversations — thread list | `conversations-thread-list.html` | Updated |
| Conversations — thread detail | `conversations-thread-detail.html` | Updated |
| Conversations — empty | `conversations-empty.html` | Updated |
| Work — bet overview | `work-bet-overview.html` | Updated |
| Work — bet detail | `work-bet-detail.html` | Updated |
| Work — empty | `work-empty.html` | Updated |
| Work — task detail | `task-detail.html` | **New** |
| Knowledge — list | `knowledge-list.html` | Updated |
| Knowledge — detail | `knowledge-detail.html` | Updated |
| Knowledge — edit mode | `knowledge-edit.html` | **New** |
| Knowledge — empty | `knowledge-empty.html` | Updated |
| Settings | `settings.html` | Updated |
| Onboarding | `onboarding.html` | Updated |
| Error states | `error-states.html` | Unchanged (reference sheet) |

The design gap audit with all decisions is at `plans/W3/design-gap-audit.md`.

**Acceptance criteria.**

*Sidebar (cross-cutting — affects every page):*
- AC-1: Sidebar bottom strip has three elements: Search hint with ⌘K badge, user avatar (settings trigger on click), and Assistant/CoC button.
- AC-2: Work section sub-nav shows teams (from API), not status filters or bet names.
- AC-3: Knowledge section sub-nav has no sub-items (scopes are inline pills on the knowledge list page, not sidebar navigation).
- AC-4: Conversations section sub-nav shows recent threads as before.

*Conversations — Thread List:*
- AC-5: Thread list is a flat chronological list — no Active/Resolved section grouping.
- AC-6: Filter chips are toggle-style (Blocking, Unread) — independently toggleable, not mutually exclusive tabs.
- AC-7: Each thread row shows a "Blocking" badge when the thread has an unresolved review or agent-blocked state.
- AC-8: "New thread" button visible in header.

*Conversations — Thread Detail:*
- AC-9: At least one message contains an inline artifact card (artifact type label, title, preview content) — not just a plain action row.
- AC-10: "Dial in" button with live indicator visible in header when a session is active (hidden otherwise).
- AC-11: One agent message shows Approve/Reject verdict buttons.
- AC-12: Composer input and Send button are equal height (`align-items: stretch`).

*Work — Bet Overview:*
- AC-13: Status filter tabs (All/Active/Completed/Draft) are horizontal pills in the content header — not in the sidebar.
- AC-14: Team pill filters (from API teams) are in the content header.
- AC-15: Bet cards have no status dots — status badge only.
- AC-16: Bet cards show: title, description (3-4 lines), progress bar + percentage, avatar group, budget badge.
- AC-17: "New bet" button in header.
- AC-18: Bet grid max-width 960px, centered.

*Work — Bet Detail:*
- AC-19: "···" overflow action menu in header (Pause/Adjust appetite/Unblock/Kill).
- AC-20: Stat cards row: Progress %, Budget spent, Team.
- AC-21: "Pitch" section with Edit button.
- AC-22: Task rows: title, owner, status — no status dots, just badge. Rows are clickable (navigate to task detail).
- AC-23: Artifacts section (simple list of artifact rows below tasks).
- AC-24: Discussion section with composer + Send button.
- AC-25: Content max-width 800px, centered.

*Work — Task Detail (NEW screen):*
- AC-26: Route `/work/bet/:betId/task/:taskId` renders the task detail page.
- AC-27: Breadcrumb: Work / [Team] / [Bet] / [Task title].
- AC-28: Metadata strip: Owner (avatar + name), Status, Started, Cost, Session (Active/Completed + Dial in button if active).
- AC-29: Sessions section listing agent sessions for this task (title, agent, cost, tokens, status). Active sessions show "Dial in" button.
- AC-30: Discussion section (threaded messages + composer).
- AC-31: Artifacts section (list of artifacts produced by this task).
- AC-32: Content max-width 800px, centered.

*Knowledge — List:*
- AC-33: Scope filter pills inline above the list (arbitrary scope tags from data, not fixed Practices/Products/Factory).
- AC-34: Sort controls (Relevance/Recency/Frequency) visible.
- AC-35: Knowledge rows: title, preview, kind badge, status badge — no status dots.
- AC-36: "+ New" button in header.
- AC-37: Curated/Triage tab switching works.
- AC-38: Content max-width 800px, centered.

*Knowledge — Detail:*
- AC-39: "Edit" as primary button. "···" overflow menu for Flag/Archive/Change scope.
- AC-40: Two-column layout: body content + metadata aside (Kind, Status, Confidence, Last edited, Editor, Access count).
- AC-41: Backlinks card in aside.
- AC-42: Discussion thread section below the body content.
- AC-43: Content max-width 960px, centered.

*Knowledge — Edit Mode (NEW state):*
- AC-44: Clicking "Edit" transitions to edit mode: "Done" replaces "Edit", formatting toolbar appears (Bold/Italic/Heading/List/Code), body content gets editor border, save indicator shows (Saving.../Saved ✓).
- AC-45: Clicking "Done" returns to read mode.
- AC-46: Metadata aside stays read-only during editing.

*Settings:*
- AC-47: Stacked single-page layout (all sections visible, scrollable).
- AC-48: "Save profile" button text (not "Save changes").
- AC-49: "Org chart" section label (shows team rows with Edit buttons).
- AC-50: Theme selector as visual swatch cards (Light/Dark/System), not a `<select>`.
- AC-51: "Backend" section showing mode (Local/Shared).
- AC-52: Content max-width 680px, centered.

*Onboarding:*
- AC-53: Card container with shadow, brand + tagline, illustration.
- AC-54: Three fields: Your name (required), Anthropic API key (required), Project folder (optional).
- AC-55: "Start HyperIdle" button — disabled until name + API key filled.
- AC-56: No step indicator, no email field, no team name field.

*All screens:*
- AC-57: All content areas are centered (max-width + `margin: 0 auto`).
- AC-58: `npm run verify` passes (typecheck + lint + tests).
- AC-59: All existing E2E tests pass or are updated to match the new screen structure.

**Validation scenarios.**
- Given the thread list renders, then threads appear in chronological order with no section headers, and the "Blocking" badge appears on threads with unresolved reviews.
- Given the bet overview renders for a team, then the sidebar shows team names and the content header shows status filter tabs + team pills.
- Given a user clicks a task row on bet detail, then they navigate to the task detail page showing sessions, discussion, and artifacts.
- Given a user clicks "Edit" on knowledge detail, then the page transitions to edit mode with toolbar, editor border, and save indicator.
- Given settings opens, then all sections are visible stacked vertically with content centered at 680px max-width.

**Contracts / constraints.**
- HTML mockups on `feat/W3-screen-design-improvements` are the source of truth. TSX matches them.
- New task detail route and knowledge edit mode are net-new implementations guided by the mockups.
- Existing E2E tests that assert on removed elements (section headers, status dots, density controls) must be updated.
- Sidebar changes are cross-cutting — test all pages after sidebar modifications.

**Out of scope.**
- Session dial-in view (depends on harness implementation).
- RecipientPicker design (figured out during development).
- Block ref embeds (designed during development).
- Mobile/responsive layouts.

**Effort.** L (~5-8d)
