# Deep Review — Can HyperIdle build HyperIdle (and other TS-stack apps)?

**Date:** 2026-06-25 · **Method:** 11 read-only Explore lanes (full prod code + 205 docs + live app, file:line) → 3 reviewer agents (self-host / multi-project / adversarial) → consolidated. 14 agents, ~1.38M tokens. App driven live at :3001/:5173.

**Coverage:** 11 loop-stage lanes, all `partial`. 120 findings (15 blocker / 41 major / 64 minor). Supersedes the shallow PDR pass of 2026-06-24.

---

## Verdict

**Self-host: NO.** **Multi-project: NO.** A flat team can today create teams, bets and *manually-authored* tasks, hold threaded conversations with real verdict/mention machinery, store connections, and render review UI over fixtures — but **cannot complete a single real build cycle**, because agents have no thinking backend, no codebase, no external-tool reach, and no execution path for approvals. None of these is polish; they are structural.

The encouraging half: the **team-scoped spine** (bets→tasks→sessions, org chart, threads/verdicts) is real and N-team-capable at the route/DB level. The path exists; the load-bearing middle is unbuilt.

---

## The build loop, traced — where it breaks

`plan → equip → substrate → execute → connect → review → land → repeat`

| Stage | State | Evidence |
|---|---|---|
| **Plan** | Real, wired — but stalls at runtime | Bet/task state machines, lifecycle, dispatcher, `registerBetDecomposition` (server-factory.ts:288) all real. Live bet `9ec17faa`: `decompositionStatus=blocked, reason=failed, tasks=0`. Manual task creation works; the scaling path (commit bet → auto-tasks) does not. |
| **Equip** | **ROOT BLOCKER** | Live `GET /api/credentials`: all 4 slots `absent`. `SetupFlow.tsx` never asks for a key. Assistant inert ("I can't think yet" assistant-turn.ts:125). This one fact starves decomposition, sessions, dispatch, artifacts, reviews. *Also:* Strategy can't inject skills/tools dynamically — `AgentScaffoldSpec` carries only `systemPrompt`; tools are role-filtered at registration (major, not the primary blocker). |
| **Substrate** | **STRUCTURAL BLOCKER** | Sandbox = `context/ knowledge/ work/` only (context-assembly.ts:88-107). No `src/`, no clone, no `repoPath/projectId/repositoryUrl` anywhere in schema (grep-verified). `git-export` exports **knowledge markdown only** (EXPORTED_KINDS). "Code lives in git, forge-optional" is `boundary-concept.md` prose with **zero implementation**. Agent outputs (doc/metric/email/**code**) have **no general artifact substrate** beyond `knowledge_items`. |
| **Execute** | Real but empty | 2 real per-session adapters (ClaudeAgentSdk, Builtin), real cost + return-gate enforcement. But sandbox has no code to act on; per-agent not per-project. |
| **Connect** | Half-built | AN1 connection storage ships + tested (per-user encrypted). **AN2 outbound MCP client / broker entirely unbuilt** — only the inbound bridge exists; `ServiceConnectionResolver` is dead code (no callers). Agents sealed off from GitHub/Stripe/etc. |
| **Review + Land** | Fixture-only loop | `GET /api/reviews/:id` returns hardcoded `FIXTURE_REVIEW` for `rev-1` only (reviews.ts:4-61). No `reviews` table, no POST, only a *knowledge*-review factory. **AL7 (approve→execute) unmerged.** *But* the thread+verdict surface IS real (threads.ts) — human judgment is recordable; nothing lands. |
| **Repeat** | Blocked + leaky | Knowledge-promotion routine never seeded; promotion counts `DISTINCT scopeId` **factory-wide, no team filter** (promotion-pipeline.ts:207) → one team's finding auto-promotes to VALIDATED for all teams. |

---

## What it takes — de-duplicated, dependency-ordered

The 15 raw blockers collapse to **6 things** (the credential gap and the decomposition failure share one root cause; review-surface "fake" is really missing *generation* + AL7, not the verdict path):

1. **Wire a thinking backend + zero-config boot.** Credential prompt in SetupFlow (or env-inject at provision) + `applyMigrations`/`applyFactoryBootstrap` in `createServer` (only desktop/main.ts migrates today). *Cheapest change, largest unblocking radius* — converts 4 inert lanes into testable; unblocks decomposition, assistant, sessions. (deps: none)
2. **Live-prove plan→execute closes** once a credential exists: commit bet → auto-tasks → dispatch → session. The lane that "never ran." (deps: 1)
3. **Build the code/output substrate** — the keystone. A project→repo binding; clone/mount the repo into `sandboxPath/src` at provisioning; a code-artifact record (repoPath/filePath/commitSha); a local-git tool; writeback. **Generalize beyond code** (founder's point — a marketing agent has Obsidian/GDrive files): substrate = the files an agent works on/produces, of which a git repo is one kind. (deps: 2)
4. **Real review generation + merge AL7.** `reviews` table + POST + factories for task/artifact/bet (not just knowledge); replace the fixture; merge approve→execute. **Review the OUTPUT/result, not the diff** — the verdict surface is already real; this is generation + landing. (deps: 3)
5. **Make "project" first-class** for the multi-project half. Reconcile the **three disjoint scope keys** (teamId for bets/tasks/sessions, productId for knowledge [never wired], scopeId for git-export; connections userId-only) onto one project identifier; team-scope promotion + knowledge queries; per-project cost/sandbox/git/connections; project picker in AppShell. (deps: 4)
6. **Outbound connectivity (AN2/AN3).** Outbound MCP client + broker (reuse `ServiceConnectionResolver` + AL7 staging for irreversible calls); scope connections per project. Required for apps that touch external services + forge-based landing; sequenced last because narrow local-git self-host can land via a built-in tool. (deps: 5)

Steps 1–4 close the **single-project self-host** loop. Steps 5–6 unlock **multiple apps**.

---

## Multi-project: single-global at every layer that matters

"Project" is not first-class. `teams` has no owner FK, no repo binding. Three disjoint scope keys never reconciled. Promotion leaks VALIDATED principles across teams (verified, two lanes). No project picker; every call hits global `/api/teams`. One global cost cap, API key, model-gateway, digest, git-export config. Running 2–3 apps today = run multiple isolated instances and accept zero cross-project knowledge.

---

## Correction (founder review, 2026-06-25 — post-publication)

The **"Equip / credentials" blocker was over-claimed.** `SetupFlow.tsx:105,202-208` (AH1 §5) **does** prompt for and write the model key; AM4 shipped harness detection/config (`SettingsHarnesses.tsx`); AN shipped external connections. The live "all credentials absent / decomposition blocked" was an artifact of testing an **un-onboarded dev DB** (built via `npm run setup`, never through SetupFlow) — **not** a missing capability. Net: onboarding/thinking-backend exists; boot-migration is a bugfix (not a WP); the decomposition failure is a *verify-once-onboarded* item. Roadmap step 1 is therefore **not** a build WP — Track AO leads with the **substrate**; onboarding-journey polish (if any) belongs to AM, not AO.

---

## Adversarial corrections (honesty — what's *not* as bad as it reads)

- **Don't double-count:** the credential gap and the decomposition failure are one root cause (no model resolution).
- **Review isn't fully fake:** thread + verdict (founder-verdict, self-verdict block, first-verdict-wins race) is **real**; only the review *Subject* and execute-on-approve are fixture/unmerged.
- **Boot has a warning:** `server-factory.ts:235-237` logs `MISSING_ROOT_SECRET`. Boot is **major, not blocker** — manual `npm run setup` + paste-key is one-time friction.
- **Strategy skill-injection** is a real **major** extensibility gap, not the primary blocker — code substrate dominates; role-based builder tools + a future git tool cover a standard TS build.
- **AN2** is a blocker for "other apps + forge landing," **not strictly** for the first local-git self-host cycle (if substrate + a local-git tool existed).
- **setInterval scheduler / in-memory MCP registry** are correctly **minor** for a flat team on one node.

---

## Fakes & vestigial leaking onto the self-host path (condensed)

**Fixture/stub presented as real:** `reviews.ts` FIXTURE_REVIEW; web review-subject/composition fixtures; `KnowledgeList` ScopePicker reads URL scope but API ignores it; `artifacts.cost` always NULL_COST; `fabric-strategy.decomposeBet` returns `[]`; generic-routine dispatch `canProvision=false` by default; attention `impact/usage` hardcoded 0; web `knowledge-data.ts` fallback fixtures.

**Vestigial:** **Nimmly `seed-product-1` persists in the local `hyperidle-pg/` DB** (pre-AF17) — source is guarded clean (`nimmly-guard.ts`), so this is **stale local data, not a source regression** (corrects earlier PDR-0004). `bets.appetite` deprecated-but-present; `stubTaskId` schema column with no creator; assorted renamed-but-unrenamed test/comment refs (CoS→System Agent, coach→assistant, product→team) — cosmetic.

**Docs↔code drift:** `boundary-concept.md` code-substrate = unimplemented; docs claim a Kernel package that doesn't exist (impl is db/server/shared/fabric); `app-shell` docs list a "Products" settings section that's "Agents" in code.

---

## How this corrects the earlier (shallow) pass

- **PDR-0001/0002 confirmed and deepened** — substrate + multi-project are the structural blockers, but the **credential/boot root cause is upstream and cheaper** and was under-weighted; fix it *first*.
- **Track AO needs realignment:** AO1 "code substrate" → generalize to an **output/files substrate**, project-bound; AO3 "review code diffs" was **wrong** (review = outputs; verdict surface already real; missing piece is *generation* + AL7); AO4 correctly dropped; the real multi-project work is **project-scope reconciliation**, broader than git-export.
- **The "skill/plugin injection" idea** = the Strategy layer's job; a *major extensibility* gap (no dynamic skill/tool injection), not a new track.
