# HyperIdle ⇄ git-host / CI / deploy — the boundary · Concept (Track AN)

**Track:** AN (Tool Integration). This boundary is the outer frame for the whole track; the *how* of integration (agent tool access, sandbox provisioning, credentials, ecosystem contribution) is the track concept (`plans/AN/concept.md`), built out across AN1–AN4.

**Level:** system/track. Frames *where HyperIdle ends and GitHub/GitLab/CI/deploy platforms begin.* Also sits one level **above** the per-WP AL7 concept (`plans/AL7/concept.md`), which reads it as a fixed input — AL7's execution loop is the *operative-work instance* of this boundary.

**Mode:** interactive (founder present, 2026-06-22). Two load-bearing forks decided by the founder — recorded in Contracts.

**Origin:** founder question, 2026-06-22 — *"the line between GitHub and us isn't clear; we maybe can't exist without a git repo behind us, and maybe/maybe-not do deploys."* Resolved here against a deep inventory of our code+docs and a cited inventory of GitHub/GitLab's full surface.

---

## Required reading (downstream `/architecture`, `/pipeline` must read)

- `docs/architecture/system-boundary.md` — the ground-truth this concept produces (ride / replace / integrate).
- `docs/architecture/what-this-architecture-does-not-include.md` — the existing "not a workflow engine / not a model loop" boundary this extends.
- `plans/AL7/concept.md` — the Staged Operation primitive; this boundary is the *why* behind its open-closure "execute through the connected tool, never reimplement it."
- `plans/AL1/design/review-system.md` §4 — the parked execution-loop sketch (descriptive vs operative).
- `docs/agent-layer/harness-capability-descriptor.md` — how a connected tool's capabilities are declared (the seam we dispatch through).
- `packages/fabric/src/services/git-export*.ts` — the *only* git in the codebase today (exports **knowledge**, not code); proof we have no code-VCS layer yet.
- `packages/server/src/tools/tool-registry.ts` — the 24-tool registry with **no** git/deploy/CI/build tool today.

---

## Phase 0 — The nouns

| Noun | Classification | One-line working definition |
|---|---|---|
| **Connected system** | **New (boundary) primitive** | An external system HyperIdle reads from / dispatches to but never reimplements: a git host, a CI runner, a deploy target, Stripe, a CRM. The executor and/or the durable store for a side-effect. |
| **Code substrate** | **New (boundary)** | The git repository where a coding agent's files physically live and accrue history. **Local-first, forge-optional** — a plain git repo on disk/in the sandbox; a remote forge (GitHub/GitLab) is an *optional* connected system, never a dependency. |
| **Landing** | **New (boundary) act** | The operative step that takes an accepted descriptive artifact (a code diff, a doc) live — merge / push / deploy / publish. Modeled as an **operative artifact carrying a Staged Operation** (AL7), not a free-floating manual step. |
| Staged Operation | Stable (input, AL7) | The deferred, fully-bound command approve executes through a connected system. Locked in `plans/AL7/concept.md`. |
| Descriptive / Operative artifact | Stable (input, AL7) | Descriptive = the work IS the artifact (approve accepts). Operative = carries a staged op (approve commits). |

Only **Connected system, Code substrate, Landing** are new here; the AL7 nouns are fixed inputs.

---

## Phase 1 — Essence

### Connected system

1. **Identity.** A connected system is *the executor and/or store for a real-world effect* — not a part of HyperIdle. HyperIdle is the **orchestration + review + governance + knowledge** layer; the connected system is where the side-effect actually happens and where durable external state lives.
2. **Essential properties.** Reached only through a declared capability (harness capability descriptor / MCP / API); never embedded; owns its own state of record for the effect (the merge lives in git, the charge lives in Stripe). HyperIdle holds the *staged spec* and the *Operation Outcome*, never re-hosts the system's data.
3. **Composition.** A Staged Operation targets exactly one connected system's capability. A code diff's **Landing** targets the code substrate's forge (or local git) + optionally a CI/deploy connected system.
4. **Authority.** The connected system performs the effect and is its source of truth. HyperIdle is the **trigger + gate**, never the executor.

### Code substrate (the founder's "do we need a git repo behind us")

- **The system does not need git.** Most agent work — a refund, an email, a metric, a doc — touches no git at all. Git is *one* connected system, not a foundation.
- **Code work needs a git repo** — but a **local one, forge-optional.** The agent edits real files in a working copy that is a plain git repo; that gives us history and a real diff. A solo founder needs **no GitHub account** to use HyperIdle. If they connect a forge, we push / open a PR / merge through its API/MCP — git becomes our *working ground*, never a product we host.
- We **read diffs in** (the code artifact is derived from the working copy, replacing today's hand-assembled `{file, hunks}` payload) and **route Landing out** (merge/deploy as a Staged Operation through the forge/CI tool).

### Landing (the founder's "do we do deploys")

- HyperIdle **never runs deploy infrastructure** — no runners, no CI engine, no registry. (Confirmed: zero CI/deploy/build tooling in the registry today; the only deploy pipeline is HyperIdle's *own* release, never user-facing.)
- But **a deploy/merge is an operative artifact.** On approve, AL7 **dispatches** it through the connected CI/deploy/forge tool and the **Operation Outcome returns**. So *"approve" makes the deploy happen — through the tool, not through us.* **Gate + trigger, not executor.**
- **Decided (founder, 2026-06-22):** Landing sits **behind a review**. The code diff stays **descriptive** (approve = "this change is good"); the **merge/deploy is a separate operative artifact** whose Staged Operation the same approve (or a follow-up review) triggers. This refines AL7's split into a **descriptive-artifact + operative-landing pair** — plan→review→**act** holds for code exactly as it does for a refund.

---

## Phase 2 — Rejection list (what this boundary is NOT)

1. **HyperIdle is NOT a git forge.** We do not host repos, own the commit graph, or become a GitHub. — *Reason: git is open and portable; rebuilding it is maximal scope for zero differentiation, and contradicts `what-this-architecture-does-not-include.md` + the open-source/small-team positioning.*
2. **HyperIdle is NOT a CI/CD engine.** No runner fleet, no pipeline executor, no secrets vault, no registry. — *Reason: the runner fleet + marketplace are the incumbents' gravity; we trigger/observe via API, we do not host compute.*
3. **HyperIdle is NOT a layer *on top of* GitHub** (the Graphite model — a workflow riding one host). — *Reason: we sit **beside every connected system** (git is one of many), pulling each tool's work into one review/governance surface. Coupling code to GitHub the way Graphite does would forfeit "review for anything" and the local-first/solo-founder path.*
4. **The code artifact is NOT a git object stored by us.** It is *derived from* the working-copy git repo for rendering/review; the repo, not HyperIdle, is the store of record. — *Reason: mirrors the L2 "blocks are derived, never stored" discipline and the AL7 "source of truth lives in the tool, never re-hosted" rule.*
5. **We do NOT replace CI security scanning, SSO, audit, or registries.** — *Reason: compliance-grade infra (CodeQL/Dependabot rules DBs, SAML/SCIM, audit logs) is table-stakes investment better integrated than rebuilt.*
6. **Issues/Projects/Wikis are NOT something we ride** — we **replace** them with bets/tasks + the knowledge fabric. — *Reason: ticket-centric planning is a weaker version of first-class time-boxed bets; this is replace-territory, not integrate-territory.*

---

## Phase 3 — The line (ride / replace / integrate)

Three verbs, applied to GitHub/GitLab's nine clusters:

| Cluster | Verdict | Stance |
|---|---|---|
| 1. Git hosting (repos, commits, protocol) | **RIDE** | code lives in git (local-first); we read diffs, route landing — never host |
| 2. Code review (PR/MR, approvals, comments) | **REPLACE** | our Subject + 5-verdict + proof canvases + anchored comments; agents first-class |
| 3. CI/CD (Actions, runners, pipelines) | **INTEGRATE** | trigger/observe via API/MCP; never host runners |
| 4. Deploy / registries / environments | **INTEGRATE** | deploy = Staged Operation through the tool; registries integrated, not rebuilt |
| 5. Project mgmt (Issues, Projects, Epics) | **REPLACE** | bets/tasks supersede tickets |
| 6. Knowledge (wikis, gists, Pages) | **REPLACE** | the knowledge fabric supersedes wikis |
| 7. Code intelligence (search, scanning, AI) | **INTEGRATE** scanning · **REPLACE** AI review | scanning is rules-DB investment; AI review is our differentiator |
| 8. Identity / governance (SSO, audit, rulesets) | **INTEGRATE** SSO/audit · **OWN** merge-policy | the *policy that decides "can this agent change land"* is ours; enforced via the host's ruleset API |
| 9. APIs / MCP | **INTEGRATE** | GitHub ships a GA MCP server (~23 toolsets incl. `pull_requests`, `actions`, `git`) — the ready-made door in |

**The clean line:** *Ride the git substrate (local-first) and integrate the heavy infra (CI, registries, scanning, SSO) via API/MCP; **replace** the entire human-centric collaboration layer — review, planning, knowledge — because that is both the lock-in and the opportunity. AL7 is the seam where this becomes concrete: HyperIdle is the **trigger + gate**, the connected system is the **executor**.*

**Why this is the white space:** both GitHub Copilot's coding agent and GitLab Duo retrofit AI as a **PR-author inside a human workflow** — the agent opens a *draft PR a human must merge*; it cannot be a first-class participant in a different primitive. HyperIdle inverts the model: agents are first-class, humans are reviewers/gates, and "review for anything" spans non-code work (refunds, sends, metrics) that git hosts do not touch at all.

---

## Phase 4 — Contracts

- **Code-substrate cardinality.** A coding agent works in **exactly one** local git working copy per unit of work; **0..1** connected forge (GitHub/GitLab) as an optional remote. Forge is never required for the system to function.
- **Closure.** The set of connected systems is **OPEN** (resolved via the harness capability descriptor — same open-closure as AL7's executable tools and the open artifact-kind vocab). The ride/replace/integrate **classification** is **CLOSED** — adding a new GitHub/GitLab feature to the comparison requires placing it in one of the three buckets in `docs/architecture/system-boundary.md`.
- **Store-of-record.** Each connected system owns its effect's state of record (merge → git; charge → Stripe). HyperIdle stores the **staged spec** + **Operation Outcome** only — never a re-hosted copy of the system's data. The code artifact is **derived** from the working-copy repo, never the canonical store of the code.
- **Landing (founder-decided).** Landing (merge/push/deploy/publish) is modeled as an **operative artifact carrying a Staged Operation** (AL7), behind a review. The descriptive code diff and its operative landing are **distinct artifacts**; approve accepts the diff and triggers the landing's staged op. At-most-once, idempotency, failure-surfacing all inherit AL7's contracts.
- **Hard rules.**
  1. **HyperIdle never executes a side-effect itself** — it triggers a connected system, which executes and returns an Outcome. (Generalizes AL7's "the tool performs the side-effect.")
  2. **No connected system is a dependency for the core product** — git/forge/CI are all optional connected systems; the system runs with none of them (review a doc, a metric, a refund).
  3. **We never reimplement a connected system's core** — no git forge, no CI runner, no registry. Integration only.
  4. **Code is git-derived, never HyperIdle-stored-of-record.**

---

## Founder decisions (2026-06-22)

1. **Code substrate = local git, forge-optional** (option #2 of 3). Not GitHub-tethered (#1), not a hosted forge (#3). Rationale: matches desktop-app / local-backend / solo-founder direction; keeps us beside GitHub, not on top of it; no external dependency to function.
2. **Landing sits behind a review** — merge/deploy is an operative Staged Operation approve triggers, not a manual out-of-scope follow-on. Rationale: makes plan→review→**act** hold for code, closing the "approve has no teeth for code" gap.

---

## Rationale

The founder's confusion was real and worth resolving precisely: the overlap with GitHub *looks* large (we both show diffs, both gate changes), so it is tempting to think we either *need* GitHub underneath or *are* a GitHub competitor. Neither is true. The inventory shows we have **no code-VCS and no CI/deploy today** — and the architecture docs already say we are not a workflow engine. The resolution is a **layer split**, not a feature overlap: GitHub/GitLab own the **substrate + infra** (git, runners, registries) and a **human-centric collaboration layer** (PR review, issues, wikis). We **ride** the substrate, **integrate** the infra, and **replace** the collaboration layer with an **agent-first** review/planning/knowledge OS. AL7 is where the split becomes operational — approve is the trigger, the connected system is the executor — and the founder's two decisions (local-first git; landing-behind-review) pin the code case to that same shape. These are expensive to change once `/architecture` binds a code-substrate adapter and a landing dispatch path — hence locking them here.

---

## Phase 6 — Self-critique

- **Rejection list distinct?** Yes — six rejections name different adjacent traps (forge, CI engine, on-top-of-GitHub layer, git-object store, scanning/SSO replacement, issues-as-ride). Each has its own reason.
- **Consistent with locked AL7?** Yes. AL7's "execute through the connected tool, source of truth in the tool, open closure" is the generalization this boundary names. The one refinement — Landing as an operative artifact paired with a descriptive code diff — *sharpens* AL7's descriptive/operative split without changing its grammar; recorded as a one-line addition to `plans/AL7/concept.md`.
- **Vocabulary collision?** "Substrate" tested confusing in conversation → defined explicitly here and prefer "connected system" / "code substrate (a git repo)" in prose. No code-term collision.
- **Right files?** Concept here; ground truth → new `docs/architecture/system-boundary.md`; cross-ref added to `what-this-architecture-does-not-include.md`; one-line refinement to `plans/AL7/concept.md`.

**Boundary LOCKED.**
