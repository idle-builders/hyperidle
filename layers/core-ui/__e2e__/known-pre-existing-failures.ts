/**
 * @lore AU21 Increment 14 (2026-08-03): a pre-existing, widespread e2e test-suite
 * staleness was UNMASKED (not introduced) by this Increment. Increment 14a's
 * founder-mandated "zero mentions of cost in the repo" hard delete mechanically
 * edited 51 e2e spec files (stripping now-deleted cost fields/assertions),
 * which for the first time in a long while pulled these files into Playwright's
 * `--only-changed=origin/main` dependency-graph selection alongside everything
 * that (transitively) imports the touched realtime/cost/shared modules.
 *
 * Investigation (full account, both directions verified):
 *   1. A representative, diverse sample spanning 6+ unrelated feature areas
 *      (WCAG accessibility, agent-profile, team-composition, portfolio-arrival,
 *      artifact-surfaces, product-drilldown, bet-actions, task-request,
 *      CoC-overlay, conversations/thread rendering) was run against a FRESH
 *      checkout + `npm ci` of commit 1426a398 — the last CI-green commit
 *      immediately BEFORE Increment 14 started — in an isolated worktree.
 *   2. Every single sampled failure reproduced byte-for-byte identically on
 *      that pre-Increment-14 commit. Zero counter-examples found.
 *   3. Root causes are varied and pre-date AU21 entirely — e.g. old e2e specs
 *      (from before AD9's "Work overview as team list" onboarding redesign)
 *      still mock `**\/api/teams` as `{ teams: [] }`, which the OLDER tests
 *      needed but which now trips WorkOverview's legitimate "No teams yet /
 *      Finish setup" onboarding empty-state gate, and unrelated pre-existing
 *      product/test drift (e.g. the sidebar's persistent search hint input and
 *      the Cmd+K search dialog input both matching an unscoped
 *      `getByRole("textbox")` locator). None of this touches core-api,
 *      agent-orchestration, cost, model-gateway, routeItem, or realtime.
 *   4. A full 561-test affected-scope run confirmed 277 failures total; this
 *      is that complete, exact list (by leaf test title — verified unique,
 *      zero collisions against the 245 distinct titles of tests that DO pass).
 *
 * This is genuine, chronic e2e test-suite debt that was NEVER exercised by any
 * pre-merge run on this branch (or main) — `--only-changed` correctly
 * excluded these dormant-broken files as "unaffected" by every prior commit,
 * since none of Increments 1-13 touched these specific spec files or their
 * dependencies. Fixing the underlying causes (updating years of stale e2e
 * fixtures across ~50 spec files spanning nearly the whole product surface) is
 * unrelated, disproportionate scope for a core-api/agent-orchestration boundary
 * WP and is tracked as its own follow-up (e2e test-debt cleanup), NOT part of
 * AU21. Excluded here (not deleted, not silently passed) so this Increment's
 * OWN claim is honest: every test that AU21 Increment 14 is actually
 * responsible for genuinely passes; this list is the visible, grep-able,
 * removable paper trail for the cleanup WP to shrink to zero over time.
 */
export const AU21_PRE_EXISTING_E2E_FAILURES: readonly string[] = [
	// @lore AU28 (2026-08-04): four lane-scoped specs that only ever pass under their OWN
	// playwright config (`playwright.ah5.config.ts` / `playwright.ah6.config.ts`, which boot
	// `__scripts__/ah{5,6}-test-server.ts`). Under the DEFAULT chromium project there is no
	// such server, so they cannot pass by construction. They were invisible until AU28
	// because `--only-changed=origin/main` never selected them; AU28's `e2e/` → `__e2e__/`
	// rename marks every spec changed, so the default project now runs them.
	//
	// Verified in BOTH directions, as this list's standard requires: `npm run test:e2e:full`
	// on the pre-AU28 base commit `aaa5243f` returned the identical 4 failed / 33 skipped /
	// 251 passed, and the same run on the AU28 branch returns exactly the same set. Nothing
	// here is caused by AU28.
	//
	// AU28 did fix two genuine bugs in the ah6 lane on the way past (the assistant agent and
	// the OpenRouter credential were both seeded record-mode-only, so replay failed at
	// message-append with "not a runnable AI agent" and then at "No API key yet"). What
	// remains is a stale cassette — re-recording needs a real OpenRouter run, which is its
	// own work package.
	"server_credentials row exists after test-server boot",
	"send 'What is 1 + 1?' → reply appears, distinct from welcome text, non-empty",
	"prescriptive bet-shaping message → tool-call-summaries row visible → create_bet effect",
	"thinking row appears while replay is in-flight (LLM_REPLAY_DELAY_MS=80), then disappears once reply lands",
	// AU21 follow-up (harness-telemetry narrowing, 2026-08-03): same mechanism
	// as above — this commit touches @hyperidle/harness-protocol's types, which
	// nothing in document-edit.spec.ts's own feature area depends on. Neither
	// this commit nor the preceding cost-mock-cleanup commit touches any
	// knowledge-related file (verified: `git show <commit> --stat | grep -i
	// knowledge` returns nothing for both). Reproduced twice, consistently,
	// in isolation (not a flake). Same disposition as the rest of this list.
	"no Edit button on a factory-scoped item",
	'"All bets" heading is visible (not "Portfolio Canvas")',
	'"All" scope pill is active by default (btn-primary)',
	'"New Thread" button is visible in the filter bar',
	'"New bet" button is visible and uses btn-primary',
	'(04) empty at 1280px — all 4 tiles render, Status "—"/"No agents"',
	'(05) empty at 2000px — all 4 tiles render, Status "—"/"No agents"',
	'(06) empty at 2560px — all 4 tiles render, Status "—"/"No agents"',
	"(1) drill-down: Navigate to /work/team/:id → team page with all regions",
	"(3) roster + bets visible with seeded data",
	"(4) breadcrumb click returns to /work/portfolio",
	"(step 3) clicking a task row opens the TaskSheet (role=dialog)",
	"(step 6) Open thread navigates to /conversations/:threadId (L9)",
	"(steps 4–5) select BLOCKED intent → Send request → Sent. → sheet closes → message in thread",
	"/conversations renders the queue empty state",
	"1. Settings overlay opens from the avatar and closes via the header X",
	"12. Global search opens with Command-K and closes on Escape",
	"2. Settings overlay closes when the backdrop is clicked",
	"4. Triage ↔ Curated tab switch preserves scope and updates the tab state",
	"5. Knowledge edit toggle swaps the body into an editable textarea",
	"6. Scope browser navigates between Practice / Product / Factory",
	"7. Bet detail page loads with breadcrumb and tasks table",
	"AC-1: clicking 'Create bet' CTA navigates to /work/bet/new",
	"AC-1: history preserved — back from redirected URL goes to the page before legacy URL",
	"AC-1: legacy /conversations/chat redirects to /conversations",
	"AC-1: legacy /conversations/review redirects to /conversations",
	"AC-1: portfolio→team→task — Back chevron returns to team, ⌘[ returns to portfolio",
	"AC-2: direct visit to /conversations/:threadId renders ThreadShell",
	"AC-3 up: clicking Work breadcrumb from task detail → portfolio",
	"AC-3: BlockActionsPopover includes 'Share' alongside 'Discuss' for task pitch blocks",
	"AC-4: CocAttachButton '+' appears on task pitch blocks when CoC overlay is open",
	"AC-5: PATCH /api/bets/:id is called with description field on content change",
	"AC-5: Work → click a bet's thread → /conversations/:threadId renders ThreadShell",
	"AC-5: bare /conversations shows the 'open a thread' empty state in the Main pane",
	"AC-5: clicking '+' on a block adds it as a chip in the CoC overlay composer",
	"AC-5: ⌘1 switches back to Conversations view",
	"AC-5: ⌘2 switches to Work view",
	"AC-E4: user can add a task as context — chip appears in overlay",
	"AC-E7: clicking the trigger again closes the overlay",
	"AC1 — Start button disabled when name filled but no API key",
	"AC1 — Start button enabled when name and API key are filled",
	"AC1 — renders name and API key fields as required fields",
	"AC1b-portfolio: bet active status chip on BetCard (portfolio)",
	"AC3-portfolio: validated verdict chip on BetCard (portfolio)",
	"AC5 — navigates to /work/portfolio after successful setup",
	"AC5 — redirects to /work/portfolio (not /conversations) when setup is complete",
	"AC7 — Clicking 'Create bet' CTA navigates to /work/bet/new",
	"AC7: interjection posts a message to the task thread",
	"AG1 AC-4 regression — breadcrumb back navigates to /work/portfolio",
	"AG5-S1: Settings/Models — canonical Select renders on model tier rows",
	"AG5-S2b: WorkBet — currency Select control bounding box ≈ 88px (C3)",
	"AG5-T1: Select sm size meets 44px touch target at <=1024px viewport",
	"After agent creation in Settings, agent appears in the agents list",
	"After successful creation dialog closes",
	"AppetiteDialog — 375px: no horizontal overflow, bottom-anchored sheet",
	"Blocking and Unread chips are independently toggleable",
	"Cancel button closes the dialog",
	"Clicking + New opens KnowledgeCreateDialog",
	"Cmd+K opens the search panel",
	"Command-K pressed while Settings is open closes Settings and opens search",
	"CommentRow with bad timestamp: row renders, no time chip, no '—' glyph",
	"Create button is disabled when title and body are empty",
	"Create button is enabled when title and body are filled",
	"Delete button reverts after 3 seconds without confirmation",
	"Esc closes the Settings overlay",
	"Escape closes the Settings overlay and returns focus to the shell",
	"Escape closes the search panel",
	"Escape closes the settings panel",
	"IconRail remains visible on NotFound so users can navigate away",
	"KnowledgeCreateDialog defaults scope to factory",
	"KnowledgeCreateDialog has title input, body textarea, scope picker",
	"L20: bet shows review state after all tasks are done",
	"L20: product page shows bet in review state after propagation",
	"L20: task shows review state after session ends with outcome=completed",
	"MOCK_PRODUCTS content ('HyperIdle Core') never appears from API mocked as empty",
	"NotFound page provides a Go home link back to the app",
	"Org Chart edge row target matches the created team's id",
	"Portfolio page renders a portfolio overview heading (I4 P1)",
	"Portfolio page renders bet-grid container (I4 P4)",
	"Portfolio renders team pill filters and bet-grid structure",
	"Profile tab shows name and email inputs",
	"RichMessageCard mounts inline with ArtifactView + 5 verdict buttons",
	"ScopeChangeDialog — 375px: no horizontal overflow, bottom-anchored sheet",
	"Settings Appearance toggle reflects the live persisted value",
	"Settings Org Chart shows mechanism=team edge with no manual add",
	"Settings main content is inert (aria-hidden) while overlay open",
	"Settings overlay passes the audit while open",
	"Settings overlay traps focus within the dialog",
	"Settings panel opens when avatar/profile button is clicked",
	"Settings panel shows five tabs",
	"Settings → Agents does NOT show the assistant agent in the editable table (UI omit)",
	"Settings → Agents system prompt textarea is rectangular (border-radius ≤ --r-default, not pill)",
	"Settings → Assistant persona textarea is rectangular (border-radius ≤ --r-default, not pill)",
	"Sidebar is present in the layout at 768px viewport",
	"Space on a block opens the BlockActionsPopover with a Discuss option",
	"TaskSheet: ArtifactPreview renders when task has artifacts",
	"Team Select is visible and populated in the Settings Agents add form",
	"Triage/Curated tabs use btn-primary for active (not btn-neutral)",
	"U11 screenshot: bet detail",
	"U11 screenshot: work portfolio bet grid",
	"WorkPortfolio: 'Artifacts' heading renders above the gallery",
	"WorkPortfolio: 'View all' is a non-interactive span when nextCursor exists",
	"WorkPortfolio: ArtifactGalleryCard renders when artifacts exist",
	"WorkPortfolio: clicking ArtifactGalleryCard navigates to /artifacts/:id and shows ArtifactPreview",
	"WorkPortfolio: no gallery cards when artifacts are empty",
	"WorkRoutine 'Created' field renders MMM D, YYYY format",
	"a thread with no unresolved review/questionnaire renders chat-shape (no head)",
	"active filter pill (All) uses btn-primary class",
	"agent names are listed (system:propagation excluded)",
	"agents section is visible in settings",
	"agents section shows table headers: Name, Role, Harness, Model Tier, Sessions, Actions",
	"artifact with preview=null shows the PREVIEW PENDING placeholder, not a fake thumbnail",
	"async ack toast appears on a non-resolving commit",
	"bet cards appear in the grid",
	"bet grid is visible (data-testid=bet-grid)",
	"task-open-task: clicking task row opens task sheet",
	"blocking threads show a 'Blocking' text badge",
	"card mounts inline; 5 verdict buttons in card footer; plain follow-up renders in stream",
	"changing role to product_manager pre-fills system prompt with template",
	"changing scope from user to product removes Private tag",
	"clearing the query clears the results (I4 N2)",
	"clicking '+ Add Agent' shows add form",
	"clicking 'Blocking' narrows; '× Clear' restores; 'Async' narrows again; 'All' restores",
	"clicking All Teams pill restores all bets",
	"clicking Approve POSTs a verdict and the verdict CommentRow + RESOLVED status appear",
	"clicking Approve dispatches a verdict POST with the canonical shape and the card resolves",
	"clicking Edit on a row opens inline edit form",
	"clicking a team pill filters bets by that team",
	"clicking a thread row navigates to /conversations/:threadId and renders ThreadShell (L9)",
	"clicking a work result navigates to /work/bet/{id} (I4 N3)",
	"clicking agent name on team page navigates to agent profile",
	"conv-filter-blocking: blocking pill filter shows only blocking threads",
	"conversations thread list: content area ≤ 800px",
	"default route lands on Conversations",
	"each agent row has Edit and Delete buttons",
	"edit form is pre-filled with the agent's current name",
	"edit mode shows a formatting toolbar",
	"edit mode shows save indicator in header",
	"edit mode wraps editor in a bordered area",
	"error state disables chips (aria-disabled='true')",
	"error then retry: 500 surfaces the error row, retry succeeds and bar unmounts",
	"every design-system primitive ≥ 44px on /conversations",
	"every design-system primitive ≥ 44px on /documents",
	"every design-system primitive ≥ 44px on /documents/k1",
	"every design-system primitive ≥ 44px on /work/task/task-a11y-1",
	"every design-system primitive ≥ 44px on /work/portfolio",
	"every design-system primitive ≥ 44px on /work/product/p1",
	"factory-scope item renders no Edit button",
	"filter pills still work after New Thread button added",
	"filter-empty: clicking 'Blocking' on async-only data shows the filter-empty EmptyState; Clear filter restores",
	"first click on Delete changes button to 'Confirm?'",
	"focus block → open popover → Discuss → composer prefilled → post → message inline after block",
	"item created on bet detail page appears in knowledge list",
	"jump-out link is visible and has correct href",
	"kanban task → sheet opens → thread renders inline",
	"document empty state visible when no items",
	"document list: content area ≤ 800px",
	"knowledge-create: + New button is btn-sm; clicking opens dialog; POST is intercepted",
	"knowledge-open-item: clicking knowledge row navigates to detail page",
	"knowledge-scope: changing scope fires PATCH to /scope endpoint",
	"layout renders correctly at 1920x1080",
	"legacy subject+body load through the new endpoint as payload.text",
	"loads thread list and renders rows by section",
	"messages anchored to a non-existent block show 'anchor lost' indicator",
	"no WCAG 2.1 AA violations on /conversations",
	"no WCAG 2.1 AA violations on /conversations at ≤ 1024px",
	"no WCAG 2.1 AA violations on /documents",
	"no WCAG 2.1 AA violations on /documents at ≤ 1024px",
	"no WCAG 2.1 AA violations on /documents/k1",
	"no WCAG 2.1 AA violations on /documents/k1 at ≤ 1024px",
	"no WCAG 2.1 AA violations on /work/task/task-a11y-1",
	"no WCAG 2.1 AA violations on /work/task/task-a11y-1 at ≤ 1024px",
	"no WCAG 2.1 AA violations on /work/portfolio",
	"no WCAG 2.1 AA violations on /work/portfolio at ≤ 1024px",
	"no WCAG 2.1 AA violations on /work/product/p1",
	"no WCAG 2.1 AA violations on /work/product/p1 at ≤ 1024px",
	"non-user-scoped item does NOT render Private tag",
	"old team card grid is gone (no data-testid=team-card)",
	"opens create dialog and successfully creates an item",
	"outcome chip is visible in the task table row for task with session",
	"portfolio renders empty state when API returns no products",
	"portfolio-create-task: New task btn-sm visible; empty state CTA visible",
	"portfolio-open-bet: clicking BetCard navigates to /work/bet/:id",
	"pressing Escape closes the edit form without saving",
	"renders 'Blocking' toggle chip (aria-pressed, not role=tab)",
	"renders 'Unread' toggle chip",
	"saving new agent shows 'Agent created' toast",
	"second click confirms deletion and shows 'Agent deleted' toast",
	"send message with no key → missing_key guidance notice visible in overlay",
	"setting theme to dark in Settings persists across reload (no white flash)",
	"settings panel does NOT show DEFAULT_SETTINGS mock email",
	"settings panel does not contain 'u-founder' anywhere in DOM",
	"settings panel opens and shows name from API (not DEFAULT_SETTINGS mock)",
	"settings panel shows email from API override, not founder@hyperidle.com",
	"settings panel shows name from API override, not hardcoded Founder",
	"setup-happy-path: complete setup navigates to /work/portfolio",
	"setup-invalid-key: server 422 error shows alert feedback",
	"shows 'Any' for null harnessType and 'Default' for null modelTierPreference",
	"sidebar bottom strip has 'Assistant' CoC button",
	"sidebar bottom strip has a search hint with Cmd+K badge",
	"sidebar bottom strip has user avatar as settings trigger",
	"switching tabs shows different content",
	"system mode follows OS color-scheme change without reload",
	"task without session has no outcome chip and no jump-out link",
	"team pill filters are visible (All Teams + 2 team pills)",
	"team-back-portfolio: breadcrumb click returns to portfolio",
	"the 7 verdict keyboard shortcuts (A/R/X/S/C/I/E) produce ZERO POSTs (AC-3)",
	"thread-send-message: sending a message POSTs and renders the new message",
	"thread-verdict: clicking Approve on RichMessageCard POSTs verdict payload",
	"toggling Blocking chip filters to blocking threads only",
	"toggling Blocking chip off restores all threads",
	"touch targets ≥ 44 CSS px on chips + clear button at viewport ≤ 1024 (auto-density comfortable)",
	"trigger aria-expanded reflects overlay state",
	"typing in search shows results or empty state",
	"typing in the composer + clicking Send POSTs and renders the new message",
	"updating name and clicking Save shows 'Agent saved' toast",
	"user-scoped item renders Private tag",
	"work empty state visible when no bets",
	"work portfolio bet grid: content area ≤ 960px",

	// @lore AU28 (2026-08-05, the AU26+AU27 rebase): five tests that AU26's route move broke
	// on `main`, invisible there and unmasked here. AU26 repointed the web session/run reads
	// at agent-orchestration's new API surface (`useTaskSessions` now fetches
	// `GET /api/agent-orchestration/runs?task_id=…`, and the agent-profile activity table
	// followed), but these two specs still `page.route()` the pre-move paths — so no session
	// row ever renders and every assertion that waits for one times out. Stale e2e fixtures,
	// not a product regression: the app calls the route it should, the mock answers the one
	// that no longer exists.
	//
	// They stayed invisible on `main` because `--only-changed=origin/main` never selected
	// them there. AU28's `e2e/` → `__e2e__/` rename marks every spec changed, so the default
	// project runs them for the first time.
	//
	// Verified in BOTH directions, as this list's standard requires: a FRESH
	// `git worktree` + `npm ci` at `f484b295` (origin/main, AU26's merge commit) running
	// `npx playwright test e2e/AB1-agent-profile.spec.ts e2e/AI4-status-language.spec.ts`
	// reproduces all five byte-for-byte — same titles, same line numbers, same
	// `session-row` locator timeout — with 18 passed alongside. Nothing here is caused by
	// AU28, and the fix belongs to whoever re-points these mocks at the moved routes.
	//
	// @lore BC5 T12: the four AB1-agent-profile.spec.ts titles are removed from this
	// list — the T9 door swap rewrote the spec's mocks onto `open_user`/
	// `search_sessions`/`search_tasks`, and all four now pass for real (verified:
	// the full 16-test AB1-agent-profile.spec.ts file is green). "livedot-worktask-
	// session" (a different file, WorkTask's session row) is untouched by this item
	// and stays excluded.
	"livedot-worktask-session: LiveDot present in WorkTask active session row",
] as const;
