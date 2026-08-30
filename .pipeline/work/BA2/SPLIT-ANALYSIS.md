# BA2 — what was built, what is healthy, how it splits

Written 2026-08-29, after the founder called a halt on a 25k diff for a feature that should be small.

## The 25k is not 25k of feature code

| | lines added |
|---|---|
| `.pipeline/work/BA2/**` — planning artifacts, critiques, rulings | **10,190** (41%) |
| tests, stories, fixtures | **10,493** (42%) |
| **production code** | **4,277** (17%) |

The planning artifacts are process residue, not product. The test volume is high because every
piece was proven red-then-green and several were proven again on real harness binaries.

**4,277 lines of production code is still too much for "an agent asks, a human clears it."** The
analysis below says why: roughly 1,800 of it is the feature, roughly 700 is repairing a review
surface that was already broken, roughly 600 is fixing pre-existing bugs that have nothing to do
with this feature, and roughly 400 is built on a premise the founder has since overturned.

## Six pieces, in the order they should ship

### 1. Codex has been completely broken in production
**~300 lines. Independent. Ships first, alone.**

`codex-cli` refuses to run in a directory it does not trust — *"Not inside a trusted directory"* —
and HyperIdle's session sandbox was never declared trusted. **Every codex session was exiting before
the model was ever called.** Nothing to do with BA2; version drift exposed it.

The fix declares the sandbox and the session's mounted filesystems trusted in the `config.toml`
HyperIdle already writes, driven by the filesystem primitive (founder ruling 18: grant trust through
the harness's own mechanism, never bypass the check).

Files: `cli-mcp-config.ts`, `adapter-pool.ts`, `provision-harness-environment.ts`, `mounter.ts`,
plus the `trustedPaths` thread through `boot.ts` and `provisioner.ts`.

### 2. Cursor-agent has always reported zero tokens
**19 lines. Independent. Ships alone.**

`cursor-agent` reports usage in camelCase; the metrics parser reads Anthropic's snake_case. Every
cursor-agent session ever has reported 0 input and 0 output tokens regardless of real spend.
Found while debugging something else. One file, one test built from the real binary's output.

### 3. The review surface fabricates content
**~700 lines, mostly deletions. Independent of the gate. Large user-visible win.**

All nine review canvases put things on screen that no payload supplied — an invented `Solo/$19`
pricing tier, vendor names (`salesforce`, `zendesk`, `mailchimp`, `stripe`), a hardcoded
`coverage +0.4%` on every diff, *"All checks passed"* where the payload carries no pass/fail state
at all, and *"Irreversible"* on operations that are not. A fake checkout card ("SPRING24", "$120.00")
rendered inside every review. A hardcoded fixture was served from a shipping route. Two controls did
nothing when clicked.

Enforced now by a property rather than a banned-string list: *no string or number may reach the DOM
that the payload did not supply, except fixed interface chrome*. That catches the next fabrication,
not only today's.

**This is the piece with the clearest standalone value and the least entanglement.**

### 4. A review cannot be reached or approved
**~200 lines. Independent. A live bug today, not only under BA2.**

The review page opened only from a bet-hosted thread; its approve button could not fire at all on a
real review because the loader returned neither id the page derived its host from — only a hardcoded
fixture made it appear to work. `submit_review` posted to the **bet's** thread and created threads
with **no human participant**, making agent-raised reviews unreachable by construction.

Fix: the loader returns the review's own thread, the page uses it, the route flattens to
`/reviews/:reviewId` (the bet-shaped route deleted, not redirected — no compat shims), and
`submit_review` anchors on the task and seeds the human.

### 5. An agent cannot attach content to a review
**~250 lines. Independent. Also a live bug today.**

`create_artifact` emits six kinds (`text, code, image, data, html, url`). `submit_review` demanded
one of five retired pre-consolidation names. **Zero overlap** — an agent doing the obvious thing was
rejected every time. And a valid reference was never resolved by the loader.

Fix: the reference speaks the consolidated six, the read arm stays tolerant so old rows still parse,
and an agent can also attach canvas payloads directly.

### 6. The action gate itself — the actual feature
**~1,800 lines. Depends on 4 and 5 to be demonstrable.**

Per-team rule store, wildcard matcher, clearance state machine, the `/action-check` bridge route,
per-harness hook shims (claude, codex, cursor-agent proven; opencode not built), and the settings
screen. Proven end to end on the real claude binary: a rule blocks a real agent's command, it raises
a review, a human approves, the action goes through.

**This is the piece to challenge hardest.** Candidates for over-engineering, listed honestly:
- **The gate-liveness heartbeat.** Built because a dead gate fails silently on three of four
  harnesses. It is real, but it is a whole mechanism plus a settings display for a failure mode
  that a simpler design might not have.
- **The clearance state machine** — blocked → cleared → spent, with CAS, retry and abandon. Much of
  its complexity exists to survive the gap between two sessions. See piece 7.

### 7. The two-session resumption machinery — built on an overturned premise
**~400 lines. Founder has since said `submit_review` does not end the session; it waits.**

If the tool call waits and the session continues, then none of this needs to exist: the
`review_approved` session-request kind and its check constraint, `resolveReviewReengagementRequest`,
the resume transcript, the session-end net for an unspent clearance, and the admission-failure
branch for a failed resumption.

It also produced the design's worst idea, which the founder killed: telling a resumed agent *"a human
reviewed and approved your request"* as prose in its conversation. A real cursor-agent refused it as a
suspected prompt injection **and was right** — nothing authenticated it. Claude believed the same
sentence, so the mechanism worked by luck on the more credulous model.

**Recommendation: delete this piece rather than port it.** Rebuild against the waiting-tool-call
design, where the approval is the tool's own result and the hook simply allows the retry.

## What to challenge before rebuilding piece 6

1. **Does the gate need a clearance table at all** if the tool call waits? The hook could allow the
   specific action for the remainder of that session, held in the session's own state.
2. **Does the heartbeat earn its place**, or is a dead gate acceptable to discover another way?
3. **Is a per-team rule list the right first shape**, given the list starts empty and the founder's
   stated value is *learning what agents themselves flag* rather than enforcement?

## Each piece carries its own tests and its own rationale

A split that moves only production code leaves the evidence and the reasoning behind, and the pieces
stop being independently reviewable. So each branch takes three things:

**Its production code. Its tests. Its slice of the planning record.**

### How the 10,493 test lines divide
Cleanly, in almost every case — the tests were written per task and are already named per concern:
- `*.no-fabrication.test.tsx` (9 files) + the shared helper → **piece 3**
- `Conversations.review-routing`, `reviews-loader-thread-id`, `submit-review-task-anchor` → **piece 4**
- `review-artifact-kind-write-arm`, `review-artifacts-envelope-write-arm`, `reviews-loader-artifact-channel`, `submit-review-artifact-ref`, `submit-review-canvas-artifacts`, `demo-world-canvas-kinds` → **piece 5**
- `action-gate-workflow`, `action-gate-routes`, `action-gate-mcp-seam`, `action-gate-provisioning`, `settings-action-rules-routes`, `SettingsActionRules`, the per-harness shim tests, `action-gate-realbinary`, `action-gate-builtin-real` → **piece 6**
- `cli-native-metrics` → **piece 2**; `cli-mcp-config` trust cases → **piece 1**
- `threads.verdict-review-resumption`, `action-clearance-session-end-net`, `agent-run-admission-failed-review-approved-reengagement`, `review-reengagement` → **piece 7**, and they die with it

The one genuinely shared file is `action-gate-realbinary.integration.test.ts`, which holds the claude,
codex and cursor-agent lanes in one file. It belongs to piece 6 and should stay whole.

### How the 10,190 planning lines divide
Less cleanly, and most of it should not travel at all:
- **`superseded/`** — a rejected architecture and its three critiques. Keep in the archive; it ships
  with nothing. Its `feasibility.md` is the exception: an accurate `path:line` audit of the tree,
  worth keeping findable.
- **`architecture.md` (~1,200 lines) and `feasibility.md`** — written as one document for one large
  package. They do **not** split cleanly, and rewriting them per piece is make-work. Each branch
  should carry a **short plan of its own** — what it fixes, why, how it was proven — and reference the
  full record rather than copying it.
- **`founder-rulings.md` (19 rulings)** — the highest-value artifact here and the one thing that must
  not be lost. Several are general, not BA2's: no fabricated content in production code (14, already
  promoted to `.claude/rules/typescript.md`), grant trust rather than bypass it (18), never assert
  authority in prose (19). Those belong in the repo's standing rules, not a work-package folder.
- **`harness-research/`** — demonstrated-live findings about five binaries. Durable and reusable;
  belongs with the harness work (pieces 1, 2, 6), not archived.
- **`SPLIT-ANALYSIS.md`, `interview-2026-08-25.md`, `progress.json`** — the record of how this went.
  Stays in `.pipeline` as history.

**The honest read: of 10,190 planning lines, a few hundred are durable (the rulings, the harness
research), and the rest is the cost of having designed the wrong thing twice.**
