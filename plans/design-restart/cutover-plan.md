# Cutover plan: from the shipping app to the new design

Written 2026-10-20. How the design in `applications/studio` becomes the real app, and the old one
goes away.

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

**Progress (2026-10-21).** Order changed: the purge came first, so no old UI code had to be kept
working through the backend changes.
- [x] Step 0 decisions · [x] step 1 designs (8 small designs + the document's discipline)
- [x] Step 3 purge: `layers/core-ui` is the studio app; Tailwind, DaisyUI, the old lint rules and
  e2e suite are gone; the token check replaces the old design check.
- [x] Step 2 backend, needed-in-branch part: done-when lines + decisions and assumptions; status
  words (`need`, `openBelow`, live `task:<id>` / `tasks` topics); answer a question by option,
  verdict is approve or reject with a reason; a person in several teams, an agent in one, all
  knowledge readable by everyone.
- [ ] Step 4 screens, wired to real data:
  - [x] the frame: the sidebar on real data and live, a URL per screen, the `call` / `useAction`
    client, Playwright back against the real server on a fresh demo world. A thread row says what
    it waits on from you (`need`: stuck, input or review), who spoke last, and whether you were
    named. A review opens at its thread's address with `?review=<message id>`.
  - [x] Conversations.
  - [x] Work: the task page on real data — the parts graph, a picked part in the address, the loop
    lists, the summary, the part's conversation, and the box (Follow, hold, stop and start again,
    ask for a review, questions, reviews, documents, sessions). Backend: `tasks.paused` (hold or
    stopped, on the task and every part not done; a "restart" dispatch after a stop), following one
    object (`subscriptions.object_id`; a person follows what they start), and a finished task needs
    nothing. A task handed off in a thread keeps that thread as its own, and says it came from it.
  - [ ] Review (Judge) — next.
- [ ] Step 5 finish.


### Step 0: decisions (founder, 2026-10-20)
- **Styling:** plain CSS with tokens, as in the studio. Tailwind and DaisyUI go. A token check
  fails on any raw value outside `tokens.css` and on any reference to a token that does not exist.
- **The studio app is deleted** at the end of the branch; its code moves into core-ui.
- **Backend changes go in the same branch.** The branch is iterated on until the new app is
  complete and works.
- **The gaps:** decided from the journey map (`journey-map.md`). Every action on every screen is
  mapped to the screen it leads to; what is needed for a journey is designed, the rest is removed.

### Step 1: design the gaps (studio, 1:1, before the purge)
`journey-map.md` maps every action on every screen to the screen it leads to. Its outcome, pending
the founder's look:
- **8 small designs:** new document, new conversation, the first start when nothing is found,
  joining a server at first start, the agent programs on your page, stopping a task, discipline,
  and empty and failed lines.
- **9 removals:** the new-task form, the org chart, keys for agent programs, the server and worker
  settings, the what-you-follow list, open beside, a page for a knowledge space, the cost line,
  and confirm dialogs.
- **Mapped:** the 9 kinds of review content onto the 6 parts Judge drew.

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

**How the screens are wired** (decided 2026-10-21):
- URLs per screen with React Router: `/conversations/:id`, `/work/:id`, `/knowledge/:id`,
  `/people/:id`, `/teams/:name`, `/plugins/:id`, `/start`. Back and forward work; a link can be
  shared.
- Data: one small `call(action, input)` client and one `useAction` hook that runs an action and
  runs it again when its WebSocket topic says something changed. No cache library.
- The walkthrough rail goes with the first screen. The studio stays runnable on the design
  branch (`design/studio-recovery`) as the reference for side-by-side screenshots.
- The demo world takes over the studio's story (the trials task, How we price, Maya, Builder,
  Growth…), so a wired screen can be compared with its design one to one.
- E2E: Playwright against the real server with the demo world, no mocked API. Local only.
- The remaining small backend pieces land with the screen that needs them: follow a task,
  document or thread; a document's icon; stop and start again; a comment on a range of text with
  a proposed change and Apply; review rounds; ticking folders and services per agent; "came with
  the plugin" and where a plugin came from.
- Found while wiring Conversations (2026-10-21), designed but not stored yet: a few words under
  each option of a question, and the question's exposure ("seen by every trial user"); a
  review's content beyond text lines (the preview, code, numbers, email parts — lands with the
  review page); outside links such as Zendesk tickets as reference chips; "Builder joined".

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
