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
- [x] Step 4 screens, wired to real data:
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
  - [x] Review (Judge): the review page on real data — the parts (a live page at desktop, tablet
    and phone widths, code, an image, numbers, text, a batch of items), the agent's flags and
    people's comments as pins on them with a thread each, the list of questions, the loop from
    the work item's task, more space, Approve and Reject with a reason, and the link back to
    round 1. Backend: a review is made of parts and flags, a comment points with an anchor (one
    shape for reviews and document blocks), and a retry names the round it follows; the nine
    canvas kinds and `messages.block_id` are gone (migration 0103).
  - [x] Knowledge (Think): the document on real data — its Markdown in a TipTap editor, view and
    edit mode, the floating format bar, / for a block and @ for the picker, saving on its
    version; comments in the margin, each a pin on a stretch of the text, faded until opened,
    with draggable ends, replies, resolve and undo, a proposed change with Apply and Dismiss,
    and the task handed off from it; For <discipline>, Follow and Publish; the tree's + and
    icons. Backend: a document comment's anchor is the document and a range of its body, a
    message may propose a change that adjust_thread settles once, documents.icon (migration
    0104), and open_document counts the followers.
  - [x] People: the team page (people with their agents, the agents of every team, Add someone,
    the team's plugins), the user page and your own page on real data (lists from tasks, reviews
    and questions; the box with conversation, edit, pause, runs on, folders, services, reasons,
    notifications, instructions or About, this app, agent programs, looks), and every set-up
    dialog. Backend: who started a task (tasks.started_by), what someone does (users.what), a
    person's four reasons replace the nine raw events, a service kept from one agent
    (service_connection_withholds), new folders go to every agent of yours, a person's About is
    their agent_file document (migrations 0105, 0106). Inviting a person stays later.
  - [x] Plugins: the plugin page on real data (how it stands, its agents, skills, reasons and
    services, Switch off and on, Remove with Undo on the team page, Install for one that comes
    with the app, where it came from, who it is for, who installed it, and what the team changed
    since with "Put the plugin's version back") and the Add a plugin dialog. Backend: an install
    keeps its source, description and who added it; an edit to a plugin's agent or reason marks
    it changed like a document, with who; restore puts each kind back; remove only pauses, so
    switching a removed plugin on undoes it (migration 0107).
  - [x] Arrive: find or ask (⌘K; Find lists knowledge, conversations and work with the text that
    matched; Tab asks your oldest agent, changeable, in a thread that answers in the overlay as it
    is written, with its sources), first start at `/start` for a fresh install (no person yet: the
    programs found here, how to fix one, Look again, your name and the team's, Start talking;
    joining a server in the desktop app), the first conversation with the first agent's hello as
    a real message and Connect a folder / GitHub / Not now, the "new since you started" note
    while you edit, and one "did not load" line with Try again on every page. Backend: search
    hits carry the matching text and their team; `POST /api/start` and `/api/start/look`; the
    desktop's `backend:join`, and shared mode passes the kept key to the page. `Arrive.tsx` is
    gone.
- [ ] Step 5 finish:
  - [x] leftovers of the old UI that nothing reached (CSS classes, the desktop worker and settings
    bridge, inspect-path, display helpers and the agent track record, two unwired lint rules), one
    home for the installed-plugins folder, the desktop window and splash on the Paper canvas, the
    docs and the skills that drive the app rewritten to the new app.
  - [x] the web smoke test (2026-10-24), on the real server with real agents and the demo world:
    every page loads, a reply persists, Find finds, missing ids say "did not load", and the wedge —
    @Builder in a new conversation answered through a real Claude Code run, live on the page. It
    found two defects, both fixed with tests: one busy agent held every other agent's work in the
    queue (already on main), and the demo world seeded "running" sessions no program ran, which
    filled Builder's slots for good.
  - [x] the branch's migrations on a copy of a real desktop database from September: all ran, every
    action answers, the people, team and plugin pages render it.
  - [x] the desktop window driven by hand (2026-10-25, packaged app): first start on an empty
    database (programs found, join form, your names, Getting started), the wedge (@Builder answered
    through a real Claude Code run), the demo world: thread, review (pins, a reply in a pin,
    Approve), the task page (parts, hold, off hold), knowledge (Follow), your page (a reason off and
    on, Dark and back), the team page, a plugin (off and on), find; menus. It found three defects,
    each fixed with a test that was red first: the live connection opened before first start kept a
    placeholder identity, so your own threads stopped updating; a task's parts moved when one
    changed; the first conversation's offer slid under later messages. Plus "1 tasks".
    Known, not fixed here: the app menu says "@hyperidle/desktop" (already on main; renaming the
    app moves its data folder).
  - [ ] the pull request.


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
  each option of a question, and the question's exposure ("seen by every trial user"); outside links such as Zendesk tickets as reference chips; "Builder joined".

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
