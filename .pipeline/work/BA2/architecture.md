# BA2 — architecture

The technical reading of `plan.md`. It decides nothing about how the program works; where this file
and the plan disagree, the plan wins. Harness behaviour comes from `harness-research/deep-*.md` and
from nowhere else — not from `founder-rulings.md`, which records decisions rather than measurements.

## Where this starts from

An implementation of this same mechanism already exists on this branch (PR #542): the gate written
per harness, an `/action-check` route, a `gate_reviews` record, a clearance keyed to rule-and-tool,
`session_resume` as an intent kind, `gate_resume` as a session source, and the provisioner branch that
reopens a session with the verdict. It was built before the research. The mechanism it implements is
confirmed. Three of its per-harness details are not, and that is the substance of this document.

## Reconciliation — what survives, what does not

Checked against the code on this branch, not against the spec that produced it.

| Piece | Verdict |
|---|---|
| End-the-session-then-resume, all four | **Survives.** Confirmed for a new reason: a human may take days and a held process does not survive that. |
| cursor `hooks.json`: `command` + `failClosed: true`, no `matcher` | **Survives.** cursor has no native `matcher`; a `preToolUse` hook fires for every call and the script dispatches on the tool name. Writing a `matcher` as an object — what cursor's own docs show — voids the entire file silently. |
| `/action-check` per call | **Survives.** The plan requires the cleared set to be re-read per call and never to live in the gate's own configuration; an HTTP ask satisfies both. It adds a dependency on the app being reachable, which is fail-closed by construction and already proven for claude and codex. |
| opencode `OPENCODE_PERMISSION` as `{"bash":"deny"}` | **Broken.** A whole-tool deny *removes the tool from the model's toolset*; the model never learns a rule exists and cannot ask. Only a pattern deny produces a denial the model sees. Must become a pattern form. |
| codex hook trust | **Incomplete.** Nothing writes `[hooks.state."<key>"] trusted_hash`; the adapter passes `--dangerously-bypass-hook-trust` instead. That works but emits two error-type stream warnings and does not persist. Writing the hash makes the hook fire with no flag and no warnings. Any later edit to `hooks.json` silently disarms the gate, so the hash must be rewritten whenever the file is. |
| cursor resume | **Broken.** `resumeSession` is handed the *new* session's `sandboxPath`. cursor binds a chat to the literal cwd string (`~/.cursor/chats/<md5(cwd)>/`); a mismatch exits 0, echoes the right id, and runs with zero context. This is the most likely cause of the unexplained hang recorded against the previous attempt. |
| Instruction reaching the agent | **Fixed on this branch.** `SessionConfig.instruction` carries the task; `assembledPrompt` stays context. Previously the agent received 200 characters of the wrong text and could not reach the gate at all. |

Nothing else in #542 was found to contradict the research. That does not mean the rest is proven —
see *Verification*.

## Obligations

| From the plan | Implementation obligation |
|---|---|
| Nothing is interrupted until someone adds a rule | Provisioning resolves the applicable rules; an empty set writes no gate at all. Already true. |
| The agent is told which rule stopped it, as a fact | The refusal carries the rule; the instruction to use `submit_review` lives in the session prompt, not the refusal. |
| The agent asks with a real review | `submit_review` unchanged. A review is linked to the block that caused it; a review with no pending denial links nothing. |
| Cleared once, and only if blocked first | The clearance is authorised by the link record, never by the act of filing a review. |
| Decline is not final and does not decline the task | A decline resumes the session carrying the reasoning; the rule stays in force. No state marks the task refused. |
| All four harnesses on their own terms | Per-harness gate writers; one shape per harness, no compatibility path. |

## Contracts

**The gate seam.** Each harness's gate asks one question per tool call — *may this session run this
tool* — and gets allow, or deny with a reason naming the rule. The transport is the existing
`/action-check`. The answer must be computed from the session's rules and its cleared set, and must
fail closed on any error, timeout, or unreachable server.

**The clearance.** Keyed to the rule *and* the tool, spent by that action alone. Not keyed to "the
next tool call" — a resumed session's first call is typically an unrelated read, and keying it that
way is what made an approved action get refused again.

**The link record.** One row per review a gate caused, carrying the session, the rule, and the tool.
Unique on the review. It is the only thing that authorises a clearance.

**The resume.** A verdict produces a durable intent, drained into a session request whose source is
the gate review, provisioned like any other session, with one branch at harness start: reopen the
harness's own session and deliver the verdict as a real user turn.

## Per-harness invariants the build must hold

Each is measured; each has a failure mode that looks like success.

- **All four fail open.** claude reports malformed hook JSON as a *successful allow*. codex skips a
  hook whose config hash changed, with no output anywhere. cursor voids its whole hooks file on a
  malformed matcher. opencode logs nothing at all when a plugin fails to import. Per the plan we do
  not monitor for this — a dead gate is a failed session — but no code may treat the presence of a
  config file as evidence the gate is live.
- **opencode** — pattern deny, never whole-tool. Tool arguments arrive on the *second* handler
  parameter. Concurrent runs collide on one global SQLite database; a per-run data dir is required.
- **codex** — a rule naming one tool is a hole: blocked on `Bash` the model routes writes through
  `apply_patch`. Per ruling 26 this is accepted behaviour, not a defect to close, but a rule set meant
  to hold must name both. A blocked call is invisible in the JSON stream — never read the stream to
  learn a gate fired.
- **cursor** — resume must run in the session's own directory. The binary auto-updates itself
  mid-session, so no behaviour may be pinned to a version string.
- **claude** — resume finds a session anywhere by id; the caller may assign that id. Concurrent
  resume of one session silently loses a branch, so a verdict must not race a second verdict.

## Security

This change reaches three surfaces.

**An agent-authored field reaching a human.** A review's title, reasoning and artifacts are written by
a model and rendered to a person who then approves something. The abuse case is a review that
misrepresents what will happen. The plan's answer is that what is approved is the agent's account and
the clearance is same-kind not same-command — so a human approves a *kind of action*, and the blast
radius is that kind. No change here makes agent text executable.

**A state-changing decision endpoint.** The verdict clears an action. The abuse case is an agent
granting itself a clearance by filing a review. Closed by the link record: only a review a gate
actually caused authorises anything, and that record is written from the gate's own account of what it
refused, never from the tool's arguments.

**The sandbox filesystem.** We write the gate into it, and the agent can read what we write — an agent
was observed reading a gate plugin's source and quoting its rule back. The gate is therefore not a
secret and must not carry one beyond the session-scoped bridge token it already holds.

Not touched by this change: credentials, outbound requests to third parties, and the isolation of the
sandbox from the user's own configuration. That last one is a real and separate exposure, recorded
outside this package.

## Verification

The maintainer has defined done: *the agent decides it is done according to the task and marks it
done*. The evidence is therefore behavioural, not a gate.

**The one piece of end-to-end evidence:** invent a task locally, let the agent hit a rule, watch it
raise a review, then approve it once and decline it once and observe each outcome — on all four
harnesses. This is a recorded manual check, not a new harness; the equivalent automated form has no CI
job by design and would gate nothing.

Existing lanes cover the rest and are adequate: unit tests for the clearance keying, service
integration for the verdict path and the link record, and the real-binary lane for the refusal itself.
Two things the existing lanes cannot show and the manual check must: that a resumed cursor session
carries its context, and that an opencode refusal reaches the model rather than removing the tool.

## Dependency order

One technical task. The three reconciliation fixes are independent of each other and of everything
else, and none is a seam requiring coordination:

1. opencode pattern deny.
2. codex trusted-hash write, rewritten whenever `hooks.json` is.
3. cursor resume in the session's own directory.

Then the manual proof. If the proof fails, it fails on evidence rather than on a guess about which
harness is wrong.

## Documentation this makes false

`docs/process-layer/staged-operation.md` describes the capture mechanism that was deleted. It was
already wrong before this change and is named here so it is not read as authority.
