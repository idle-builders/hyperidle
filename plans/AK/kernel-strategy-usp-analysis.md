# Kernel vs Strategy: what the docs say, where the code is, and what the plan implies

**Date:** 2026-06-14
**Branch:** `research/kernel-strategy-usp` (off `origin/main`, worktree only — no code edits)
**Method:** Read `docs/product/` strategic docs + two existing audits (vision-gap, launch-readiness) directly; three Explore agents traced the codebase (task→harness dispatch & fabric coupling; review/conversation experience; concept→bet→tasks→result funnel).
**Status:** Research/discussion artifact. Comment inline.

---

## 0. First problem: "Kernel" and "Strategy" mean two different things in your head vs. the docs

This matters before anything else, because the whole plan hinges on the cut.

- **Docs/code use `Kernel` / `Fabric`** as the *Meta-Layer split*: Kernel = stable protocols (routing, persistence, events), Fabric = volatile heuristics (scoring, knowledge propagation, notifications). `what-is-hyperidle.md:39-44`. The code enforces it: `packages/fabric` is not imported by kernel tables; the O2 refactor pushed volatile fields into extension tables `knowledgeStrategyFabric`, `taskStrategyFabric` (1:1 sidecars to `knowledge_items`, `tasks`).
- **You mean `Kernel` = the work-lifecycle USP** (idea → concept → bet → tasks → review → result) **and `Strategy` = the knowledge-management USP** (the fabric).

These aren't the same axis. Your "Kernel" spans the kernel *and* parts of the fabric (task dispatch, cost caps, session context all live in `packages/fabric` today). Your "Strategy" is roughly the *knowledge half* of the fabric (relevance, attention, materialization, practice meetings). **The fabric package currently mixes both of your halves.** That is the single most important finding, and §4 returns to it — your "build a minimal strategy" instinct is correct precisely because it forces this boundary to be redrawn where it actually belongs.

---

## 1. What the documentation says (your two USPs)

**Kernel journey (your A→D) is documented well and coherently:**

- **A — idea entry:** bet description is explicitly meant to "feel like a knowledge document" — same markdown/TipTap editor as knowledge items. The assistant is documented as the per-user operator that drafts concepts and proposes factory-doc changes (`human-ai-collaboration.md:27`).
>> like you noticed below this has some gaps its the same editor but is is actually a block? could we transfer a knowledge document into a bet description? 
- **B — concept→committed bet:** shape (PM writes pitch) → commit (founder moves shaped→committed, done-condition drafted) → team begins (`how-work-flows.md:31-37`).
- **C — review:** this is where the docs are *strongest* and match your "game changer" claim. GitHub-PR model, 5 binding verdicts, 5 artifact renderers, cost visible on every thread, "humans in every loop that matters and out of every loop that doesn't" (`human-ai-collaboration.md:54-104`).
- **D — result:** bet ships → retro routine fires → knowledge flows up (`how-knowledge-compounds.md:100`).
>> D is already part of strategy - compounding is essential knowledge management

**Strategy USP (knowledge) is documented in the most detail of anything** — five layers L0-L4, canonical store + two projections, attention scoring, lifecycle, practice meetings (`how-knowledge-compounds.md`). Ironically the half you call "more of a playground that will change" is the most fully specified in the docs.

---

## 2. The gaps between docs and learnings

Two existing audits dated 2026-06-05 are the baseline: `docs/product/vision-gap-audit.md` and `docs/product/launch-readiness-audit.md` (73 features, "73% launch-ready"). They already catalog terminology drift (Product→Team, pitch→description, shaped/committed/shipped→draft/active/completed), removed surfaces (Canvas, right sidebar), and unbuilt features (global search 404, autonomy UI, snooze/escalate, pitch expiry).

But **neither audit foregrounds the gap that actually breaks the Kernel USP.** The funnel trace found it:

| Hop | Doc claim | Code reality |
|---|---|---|
| A create bet | rich, "feels like a doc" | **REAL** — full-page TipTap editor, `WorkBetCreate.tsx` |
| A assistant writes concept | core flow | **STUB** — `assistant-dispatcher.ts:157` logs intent, "session provisioning deferred to a future story." Assistant cannot create or shape a bet. |
>> should fix
| knowledge doc → bet | implied | **MISSING** — only the reverse (bet→retro→knowledge) exists |
>> should fix
| B commit (draft→active) | one click | **REAL** — `bets.ts` commit handler, capacity-gated |
| **B→C decompose into tasks** | "the team begins," "agents decompose their own work" | **MISSING ENTIRELY** — no listener fires on `bet_state_changed(active)`. A committed bet sits with zero tasks forever. Tasks must be hand-`POST`ed. No PM agent, no auto-outline, no dispatch. `lifecycle-propagation.ts:744-785` only handles the *upward* (done) direction. |
>> ok wow this is an essential one that means the entire work routine is broken?? maybe worth a discussion what is strategy and what is kernel. But we need some sort of way that bets turn into tasks and work starts. but yeah maybe there are many ways here and this also has some overlap to strategy.
| dispatch task → session | — | **REAL** — `task-dispatcher.ts` → `provision-registry` → `session-provisioning.ts` → harness |
| C review | game-changer | **REAL but thin** (see §3) |
| D task→bet→result | automatic | **REAL** — full upward propagation, ship-confirmation thread, retro→knowledge |

**The Kernel USP loop is ~80% wired with a hole punched in the middle.** Everything downstream of "tasks exist and are accepted" works. Everything is in place to *create* and *commit* a bet, and to *complete* one. The two missing hops are exactly the two "magic" moments of the pitch: **the assistant turning a conversation into a concept/bet (A), and a committed bet auto-exploding into running work (B→C).** Without those, the demo is "type a bet, then manually type every task" — which is Linear, not an agentic OS.

---

## 3. The review experience — the "game changer" — is good, not yet eclipsing

**Genuinely strong and rare today:**

- Thread-native review anchored to any host (bet/task/knowledge/artifact). 5 binding verdicts wired end-to-end (`thread.ts`, `threads.ts`).
- **Live session dial-in (Q1)** — watch real-time tool calls, reasoning, cost while the agent works (`session-activity-buffer.ts`, `SessionActivityPanel.tsx`). Almost no competitor has this. The most defensible review feature.
- Attention/silence routing so the founder is pulled in by risk tier, not firehose (`dispatcher.ts`, `silence-policy.ts`, `founder-router.ts`).

**Missing for "best review experience ever" — the same gap the docs over-promise:**

- **No inline diff-line / paragraph-anchored comments.** Docs claim it (`human-ai-collaboration.md:65,87`); code renders static diffs only. This is the #1 thing separating "good" from "killer" for review. Block-ref scaffolding (`PlainPayloadWithBlockId`) exists but no UI wires it.
- Questionnaire answers render-only (dispatch deferred). Verdict notes have no mentions. Digest/push channels defined but dormant. No review analytics.

>> I want to have a full in depth review of all the other tools that allow review, looking what the community does and actuallly screen shoting the tool, this will be a concept act together with the human who gives access to what ever tool is necesarry or does screen shots. There are ok experiences our there but none that I know are great. The one gap that even I have in my knowledge how about none code reviews what is the standard there like what does figma do, what does marketing XYZ tool do, what does ??? do. No clue this needs wide research and then a deep dive together with the user.

Review is the strongest *real* asset (especially dial-in), but the async-polish layer that would make it "eclipse everything" is unbuilt and over-claimed in docs.

---

## 4. What "minimal strategy as an alternative to the fabric" actually implies

The instinct — *ship the Kernel USP first behind a minimal strategy that just deploys a task to a harness* — is right, and the architecture half-supports it.

>> the minimal startegy is probably not the one we would recommend to users, but it is the one we can use to test that the kernel works correctly and the one that other contributors could use to build a new strategy. so it is an essential piece. It will also allow us to hone the kernel and keeping strategy complexity to the side until the kernel is ready.   

**The seam exists.** `packages/fabric/src/services/provision-registry.ts` is a zero-dependency leaf. The fabric's `task-dispatcher` calls `getProvisionSessionFn()`; the server registers the real `provisionSession` at bootstrap (`server-factory.ts:223`). Swapping in a `minimalProvisionSession` is a single `setProvisionSessionFn(...)` call — no changes to dispatcher, bootstrap, or kernel.

**But the seam is in the wrong place conceptually — this is the gap you predicted.** The current dispatch path imports these from the fabric as *hard-required*:

| Fabric import at dispatch | Your-Kernel or Your-Strategy? |
|---|---|
| `checkCostCap`, `recordCostAndCheck` | **Kernel** (budget is a stable protocol, doc says so) — mislocated in fabric |
| `buildSessionContextData` (task+bet+agent+team) | **Kernel** — identity/context, not heuristic |
| `writeWorkspaceCLAUDEmd`, `startWatcher` | **Kernel** — workspace plumbing |
| `composePrompt` (base soul+task+done-condition) | **Kernel** base / **Strategy** enrichment — *mixed in one function* |
| `materialize` (knowledge slice), relevance/attention scoring | **Strategy** — the genuinely swappable part |

So "fabric" today = your-Kernel-plumbing **+** your-Strategy-heuristics fused together. A minimal strategy isn't really "a smaller fabric" — **it's the act of separating the kernel-grade primitives (cost, context, workspace, base prompt) out of the fabric so they always run, and making only the knowledge layer (materialize + relevance + attention + practice meetings) the pluggable Strategy.** That separation is the real deliverable, and it's what tells you "what is kernel and what is strategy" — you discover the boundary by drawing it.
>> A piece that I am missing here is the entire agent / harness sandbox provisioning (unless this is workspace). Context is I guess the skills,hooks, agents.md and what ever other files that can be injected into the harness? I think we should start to use the correct words here that are used in harness engineering and around agent harnesses this makes the interface to these harnesses and the explanation to other users far easier. the nouns in this space are pretty well defined by now. we Just need to absorb those from the internet.

Minimal strategy = `composePrompt` returns soul + task + done-condition + tools (no knowledge slice); `materialize` is a no-op; relevance/attention never run. Cost caps, context, workspace, review, propagation all stay. A few-day swap — *once the kernel/strategy code split is done*, not before.
>> interesting one prompt != soul. Thats the relevant part soul is the AGENTS.md (and we should probably call it like that), and then there is the skills and the hooks and all that stuff. Those are files that belong somewhere in the agent sandbox. the same is auth. And then each harness has a different memory mechanism that can be filled. not sure but this sounds a bit thin. Also make sure this space moves so freaking fast any knowledge must be checked against the web becuase it is surely outdated. 

---

## 5. Conclusions / implications

1. **The thing blocking the Kernel USP is not the fabric — it's the two missing funnel hops.** Even a perfect minimal strategy won't demo the loop until (a) the assistant can turn a conversation into a committed bet, and (b) `bet→active` dispatches a planner (assistant or PM agent) that decomposes into accepted tasks. Those two are the highest-leverage builds in the repo right now. The downstream (dispatch→session→review→propagation→retro) already works.

2. **Build the minimal strategy by extraction, not addition.** Don't write a parallel "simple fabric." Lift cost/context/workspace/base-prompt out of `packages/fabric` into the kernel (or a `kernel-runtime`), leave knowledge materialization + relevance + attention as the Strategy port behind `provision-registry`. Default Strategy = minimal (no knowledge injection). The full fabric becomes one implementation of that port. This removes the fabric as a hard dependency of running a task and is the clean answer to "where's the kernel/strategy line."

3. **Reconcile the naming once, top-down.** Three vocabularies are in play: docs (pitch/bet, Kernel/Fabric), code (description/bet, draft/active/completed, knowledgeStrategyFabric), and your head (goal/concept, Kernel/Strategy). The vision-gap audit already flags the doc↔code drift as Critical. If renaming, do it *before* the kernel/strategy extraction so new package/table names land in the target vocabulary, not the legacy one.

4. **Lead the product story with review + dial-in, but don't ship the inline-comment claim until it's wired.** Dial-in is the rare, real differentiator. Inline diff/paragraph comments are the credibility gap — docs promise them, code doesn't have them, and they're table-stakes for "best review ever."

---

## Appendix: open questions for you to comment on

- **Q1.** Is the target cut "Kernel = work-lifecycle / Strategy = knowledge" (your framing) the one we standardize on, retiring "Fabric" as a name? Or keep Kernel/Fabric and treat your halves as orthogonal?
>> Kernel is the OS, strategy is the knowledge management strategy. Also OS is the part the user interacts with, the strategy is the stuff behind the scenes that makes it magic.
- **Q2.** Minimal-strategy build order: extract kernel-runtime FIRST (clean boundary, slower) vs. ship a thin `minimalProvisionSession` now and refactor the boundary later (faster demo, tech debt)?
>> We probably need to build this together we need to slice and dice to rearrange stuff and use the minimal strategy to check that the kernel works correctly and then check that the farbic strategy still works against the refined kernel. Its probably first understand the proccesses and nouns again, then refine the interfaces. Then write the minimal staregy since we will need that for TDD of the rebuild kernel, then write tests for kernel then properly split the kernel & fabric.
- **Q3.** The B→C planner: assistant drafts tasks for founder approval, or PM agent auto-decomposes and self-accepts? The docs say agents decompose their own work with no human gate at task level (`how-work-flows.md:47`) — confirm that still holds.
>> the team should auto compose the tasks, like with everything (knowledge, reviews) we seak user feedback when relevant. Also in this case when a task and the concept of a task is high impact we get the user involved for that task or concept and have him check it, the rest just flows. the knowledge triage and the review scoring already has such a mechanism we should reuse this same mechanism or maybe unify it into an human attention scoring mechnism
- **Q4.** Rename now or after extraction? (goal/concept vs pitch/bet, and the Kernel/Strategy package names.)
>> doesn't matter where it fits better
- **Q5.** How much review polish (inline comments) is in-scope for the Kernel-USP-first milestone vs. deferred?
>> review polish is something that can probably be done in parallel. But we should register the research and work for it. maybe this is even its own worktrack.
