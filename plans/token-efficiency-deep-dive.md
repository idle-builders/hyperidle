# Token Efficiency — Deep Dive

Follow-up to `token-efficiency-proposal.md`. Three questions:

1. Can better handover documents fight the cold-start problem?
2. How exactly do we group the 17 steps?
3. Where should we offload work from agents into deterministic scripts?

---

## 1. Cold-start as a handover-document problem

### What "cold start" really costs

Each fresh sub-agent pays for three things before doing useful work:

- **System scaffold** (~10–12K): the Claude Code system prompt, tool definitions, MCP descriptors. This is fixed and outside our control.
- **Project context** (~5–8K): `CLAUDE.md`, the rules in `.claude/rules/`, the cited skill file. **Highly cacheable** — fix this with prompt caching (TE-3 in the original proposal).
- **State context** (~3–10K, variable): the agent has to *figure out where it is* in the work. Today this means re-reading the spec, the prior step's output, plus probing the codebase. **This is what handover documents kill.**

The first two are bandwidth problems (cache them). The third is a *comprehension* problem — the agent re-derives state because nobody packaged it.

### Anatomy of a good handover

The pipeline already produces lots of step output: `plans/<id>-plan.md`, `plans/<id>-plan-critique.md`, `plans/<id>-simplification-scan.md`, `plans/<id>-step5-applied.md` etc. They're optimized for the *human reader*, not the next agent. They contain the reasoning trail; the next agent only needs the *conclusions*.

Replace per-step output sprawl with a single rolling document the orchestrator updates after every step:

**`.pipeline/briefs/<id>.toon`** — the Story Brief. Lossy, structured, ≤2K tokens. Co-exists with the existing per-step artifacts (which become reasoning evidence, read only when an audit is triggered).

```toon
story: L7
goal.oneLine: Implement nightly retro feed for compound agent
goal.spec: docs/work-packages/TRACK-L.md#L7
status: in_progress
currentStep: write-tests
priorStepConclusions:
  design.score: 8
  design.approvedDoc: docs/design-explorations/L7/approved.md
  design.deltas: ["new RetroFeed component", "uses existing Button"]
  plan.score: 9
  plan.doc: plans/L7-plan.md
  plan.tasks: [migration, route, ui-component, e2e]
  plan.routes: ["GET /api/retros"]
  plan.routeChecklist:
    - route: GET /api/retros
      guard: requireAuth
      file: packages/server/src/routes/retros.ts
nextStep:
  inputs: [plans/L7-plan.md, docs/concept/retro.md]
  targetFiles:
    - packages/server/src/routes/retros.ts (new)
    - packages/web/src/RetroFeed.tsx (new)
  successSignal: "all tests in packages/*/__tests__/L7-*.test.ts fail with NotImplementedError"
openIssues: []
ledger:
  - step: design, durationMs: 124000, retries: 0, tokensIn: 38421
  - step: design-critique, durationMs: 60000, retries: 1, tokensIn: 22110
  - step: architecture, durationMs: 180000, retries: 0, tokensIn: 41200
  - step: architecture-critique, durationMs: 90000, retries: 0, tokensIn: 18400
```

### What the brief replaces

| Today the next agent reads | After |
|---|---|
| `plans/<id>-plan.md` (full plan, ~6K) | `priorStepConclusions.plan.tasks` + on-demand fetch |
| `plans/<id>-plan-critique.md` (full critique, ~3K) | `priorStepConclusions.plan.score` only |
| All previous review findings | `openIssues` (only unresolved ones) |
| Re-grep for files to touch | `nextStep.targetFiles` |
| Re-derive success criteria | `nextStep.successSignal` |

**Estimated saving:** ~8–12K per step × ~10 steps = ~100K per story. Stacks with prompt caching of the stable docs.

### Who writes the brief

The orchestrator in `packages/pipeline/src/runner.ts`, not the agent. After each subagent returns, a deterministic post-step hook:

1. Reads the new artifact (e.g., `plans/<id>-plan-critique.md`).
2. Extracts the score, the headline conclusions, the open issues, the file paths.
3. Updates `.pipeline/briefs/<id>.toon`.

This is the offload pattern from question 3 — the agent produces evidence, the script summarizes it for the next agent.

### What we keep adversarial

The brief is for *forward* hand-off (output → next-step input). For *adversarial* steps (critique, review), the next agent must read the actual full artifact, not the producer's self-summary, otherwise it inherits the producer's framing. So:

- Forward steps (write-tests reading plan, write-code reading tests, ship reading verify): brief only.
- Adversarial steps (critique reading plan, review reading code): brief for *context*, raw artifacts for *evidence*.

This preserves the validation-first principle.

### Verification

A `pipeline-brief.test.ts` that runs a full mock pipeline and asserts: (a) every step writes the brief; (b) the brief at step N+1 contains exactly the headlines of step N's output; (c) total tokens-in for steps 5–17 drops by ≥30% vs reading prior artifacts directly.

---

## 2. Step grouping — concrete proposal

### Principles

The current 17 steps mix three concerns: *adversarial separation* (must be different agent), *parallelism* (independent reviews), and *sequential coupling* (apply-after-scan). Group on coupling, split on adversarial need.

**Split:**
- Producer ≠ Critic. `/design` and `/design-critique`, `/architecture` and `/architecture-critique`, `/write-code` and any `/*-review`.
- Author ≠ DoD auditor. The auditor must enter cold so it can't rationalize the implementer's shortcuts.

**Collapse:**
- Author + their direct successor when both touch the same files with the same intent (write-tests → write-code is one TDD loop).
- Scan → apply when the scanner already knows what to fix (simplification-scan + apply, slop-scan + apply).
- Verify → ship (both run on the same green tree, same files).

**Parallel:**
- Multi-perspective reviews are independent — run as parallel sub-agents (the existing `/review` skill already does this).

### Proposed groups (12 agents, down from 17)

| # | Agent | Steps | Why grouped / split |
|---|---|---|---|
| 1 | designer-author | /design (1) | Produces multi-variant exploration. Skip if no UI. |
| 2 | designer-critic | /design-critique (2) | Adversarial split from #1. |
| 3 | architect-author | /architecture (3) | Produces plan. Reads design brief. |
| 4 | architect-critic | /architecture-critique (4) | Adversarial split from #3. |
| 5 | developer (TDD) | /write-tests (5) + /write-code (6) | Same files, same intent, one TDD loop. The "tests are not weakened to pass code" principle is preserved by the agent's instructions, not by a fresh context. |
| 6 | adversary-scanner | /simplification-scan (7) + /slop-scan (8) | Both are "find findings, no edits". One agent runs both lints. |
| 7 | developer-applier-A | /apply-review for #6 (9) | Adversarial split: applier didn't write the scans. |
| 8 | reviewers (parallel ×4) | /architecture-review (10), /adversary-review (11), /security-review (12), /design-review (13) | Already designed parallel in `/review`. Each is its own subagent. |
| 9 | developer-applier-B | /apply-review for #8 (14, 14b) | Single applier handles both code and test fixes; "qa" split (14b) was a coordination artifact, not a real role boundary. |
| 10 | qa-auditor | /check-definition-of-done (15) | Adversarial — must enter cold; no carry-over from #9. |
| 11 | developer-shipper | /verify (15b) + /ship (16) | Both run on green tree; verify is just the gate before ship pushes. |
| 12 | compound | /retro (17) | Reads the ledger from the brief, no codebase work. |

### Cold-start savings

17 spawns × ~20K loading → 12 spawns × ~5K (with prompt caching of CLAUDE.md, ARCHITECTURE.md, the canonical-shapes contracts under docs/) = ~340K → ~60K. **~280K saved per story** from grouping + caching together.

### What the loop-back looks like

Today: if step 15 (DoD) fails, loop back to step 5. With grouping, that becomes: if #10 fails, loop back to #5 (TDD). The brief carries the DoD's specific complaints into #5's `nextStep.openIssues`. Max 3 attempts unchanged.

### Edge cases

- **No-UI stories:** skip #1, #2, and the design-review parallel branch in #8. The brief sets `design.skipped: true` and downstream steps don't try to read design artifacts.
- **L (Large) stories:** the single-developer TDD loop in #5 may need to checkpoint mid-way. Add an explicit `pause` state so a long agent can hand off to a fresh one without losing the brief.
- **Critique loops:** today architecture-critique iterates up to 3× until score ≥7. Keep that; #3 and #4 swap repeatedly. Each iteration is cheap because of caching.

### Verification

A pipeline integration test runs L7 end-to-end through the new grouping, asserts the same artifacts are produced, and confirms `.pipeline/progress/L7.toon` records the same set of step transitions (with new `agentGroup` annotations).

---

## 3. Script-vs-agent — where to offload

The user's intuition is right: agents are paying for work that's deterministic and re-derivable. Anywhere the agent is *aggregating, parsing, or formatting raw output*, that's a script's job. The agent's value is *judgment* — the irreducible "is this the right thing to build."

### Strong candidates (do these)

#### A. Diff summarizer — `bin/diff-summary`
Replaces raw `git diff` reads in `/review`, `/ship`, `/architecture-review`. Output:

```toon
diff:
  filesChanged: 12
  linesAdded: 340
  linesRemoved: 12
  byCategory:
    tests: 4
    components: 5
    routes: 2
    schema: 1
  newRoutes: ["GET /api/retros", "POST /api/retros"]
  newExportedSymbols: ["RetroFeed", "useRetros"]
  removedExportedSymbols: []
  publicApiBreakingChanges: []
  largestFile: packages/web/src/RetroFeed.tsx (210 lines)
```

**Cost saved:** ~5–10K per review step. **Who computes it:** TypeScript script using `git diff --stat`, `git diff` parsing, plus a tiny ts-morph pass for exported-symbol diffing.

#### B. Test failure triage — `bin/test-summary`
Wraps `vitest run` and `playwright test`. Output (only on failure):

```toon
testRun:
  status: failed
  totalTests: 412
  passed: 408
  failed: 4
  failures:
    - file: packages/server/src/__tests__/L7-retros.test.ts
      test: returns 401 for unauthenticated
      assertion: "expected 200 to be 401"
      file:line: routes/retros.ts:42
    - file: ...
```

**Cost saved:** Vitest's full failure dump is ~500–2000 tokens *per failure*; this caps it at ~50 tokens per failure plus pointer to the file. **Bypass:** if `--debug` is set, raw output is emitted in addition (per the Playwright-debug-loss concern from the original proposal).

#### C. Lint triage — `bin/lint-summary`
Groups by rule, counts, shows one example per rule. Replaces raw Biome + ESLint walls of text.

#### D. AC-to-test map — `bin/ac-coverage`
Parses the story file's acceptance-criteria bullets, scans test descriptions, reports unmapped criteria. Replaces the manual cross-walk in `/check-definition-of-done`.

```toon
acCoverage:
  storyId: L7
  total: 8
  covered: 7
  missing:
    - "Feed updates within 30s of new retro" → no matching test description found
```

**Cost saved:** the DoD agent currently re-reads the story + every test file to build this mapping. Script does it in 200ms. The agent only judges the *quality* of coverage (does the test actually verify the AC, or is it a fake test?).

#### E. Route checklist verifier — `bin/route-check`
The architecture critique already mandates a `route-checklist:` block. A script can verify, for every declared route, that there's a corresponding handler file and the guard middleware is applied. Run it in `/architecture-review` and `/security-review`.

```toon
routeCheck:
  declared: 4
  found: 4
  missingGuard: []
  unguardedExposed: []
```

#### F. Coverage delta — `bin/coverage-delta`
Compares `bun run test:coverage` before and after the change. Today nobody reads this; a script can flag drops or untested new lines.

#### G. Concept-existence check — `bin/concept-check`
The pipeline fails fast if `/concept` is missing for a story that introduces a primitive. Today an agent inspects. Script: parse story metadata, parse `docs/concept/*.md`, parse the canonical-shapes contracts under `docs/<topic>/`, return `ok` / `missing: [noun1, noun2]`. One call before the pipeline starts.

#### H. Brief writer — `bin/brief-update`
The post-step hook from question 1. Reads the latest step artifact, extracts headlines, updates `.pipeline/briefs/<id>.toon`. Pure data wrangling.

#### I. Ledger / retro feed — `bin/retro-feed`
The runner already records timing/retry/token data. Surface it as a TOON file the retro skill consumes. Today the retro agent re-reads scan/review/critique markdown files to reconstruct what happened — most of that is in the runner's logs.

#### J. Worktree health — `bin/worktree-check`
Already partly scripted in the pipeline skill. Promote to a single command: `bin/worktree-check L7` returns clean/dirty/uncommitted/unpushed/branch state.

### Weaker candidates (think twice)

- **Spec interpretation** — the agent must read the spec; you can't deterministically extract intent.
- **Design quality scoring** — the rubric is judgment-heavy by design.
- **Architecture review of layer violations** — possible to lint partially (boundary check between Human Interface / Meta / Agent Runtime), but novel violations need the architect's eye. Add a partial `bin/layer-lint` that catches the easy cases.
- **Slop scan / simplification scan** — these *look* deterministic but their value is the agent's pattern recognition. A subset can be linted (dead exports, unused abstractions) but the core stays agent-driven.

### Where the scripts live

`bin/` for executables, `packages/pipeline/src/scripts/` for the implementation. Each script has a unit test + a snapshot test of its output format (TOON shapes are part of the contract for downstream agents).

### Investment ranking

If we did one thing: **B. Test failure triage**. Highest token volume, easiest to ship, lowest risk.

If we did three: **B + A + H** — test triage, diff summarizer, brief writer. These three feed every step and stack multiplicatively with the brief approach in question 1.

If we did the full set: estimated **~200K saved per story** on top of the original proposal's ~537K. Total system reduction approaches **75%**.

---

## How this stacks with the original proposal

| Layer | Lever | Tokens saved per story |
|---|---|---|
| Original TE-1 (reporters) | `vitest --reporter=dot` etc. | ~30K |
| Original TE-2 (TOON files) | progress + plan handoffs | ~25K |
| Original TE-3 (prompt caching) | reorder skill prefixes | ~120K |
| Original TE-4 (rtk wrapper) | git/test/lint compression | ~120K |
| Original TE-5 (skill diet) | trim SKILL.md prose | ~15K |
| Original TE-6 (group steps) | 17 → 12 sub-agents | ~220K |
| Original TE-7 (ast-grep) | structural search | ~7K |
| **New: handover briefs (Q1)** | `.pipeline/briefs/<id>.toon` replaces re-reads | ~100K |
| **New: scripted offload (Q3)** | bin/diff-summary, bin/test-summary, bin/ac-coverage, bin/brief-update, etc. | ~200K |
| **Total** | | **~837K per story** |

Current ~600–800K → projected ~100–200K. **~75–80% reduction**, autonomy and validation gates unchanged.

---

## Sequencing change

Reorder the rollout from the original proposal — handover briefs and the brief-writer script come *before* the pipeline grouping, because the brief is what makes the grouping possible:

1. TE-1 reporters (1 day)
2. TE-2 TOON for progress files (1 day)
3. **NEW:** brief schema + writer script (`bin/brief-update`) (2 days)
4. **NEW:** test-summary + diff-summary scripts (3 days)
5. TE-3 prompt-caching prefix reorder (2 days)
6. TE-4 rtk wrapper for unscripted commands (3 days)
7. TE-6 pipeline grouping using briefs (5 days — biggest behavioral change)
8. TE-5 skill prose diet (1 day)
9. **NEW:** AC-coverage, route-check, coverage-delta scripts (3 days)
10. TE-7 ast-grep dispatch (1 day)

Each is a separate work package with its own /architecture + /verify gate.
