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

**Nobody uses the app in production** (no active deployments). So there is no need for a slow
rollout, feature flags or an old/new switch: the old app can be replaced outright.

## 2. The approach (recommended)

**Build the new app next to the old one inside `layers/core-ui`, wire it to the real backend one
screen at a time, then switch over in one change that deletes the old app.**

- The new app lives in a new folder of core-ui with its own entry page. Only a dev command opens
  it, and nothing ships it until the switch.
- It keeps the part of core-ui that has nothing to do with design: `call()`, the WebSocket client
  and the API key handling. Data hooks that fit are reused; the rest are written fresh.
- Everything else in core-ui is deleted at the switch: pages, `ds/`, `settings/`, `shell/`,
  `components/`, their tests, e2e specs and stories, Tailwind, DaisyUI, the Hearth tokens and the
  Tailwind design lint rules.

**The one bridge:** two apps live side by side on main until the switch. That is unavoidable when
building the new app on main in small pull requests, and it ends with the switch.

**Why not restyle core-ui in place:** almost nothing carries over. The sidebar, page layouts,
components and lint rules are all different. Restyling would mean fighting DaisyUI and rewriting
40k lines of tests written for the old layout anyway. The studio was built with no link to the old
code on purpose.

**The other option (not recommended):** replace one page at a time in place, deleting each old
page as its new one lands. This also works, but every step needs a shell that hosts old Hearth
pages next to new Paper pages. That means more throwaway glue, and the app looks broken for weeks.

## 3. Steps

### Step 0: decisions and getting the design onto main
- **Decide:** side by side and then one switch (recommended), or page by page.
- **Decide:** styling.
  - Recommended: plain CSS with tokens, as in the studio. Tailwind and DaisyUI go.
  - Keep a token check that fails on any raw value outside `tokens.css` and on any reference to a
    token that does not exist.
  - The alternative is Tailwind on the Paper tokens.
- **Decide:** what happens to the studio after the switch.
  - Recommended: delete it. New design work happens as stories in the real app.
  - The alternative is to keep it as a sketch pad.
- Open a pull request that merges `design/studio-recovery` into main, so the design and its notes
  are the reference for everyone. This needs your go-ahead: no pull request until you ask.

### Step 1: design what the old app does and the new design does not
Each item gets a design (1:1, in the studio, as before) or is dropped. **Decide** per item.

| Old app has | New design today |
|---|---|
| First start (`/setup`): find agent programs, sign in, local or shared | only "name your team" |
| Settings → Harnesses: agent programs on this computer, and their keys | not drawn |
| Settings → Backend, Worker: this computer or a shared server | only a "Lives on" fact |
| Settings → Appearance: light or dark | not placed (own page?) |
| New task without a conversation (`/work/task/new`) | not drawn |
| New document (`/documents/new`) | not drawn |
| Org chart and reporting lines; discipline (added on main 29 Sep) | not drawn |
| 9 kinds of review content: outcome summary, field changes, action, rendered in context, numbers moved, visual diff, code diff, batch, browser preview | Judge drew preview, code, image, numbers, email and text; map the rest |
| Notifications popover | bell exists; the "what you follow" list is not drawn |
| Empty, loading and failure states | none (planned for the final pass) |
| — | "This session cost": the backend only counts tokens, not money; show tokens or drop |

### Step 2: backend changes the design needs
**Needed before the switch.** Without these, the screens would show things that do not exist:
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

**Can follow after the switch.** That part of the screen stays hidden until the backend supports
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

Each item is its own small backend change with tests, run like any other work.

### Step 3: the base of the new app
- The Paper tokens and fonts, light and dark. The Workshop and Precision skins are not carried over.
- The shared pieces from the studio: dialog, field, segment buttons, format bar, the status icons,
  avatar, message, the "decisions and assumptions" and "done when" lists, and the sidebar frame.
- The token lint for the new folder.
- The studio's made-up data goes only into stories and tests. Production code can never import it.

### Step 4: the screens, wired to real data, one per pull request
In this order, because each one builds on the one before:
1. Frame: sidebar (find or ask, Conversations / Work / Knowledge, team switch), routes.
2. Conversations: thread list and thread, the mention picker, the work item strip, the session
   line, and question cards (Hand off).
3. Work: the task page, with the graph, the box, and the decisions and done-when lists (Run the
   shift).
4. Review (Judge).
5. Knowledge: the tree with team spaces, and a document with comments in the margin (Think).
6. People: team page, user page, the set-up dialogs.
7. Plugins.
8. Arrive: find or ask, notifications, first start.
9. Whatever step 1 decided to keep.

**Each screen counts as done when:**
- it shows real data from a seeded database
- a Playwright spec covers it
- a screenshot taken side by side with the studio is sent to you, and you have looked at it

### Step 5: the switch, in one change
- The entry page and the route list point at the new app.
- Delete the old app (the list in §2), and rewrite `docs/ui-design` and the user guide to match.
- The desktop window background (hard-coded `#242418`) changes to the Paper colour.
- Proof:
  - `npm run verify`, full tests, full e2e
  - the desktop smoke test (`desktop-smoke-test` skill)
  - the web smoke test (`smoke-test` skill)
- Delete the studio, if step 0 decides so.

### Step 6: after
- The "can follow" backend items, each one turning on its hidden part of a screen.
- The final design pass (dark mode, sign-off on every screen). Mobile is a separate design, later.

## 4. How the work runs
- Every step is a small pull request off main. No pull request carries more than one screen or one
  backend change, so each stays well under the 1,000-line check.
- **Decide:** the backend items run through the normal task pipeline (recommended), and you see the
  screens 1:1 from screenshots, as in the design sessions.
