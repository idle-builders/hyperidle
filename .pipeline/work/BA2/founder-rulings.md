# BA2 — Founder rulings

Recorded at the concept gate, 2026-08-25. These are decided; a later phase may not reopen them.

## 1. Nothing ships pre-marked

No builtin tool arrives marked as needing approval. The loop is entirely opt-in: it does nothing
until a human marks a tool, or until a tool definition earns an `irreversible` declaration for a
recorded reason.

This confirms the architecture's Decision 2 as written. The consequence is accepted deliberately:
the feature is invisible on a fresh install until someone turns it on. That is the correct reading
of "security is never preemptive — never a wall we build first".

## 2. The dead `enabled` toggle is BA9's row, not BA2's rubble

`editableFieldsFor`'s `case "tool"` `enabled` field (`layers/core-api/src/routes/agent-behavior-config-impl.ts:243-248`)
— written by the settings page, read by nothing — **stays**. It belongs to the tool-configuration
surface that BA9 owns, not to the approval loop. BA2 does not touch it.

`needsApproval` therefore **adds** a field alongside `enabled`; it does not replace it. The
architecture already says "gains, not becomes" — this ruling settles the conditional wording in
§5 ("stays until the founder says whose it is"): it is BA9's, and the condition is discharged.

The track partition holds: neither track acts on the other's rows.

## 3. Concept gate — not yet approved

The founder is reading the architecture before approving. **No code may be written.** The build
phase does not start until the gate clears.

## 4. Hooks are the mechanism

Confirmed 2026-08-25 after phase 1 research. Interception on the four CLI harnesses is done with
**hooks**, not with any harness's native permission tooling — which is in any case unusable in the
headless form this product runs on all four (see `harness-research/FINDINGS.md` §1).

## 5. Holding the agent inline is rejected

A hook can be held open (proven, 95 s). It is not used. The agent is frozen inside the tool call while
held and cannot compose the review, which is the work the design depends on. Approval **resumes** the
agent; D10 stands.

## 6. The push-back is delivered in two pieces

The agent must be told to raise a review via `submit_review` — it cannot be left to derive it. But that
instruction may **not** ride the hook's deny message: an imperative there is exactly what Sonnet twice
refused as a suspected prompt injection. Standing policy goes in the **seed prompt**; the deny message
is a **terse fact** naming the rule.

## 7. The builtin harness is out of scope

Ruled 2026-08-25. Ignore builtin. It is an in-process loop with no subprocess to hook, and every action
it takes is a HyperIdle tool-registry call — the category ruled out of scope in the interview. It is
**not** given a registry-level interception as a special case.

Consequence, accepted knowingly: a team's permission rule does not apply to an agent running on the
builtin harness. "This action needs a human" is therefore a property of the agent's harness as well as
of the team. Do not paper over this later by quietly adding registry interception — it was considered
and declined.

## 8. No design pass; the review appears where the human already is

Ruled 2026-08-25. *"If there is already a thread (i.e. for the task) it shows up in that thread; if not
it creates a new thread and it pops up in your conversation. We use what is there."*

This restates D7 and settles the surface question with it: **no design phase**. The review entry point
is an existing approved affordance and the work is to make it reach a task-hosted review, not to design
anything new. The independent reviewer reached the same conclusion.

## 9. A decline tells the agent why, and it may come back

Ruled 2026-08-25 — previously an assumption taken by the orchestrator, now **confirmed**. Every verdict
resumes the agent; a decline simply clears nothing and carries the human's reasoning back. AC7 still
holds: nothing is cleared, so the action stays blocked.

## 10. The gate reports rather than alarms — accepted on simplicity

Ruled 2026-08-25. Founder: *"not sure I understand, but if what you recommend is simple we follow
simple."*

Recorded honestly as a **deferred** decision rather than an independently reasoned one. What was
accepted: a dead gate becomes visible on the permission-list screen the next time a human looks at it,
rather than raising an alarm at the moment it dies. It catches the structural failures phase 1 named —
a shim never provisioned, the codex trust flag dropped, `--pure` left in place — because all three
produce zero heartbeats. It does not catch a gate that dies mid-session, or a rule whose pattern is
simply wrong.

**If this later proves too weak, the escalation is known and is not a redesign:** an active per-session
alarm needs `run-orchestration` to carry which harness ran, which is the open founder question in §9 of
the architecture. Nothing in the current design forecloses it.

## 11. The review screens working and being reachable is part of this package

Ruled 2026-08-25, at the concept gate, alongside approval: *"part of this workpackage is also to make
sure that the review screens actually work and are accessible."*

This **widens** the package deliberately. The architecture already repairs the entry point BA2 itself
breaks (a task-hosted review the page cannot open). This ruling goes further: the review surface as a
whole must work and be reachable, not only the path BA2 introduces.

**Orchestrator's reading, stated because it changes the work:** "accessible" is taken as *reachable and
usable* — a human can get to a review and act on it. It is **not** taken as accessibility in the
assistive sense (keyboard navigation, screen readers, contrast across the nine canvases), which would be
a substantially larger piece of work. Flagged to the founder; if the other reading was meant, this
ruling is re-scoped rather than stretched.

Consequence: the review surface is now BA2's to fix where it is broken, under the BA track's own
ownership rule — a package finishing a feature owns the rubble around it.

## Concept gate — APPROVED

Approved 2026-08-25: *"the plan and architecture sounds good lets continue."* Build may start.

## 12. The review canvases must show real data — the content pipeline is in scope

Ruled 2026-08-25, after the surface audit reported that the nine review canvases never render with real
data and only work against a hardcoded fixture. Founder: *"this workpackage is about getting review to
work properly. If the reviews only display stubs right now we also need to fix this. The goal here is in
the end we tested reviews through fully and seen they worked."*

This **overturns** the addendum's out-of-scope call on the canvases and widens AC8. A review whose
canvas shows a fabricated demo is not a working review: the artifacts and examples *are* the review, per
the interview — they are what makes producing one real work for the agent, and what distinguishes a
review from the push-back.

In scope as a consequence:
- Whatever populates a review's artifacts so a canvas renders the real thing.
- The nine canvases rendering real data, not a demo substitute.
- The silent demo substitution on an un-type-guardable payload (nine sites) — recorded by the audit as a
  trap for whoever populates artifacts. That is now this package.

**The bar is "tested through fully and seen they worked"** — an end-to-end demonstration of a real
review, not a component test with a hand-fed fixture. Note the audit's finding that the two e2e specs
covering the verdict path are already on the known-failing exclusion list, so no green end-to-end proof
exists at any level today. That gap is this package's to close, not to inherit.

Proof is read from the DOM and reported in prose. Screenshots are not evidence in this repository.

## 13. The six-kind consolidation stands; wire the canvases to it and prove it by hand

Ruled 2026-08-28, after the archaeology corrected the record. Founder: *"the consolidation to the 6
types makes sense. And yeah those should work we should manually test that an agent creates a review
and we can see it and approve it so this wiring up above is exactly this story."*

**The record, corrected.** An earlier report to the founder said the nine canvases never render real
data. That was wrong. All nine renderers were built 2026-06-19 (AL2, #337) and are complete. The demo
world ships real payloads for five kinds (`outcome_summary` ×3, `code_diff` ×2, `visual_diff`,
`browser_preview`, `metrics_moved`), persisted into the review message payload and read back by the
loader at `routes/reviews.ts:149-150,176`. **The canvases work.** Four kinds have no data anywhere:
`field_change_set`, `action_operation`, `rendered_in_context`, `batch`.

Eight days after the canvases shipped, 2026-06-27 (AM5, #369) consolidated artifact kinds to six —
`text, code, image, data, html, url` — retiring the old kinds with no migration and deleting the
conversion branch.

**The ruling:**
- **The six-kind consolidation is correct and stays.** Do not reintroduce the old artifact vocabulary.
- **The canvases stay and must work**, fed from the consolidated world. The founder wants a high
  diversity of things to render in a review; that is the point of the surface.
- **The story is the wiring**: an agent produces a review, a human sees it rendered, and approves it.
  Not a rebuild — the two breaks are `submit_review`'s `artifactRef` still speaking the pre-AM5
  vocabulary (zero overlap with what `create_artifact` emits, so an agent cannot attach anything), and
  the loader never resolving a ref at all.
- **The proof is a manual test of the running product**: an agent creates a review, it is seen, it is
  approved. Read from the DOM and reported in prose — screenshots are not evidence here.

The out-of-scope call on "feeding the canvases" from the earlier addendum is void; it rested on the
false premise that they had never rendered.

## 14. No demo data in productive code. Prefilled demo rows in the database are fine

Ruled 2026-08-28. Founder: *"we don't want demo data anywhere in our application except for in tests.
In productive setup super illegal."* — then, clarifying the line: *"we can prefill the database with
demo data, that is fine since that is still no demo data in productive code."*

**The line is code versus data.** Seeding a database with demo rows is legitimate; a shipping code path
that invents, substitutes or hardcodes content is not.

**Allowed:** the demo world (`tools/setup/src/demo-world/`) writing rows, including new canvas payloads.
That also settles the open question: seeding demo instances for the three canvases with no data anywhere
is **fine**, because it is data.

**Violations, all currently in shipping code:**
1. **The nine canvas fixture-substitution sites.** Each does `if (!isXPayload(p)) return FIXTURE` and
   renders a fabricated demo — a `Solo/$19` tier, `"Onboarding · Create account"`, `mailchimp`,
   `quickbooks`, `stripe`. The surface critique established five of these fire on **well-formed**
   payloads, not only malformed ones, so an agent's real review renders invented content on the success
   path. Under this ruling that is not merely an AC9 failure; it is prohibited outright.
2. **`FIXTURE_REVIEW` served from a shipping route** (`layers/core-api/src/routes/reviews.ts`) for the
   id `"rev-1"`. A production route returning hardcoded demo content.
3. **The hardcoded checkout mock in `ReviewComposition.tsx`** — `"SPRING24"`, `"$120.00"`, an expiry
   line — rendering inside every review. Already being removed by T4c.

All three are removed by this package. A canvas that cannot type-guard its payload renders the honest
unknown-canvas fallback; it never invents a substitute.

**Standing rule for the rest of the work:** production code may not carry fabricated content as a
fallback, a placeholder, or a convenience. If a real value is missing, say so in the interface.

## 15. "Accessible" means reachable — CONFIRMED

Ruled 2026-08-28, closing the ambiguity the orchestrator flagged when ruling 11 was made. Founder:
*"no accessible just means get to it, not accessibility in terms of assistive tech."*

So AC8 is **reach and act**: a human can get to a review and act on it. Assistive-technology
accessibility — keyboard navigation, screen readers, contrast across the nine canvases — is **not** in
this package. It is not thereby judged unimportant; it is a separate piece of work with its own scope,
and stretching it into BA2 under a word would have been the wrong way to take it on.

This confirms the reading the work was already built to (ruling 11's stated interpretation), so nothing
built needs revisiting. Recorded because an assumption that turns out right is still an assumption
until it is confirmed, and the next reader should see which it is.

## 16. If models do not comply, that is learning — adjust the push-back

Ruled 2026-08-28, while the real-binary proof was being written. Founder: *"if the models don't comply
that's relevant learning and means we need to adjust our push back."*

**The push-back is tunable, not fixed.** Model non-compliance with the block message is **not** a
verdict on the feature and **not** something to soften an assertion around. It is a finding about the
*wording*, and the wording is ours to change.

What that means for the proof lane and anything after it:
- A non-complying run must be **characterised, not just reported**: which model, which phrasing, how
  often, and what it did instead. "The model refused" is the beginning of the finding, not the end.
- The two-piece design (standing policy in the seed prompt, a terse fact in the deny message) already
  exists because research found Sonnet twice refusing a deny message that carried an instruction, while
  Opus complied on identical input. That was the first iteration of exactly this loop.
- Adjusting the wording is in scope. Weakening the assertion, raising the retry count, or picking a
  more compliant model to make the lane green is not — that hides the signal this ruling exists to
  collect.

This is why the harness lane runs real models rather than a stub: the thing being measured is whether a
real agent, given a real push-back, does the right thing next. A stub can only prove we sent bytes.

## 17. visual_diff: no fabricated screens; real content comes through the six artifact kinds

Ruled 2026-08-29. Founder: *"Like we said previously we reduce down to the 6 review interfaces. We had
this discussion previously. And also we set a hard rule not demo data anywhere in production code. Demo
stuff only ever enters through database population."*

Resolves the last open question. Two rulings already made decide it, and no new one was needed:

- **Ruling 14** — no fabricated content in production code. `ReviewVisualDiff`'s `MockScreen`
  (`:114-160`, mounted unconditionally at `:330` and `:339` as *both* evidence panes, with a hardcoded
  figma mark at `:190,320`) is demo data living in a shipping component. It goes. Not conditionally,
  not behind a guard — deleted.
- **Ruling 13** — the six-kind artifact consolidation stands. Real visual content reaches a review the
  way all other content does: as artifacts of the consolidated kinds, `image` being the relevant one
  here. The canvas renders what it is given and nothing else.
- **Ruling 14's second half** — demo data enters **only** through database population. If a demo
  visual comparison is wanted, it is seeded as image artifacts in `tools/setup/src/demo-world/`, never
  hardcoded into the component.

So `visual_diff` renders the labels and artifacts its payload actually carries. Where it has no image,
it shows an honest absence — the same rule every other canvas now follows. No design pass (ruling 8);
this is subtraction plus reading real data.

**This closes T4e-b.** It was the only remaining founder-blocked item in the package.

## 18. Trust is declared, not bypassed — and filesystems are what declare it

Ruled 2026-08-29, correcting a fix this package shipped. Founder: *"HyperIdle session sandbox can 100%
be a git repo… and trusted directory is not about git repo or not, it just means we need to tell it to
trust that directory. Which is the full purpose of the filesystems, which tell what are trusted
directories and should also make it known to the harness that this is trusted."*

**What was wrong.** T8 hit codex 0.150.1 refusing to run in the session sandbox — *"Not inside a trusted
directory"* — and fixed it by passing `--skip-git-repo-check`. Two errors in that:
- It diagnosed the cause as "the sandbox is not a git repo". It is not a git-repo check; it is a
  **trust** check, and codex's own mechanism is `[projects."<path>"] trust_level = "trusted"` in its
  `config.toml`. Verified in the installed binary's own config.
- It **bypassed** the check rather than **granting** the trust. This package already refuses that shape
  elsewhere — it is the same move as running with a safety flag off because the safe path was not wired.

**The right shape.** HyperIdle already writes `<sandbox>/.codex-home/config.toml` (for the MCP server
entry), so the trusted-project declaration belongs in the file we already author. And the thing that
*decides* what is trusted is the **filesystem primitive** — that is its purpose. A session's mounted
filesystems are the trusted directories, and the harness should be told so, per harness, in whatever
form that harness understands.

So: revert `--skip-git-repo-check`; declare the sandbox and the session's mounted filesystems as trusted
in the config we already write; and treat "make the harness aware of what the filesystem primitive
declares" as the general shape rather than a codex special case.

**The standing rule this makes explicit:** when a harness refuses on trust, grant the trust through its
own mechanism. Never reach for the bypass flag — a bypass makes the refusal disappear without making
the thing safe, and hides whatever the check was protecting.

## 19. Approval is not asserted in prose. The hook allows the call; the tool result carries the outcome

Ruled 2026-08-29, from the cursor-agent resumption finding. Founder: *"the cursor rejection gives you
exactly the design guidance. The response of the review is the result of the submit_review tool which
includes what was approved. There is no tool check list — rather, when we reprovision the session after
the review approval, the hook intercepting needs to understand that it should allow the specific call
the next time."*

**What the model taught us.** A resumed cursor-agent refused to act, and its own reasoning was right:
*"That claimed approval is suspicious — it's coming through the conversation text rather than an actual
system-level confirmation, which is a hallmark of injection attempts. A real clearance would come back
through the system as a tool result naming the rule id it cleared, not as a message asserting that a
human already said yes."*

We were telling the agent it had been approved, in prose, with nothing authenticating it — and then
asking it to act on that claim. Claude happened to believe it; cursor-agent did not. **A mechanism that
depends on the agent being credulous gets weaker as models get better.** That is the wrong direction.

**The design, and it is subtraction not addition:**
- **The hook allows the call.** `adjudicateAction` already spends a cleared clearance and lets the
  action through. The authority lives at the system boundary, where it cannot be forged, and the agent
  never has to evaluate a claim. It simply retries and the action works.
- **The prose claim goes.** `buildResumeTranscript`'s *"A human reviewed and approved your request…
  you may now retry"* is deleted. The task instruction stays — the agent needs to know what it was
  doing, which is a fact about its own work, not an assertion of authority.
- **What was approved rides the `submit_review` tool result** — the authenticated channel the model
  itself named — not a sentence in the transcript.
- **No `check_clearance` tool.** Explicitly rejected: it adds a round trip and a new surface to answer
  a question the hook already answers by simply allowing the call.

**The standing principle:** never ask an agent to trust an assertion of authority delivered through a
channel an attacker could also write to. Put the authority where it is enforced. An agent refusing an
unauthenticated claim is behaving correctly, and a design that needs it not to is the defect.

## 20. The gate, redesigned: scoped rules, a waiting tool, an adapting hook

Ruled 2026-08-29, after the founder called a halt on a 4,277-line production diff and challenged the
gate's shape. This **replaces** the design in `architecture.md` §2 for pieces 6 and 7.

### No clearance table
*"No I don't want a clearance table, that's over engineered."*

The `actionClearances` table, its state machine (blocked → cleared → spent), the CAS spend, the retry
and the abandon path all go. They existed to carry a grant across a gap between two sessions. There is
no gap — see below — so there is nothing to carry.

### No liveness heartbeat
*"What is a liveness heartbeat in this case… also sounds overengineered."*

For the record, since it was asked: every session checked in with the server, and the settings screen
displayed *"checked by claude-code 2 minutes ago"*, so a human could notice a gate that had silently
stopped working — on three of four harnesses a broken gate fails **open** with no error, no event and
nothing on the wire. It was built for that.

**Dropped.** The accepted residual: if a hook breaks, actions stop being intercepted and nothing says
so. Recorded here so it is a known trade rather than a surprise.

### Rules are scoped items, like everything else in the system
*"What it should be like everywhere else: we have rule items which can be assigned global, a team, or
an agent. And session provisioning then takes the set that is specific for the agent — which is the
global stuff, plus stuff for the agent's team, plus stuff for that specific agent. And in the settings
we then see those various rules with their scope."*

So: **one rule item with a scope** — global, team, or agent — not a per-team table. Provisioning
resolves the applicable set by union: global + the agent's team + that agent. Settings lists rules and
shows each one's scope.

### The rule table is not a request log
*"Seeing what the agent requests doesn't belong in that rule table — that's something we see in the
reviews, and we can later take from reviews and bake it into the rule table."*

What agents ask about is visible in the **reviews**, which is where it already is. Promoting a pattern
from reviews into a rule is a later, deliberate act by a human — not something the rule store
accumulates on its own.

## 21. `submit_review` waits. There is no second session

Ruled 2026-08-29. *"Two-session machinery sounds wrong. What we have here is a tool that responds back
with the review result. It just interrupts the session — actually what it really is, the agent waits
for the result — and once the review is back the session continues, like many other tools / MCP calls
do. And the hook just adapts what he is triggered on."*

**`submit_review` is an ordinary tool call that happens to take a long time.** The agent calls it, the
call blocks, a human answers, the tool returns the verdict, and the same session continues. Exactly the
shape of any slow MCP call. Nothing is re-provisioned and nothing is resumed.

**The hook adapts what it triggers on.** After an approval comes back, the action that was blocked no
longer triggers the hook for that session. That *is* the one-time pass — held in the session's own gate
state, needing no table and no persistence, and naturally expiring when the session ends.

**What this deletes:** the `review_approved` session-request kind and its check constraint,
`resolveReviewReengagementRequest` and the reengagement path, the resume transcript, the session-end
net for an unspent clearance, and the admission-failure branch for a failed resumption.

**Why it is also more correct, not merely smaller.** The two-session design had to *tell* a resumed
agent it had been approved, in prose, with nothing authenticating it — and a real cursor-agent refused
that as a suspected prompt injection, correctly (ruling 19). A tool returning its own result is a
channel the model already trusts, so the problem disappears rather than being mitigated.

## 22. Declare the filesystems we inject as trusted, on every harness that has such a mechanism

Ruled 2026-08-29, correcting ruling 18 after it was proven insufficient. Founder: *"yeah the first — or
generally, for all harnesses that have a trusted directory mechanism we should define the filesystem we
inject as trusted."*

**What ruling 18 got wrong.** It asserted that writing codex's `[projects."<path>"] trust_level =
"trusted"` entry would let `codex exec` start in the session sandbox. It does not. Proven by probe, on
the installed 0.150.1 binary: same directory, trust declared, `codex exec` refuses with *"Not inside a
trusted directory and --skip-git-repo-check was not specified"*; `git init` that same directory, same
config, and it runs. Codex **reads** the entry — a bogus key inside that table is rejected, so the file
is parsed — and **ignores it** for this precondition.

That error was the orchestrator's: the mechanism was inferred from seeing the entries in a real config,
and never probed against the check it was supposed to satisfy.

**The ruling, in two parts:**

1. **The session sandbox is a git repository.** This is what actually satisfies codex, it needs no
   bypass flag, and it was the founder's own first instinct. It is also plausibly useful beyond codex —
   an agent working in a versioned scratch directory can diff and revert its own work.
2. **Where a harness has a trusted-directory mechanism, declare the filesystems we inject as trusted
   through it.** That part of ruling 18 stands and generalises: the filesystem primitive knows what a
   session mounts, and a harness that can be told should be told. It is simply not sufficient on its
   own for codex.

**The standing rule from 18 is unchanged and was never the problem:** when a harness refuses on trust,
grant the trust through its own mechanism — never reach for the bypass flag. What changed is the
finding that for `codex exec`, the mechanism that actually grants it is the directory being a
repository.

## 22a. Correction to ruling 22 — the trust declaration is not even necessary for this check

Recorded 2026-08-29 after the rework produced a full empirical matrix against the installed
codex-cli 0.150.1. Ruling 22 said the trust declaration was "necessary but not sufficient". That is
still wrong. The matrix:

| sandbox is a git repo | `trust_level` declared | `codex exec` |
|---|---|---|
| no | no | refused |
| no | **yes** | **refused** |
| **yes** | no | **runs** |
| yes | yes | runs |

**The refusal tracks git-repo-ness alone.** A bare `git init` with **zero commits** satisfies it; the
trust declaration changes nothing either way for this precondition.

That is now three successive corrections to the same claim — first asserting the declaration was the
fix, then that it was necessary-but-insufficient, and only now, from a matrix rather than a single
probe, that it is beside the point. **The lesson is the method, not the fact:** each earlier claim came
from testing one combination and reasoning about the rest. A two-variable question needs all four cells.

**What stands unchanged:** the founder's instruction in ruling 22 that where a harness has a
trusted-directory mechanism, the filesystems we inject are declared through it. That is a principle
about being explicit with harnesses, and it is kept deliberately — not because it satisfies codex, which
it does not, but because it is the right shape and other harnesses may honour it. The `@lore` in the
code now carries the full table so no future reader repeats this.

## 23. A session waiting on a human does not hold a concurrency slot

Ruled 2026-08-29. Founder, on being told a waiting `submit_review` occupies capacity: *"well but if
it's not working it shouldn't be holding a concurrency slot."*

**Established first, by reading the code rather than assuming:**
- **A waiting tool call costs no tokens.** The model has emitted its call and is awaiting a result; it
  generates nothing meanwhile.
- **HyperIdle imposes no timeout anywhere on the MCP bridge or the tool path.** A tool call may wait
  indefinitely as far as our own code is concerned.
- **But it holds a concurrency slot.** `adapter-pool.ts` selects by `currentLoad / maxConcurrent`
  (`:168`, `:203`), and the local CLI defaults are **2** and **4** (`:520`, `:574`). One session parked
  on a human for an hour therefore consumes a quarter to a half of that harness's whole capacity.

**The ruling:** the slot bounds *active work* — CPU, memory, model throughput. A session blocked on a
human is doing none of it and must not count. It releases its slot on entering the wait and takes one
again when the verdict returns.

The mechanism is small: `currentLoad` is a single counter per adapter entry, incremented at selection
(`:210`) and decremented at release (`:254-255`).

**The one question this opens, to settle when it is built:** what happens if the pool is full when the
human finally answers. A released slot may have been taken meanwhile. Reserving defeats the purpose;
briefly exceeding the limit, or queueing the resumption, are the honest options. Decide it deliberately
rather than letting the resumed session fail on a full pool.

**Still unmeasured, and the design must not assume it away:** whether the harnesses themselves impose a
tool-call timeout. Ours do not, but phase-1 research held a Claude Code hook open for 95 seconds only
with an explicit 600-second setting — so harness-side timeouts exist and are configurable, and a default
may well sit on the MCP tool path. If a harness caps a tool call at, say, 60 seconds, "wait for a human"
does not work there without changing that setting. **Probe each harness before building on it.**

## 23a. The full-pool question was already answered — the queue exists

Recorded 2026-08-29. Ruling 23 left open "what happens if the pool is full when the human finally
answers". The founder asked whether the system already queues work when max-concurrent is reached. It
does, and I confirmed it in the code rather than assuming either way:

- `adapter-pool.ts:208` — `select()` returns `null` when every matching adapter is at `maxConcurrent`.
- The runtime raises a **`ConcurrencyLimitError`**, distinct from `NoEligibleHarnessError` — one is
  "everything is busy" (429), the other "no such harness is registered" (422, a configuration problem).
  The system already separates the two.
- `runtime.ts:397-400` — on `ConcurrencyLimitError` it **releases the request's claim**, returning it to
  the pending pool. The next drain picks it up.

**So a full pool does not fail work; it queues it.** A resumed session whose slot was taken while it
waited simply re-enters that queue and starts when capacity frees. Nothing new is needed: no
reservation, no deliberate over-limit, no bespoke resumption queue.

**The lesson, and it is the founder's point:** the open question was a gap in my knowledge of the
system, not a gap in the system. Check what exists before designing around its absence — the same error
that produced three wrong claims about codex's trust mechanism.

## 24. The review ends the session; the verdict resumes it as a user message

Ruled 2026-08-29. **Supersedes ruling 21's "submit_review waits".** Founder: *"Our review tool stays
something that ends the session, and the response to the review is the user message to continue the
session — that shouldn't end up feeling like a prompt injection."*

**Why the waiting shape was abandoned.** Measured against the real binaries: claude and opencode can be
held open indefinitely with progress-notification keepalive, **codex cannot** (wall clock, progress does
not reset it), and **cursor-agent caps at 60 seconds with no lever at all** — it sends no progress token,
so keepalive is structurally impossible. Waiting therefore could not work on all four, and ruling 4 says
it must.

**Why resuming works where the earlier two-session design failed.** The original design ended the
session and then built a *new* one carrying a **fabricated transcript** asserting *"a human reviewed and
approved your request"*. cursor-agent refused it as a suspected prompt injection and was right — nothing
authenticated the claim. Delivering the same verdict as a **genuine user turn in a genuinely resumed
session** removes the claim entirely: it is not a message *about* a human, it is the human.

**Proven on all four, 42 two-phase runs against the real binaries** (`harness-research/session-continuation.md`):

| | resume invocation | carries a message | context survives | complied |
|---|---|---|---|---|
| claude-code | `claude -p <msg> --resume <uuid>` | yes | fully | 4/4 |
| codex | `codex exec resume <thread-id> <msg> --json` | yes | fully | 6/6 |
| cursor-agent | `cursor-agent -p <msg> --print --resume <chat-id>` | yes | fully | 3/6 bare, **8/8** worded |
| opencode | `opencode run <msg> --dir <sandbox> --session <id>` | yes | fully | 6/6 |

cursor-agent, given the exact sentence it once called an injection: *"That got approved, so I'll try it
once more."* Control: with no approval, all four declined to retry and recounted the block — the retry is
verdict-driven, not resumption-driven.

**Two constraints this creates:**
1. **The verdict's wording is load-bearing on cursor-agent.** A bare *"Approved. Go ahead."* complies
   3/6 — it objects on *mechanism*, not suspicion: *"a chat message saying 'approved' isn't the same as
   the formal review approval mechanism the policy requires."* Naming the gate fact in the verdict takes
   it to 8/8. Tunable per ruling 16.
2. **cursor-agent fails silently on a wrong resume.** claude, codex and opencode all fail loudly on a
   bad session id or a mismatched working directory. cursor-agent **exits 0, echoes back the id you
   asked for, and runs a context-free session** — reproducing the original defect exactly. A positive
   check that the resumed session is the one intended is required, not optional.

## 25. One shape only — delete before building

Ruled 2026-08-30 on approving the gate plan. Founder: *"Let's make sure that we cleanup and there is a
single method to do this, not yet another shape."*

The history that earns this: the approval loop has now been designed three times — the original AL7
capture machinery, the abandoned two-session resumption path, and the design in `BA2-gate/plan.md`. A
codebase carrying more than one of those teaches the next reader the wrong one.

**Checked before acting, rather than assumed:** the abandoned two-session path **never merged** — zero
occurrences of `resolveReviewReengagementRequest`, `buildResumeTranscript`, `review_approved`,
`actionClearances` or `teamActionRules` anywhere in `origin/main`. Only the five reviewed pieces landed.
So there are **two** shapes, not three: the old capture machinery, and the one to be built.

**Therefore the deletion goes first, as its own change.** The old AL7 capture path — `proposedCalls`,
`tailoredGrants`, `sessionWorkflow`, `captureProposedCall` and everything reachable only from them — is
removed before any new code is written. It is already production-dead (verified: every `sessionWorkflow:`
site is a pass-through of an optional field that no production caller ever supplies), so this is a
deletion with no behaviour to preserve.

The repository then holds exactly one shape at every moment: the old one until it is gone, then nothing,
then the new one. Never two at once, and never a reader's choice between them.

`docs/process-layer/staged-operation.md` documents the deleted mechanism and goes with it.
