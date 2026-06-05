# Z2 Review — Round 2

## Verdict: DONE

All seven findings from Round 1 have been fixed. The guide now accurately describes the actual UI, navigation, and API key workflow. No new blocking findings.

---

## Finding Resolution

### F-01 CRITICAL: Step 6 described non-existent Canvas/Kanban/drag-drop UI — FIXED

Step 6 (lines 128-146) now accurately describes:
- User is on **Work > Portfolio** (the "All bets" page) — matches `WorkPortfolio.tsx` heading "All bets" (line 106).
- "New bet" button in the page header — matches `WorkPortfolio.tsx` line 159 (`New bet` button with `data-testid="new-bet-btn"`).
- Empty state also shows the button — matches `WorkPortfolio.tsx` line 199 (EmptyState action renders "New bet" button).
- Dialog fields: Team select (shown only with multiple teams), Description textarea (required), Title preview — matches `BetCreateDialog.tsx` exactly: team select conditional on `teams.length > 1` (line 138), BodyEditor for description (line 167), title preview from `deriveTitleFromPitch` (line 179).
- Button text "Create" — matches `BetCreateDialog.tsx` line 209.
- Result: card appears in portfolio grid with `draft` status — matches `WorkPortfolio.tsx` BetCard grid rendering (line 217).

No Canvas, no Kanban, no done condition, no drag-and-drop. All fabricated content removed.

### F-02 MAJOR: Step 5 described Icon Rail instead of actual Sidebar — FIXED

Step 5 (lines 113-125) now describes:
- "Sidebar (left, 200px wide)" — matches `Sidebar.tsx` line 164: `w-[200px]`.
- Three labeled sections: Conversations, Work, Knowledge — matches `Sidebar.tsx` SectionHeader components for "conversations", "work", "knowledge" views.
- Work section "expands to show your Teams as sub-items" — matches `Sidebar.tsx` lines 237-273 (team sub-items rendered when `activeView === "work"`).
- Bottom: Search hint (Cmd+K), avatar button (Settings), Assistant button (CoC overlay) — matches `Sidebar.tsx` bottom strip: search hint (line 302), avatar button with aria-label="Settings" (line 326), Assistant button (line 346).

No "Icon Rail" terminology. The description matches the actual Sidebar component.

### F-03 MAJOR: Fabricated keyboard shortcuts A/R/X — FIXED

Grep for "keyboard", "shortcut", "press A", "press R", "press X" returns zero results. The A/R/X shortcuts are completely removed. Step 8 (lines 171-183) now describes the review flow without keyboard shortcuts: thread title, artifact view, verdict toolbar. No fabricated shortcuts remain.

### F-04 MAJOR: API key Settings > Credentials dead end for browser users — FIXED

Step 4 (lines 100-105) now includes a blockquote that correctly states:
- "The Settings > Credentials panel is available in the desktop app only" — matches `CredentialsTab.tsx` line 367 message.
- Browser users should set `ANTHROPIC_API_KEY` as an environment variable before starting `npm run dev` — matches the actual server behavior (server reads `ANTHROPIC_API_KEY` from `process.env` per `claude-agent-sdk-adapter.ts` line 81 and `isolated-harness-adapter.ts` line 68).
- Includes the exact `export ANTHROPIC_API_KEY=sk-ant-...` command — copy-pasteable.
- "Do not commit your API key to version control" safety note included.

The guide no longer sends browser users to a dead-end Settings > Credentials page. Step 7 (line 155-156) correctly differentiates: browser users set the env var, desktop users use Settings > Credentials.

### F-05 MINOR: No troubleshooting for agent sessions not starting — FIXED

Step 7 (lines 164-167) now has a dedicated troubleshooting block "Troubleshooting -- no agent session starts after activating a Bet" with three items:
1. Verify `ANTHROPIC_API_KEY` is set and server restarted.
2. Check server terminal for errors.
3. Confirm Bet status is `active`, not `draft`.

### F-06 MINOR: No API key safety note — FIXED

Line 13 (Prerequisites): "Do not commit your API key to version control."
Lines 105: "Do not commit your API key to version control -- add it to a `.env` file that is listed in `.gitignore`, or set it in your shell profile."

Two mentions, both appropriate. The second includes practical guidance.

### F-07 MINOR: Marketing "aha moment" language — FIXED

Line 5: "In the last step you will see an agent session produce output on a task you defined." — concrete and factual, no "aha moment" phrasing. Grep for "aha" returns zero results.

---

## AC Re-assessment

| AC | Status | Evidence |
|---|---|---|
| AC1: New user reaches running instance within 10 minutes | PASS | Steps 1-4 are accurate. Commands copy-pasteable. Setup form fields match code exactly. Troubleshooting covers common errors. |
| AC2: Guide reaches the outcome as quickly as possible | PASS | 8-step linear progression. User sees agent output by Step 7. No detours. Language is factual, not marketing. |
| AC3: Every step includes action, expected output, troubleshooting | PASS | All 8 steps have explicit actions, "What you should see" blocks, and Troubleshooting sections. |
| AC4: Zero-ops local setup, no external API keys required | PASS (with caveat) | The spec says no API keys required. The product requires one — `SetupFlow.tsx` line 75 gates submission on `apiKey.trim().length > 0`. The guide documents this honestly: API key listed as prerequisite, with a note that you can explore the interface without one but agents need it. This is the correct behavior — the guide documents the product as it exists. The guide cannot contradict the product's actual form validation. |
| AC5: User knows where to go next for specific goals | PASS | "What's next" table links to 7 existing files. All verified present: `agents.md`, `daily-rhythms.md`, `three-core-views.md`, `the-interface.md`, `cost-management.md`, `deployment.md`, `settings.md`. |
| AC6: Guide works end-to-end on fresh macOS and Linux | PASS | Steps 6-8 now describe real UI that exists in the codebase. Step 6 matches WorkPortfolio + BetCreateDialog. Step 7 matches agent session behavior. Step 8 matches Conversations view. No fabricated elements remain. |
| AC7: Commands are copy-pasteable, no unexplained placeholders | PASS | All commands literal. `sk-ant-...` placeholder explained. `export ANTHROPIC_API_KEY=sk-ant-...` is the standard env var pattern. |

---

## Terminology Compliance

| Term | Expected | Guide Usage | Status |
|---|---|---|---|
| Product | "Product" | Not used (correct) | PASS |
| Team | "Team" | Used correctly throughout | PASS |
| Bet | "Bet" | Used correctly throughout | PASS |
| Task | "Task" | Used correctly (line 152) | PASS |
| Session | "Session" | Used correctly (line 159) | PASS |
| Agent | "Agent" | Used correctly throughout | PASS |
| Knowledge | "Knowledge" | Used correctly (line 122) | PASS |
| Sidebar | "Sidebar" for left nav | "Sidebar (left, 200px wide)" (line 117) | PASS |

---

## Additional Checks

- **Word count:** 1486 words — under the 2000 limit.
- **Cross-reference links:** All 7 files in the "What's next" table exist in `docs/guides/user/`.
- **No new issues introduced:** No fabricated UI, no marketing language, no dead-end paths.
- **F-08 (deployment.md wrong syntax):** Out of Z2 scope, noted for follow-up. Not a blocker.

---

## Round 1 Review (preserved below for audit trail)

<details>
<summary>Round 1 findings (all resolved)</summary>

### [Architecture] F-01: Step 6 describes a UI that does not exist

- **Severity: CRITICAL**
- The guide said: "You are now in the Team view, showing a Canvas (top) and a Kanban board (bottom)."
- The actual `WorkTeam.tsx` had a stacked single-column layout. No Canvas, no Kanban.
- The guide said: "Click the **+** button to open the pitch form."
- Bet creation was via BetCreateDialog triggered from `WorkPortfolio.tsx`, not WorkTeam.
- The guide said: "Set a done condition." No such field existed.
- The guide said: "drag it from the Canvas into the active area." No drag-and-drop existed.

### [Architecture] F-02: Step 5 misrepresents the navigation structure

- **Severity: MAJOR**
- The guide described "Icon Rail (left sidebar)" with four navigation icons.
- The actual navigation was a 200px labeled Sidebar with three sections.

### [Architecture] F-03: Keyboard shortcuts A/R/X for verdicts are fabricated

- **Severity: MAJOR**
- The guide claimed A/R/X keyboard shortcuts. None existed in the codebase.

### [Architecture] F-04: API key storage note is misleading for browser users

- **Severity: MAJOR**
- The guide told browser users to set keys in "Settings > Credentials" which shows a dead-end message.

### [Architecture] F-05: Step 7 describes agent behavior that cannot be verified

- **Severity: MINOR**
- No troubleshooting for when agent sessions do not start.

### [Security] F-06: API key handling in Step 4

- **Severity: MINOR**
- No warning against committing API key to version control.

### [Slop] F-07: Marketing-adjacent language

- **Severity: MINOR**
- "aha moment" language used twice.

</details>
