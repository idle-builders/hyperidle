# Play-through before rc.3

A long, real use of the desktop app before cutting rc.3: a fresh install, one person (me, as Finn),
building a real thing — **Streak**, a small habit tracker web page in `~/code/streak` — with the
agents, end to end. Everything that feels off is written down as it happens.

Build used: branch `fix/working-line-preload-app-name` (rc.2 + the three fixes), packaged, opened
from Finder, on an empty database.

## Journal

### 1. First start (22:54)
- Fast and clear: four agent programs found and signed in, name + team, Start talking. Lands in
  "Getting started" with Builder's hello. Good.
- **Off:** Builder says it "can already read and change files here" before any folder exists —
  "here" is unclear (which files?). It cannot see any project yet.
- **Off:** first start never says which program Builder will run on until the hello. Fine, but
  choosing one is not possible here.

### 2. Connecting the project folder
- "Connect a folder" leaves the conversation and opens a dialog over my own page. Saved fine;
  Works in shows `~/code/streak · given to Builder`.
- **Off:** no "Choose…" button — on a Mac I have to type the path by hand. A folder picker is
  expected in a desktop app.
- **Off:** after Save I stay on my page. The conversation I came from is one click away, but the
  flow started there and I expected to land back in it.
- **Off:** Builder is not told a folder was added; nothing in the conversation changes.

### 3. Giving Builder the project (22:54 → 23:04)
- I answered Builder's "What are you working on?" in plain words (no @mention): build Streak, plan
  it in parts, then build it. Builder picked it up without an @ — good.
- **Bug, fixed in this branch:** the folder never reached Builder. A folder saved as
  `~/code/streak` (the dialog's own example is `~/code/project`) failed to mount every time
  (`spawn git ENOENT` — git was run in a folder literally named `~`). Builder worked anyway,
  because it read the absolute path from my message and wrote straight into my checkout,
  uncommitted, not on its own branch.
- **Off (big):** Builder ran **twice at once** — once because a folder was added (a reason to start
  that fired on its own), once for my message. Both built the whole app, and both filed a review:
  two nearly identical "Streak is built" cards. The second overwrote the first one's files.
- **Off (big):** **no task was made.** I asked to "plan it in parts"; Builder built it inside the
  conversation and asked for a review. Work is empty, so nothing shows the parts, the plan, or what
  is done. The task page — the heart of the product — never came into play.
- **Off:** the review card in the thread is a long wall of text (eight long bullets). The thread
  becomes hard to read; the card should be short with the detail behind "Look at it".
- **Off:** "1 waiting for you" while there are two open reviews.
- Good: the reviews are honest about what was and was not checked ("nobody has looked at the
  rendered page yet").

### 4. Looking at the review (23:05)
- The review page is good to read: Builder's reasoning, a "Try it" part with the running page, then
  the code parts (`streak.js` and the rest) as diffs. 7 open questions flagged.
- **Off (big):** "Try it — add a habit and tick it" cannot be tried. A "point at something" layer
  covers the whole live page: my first click dropped a comment pin, and what I typed for a habit
  went into the pin's comment box. There is no way to switch between *using* the page and
  *pointing* at it. "More space" has the same layer.
- **Off:** the live page keeps the height it had when it loaded; anything the page adds later
  (the habit list) would be cut off.
- Checked the work myself: `npm test` → 13 pass. 360 lines across `index.html`, `styles.css`,
  `streak.js`, `app.js`, `test/`. Solid for ten minutes of work.
- **Off (big):** one of the two runs **committed straight to my `main`** ("Build Streak: add
  habits, tick today, count streaks"), while the other run's review says "I have not committed —
  say the word and I will". The two reviews now disagree about the state of my repo. (With the
  mount working, an agent works on its own `agent/…` branch instead — but nothing told me that
  this run had fallen back to my checkout.)
- Builder's flags are useful and specific (the grace rule, no confirm on remove, Chrome only,
  "committed locally without being asked"). Answering one in its pin bubble worked; the count went
  7 → 6 open.
- **Off:** the pin bubble covers the right side of the part it belongs to, so the text I am
  answering is half hidden while I write.
- Reject asks for a reason and says where it goes ("Goes back to Builder and the session that raised
  this review"). Clear. Rejected with: keep the grace rule, confirm on remove, show the longest
  streak, one builder only, work on a branch.
- **Off:** after rejecting, the conversation still says Needs review — the *other*, duplicate
  review is still open, and nothing tells me there are two.

### 5. Round 2 (23:08)
- **Bug, fixed in this branch:** round 2 started **twice** again — my reply on a flag woke Builder
  as an ordinary conversation reply, and the reject brought back the session that asked. Root
  causes, both fixed with tests:
  - first start gave Builder a "reason to start" on **every** change in the workspace (every task,
    message, document, person). So every message started it twice, and adding a folder (a change
    to me) started it once more. Builder now starts only when asked.
  - a reject / approve / answer both resumed the asking session **and** woke the same agent as a
    plain reply. Now only the session that asked comes back.
- **Off:** the resumed review session ended as "stopped" a minute later, so the round-2 work is
  being done by the *other* run, which never saw the reject as a reject — only my flag reply.
- **Off (big):** Builder switched **my checkout** to a new branch `builder/round-2` (because the
  folder never mounted, it works in my real folder). An agent should never move my checkout.
- **Off (big):** the "Try it" live page cannot run at all: the log says
  "Blocked script execution in 'about:srcdoc' … 'allow-scripts' permission is not set". An agent's
  try-it page is inline, and inline pages are not allowed to run scripts. So "Try it" shows a page
  that cannot be tried, even before the pin layer gets in the way.
- **Bug, fixed in this branch:** Builder kept waking itself: its "every message" reason fired on
  its own review message, so a new run started right after it posted. New installs no longer get
  those reasons; migration `0108` removes them from existing installs (rc.1 / rc.2 users). After
  updating, Builder here has none.
- Round 2 itself was good: all four asks done (confirm before remove that names the streak you
  lose, best streak shown, grace rule kept, work on a branch).
- **Off:** Quit took ~40 s while an agent was mid-run (earlier: 9 s). Nothing on screen says the app
  is waiting for an agent to stop; it just looks stuck.

### 6. Approving round 2, then a bigger feature (23:35)
- **Bug, fixed in this branch:** a long review title pushed **Approve off the screen** ("Appr…" at
  the right edge). The title now shortens with "…" and shows in full on hover.
- Builder's round-2 note owned up to the parallel runs and cleaned them up itself (stopped the other
  run, kept one branch). Good agent behaviour — but it should never have been needed.
- **Off:** after approving, the conversation still says Needs review and "1 waiting for you": the
  duplicate round-1 review is still open. The only ways to clear a stale review are Approve or
  Reject; there is no "this one is obsolete".
- Asked for a bigger feature in a new conversation, explicitly "as one task with parts so I can
  follow it in Work".
- **Off:** a new conversation's title is its whole first line — here three lines of bold text in the
  page header. It should be short (first sentence, or cut with "…").
- **Off:** my request sat ~9 minutes before Builder started, because it was still busy with the
  approved review. Nothing said "Builder will get to this after its current work" — the new
  conversation just looked ignored.
- **Off:** quitting the app while an agent ran marked that run "crashed".
- This time Builder **made a task**: "Streak round 3" with three parts. The task page is where the
  product shines: parts with live status, decisions and assumptions, a "done when" list split into
  checks and one review, the conversation underneath.
- **Off:** the task's details show raw markdown (`**Week view**`, backticks) instead of formatting.
- **Off:** for a moment the box reads " owns this" and the part "is on it" with no name — names
  arrive after the page draws.
- **Off (big):** the task "Needs input" because of a decision "waits for an answer" (which export
  format), but **there is no question to answer anywhere** — no question card in the task's
  conversation or mine. Part 2 says "Stuck". The only way to answer is to guess and type a reply.

### 7. Following the task (00:00 → 00:40)
- Builder worked ~45 minutes on round 3. In that time my conversation showed only the task strip
  ("Needs input"); Builder posted nothing there.
- **Off:** no working line in the conversation the whole time, although Builder was busy: the line
  only shows runs on the conversation's top task, not on its parts.
- **Off (big):** **my page did not list what I owed.** For a long stretch the task said
  "Needs input" (the export format) and Part 3 said "Needs review", but Waiting for you listed only
  the stale duplicate review from round 1. Cause: Builder set the *states* (decision waiting, part
  in review) long before it sent the matching card; the status words come from the state, my page
  from the cards. When the Part 3 review card finally came, it asked about the export format in
  passing text, not as a question card I could answer.
- **Off:** "Started by you: 0" — I asked for round 3, but the task counts as started by Builder.
- **Off:** all three parts share my conversation, so their reviews pile up in one long thread.
- **Off:** the review page shows nothing at all (not even its header) for about a second on open.
- Approving Part 3 worked; the chip is quiet now.
- Answered the format question with a plain reply (`@Builder … use JSON, one file, with a version
  number`) — the only way to answer it.
- **Bug, fixed in this branch:** approving Part 3 posted "This action was approved but could not be
  carried out…" **as if I had written it**. It now comes from the agent ("Your approval could not
  reach my session …, so I have not acted on it"). Fixed: no working line for an agent on a part;
  "Started by you" now counts a task an agent made from my conversation; task details render
  their formatting.
- **Off (big):** the approval could not reach Builder at all: the review was raised by a run that was
  *still going* (it had not reported its id yet), so an approve while the agent is still working
  is simply lost. Builder only heard about it because my JSON reply happened to wake it. The
  approval should wait for that run to end and be handed over then.
- Builder then closed Part 3 ("committed as 2a0ce42, task closed as met") and kept going on Part 1.
- **Off:** Part 2 still says "Stuck" 40 minutes after I answered the format. The decision is
  answered in words, but nothing moves the part on until Builder gets to it.

### 8. Knowledge, and the end of round 3 (00:10)
- **Bug, fixed in this branch:** on a fresh install, Knowledge said "No documents yet." and offered
  **no way to make one** — the team's space (with its +) only showed once a document existed.
  Now the space always shows; covered by the first-start browser test.
- **Off:** I wanted to write "How Streak works" as a document, but writing in a document needs real
  keystrokes, which I can only send with full screen control — asked, no answer while you were
  away. (A tooling limit of this run, not an app bug.)
- All three parts reached review. The Part 2 review (export/import) is excellent: JSON with a
  version, refuses newer files, replace-not-merge with a confirm, 151 browser checks.
- **Off:** two "Builder is working" lines at once — the double-start bug again (this build predates
  the fix). Builder flagged the mess itself: "two sessions built the theme in parallel".
- **Off:** "Peek at session" shows raw tool calls — `Bash {"command":"sed -n '1,70p' styles.css …"}`
  — not readable steps like "Read styles.css". For Bash steps the summary has no verb or target,
  so the raw arguments show.
- **Off:** clicking Conversations reopened the review page I was last on, not the conversation —
  correct by the "last page" rule, but it felt like I was stuck in the review.
- With the mount fixed, each run now works on its own `agent/local-sb-…` branch in a worktree —
  good. **Off:** none of them are ever cleaned up: after one evening my repo has six
  `agent/local-sb-*` branches plus `streak/round-2` and `streak/round-3`, and three worktrees still
  checked out in a temp folder. Nothing in the app shows or tidies them.

### 9. After the rebuild with fixes (00:49)
- Seen in the window: task details formatted; conversation and review titles one line with "…";
  Approve visible again; an approval starts **exactly one** run (the resumed review session).
- **Bug, fixed in this branch:** the task box listed every review twice (once per part sharing the
  conversation), and a task whose work runs on its parts said "Not started".
- **Off:** Builder's final round-3 review starts with an apology for a mess the double runs made:
  a session "died before folding it in", a commit was "abandoned on a dead session's worktree
  branch", and the light-theme colours changed *after* I had approved them. All of that traces to
  the double-start bugs now fixed.

### 10. Merge and finish (01:53 → 02:00)
- Asked Builder to merge round 3 into `main` and tidy up. It had refused to merge on its own
  ("approving a review that says nothing is merged isn't an instruction to merge") — right call.
- One run, one working line, readable steps under Peek ("Survey branches, worktrees, status",
  "List round-3 files and the orphan commit diffstat").
- Result, checked myself: `main` at `b83c173`, only `main` left, Streak's 67 tests pass. Builder's
  closing report is precise about what it deleted and why.
- **Off (big):** both conversations still say **Needs review** and my page "2 waiting for you",
  while Builder says "nothing is open and nothing is waiting on me". The two are the stale duplicate
  reviews from the double runs; there is no way to set an obsolete review aside, so they will wait
  forever.
- **Off:** one temp worktree of Builder's own last run stays behind (it cannot remove itself).

## Summary

Five hours, one real project, end to end: fresh install → folder → plan → build → review →
reject → round 2 → approve → a three-part task → reviews → merge. Builder's work and its honesty
were the strongest part; most of the pain came from the app starting it more than once.

**Fixed during the play-through** (PR "Fixes from inspecting rc.2 and a long play-through"):
folders written as `~/…` never mounted; Builder started on every change anywhere (and woke itself);
a verdict started the agent twice; the "could not reach" notice posted as me; no way to make the
first document; Approve pushed off screen by a long title; long conversation titles; raw markdown
in task details; reviews listed twice on a task; "Not started" for a task under way; "Started by
you" missing tasks made from my conversation; no working line for agents on parts or replies;
raw tool arguments under Peek; plus migration `0108` for installs that already ran first start.

**Still open — product decisions** (most important first):
1. **Asks without a card.** An agent can mark a decision "waiting" or a task "in review" long
   before (or without) sending a question or review card. Status words then say Needs input /
   Needs review with nothing to act on, and my page doesn't list it. Either the state change must
   come with its card, or the page must say "Builder hasn't asked yet".
2. **An approval while the asking run is still going is lost** ("could not reach my session").
   It should wait for that run to end and be handed over then.
3. **Stale reviews can't be set aside** — only Approve or Reject. Duplicates and superseded rounds
   keep "Needs review" and "waiting for you" lit forever.
4. **"Try it" live pages can't be tried**: a pin layer covers them, and inline pages may not run
   scripts. Needs a "Use it / Point at it" switch, and scripts allowed without same-origin.
5. **Work without a task.** For the first request Builder built everything inside the
   conversation; Work stayed empty. Only an explicit "as one task with parts" made a task.
6. **Queued requests look ignored**: a request waits silently while the agent is busy (9 minutes
   here). Say "Builder will start after its current work".
7. **Review cards in the thread are walls of text**; keep the card short, detail behind Look at it.
8. **Agent branches and worktrees pile up** (eight branches after one evening); nothing shows or
   tidies them.
9. Smaller: no folder picker in the folder dialog; after connecting a folder you stay on your page;
   Builder's hello says it can change "files here" before any folder; quitting while an agent works
   takes ~40 s and marks the run "crashed"; the review page draws blank for a second; Peek shows a
   command's text when the agent gave no description.
