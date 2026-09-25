# BC7 — Opinions out: the default install is empty

## What we need

**Why this exists.** The founder's ruling for the track: the app ships with nothing — one agent,
one subscription to everything, empty prompts — and every opinion arrives from a plugin or from
the person. Today a fresh install still carries opinions in code, and the other half of the ruling
is not possible at all: the bundled plugins cannot reach a user of the packaged app. This is the
last item of the track; nothing follows it.

**What exists today (census 2026-09-24, base `3407cb98f`).** The role catalog, the prompt
templates, the assistant system prompt and the team-scaffolding route the cull list named are
already deleted (BC5 removed the `org` package). What is left in core: boot seeds a "System Agent"
row on every launch; the welcome screen creates two agents (an assistant with a one-line baked
identity, a "Team Agent" with none) and no subscription; migration 0080 inserts three folders
(Product, Practices, General) into every database; one paragraph about asking a person for review
is appended to every agent prompt; two add-agent forms default the role to "builder";
`docs/system-prompts/` is dead and holds merge-conflict markers. On the plugin side: nothing
packages `plugins/` into the desktop build, nothing installs a plugin at boot or from the welcome
screen, `search_plugins` lists installed plugins only, Settings › Plugins takes a typed git URL or
folder path (a git URL of the repo fails — the manifest must sit at the repo root), and a plugin's
agents land with no harness and, at factory scope, no team, so they cannot run.

**Missing delta.** Both halves: finish the empty install exactly as ruled, and make the bundled
plugins installable from the packaged app so the opinions can come back.

**Founder rulings (interview 2026-09-24).**
- Both halves are this item. An empty install is only a product if a plugin can arrive.
- A team can exist without an agent. A fresh install after the welcome screen is: the person,
  their team, and **one agent — the person's assistant**, owned by them (so in their team by
  inheritance), on the picked harness, with an empty prompt. "The most minimal version."
  The welcome screen's second agent and the boot-seeded System Agent go.
- **Nine subscription rows, one per event** — never a wildcard ("harder for a person to edit").
  Each row has its own prompt, because each event needs a different reaction.
- **On a fresh install those nine prompts are empty.** The prompt is the person's taste on top of
  the part we generate around the event (context engineering). It fills only when a human edits
  it or installs a plugin.
- A plugin brings its own agents with their own subscriptions and prompts, as today. It does
  **not** write into the assistant's nine subscriptions. Skipped for good.
- The review paragraph added to every agent prompt **stays in code**, rewritten to how review
  actually works now. Proper context engineering and prompt construction stay.
- **The bundled plugins ship inside the app.** Settings › Plugins lists them as available with an
  Install button beside the installed ones; git URL and folder path stay for everything else.
  (A public plugin repo was the fallback if shipping were hard; it is a few lines of build config.)
- **A plugin's agents land on the team the plugin is installed for, on the first available
  harness** — the plugin is installed locally, so the local harness is the one. The librarian
  stays a no-team agent that reaches every team, as BC5 set it up.
- **A plugin can be installed per team, independently** (ruling on the critique's blocker,
  2026-09-25). Today a plugin is one row with one scope, so a second team's install silently moved
  the first team's agents away. Each team's install is now its own; nobody's agents move.
- The configuration layer (`builtin | plugin | user` origin, contributions with user overrides)
  stays: the founder called it "the right shape already". Not a delete candidate.
- The welcome screen keeps its look (BC5 ruling stands).

**Consequences the rulings settle without a question.** The three migration-inserted folders go
(four empty lists). The baked assistant identity goes (empty prompts). The "builder" form defaults
go. `docs/system-prompts/` and its stale references go. The hidden `system:propagation` actor row
stays as plumbing but leaves the agents list. Stale tool names in prompt text are fixed as part of
"proper prompt construction".

**Not in this item.** Letting a plugin add taste to an existing agent's subscriptions. A plugin
registry or public repo. Any welcome-screen change beyond making one agent and nine subscriptions
underneath. The UI rebuild and the agent workspace (the phase after this track).

**How it is used.** Someone downloads the app, opens it, types their name, picks a harness and a
folder. They see empty lists and one agent, their assistant. Every change they make wakes it; it
gets what happened and decides for itself. They open the assistant's profile and write, per event,
how it should react. Or they open Settings › Plugins, see "Role personas" and "Document
management" as available, click Install, and a builder, a designer and the rest appear on their
team, runnable at once; the librarian starts its sweeps. An agent can do all of that through the
same actions.

**Dials.** complexity: feature · ambiguity: settled by this interview · exposure: user-facing
(welcome screen underneath, Settings › Plugins, agent profile). Size: under 1,000 new lines;
deletions free; judged on net change.

## How it works

**Boot.** The server no longer seeds a "System Agent". It still makes sure the hidden system actor
row exists, because system writes need an actor; that row is not an agent and never shows in a
list of agents. A new migration deletes the three folders an earlier migration put into every
database, where nothing was ever filed under them. Nothing else is seeded.

**Welcome screen.** Same screen, same fields. Underneath it now makes two calls instead of three:
the person with their team and folder, then one agent — the person's assistant, owned by them, on
the picked harness, with no identity text — carrying nine subscriptions in the same call, one per
event, each without a prompt. Everything after that is the existing subscription machinery: a
change row fires, the assistant is within reach because it inherits its owner's team, it wakes with
"what happened" and an empty instruction, and decides for itself.

**The taste part.** On the assistant's profile the nine rows are there from the start; the person
writes the prompt for the events they care about, pauses the ones they don't. The generated part
around an event and the review paragraph are core and stay; the paragraph is rewritten so that
what it tells an agent about asking for review is what the thread module does today.

**Bundled plugins.** The desktop build carries the `plugins/` folder next to the migrations. The
plugin list now has two kinds of rows: installed, as today, and available — read from that folder
and not yet installed. Installing an available one is the same install as a folder path, with the
path supplied by the app, into the team of whoever installs it. The agents a plugin brings get the
first available harness at install time, the same choice the welcome screen makes, so they are
runnable at once; their subscriptions and prompt documents arrive as today. The librarian's plugin
is installed factory-wide and its agent keeps no team, so it reaches every team. Two teams can
each install the same plugin; each gets its own agents and its own row, and removing one team's
leaves the other's alone. Remove, disable, enable and restore are unchanged per install; a bundled
plugin a team has not installed shows as available to that team.

**Left simple.** No plugin registry, no versions, no updates: the bundled folder is whatever the
build shipped. A plugin only adds its own agents; it never touches the assistant. The harness is
picked once at install; changing it later is the ordinary agent edit.

## What was decided along the way

- **The premise moved.** The four opinions the track named were already deleted by BC5; the item
  became "finish the empty install" plus "let a plugin arrive". Both halves ruled in by the founder.
- **Wake once.** A change that itself starts an agent's work names that agent on its event, and that
  agent's subscriptions skip it; a subscription hears only changes after it was created. Without this
  a message to the assistant produced two sessions and two answers, and a new agent woke on its own
  creation.
- **An empty instruction is said out loud.** A subscription with no prompt tells the session that
  nobody has written an instruction for this event yet and to decide for itself; the old "speak only
  if the instruction asks" would have silenced the assistant for good.
- **A plugin installs per team** (founder ruling on the critique's blocker). One `plugins` row per
  install: the manifest name for a factory install, `<name>@<teamId>` for a team; one folder per
  install; contributed ids keep hashing the manifest name so existing installs are untouched;
  configuration-default ids take the install id. `installScope` in the manifest only picks the
  Install button's default scope; document-management declares `factory`.
- **An install refuses a team that does not exist** (review finding): a made-up team id had built an
  install path outside the install root and the installer's delete-then-copy reached it.
- **The system actor stays, hidden.** Boot inserts only `system:propagation`; `search_users` omits
  role "system" rows unless named in `ids`.
- **The three grouping roots** go only where unedited, empty and no task's source (0091); the demo
  seed inserts its own roots.

## Accepted limits and what is left

- The stored identity documents of the persona plugin carry raw `{{product}}` / `{{community}}`
  placeholders; they are substituted when a session prompt is built, not in the document. The
  assistant's first empty-prompt wake pointed exactly this out. Pre-existing.
- A person's configuration override of a plugin key applies to every team's install of that plugin
  (overrides have no scope); no bundled plugin ships such keys.
- If no harness is ready at install time a plugin's agents land without run config; the install
  succeeds and the ordinary agent edit fixes it.
- A plugin's agents are raw-inserted, so no `user.created` change fires for them; the assistant
  hears the documents they bring, not the agents.
- The shared backend always offers the repo's bundled plugins as available to every team; their
  agents take the server's own harness pool. The desktop app still does not wire plugin MCP servers.
- "A subscription hears only later changes" compares timestamps to the millisecond.
- The lower-level installer function still accepts any team id; only `edit_plugin` checks, and every
  real path goes through it.
- The remote server runs no boot seed (unchanged): a fresh shared database needs `db:bootstrap:pg`.
- Maintainer-owned `.claude/rules/docs.md:11` still lists `system-prompts/` — a pipeline run may not
  edit rule files; the founder's edit.
