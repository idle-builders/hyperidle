# `git-export` — re-challenge (pass A verdict rejected)

Pass A said **stays** (`group1.md:76-84`) on the grounds that core consumes its own `knowledge_updated`
event and writes its own `server_config` section. Founder rejected it: *"git export definetly not stay
wtf is that even that shouldn't exist the name already says bad bad bad."*

Re-investigated from the code. **Pass A was wrong.** Not because the layer call was wrong — because the
question it answered ("does core use it?") was answered against a code path that is **off by default and
has no client.** The founder's read of the name is correct: `git-export` is a mechanism, and the package
today is a *git subprocess runner* with a dead export feature riding on it.

---

## 1. What it actually does, end to end

Two independent things share one package.

**(a) The export feature** — 1,012 lines (`git-export.ts` 570 + `git-export-config.ts` 442).

| Step | Evidence |
|---|---|
| Trigger 1 — event | `registerGitExportHandler` subscribes `eventBus.on("knowledge_updated", handler)` — `git-export.ts:564`, registered at `server-factory.ts:553` |
| Prefilter | reads the knowledge projection for the item, keeps only `L2`/`L4` × 7 kinds — `git-export.ts:545-550`, kinds at `:29-37` |
| Gate | `loadGitExportConfig` → `null` unless `server_config.gitExport.enabled` — `git-export-config.ts:69` |
| Debounce | in-memory `setTimeout`, default 2000 ms — `git-export.ts:556`, default `server-config.ts:64` |
| Trigger 2 — HTTP | `POST /api/git-export/run` — `git-export-routes.ts:120-145`, mounted `app.ts:573` |
| Plan | selects `active`/`validated` L2/L4 items, maps to `products/<scope>/<KIND>.md` and `factory/<KIND>.md` — `git-export.ts:184-206`, `:132-157`, statuses `:45` |
| Write | writes files into a configured repo dir, deletes tracked files no longer in the plan — `git-export.ts:306-336`, `:343-368` |
| Commit / push | `git add -A` → commit → optional `push origin <branch>` — `git-export.ts:437-470` |
| Persist | writes `lastCommitAt`/`lastCommitSha`/`lastPushAt` back to `server_config.gitExport` — `git-export.ts:459`,`:468` → `git-export-config.ts:163-179` |

What the user gets: a local git repo full of markdown mirroring their canonical knowledge rows, optionally
pushed to a remote. **Write-only.** There is no import, no restore, no read-back — nothing in `packages/`
parses `products/*.md` or `factory/*.md` back into `knowledge_items`. Context assembly reads the DB, not
the repo (`docs/process-layer/the-five-primitives.md:30`). A backup with no restore path is not a backup.

**(b) The git runner** — 509 lines (`git-export-runner.ts`), `createGitRunner`, 15 whitelisted git verbs
over `spawn` with a hardened env allow-list. Its own header says what it is:

> `git-export-runner.ts:5` — *"Narrow interface over the git subcommands the export **and filesystem
> products** need."*

Nine verbs serve the export. The verbs added since — `lsRemote` (AO1, `:52-66`), `clone`/`bundle`/
`worktreeAdd`/`worktreeRemove`/`restoreStaged` (AO2, `:67-125`), `currentBranch` (AV1, `:133-137`) —
have **nothing to do with export**. They exist for filesystem mounting and session provisioning.

---

## 2. Reachability — the export is effectively dead

Same failure mode the sweep already caught twice.

- **Zero UI.** `rg -a -i "gitexport|git.export" packages/web/src` → **0 hits.** Also 0 in `packages/desktop`,
  `packages/api-contract`, `packages/fabric`, `packages/eval`. No client has ever existed:
  `git log -S"gitExport" -- packages/web` → **empty**, across the whole history since the feature landed
  in `f799577c feat(H1): Git Export Routine` on **2026-04-18** (3.5 months).
- **Off by default and no path to on.** `enabled: z.boolean().default(false)` — `server-config.ts:58`;
  `repoPath: z.string().default("")` — `:59`. Nothing in seed, onboarding, scripts or desktop ever sets
  them. The only way to enable it is hand-rolling `PATCH /api/git-export/config` with curl.
- **Even when the event fires, it no-ops.** `loadGitExportConfig` returns `null` on `enabled=false`
  (`git-export-config.ts:69`) — but only *after* the handler has already paid a DB round-trip for the
  projection (`git-export.ts:545`, config check at `:552`). So the disabled feature costs a query on
  **every** knowledge update in every install.
- **Four routes, zero non-test callers.** `git-export-routes.ts:84`,`:93`,`:97`,`:120`,`:147`. The only
  requesters are `src/routes/__tests__/git-export.routes.integration.test.ts` and
  `src/__tests__/git-export-routes.integration.test.ts`.
- **Machinery kept alive by its own tests.** The `/testing` subpath (`testing.ts:1-37`) exists solely to
  re-export 15 symbols — `computeExportPlan`, `buildCommitMessage`, `loadGitExportConfig`,
  `writeExportMeta`, and all seven sanitizers — that no production file may import (main barrel
  deliberately omits them, `index.ts:1-58`). Test-only reachability, made architectural.
- **Test-to-code ratio.** 2,144 lines of export tests (`git-export.integration.test.ts` 1,348 +
  `git-export-routes.integration.test.ts` 582 + `git-export.routes.integration.test.ts` 214) against
  1,012 lines of export code that nothing calls.

**Contrast — the runner is genuinely live**, in shipped features with real UI:

- `server-factory.ts:1007` — `gitRunnerFactory: createGitRunner` feeds the filesystem **mounting engine**
  (clone/worktree/bundle for agent sessions).
- `routes/filesystems.ts:153` — reachability probe (`lsRemote`).
- `routes/filesystems.ts:260` — `inspectLocalPath` branch detection (`currentBranch`, AV1 onboarding).
- `filesystems/src/ports.ts:6-32` already re-declares the runner interface structurally as
  `FilesystemsGitRunner` — filesystems has *already* modelled it as its own dependency, just without
  owning it.

Two of the runner's three production consumers are not the export.

---

## 3. Domain, or mechanism wearing a domain's name?

**Mechanism.** Decisively.

- The noun is a verb. "Git export" names an action the system performs on someone else's data. It owns no
  entity, defines no lifecycle, has no vocabulary of its own. Its "state" is one blob on
  *`settings`*-owned `server_config` (`server-config.ts:57-70`) and its data is entirely
  *`knowledge`*-owned rows, reached through an injected port because it may not query them
  (`git-export.ts:180-190`, `ports.ts`).
- It is a **representation choice for knowledge**, and knowledge should own how knowledge is represented.
  Every domain decision in the exporter — which kinds ship (`git-export.ts:29-37`), which statuses are
  publishable (`:45`, citing `KNOWLEDGE_ARCHITECTURE.md §9`), what the on-disk taxonomy is (`:132-157`) —
  is a *knowledge* rule that has been copied out of knowledge into a package named after a transport.
  `docs/knowledge-architecture/facilitators.md:79-92` already documents these as knowledge-architecture
  rules; the code just lives elsewhere.
- If it were a domain, its name would be something like **Knowledge Publication** or **Knowledge Mirror**.
  But naming it honestly exposes that it has no independent identity: a mirror of knowledge is knowledge's
  problem.

**Against the settled git-host position** (`docs/architecture/system-boundary.md:19`, `:32`;
`system-overview.md:167`): HyperIdle rides git as the **working ground for code** — a local, forge-optional
repo the agent edits, with the code artifact *derived* from it. That is the filesystems/mounting path, and
the runner serves it. Knowledge is the opposite: the DB is canonical, deliberately
(`docs/knowledge-architecture/the-canonical-store.md:67`, `docs/requirements/system-requirements.md:17`
S-2.2 — *"Git is the backup and audit trail, never the source of truth"*). So "riding git" does **not**
license a knowledge exporter; it licenses the runner. The exporter is a one-directional backup mechanism
chosen in H1, never wired to a user, and never given a restore path — which is exactly the shape of a
missing design (should knowledge *live* in git?) papered over by a feature.

Note the docs are also stale on this: `the-canonical-store.md:67` cites
`packages/server/src/services/git-export.ts`, `system-requirements.md:17` and `facilitators.md:5,79` cite
`packages/fabric/src/services/git-export.ts`. Neither path has existed since AU19. Nobody has looked at
this feature in a long time.

---

## 4. Verdict — **splits: the runner survives, the export deletes**

Not one of the four offered options cleanly, because the package is two things.

**(a) `createGitRunner` + `GitRunner` + `GitConfigInjection` → relocates, renamed.**
Extract `git-export-runner.ts` (509 lines) to its own package — `@hyperidle/git-runner`, or fold into
`filesystems`, which already declares the interface at `ports.ts:6-32`. It is a hardened subprocess
adapter, not a domain: no DB, no tables, no events. Its live consumers are the filesystem mounting engine
and the reachability/branch probes. Which side of the core/orchestration line it lands on follows the
mounting-engine decision in `group1.md:50` — it must not be resolved inside a git-export verdict, and the
group1 note flagging exactly this is correct and carries forward.

**(b) The export feature → deletes.**
`git-export.ts` (570), `git-export-config.ts` (442), `ports.ts` (99), `testing.ts` (37),
`src/routes/git-export-routes.ts` (163), the `api.route("/git-export", …)` mount (`app.ts:573`), the
`registerGitExportHandler` bootstrap (`server-factory.ts:553-559`), the `GitExportSchema` section
(`server-config.ts:57-70`), and 2,144 lines of tests. ~4,500 lines total.

**What is lost:** nothing a user has. The capability was never reachable from the product. What is lost is
a *documented claim* — `system-requirements.md:17` (S-2.2), `the-canonical-store.md:67`, and
`facilitators.md:79-92` assert that knowledge is git-backed. Deleting the code makes those docs honest
about an unimplemented intent instead of pointing at (already-stale) paths for a switch nobody can flip.
Also lost: the `knowledge_updated` event's only *behavioral* subscriber — the event stays alive and
correct via observability (`observability/src/dispatcher.ts:401`) and realtime broadcast
(`realtime/src/ws-connection-hub.ts:31`), so no event plumbing is orphaned.

**If knowledge-in-git is genuinely wanted**, it is a design question for `knowledge` — bidirectional,
restorable, with a user-facing surface, owned by the domain whose rules it encodes — not a resurrection of
a one-way exporter. That is a new work package, not a rescue of this one.

**Explicitly rejected alternatives:**
- *stays* — no domain, no user, no client, no restore, off by default. Pass A's "core consumes its own
  event" is true and irrelevant: a subscriber that returns `null` at `git-export-config.ts:69` on every
  install is not a use.
- *relocates to `agent-orchestration`* — no agent anywhere in the path. Pass A got this part right.
- *dissolves into `knowledge`* — would move ~1,000 lines of unreachable code into a healthy domain and
  make `knowledge` own a mechanism it has no user for. Delete first; design later if wanted.

---

## 5. Is this AU26's call?

**Split the answer.**

**(a) The runner extraction is squarely AU26's axis** — "which layer owns what." A git subprocess adapter
whose main consumer is the filesystem mounting engine is sitting inside a package named for a different,
dead feature. AU26 should execute it, sequenced after the mounting-engine decision (`group1.md:50`) since
that decision determines the destination.

**(b) The export deletion is a different axis** — "should this feature exist" — and folding a feature
deletion into a layer-cleanup WP is scope creep by default. Three things make this the exception:

1. The founder has already made the product call on the record. This is not AU26 inventing a scope; it is
   AU26 executing a stated decision.
2. Nothing is being taken from a user, because no user can reach it. This is dead-code removal that
   *happens* to be shaped like a feature, not a feature removal.
3. It cannot be cleanly deferred. The package must be dissolved to free the runner; parking the export
   half means either shipping a package named `git-export` that no longer exports, or leaving ~4,500 lines
   of unreachable code in core — precisely what this WP exists to stop.

**Recommendation: AU26 executes both, as one increment.** Same edit, same package. Raise as a *finding*
(not a blocker) the doc consequence — `system-requirements.md` S-2.2, `the-canonical-store.md:67`,
`facilitators.md:79-92` need rewriting to stop claiming a git-backed knowledge store — and, separately, the
open product question *"should knowledge live in git?"*, which belongs to a future `knowledge` WP and is
explicitly **not** AU26's to answer.

**Fallback if the deletion is judged out of scope:** AU26 extracts the runner only and files the export
deletion as a standalone finding. This is worse — it leaves a package called `git-export` containing
nothing but a dead exporter — but it keeps the WP's axis clean and is a legitimate call to make.
