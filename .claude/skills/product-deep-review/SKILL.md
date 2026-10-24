---
name: product-deep-review
description: "Deep review of a feature's functionality, user value, and visual quality — not contract-compliance, but does-this-actually-work-and-is-it-worth-using. Drives the real app, screenshots every state, judges the user value, and tracks coverage across runs so it knows which features are current, stale, or never reviewed. Manual, founder-invoked, runs on Fable via the auditor agent. (Future: ingest real usage data.)"
argument-hint: "[feature name | route | 'all' | 'stale' | 'never']"
user-invocable: true
min_tool_calls: 18
---

# Product Deep Review

A deep, whole-feature review of HyperIdle from the **user's** side. The pipeline `/review` asks "does the code match the contract?" — this asks a different question: **does the feature actually work end-to-end, is it worth using, and does it look right?** Run as the **auditor** agent (Fable). Coverage-aware across runs.

**Argument** (`$ARGUMENTS`): a feature/route to scope to, or `all`, `stale` (changed since last review — default cadence), or `never`.

---

## Phase 0 — Coverage reconciliation (always first)

1. Read `.pipeline/audits/product/ledger.json` (seed shape below if absent).
2. `git rev-parse HEAD`.
3. Classify each ledger feature: **CURRENT** if `git diff --name-only <last_reviewed_commit> HEAD -- <feature paths>` is empty, else **STALE**.
4. Enumerate live features/routes (Phase 1) and mark any not in the ledger as **NEVER**. A ledger feature whose paths no longer exist is **REMOVED** — drop it from the ledger with its open findings closed, and say so.
5. Report coverage: `N current / M stale / K never (total T)`. Pick targets per `$ARGUMENTS`; state what you defer.

A feature's "paths" are its page addresses plus the server + web files that implement it — map them from the page addresses in `layers/core-ui/src/App.tsx` (one screen per file: `Thread.tsx`, `Judge.tsx`, `Shift.tsx`, `Think.tsx`, `People.tsx`, `Plugins.tsx`, `Start.tsx`, `Sidebar.tsx`, `Find.tsx`) and the actions they call (`framework/domain-model/src/actions/`).

---

## Phase 1 — Functionality: does it actually work?

Drive the **real running app**, not the code: seed the Northwind demo world and start it as `/smoke-test` step 1 says (`npm run setup -- --profile laptop --demo`, then `npm run dev`; start the server with `topology: 'local'` when the feature needs agents to answer — `npm run dev` runs no agents). The page addresses are in `layers/core-ui/src/App.tsx`: `/conversations/:id` (a review at `?review=<message id>`), `/work/:id` (`?part=`), `/knowledge/:id`, `/people/:id` (`/people/me` is your page, which holds your settings — there is no settings screen), `/teams/:name`, `/plugins/:id`, `/start`. For the feature in scope:

- **Every user journey** — walk each path a real user takes, start to finish. Does it complete? Does it persist?
- **Every state** — empty, loading, populated, error, edge (long text, zero items, max items, concurrent edits). Trigger them, don't assume them.
- **Error recovery** — break it on purpose (bad input, dropped network, stale data). Does it fail legibly and recover, or dead-end?
- **The wedge** — HyperIdle's loop is plan in documents and conversations → hand off and watch the task move → check the result in a review. Does the feature serve that loop, or sit beside it?

Record exactly what you did and what happened. "It works" without a traced journey is not a finding.

---

## Phase 2 — User value: is it worth using?

Judge the feature as the founder's customer (solo founders, small teams, agencies) would.

- **Job-to-be-done** — what decision or task does this serve? Is that job actually advanced, or just technically supported?
- **Friction** — count the steps, clicks, and reads to reach the value. Where is the dead time, the redundant confirm, the thing the user must remember that the app should?
- **Legibility** — is the value obvious to the user, or buried? Would a new user find and understand it unprompted?
- **Gaps** — what's the obvious next thing the user will want that isn't there? What promise does the feature imply but not keep?

Prioritize findings by **user impact**, not code tidiness.

---

## Phase 3 — Visual testing

Look at pixels, across states and breakpoints — not code.

- Screenshot every meaningful state via Playwright (`cd layers/core-ui && npx playwright screenshot http://localhost:5173/<address> /tmp/pdr-<name>.png --wait-for-timeout=3000`), desktop first, in light and dark (Looks on your page). A narrow window or a phone is a later design — note what breaks, do not judge it against a design.
- Compare against the design reference: the studio on branch `design/studio-recovery` (`applications/studio`), screen by screen, and the intent in `plans/design-restart/information-architecture.md`.
- Judge against the Paper skin and its rules: tokens only (`layers/core-ui/src/tokens.css`), colour never carries status (one flag colour for "this one is yours", words for the rest), all states styled (hover/focus/active/disabled), accessibility (focus order, aria, keyboard), and anti-slop (no oversized padding, gradients, hero sections, decorative icons).
- Read the PNGs. Cite screenshot paths in findings.

---

## Phase 4 — Usage data *(future iteration — stub)*

Not active yet. When telemetry exists, this phase pulls real funnels (entry → activation → drop-off), engagement, and error rates for the feature and reconciles them against the intended value from Phase 2 — turning "I think this is high-friction" into "73% drop at step 3." Until then, explicitly mark this phase **DEFERRED — no usage data wired** in the report so it's visible as a known gap, and base value findings on Phases 1-3.

---

## Phase 5 — Report

Per finding: stable ID (`PDR-NNNN`), title, category (Functionality / Value / Visual), **user-impact severity** (Blocker / Major / Minor / Polish), where (route + screenshot/repro), what the user experiences, and the recommended change. Write each to `.pipeline/audits/product/findings/PDR-NNNN.md` and summarize inline.

Open with the Phase 0 coverage line and a per-feature verdict (**SOLID** / **WORKS-BUT** / **BROKEN**).

---

## Phase 6 — Update the ledger

```jsonc
// .pipeline/audits/product/ledger.json
{
  "domain": "product",
  "updated_at": "<ISO date>",          // pass via the agent; do not invent a clock
  "features": {
    "knowledge-detail": {
      "paths": ["layers/core-ui/src/Think.tsx", "layers/core-ui/src/DocEditor.tsx", "layers/core-ui/src/doc-page.ts", "layers/core-api/document/src/document-actions.ts"],
      "routes": ["/knowledge/:id"],
      "last_reviewed_commit": "<HEAD sha at review>",
      "blob_hashes": { "layers/core-ui/src/Think.tsx": "<git rev-parse HEAD:path>" },
      "verdict": "works-but",          // solid | works-but | broken
      "open_findings": ["PDR-0003"],
      "reviewed_at": "<ISO date>"
    }
  }
}
```

Leave CURRENT features untouched. Don't mark a feature reviewed if you couldn't drive it.

---

## Output

1. Coverage line (current/stale/never).
2. Per-feature verdict.
3. Findings, impact-sorted, each with screenshot/repro + recommended change.
4. Updated ledger + `findings/PDR-*.md`.

Target: $ARGUMENTS
