# Cutover plan: from the shipping app to the new design

Written 2026-10-20. How the design in `applications/studio` becomes the real app, and the old one
goes away. Founder decisions still open are marked **Decide**.

---

## 1. Where we start

**The shipping app** is one package, `layers/core-ui`:
- About 43k lines of production code and 54k lines of tests and stories.
- React Router, with Tailwind 4 and DaisyUI 5 (the Hearth themes), plus its own component set in
  `ds/` (about 10k lines).
- 35 design lint rules, mostly built around Tailwind classes.
- It talks to the backend through `call("<action>")`, which posts to `/api/actions/<name>`, and one
  WebSocket.
- The desktop app and the remote server both serve its build from `layers/core-ui/dist`.

**The new design** is `applications/studio`:
- About 5.5k lines, written in plain CSS with tokens.
- Its made-up data sits inside the components, and it has no backend.
- It lives on branch `design/studio-recovery`, which is 46 commits ahead of main and not merged.

**The backend** was checked against `origin/main` at `dceb86a48` (2026-10-07), after the Track BC
redesign:
- 17 actions in six modules (task, thread, document, user, platform, session) behind
  `/api/actions/<name>`.
- One users table for people and agents. Subscriptions replace routines and notifications.
- Plugins install per team.
- Since the design branch split off, main added `discipline` (a person's or agent's craft, which
  decides which documents an agent gets). It also dropped the agent effectiveness score and the
  server config table.

**Nobody uses the app in production** (no active deployments), so the old app can be replaced
outright.

## 2. The approach (founder, 2026-10-20)

**One branch, one complete replacement, no side by side.** Everything old is purged. The new app
is placed in fresh. Founder: "kill everything old, proper purge and place the new in fresh."

- **One branch off `origin/main`** (`feature/ui-cutover`) and one pull request at the end. Main
  keeps the old app until that pull request merges. The branch itself is allowed to be broken
  between the purge and the end.
- The design branch `design/studio-recovery` is merged into the cutover branch first, so the
  studio code and the design notes come along. It needs no pull request of its own.
- **Nothing in `layers/core-ui` survives**: pages, `ds/`, `settings/`, `shell/`, `components/`,
  `hooks/`, `services/` (the API client and WebSocket client too), every test, e2e spec and story,
  Tailwind, DaisyUI, the Hearth tokens, and the Tailwind design lint rules in
  `tools/eslint-plugin-design` and `tools/repo-gates`.
- The package keeps its place and name (`layers/core-ui`), so the desktop app and the remote
  server still find its build where they look today. Only what is inside is new.
- Docs about the old UI (`docs/ui-design`, the user guide's screens, `.claude/rules/design-system.md`,
  `aesthetic-quality.md`, `frontend.md`, the `visual-polish` skill) are rewritten or deleted in
  the same branch.

## 3. Steps, in order, all in one branch

### Step 0: decisions before the branch starts
- **Decide:** styling.
  - Recommended: plain CSS with tokens, as in the studio.
  - A token check fails on any raw value outside `tokens.css` and on any reference to a token
    that does not exist.
  - The alternative is Tailwind on the Paper tokens.
- **Decide:** the studio app is deleted at the end of the branch, since its code moves into
  core-ui (recommended). New design work is then done in the real app.
- **Decide:** for each gap in step 1, design it or drop it.
- **Decide:** whether the backend changes in step 2 go in this branch too (recommended, since the
  new screens need them), or land on main first as their own pull requests.

### Step 1: design the gaps (studio, 1:1, before the purge)
What the old app does and the new design does not. Each gets a design or is dropped.

| Old app has | New design today |
|---|---|
| First start (`/setup`): find agent programs, sign in, local or shared | only "name your team" |
| Settings → Harnesses: agent programs on this computer, and their keys | not drawn |
| Settings → Backend, Worker: this computer or a shared server | only a "Lives on" fact |
| Settings → Appearance: light or dark | not placed (own page?) |
| New task without a conversation (`/work/task/new`) | not drawn |
| New document (`/documents/new`) | not drawn |
| Org chart and reporting lines | not drawn |
| Discipline of a person or agent (backend has it; the user page should show and edit it) | not drawn |
| 9 kinds of review content: outcome summary, field changes, action, rendered in context, numbers moved, visual diff, code diff, batch, browser preview | Judge drew preview, code, image, numbers, email and text; map the rest |
| Notifications popover | bell exists; the "what you follow" list is not drawn |
| Empty, loading and failure states | none (planned for the final pass) |
| — | "This session cost": the backend only counts tokens, not money; show tokens or drop |

### Step 2: backend changes the new screens need
**Needed in the branch.** Without these, the screens would show things that do not exist:
- **Status words:** work out Stuck / Needs input / Needs review for each task, with counts up the
  tree. Add a task topic to the WebSocket.
- **Done when:** becomes a list of lines. Each line either checks itself (with its evidence) or is
  reviewed by a person, and has its own state. "Ask for a review" adds a line. This replaces
  `doneCondition` and `needsReview` fully.
- **Decisions and assumptions on a task** (new): who decided and where, which assumptions held, were
  not checked yet, or did not hold.
- **Questions:**
  - an answer that names the chosen option, instead of approve/reject
  - a reject must give a reason
- **Teams:**
  - a person can be in several teams
  - team actions: list, open, edit name and "what"
  - every team's knowledge space can be read by everyone

**Can follow after the merge.** That part of the screen stays hidden until the backend supports
it:
- review rounds that link back to the earlier round; one review per owner
- a comment on a piece of text, not a whole block; a proposed change with Apply
- unticking a service for one agent; new folders going to every agent by default
- plugins:
  - tracking edits to agents and reasons, not only documents
  - "came with the plugin"
  - showing where the plugin came from
- following one task or document; the "what you follow" list; telling you when you are mentioned
- summaries that roll up to the parent task

### Step 3: purge
One commit deletes the old app completely (the list in §2), along with its packages
(Tailwind, DaisyUI, the TipTap editor if the new design does not use it) and its lint rules. From
here, core-ui is empty except for its package file.

### Step 4: place the new app
1. **Base:**
   - the Paper tokens and fonts, light and dark (Workshop and Precision are not carried over)
   - the token check
   - a new, small API client (`/api/actions/<name>`) and WebSocket client
   - the shared pieces from the studio: dialog, field, segment buttons, format bar, status icons,
     avatar, message, the loop lists
2. **Screens, wired to real data**, in this order:
   1. Frame: the sidebar (find or ask, Conversations / Work / Knowledge, the team switch) and the
      routes.
   2. Conversations: the thread list and the thread (Hand off).
   3. Work: the task page (Run the shift).
   4. Review (Judge).
   5. Knowledge: the tree with team spaces, and a document (Think).
   6. People: the team page, the user page, the set-up dialogs.
   7. Plugins.
   8. Arrive: find or ask, notifications, first start.
   9. The gaps that step 1 kept.
3. The studio's made-up data goes into tests and the demo seed only. Production code never
   contains it.

**Each screen counts as done when:**
- it shows real data from a seeded database
- a Playwright spec covers it
- a screenshot is taken side by side with the studio, and you have looked at it

### Step 5: finish the branch
- The desktop window background (hard-coded `#242418`) changes to the Paper colour.
- Delete the studio app, if step 0 decides so.
- Proof:
  - `npm run verify`, full tests, full e2e
  - the desktop smoke test (`desktop-smoke-test` skill)
  - the web smoke test (`smoke-test` skill)
- Open one pull request to main. You merge it.

### After the merge
- The "can follow" backend items, each one turning on its hidden part of a screen.
- The final design pass (dark mode, sign-off on every screen). Mobile is a separate design, later.

## 4. Size

The branch adds far more than the 1,000-line check allows: the studio alone is about 5.5k lines,
plus wiring to the data and the backend changes. It also deletes about 97k lines. A complete
replacement in one branch was your explicit choice, so this is expected, not a sign the plan is
wrong. Each screen is still built and checked one at a time, in its own commits.
