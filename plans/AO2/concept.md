# AO2 — Concept (RE-LOCK): Mount the bound filesystem into the session working directory — per-source

**Level:** Per-workpackage. **This is a concept *re-lock*, not a first lock.** AO2 was already mid-build (`feat/AO2-materialize-substrate-sandbox`, at write-tests) when **AQ1 landed on `origin/main` (PR #371) and reshaped the primitive AO2 was built on** — the "session sandbox" is no longer an isolation boundary, just a host working directory. This doc re-locks what AO2 *is* now and forces the spec corrections.

**Second pass (2026-06-28, founder):** the re-lock below was still written **git-only** ("mount = git checkout"). But AO0 locked the filesystem as an **OPEN kind** (`code` = git repo; `doc_set` = a markdown / Obsidian **folder**; later GDrive / Dropbox / S3). The mount + capture-back contract must serve **all** of these, and they have **different native transports** — so mount cannot be one git verb. **Phase 5 generalizes mount to an adapter model**: ONE uniform `mount`/`captureBack` contract `session-provisioning` calls kind-agnostically, with all source differences encapsulated in a **registry of mount adapters** selected by the filesystem's kind+source. The git framing below stays correct — it is now **one adapter** (in fact two: worktree for local git, clone for remote git), not the whole story.

**Mode:** Autonomous (`PIPELINE_INTERACTIVE` ≠ `1`) — no recap gate. Doc-only WP (concept/research); no code, no tests written here.

## Fixed inputs (every claim below is grounded in these; nothing aspirational)

- **AQ1 run-unit model** — `docs/architecture/run-unit-model.md` + `plans/AQ1/concept.md` (LOCKED). The run-unit is a **per-session working directory on the host**; the harness runs as a host child process with the real `$HOME`; **no isolation boundary**; inherited tools (`gh`, `git`, `~/.ssh`, `~/.config/gh`) work for free; the working dir is `rm -rf`'d on destroy. **Decisive for Phase 5:** a *local* source (an Obsidian vault folder, or a local git clone of the repo) is **already physically present on the host** — so `git worktree` / work-in-place is the natural primitive, not a network round-trip.
- **AO0 filesystem concept** — `plans/AO/concept.md` + `plans/AO/research-filesystem-vs-tool.md` (LOCKED). Filesystem = authored corpus; **OPEN `kind`** (`code` = git repo, `doc_set` = folder) and **OPEN `source`** (`local` / `github` / `gdrive` / …); registered team-scoped, **injected per-bot** via `FilesystemInjection`; references a Connection + resource. SoRs (inbox/CRM/ticket) categorically excluded; cloud-drive **lookup** is the knowledge fabric, not a filesystem.
- **AO1 — merged** (`packages/server/src/routes/filesystems.ts`, `packages/shared/src/filesystem.ts`, schema `filesystems`/`filesystem_injections`). AO1 **already owns the AO2 seam types**: `FilesystemMounter.mount()` / `.captureBack()`, `MountResult`, `CaptureResult`, `FilesystemAuth`, `FilesystemAuthResolver` (`packages/shared/src/filesystem.ts:101-133`). AO1 already renamed the act from "materialize" to **mount** in code, and the seam carries `filesystem.kind` + `filesystem.source` — the **discriminants Phase 5's selection rule keys on** (no new AO1 field required; see Phase 5·selection).
- **AN2 provisioning concept** — `plans/AN2/concept.md` (LOCKED but **UNMERGED**, no code). Held `token`/`mcp` Connections re-applied into the working dir at spawn; **inherited auth never carried/extracted**. **AN2 owns held-connection auth, NOT AO2.**
- **AN1 resolver — merged** (`packages/server/src/services/service-connection-resolver.ts`; `service_connections` re-merged on this branch via migration `0039_classy_nocturne.sql`, retained through `0040`). The sole plaintext-token seam. AO1's `FilesystemAuthResolver.resolveToken()` already delegates to it.
- **Adapter-registry precedent (in-codebase)** — `packages/server/src/harness/sandbox-adapter.ts` (uniform `SandboxAdapter` interface: `spawn`/`exec`/`destroy`), `local-sandbox-adapter.ts` / `disabled-sandbox-adapter.ts` (per-kind impls), and `adapter-pool.ts` (a **registry keyed by a stable id/`type`** with a `select(requirements)` that filters by `type`/capabilities and returns the matching adapter — `adapter-pool.ts:194-246`; `CLI_TOOL_CONFIGS` registers `codex`/`opencode` by binary name, `:338`). The harness layer is the worked precedent: **one interface, N implementations registered by a discriminant, a selector that dispatches**. Phase 5's mounter registry follows this shape exactly.

---

## What changed / why re-lock

AO2's old framing (`TRACK-AO.md` AO2, lines 77-117) was written against a world with **a per-session isolation boundary** the agent could not see past. Its load-bearing verbs and AC#4 all assumed:
- "**materialize INTO the sandbox**" = copy working files *across an isolation wall*;
- "the bound Connection's auth **is provisioned into the sandbox** so the agent's git/gh fetch/push" (AC#4) = AO2 must build an **auth-injection** mechanism because the agent could not otherwise reach the host's credentials;
- writeback = capture *out of the isolated copy* before teardown.

**AQ1 deleted the wall.** `CliHarnessAdapter.startSession` spawns the harness as a host child process with `cwd = sandboxPath` and the real `$HOME` forwarded (`cli-harness-adapter.ts:376-380`; env allowlist includes `HOME`, AQ1 §15). `LocalSandboxAdapter.spawn()` is now just `mkdir` and `.destroy()` is `rm -rf` (`local-sandbox-adapter.ts:75-105`). So: there is no boundary to materialize *across*; the agent's own inherited `git`/`gh` already authenticate via `$HOME` with **zero** provisioning; the isolation/Docker machinery the old AO2 assumed was **deleted in AQ1** (`docs/architecture/run-unit-model.md:38-39`).

The reshape **shrinks AO2 to its honest residual**: place the bound filesystem's working set into the working dir, wire `captureBack` before teardown, and degrade gracefully when no filesystem is bound. Everything else AO2 used to claim is either free (inherited auth — AQ1) or someone else's (held-connection auth — AN2). **And it makes mount source-shaped:** the *honest* residual differs per source — a local git repo wants `git worktree add` (instant, no network), a remote repo wants `git clone`, a local Obsidian folder wants work-in-place. Phase 5 names that set.

---

## Phase 0 — The noun(s)

| Noun | Class | One-line working definition |
|---|---|---|
| **Mount** (the AO2 act) | **Reshaped** (was "materialize") | The spawn-time act that places a bot's bound filesystem's working set into the session's host working directory, before the harness runs. Post-AQ1 it is a **plain placement into a host directory**, not a copy across an isolation boundary. **Adapter-dispatched** (Phase 5): the *how* (`git worktree` vs `git clone` vs in-place folder vs cloud-sync-pull) is chosen by a **mount adapter** keyed on the filesystem's `kind` + `source`; the contract `session-provisioning` calls is kind-agnostic. Code noun already chosen by AO1: `FilesystemMounter.mount()` (`shared/src/filesystem.ts:121-128`). |
| **Mount adapter** | **New (Phase 5)** | One implementation of the per-source mount + capture-back strategy, registered in a **mounter registry** and selected by `(kind, source-locality, transport)`. Mirrors the harness `SandboxAdapter` + `AdapterPool` precedent (one interface, N impls, a selector). Differentiation lives **here**, never in the provisioning flow. |
| **Capture-back** | **Reshaped** (was "writeback") | The teardown-time act that commits (`git`) / snapshots (`file`) authored changes before the working dir is `rm -rf`'d. **Source-aware** (Phase 5): git commit (+ bundle) for git adapters, folder snapshot for the local-folder adapter, cloud push for the deferred cloud adapters. **Not** push/PR/merge to a forge — that is landing (AL7/AO3). |
| **Inbound-git checkout** | **New** (satellite) | The `clone`/`worktree`/`fetch`/`checkout` capability `GitRunner` lacks today (`git-export-runner.ts:34-71` — export-only: `init/add/commit/push/lsRemote`, **no clone/worktree/fetch/checkout**). The real residual the git adapters build on. |
| Filesystem / FilesystemInjection | Stable (AO0/AO1) | The bound authored corpus (`kind` + `source`) + the per-bot wiring. The `kind`/`source` Phase 5 dispatches on. Fixed input. |
| Sandbox (run-unit) | Stable (AQ1) | A per-session **working directory on the host**, no isolation. The mount target. |
| Connection provisioning | Stable (AN2, unmerged) | Held-connection auth re-applied at spawn. **AO2 does not implement this.** |

**Human design review forecast:** **No** — backend/runtime provisioning mechanism, no rendered surface (unchanged from the WP field).

> **Vocabulary note — "mount", not "materialize".** AO1 already shipped the seam under the name **mount** (`FilesystemMounter`, `MountResult`). The re-lock ratifies that choice (Phase 3). "Materialize" is doubly wrong: it is **retired Fabric vocab** (old `packages/fabric` workspace-materialization, per the locked harness vocabulary) AND AN2 deliberately reserves **"provisioning"** for held-connection auth. AO2 says **mount** (place files) and **capture-back** (take changes out). Phase 5 adds **mount adapter** / **mounter registry** — deliberately disambiguated from the harness *sandbox* "adapter" and AN *connection* "provisioning" (Phase 3).

---

## Phase 1 — Essence (central act: Mount)

1. **Identity.** Mount is an **act** within session provisioning — a step, not a stored entity. Given a bot's injected filesystem (`kind` + `source`) + a fresh host working directory, it produces the filesystem's working set inside that directory **via the adapter selected for that source** (a git working tree at the branch for `code`; the folder's files for `doc_set`). It holds no durable state; the working tree dies with the working dir.

2. **Essential properties.** Every mount: (a) runs **at spawn**, after `workspace.spawn` (Phase 4, `session-provisioning.ts:463`) and before context assembly (Phase 6, `:488`) — the new **Phase 4.5** AO1's architecture already located (`plans/AO1/architecture.md:410`); (b) is **driven by the bot's injected filesystems** (`sessions.agentId → filesystem_injections.agent_user_id → filesystems`), never a global path (AO0 hard rule 7); (c) is **idempotent per working dir** — a fresh placement each spawn; (d) **dispatches on `(kind, source)`** to the matching mount adapter — the provisioning loop is **adapter-agnostic** and never branches on source itself (Phase 5 contract); (e) for a `code` kind, leaves a real git working tree the harness can read/edit/build/test; (f) needs **no auth boundary crossing** — the working dir *is* on the host, so the agent's inherited `git`/`gh` (real `$HOME`) operate on it directly.

3. **Rejection list** — see Phase 2.

4. **Composition.** Mount *consumes* the bound `Filesystem` (AO1) + the `FilesystemAuth | null` the resolver yields; *selects* a **mount adapter** from the **mounter registry** by `(kind, source-locality, transport)`; *produces* the working set inside `SandboxHandle.path`; *uses* the **inbound-git checkout** capability added to `GitRunner` (for the git adapters). Capture-back *attaches to* teardown — after `endSession`, before `workspace.destroy` (`session-provisioning.ts:1117-1122`; and the not-returned path at `:1102-1104`; and crash/budget paths if a tree exists), **routed back through the same adapter** so the capture strategy matches the mount strategy.

5. **Lifecycle.** `spawn (mkdir working dir) → resolve injected filesystems → for each: select adapter by (kind, source) → adapter.mount into working dir → harness runs as host process, edits/builds/tests with inherited tools → endSession → adapter.captureBack (git commit/bundle · folder snapshot · cloud push) → rm -rf working dir`. A bot with **no** injected filesystem skips mount entirely and degrades to today's behavior.

6. **Authority.** The **server** (session-provisioning, Phase 4.5) owns the mount act and the **mounter registry**; each **mount adapter** owns its source's strategy. The **git repo** is the source of truth for `code` (AO0; system-boundary hard rule 4). For its **own live-proof**, AO2 relies on the agent's **inherited** `$HOME` auth (free, AQ1) to push to a real repo — it builds no auth path. **Held-connection auth is AN2's authority**, composed in later.

---

## Phase 2 — Rejection list (what AO2 is NOT, with reasons)

1. **AO2 is NOT an auth-injection / credential-provisioning mechanism.** Post-AQ1 the harness runs on the host with the real `$HOME`, so inherited `git`/`gh`/`~/.ssh`/`~/.config/gh` already authenticate with **zero** AO2 work (`run-unit-model.md:17`; `cli-harness-adapter.ts:376-380`). Carrying a **held** token into the working dir is **AN2's** job (`plans/AN2/concept.md` — Connection provisioning, Phase 8b), keyed on `HELD_AUTH_SOURCES`, gate-free. *Why:* the old AC#4 was written when an isolation wall meant the agent *couldn't* reach host creds; that premise is dead. AO2 re-implementing auth-into-sandbox would duplicate AN2 and re-introduce a credential boundary AQ1 + ETHOS §2 reject. **AO2 never extracts inherited auth** (AN1 hard rule 4).

2. **AO2 is NOT isolation.** It does not create, assume, or restore any boundary. The Docker/isolated adapters the stale in-flight branch resurrects were **deleted in AQ1** (`run-unit-model.md:38-39`); per-agent isolation is **AQ2**. AO2 mounts into a plain host directory. *Why:* re-adding a boundary contradicts the locked AQ1 posture (no preemptive wall) and the founder's 2026-06-28 note on the WP itself.

3. **AO2 is NOT a sync engine.** `code` → git is the host's native mechanism; `doc_set`/`file` → last-write + a captured snapshot; cloud sources (deferred) → the connector's own sync, last-write, no merge engine. No OT/CRDT, no two-way diff, no conflict resolver in any adapter (AO0 contract; research-grounded — no production system materializes a non-code SoR for syncback). *Why:* AO0 categorically excludes systems of record and a custom sync layer. **A mount adapter rides the source's native transport; it never invents merge.**

4. **AO2 is NOT AN2's connection provisioning.** AN2 re-applies **held** `token`/`mcp` Connections (the user's connected GitHub/services) into the working dir. AO2 places **files** (the repo working tree / folder). Distinct axes: files (AO2) ⟂ auth/tools (AN1/AN2) — they **compose**, never merge. *Why:* folding held-token provisioning into AO2 re-merges two primitives AO0 deliberately split. (And note the deliberate naming split — Phase 3 — so "mount adapter" never reads as "connection provisioning".)

5. **AO2 is NOT landing.** `captureBack` commits / snapshots **inside** the working dir (or bundles it to a durable path); it does **not** push/PR/merge/publish to a forge. Pushing an approved change to the forge — or pushing a doc back up to GDrive as a *publish* — is a **landing** op routed through AL7/AO3 (AO0 vocabulary lock; `shared/src/filesystem.ts:131`). *Why:* capture-before-teardown (so changes aren't lost to `rm -rf`) is a different act from making a change real on an external target. **This holds per-adapter** — every adapter's capture-back stops at "durable + reviewable", never "live".

6. **AO2 is NOT the filesystem model.** AO1 owns the record, the injection mapping, registration, reachability, and the seam **types**. AO2 only **implements** `FilesystemMounter` (as the adapter registry) + the git checkout capability + the two hook calls. *Why:* AO1 is merged; AO2 must not re-model.

7. **A mount adapter is NOT a new *transport instance* — only a new *transport kind*.** Adding GitHub repo #2 is a new **Connection** row (AN), not new adapter code — the existing remote-git adapter serves it. A new *kind of transport* (the first time GDrive is supported) is a **new adapter**. *Why:* the adapter set is closed-ish on *transport classes*, open on *instances* — the same boundary AN draws (a new account = a Connection; a new service-class = new connector code).

---

## Phase 3 — Vocabulary lock

| Term | Definition | Aliases NOT to use |
|---|---|---|
| **Mount** | The spawn-time act placing a bound filesystem's working set into the session's host working directory, **dispatched per-source via a mount adapter**. Code: `FilesystemMounter.mount()`. | **materialize** (retired Fabric word), **provision** (AN2's word for held auth), inject (AO0's per-bot wiring), hydrate, copy-in |
| **Mount adapter** | One per-source implementation of the mount + capture-back strategy, registered in the **mounter registry**, selected by `(kind, source-locality, transport)`. The unit that holds all source differences. | sandbox adapter (= the harness run-unit `SandboxAdapter` — different layer), connection provisioner (= AN2), driver, plugin |
| **Mounter registry** | The selector that maps a filesystem's `(kind, source)` to its mount adapter — mirrors `AdapterPool.select()` for harnesses. | adapter pool (reserved for harnesses), mount manager |
| **Capture-back** | The teardown-time act committing (`git`) / snapshotting (`file`) / pushing (cloud, deferred) authored changes before `rm -rf`, **routed through the mount adapter** that mounted it. | writeback-as-landing, sync, save, push (push-to-forge = land) |
| **Inbound-git checkout** | The `clone`/`worktree`/`fetch`/`checkout` capability added to `GitRunner` (export-only today). The git adapters' primitive. | clone engine, sync |
| **Land** | Make an approved change real on the forge / external target (push/PR/merge/publish) — AL7/AO3, NOT AO2. | capture (capture ≠ land) |
| **Working directory / run-unit** | The per-session host directory (AQ1). The mount target. No isolation. | sandbox-as-jail, container, isolated copy |

Reconciliation: **mount** (place files, AO2) vs **provisioning** (re-apply held auth, AN2) vs **inject** (per-bot wiring of a registered filesystem, AO0) are three distinct words for three distinct acts — never interchange them. **"Mount adapter" (AO2, per-source file placement) is deliberately distinct from "sandbox adapter" (the harness `SandboxAdapter`, a run-unit) and from "connection provisioning" (AN2, held auth)** — three adapter-ish words for three layers; never collapse them. AQ1's **sandbox = host working directory** is the only sense of "sandbox" AO2 uses.

---

## Phase 4 — Contracts + hard rules

- **Uniform contract, adapter implementations (the core shape).** `session-provisioning` calls **one** `FilesystemMounter.mount({ filesystem, sandboxPath, auth })` / `.captureBack({ filesystem, sandboxPath })` contract (AO1's shipped seam, `shared/src/filesystem.ts:121-133`), **kind-agnostically** — it never branches on `kind`/`source`. The implementation is a **mounter registry** that selects a **mount adapter** by `(kind, source-locality, transport)` and delegates. **All source differences live inside the adapter; none leak into the provisioning flow.** This mirrors the harness layer (`AdapterPool.select()` → one `HarnessAdapter` interface, N impls — `adapter-pool.ts:194`).
- **Cardinality.** One session ↔ one working directory ↔ 0..N mounted filesystems (the bot's injected set). Each injected `Filesystem` → at most one mount per working dir, served by exactly one adapter (the selection is deterministic — Phase 5).
- **Closed-ish adapter set, keyed by source.** The set of mount adapters is **closed on transport class** (each is code) and **open on instance** (a new Connection of a known transport needs no new adapter — Phase 2 rejection 7). v1 ships the **git adapters** (`code`) + the **local-folder adapter** (`doc_set`); cloud-sync adapters are **named but deferred** to their connector WPs (Phase 5 table).
- **Inherited = free; held = AN2.** AO2's own behavior and live-proof use **inherited** `$HOME` auth (free under AQ1) — it builds no auth path. When AN2 merges, a held forge token reaches the working dir via AN2's provisioning; AO2's mount is unchanged (the adapter checks out; auth is ambient). The `FilesystemAuth | null` that `mount()` accepts is honored when present but **AO2 does not produce it** — AN1's resolver does (`resolveToken`/`resolve`), AN2 places held secrets.
- **Capture-back before teardown, per-adapter.** Authored changes are committed/snapshotted **after `endSession`, before `workspace.destroy`** (`session-provisioning.ts:1117-1122`) on the normal and not-returned paths, and on crash/budget paths when a working tree exists, **through the same adapter that mounted**. *Why this still matters post-AQ1:* the working dir is `rm -rf`'d on destroy (`local-sandbox-adapter.ts:103`), so uncommitted work is genuinely lost — but the **agent's own inherited `git` does the push itself**; AO2 only ensures a commit/snapshot/bundle exists before deletion.
- **Mount driven by the AO1 attachment, never a global path.** Resolve `sessions.agentId → filesystem_injections.agent_user_id → filesystems.id` (Phase 4.5). No team-shared-via-null fallback. A bot with no injected filesystem → no mount, degrade to today (AO0 hard rule 7; old AO2 AC#3).
- **No isolation, no preemptive wall** (AQ1 hard rule; ETHOS §2). The working dir is on the user's machine.

### Hard rules (a downstream violation means the concept is broken)
1. **Mount places files only.** It never injects, extracts, or resolves auth as its own concern — inherited is ambient (AQ1), held is AN2.
2. **Never extract inherited auth** (AN1 hard rule 4; AQ1 hard rule 2).
3. **Capture-back is not landing.** Commit/snapshot/bundle only; push/PR/merge/publish to an external target is AL7/AO3.
4. **No isolation machinery.** AO2 adds zero boundary; it must not re-introduce the AQ1-deleted Docker/isolated adapters.
5. **No custom sync engine in any adapter.** git for `code`; last-write + snapshot for `doc_set`/`file`; the connector's native sync for cloud (deferred). Never OT/CRDT/merge.
6. **The provisioning flow is source-agnostic.** `session-provisioning` calls the uniform `mount`/`captureBack`; every per-source branch lives **inside an adapter** behind the registry. A `switch (source)` in the provisioning loop is a concept violation.
7. **Inbound-git rides one runner.** Extend `GitRunner` with `clone`/`worktree`/`fetch`/`checkout` (reuse `buildGitEnv` hardening, `git-export-runner.ts:135-173`) — do not fork a sibling runner duplicating the security-critical env code. The local-git (worktree) and remote-git (clone) adapters share this one runner.
8. **A new transport instance is a Connection, not an adapter.** New adapter code is earned only by a new transport *class* (Phase 2 rejection 7).
9. **Live-proof.** AO2 must drive a **real** session that checks out a **real** git repo, lets the agent edit + run the project's test command, and captures the change — before `done`. Inherited `$HOME` auth is sufficient; no AN2 dependency. The local-folder adapter is proven thin (mount a folder, edit a file, snapshot it back).

---

## Phase 5 — Source adapters (the mount is per-source)

**The point.** AO0's `kind`/`source` are OPEN, and the sources have **different native transports** — a git repo clones/worktrees, an Obsidian vault is just a folder, GDrive syncs over an API. One git verb cannot serve all of them. So the **mount is adapter-dispatched**: one uniform contract (`FilesystemMounter.mount`/`.captureBack`, AO1's shipped seam), a **mounter registry** behind it, and a **mount adapter** per source that owns that source's mount + capture-back strategy. This is the exact shape the harness layer already uses (`SandboxAdapter` interface + `AdapterPool.select()` + per-kind impls — fixed-inputs/precedent above); AO2 reuses the pattern, not the code.

### The adapter set

| # | Source (kind · locality · transport) | Mount strategy | Capture-back strategy | Auth | v1 / deferred |
|---|---|---|---|---|---|
| 1 | **Local git repo present on host** (`code` · local · git, `connectionId` null or a local path) | **`git worktree add <workdir> <branch>`** — instant, shares the host repo's object store, **no network**. The unit of work = a worktree (mirrors the human flow CLAUDE.md mandates: *every change in its own worktree+branch off `origin/main`*). | `git add`/`commit` on the worktree branch → **`git worktree remove`** (+ optional bundle to a durable path for AO3). The commit already lives in the shared object store. | none (local) | **v1** |
| 2 | **Remote git repo** (`code` · remote · git, `connectionId` → forge + `resourceRef.repo`+`branch`) | **`git clone` (shallow, `--depth=1`)** into the working dir at the branch. | `git add`/`commit` → bundle to a durable path. Push/PR = **landing** (AL7/AO3), not capture. | inherited `$HOME` (free, AQ1) for live-proof; held forge token via AN2 later | **v1** |
| 3 | **Local folder** (`doc_set` · local · file — an Obsidian vault already on host) | **Work in place** — point the harness at the vault path (or a per-session symlink into the working dir). No copy: post-AQ1 there's no boundary, and a copy doubles disk + loses external-tool live-reload (Obsidian open on the same vault). **In-place is the v1 pick** (argued below). | **Last-write is already in place**; capture-back = a **snapshot** (timestamped copy of the changed subtree) to a durable path for AO3 provenance. No merge. | none (local) | **v1 (thin)** |
| 4 | **Cloud-synced folder / object store** (`doc_set`/`data` · remote · GDrive / Dropbox / S3) | **Sync/pull down** via the connector (the connector's own client), into the working dir. | **Sync/push up** (last-write, **no merge engine**) — and *publish* is landing. | held Connection (the connector's token) — **a dependency that does not exist yet** | **deferred** — built in each cloud connector's WP, NOT in AO2 |

> **Worktree vs clone vs in-place — the decision.**
> - **Local git → worktree (1), not clone.** Post-AQ1 the repo is physically on the host, so `git worktree add` is instant, costs ~no disk (shared object store), and **is** the human flow this repo mandates (*work in a dedicated worktree on a branch cut from `origin/main`*). HyperIdle-builds-HyperIdle therefore uses the worktree adapter on itself — the unit of agent work = a worktree, mirroring the human. Clone would re-download what's already there and break the "shares object store" property. *Caveat:* `git worktree` forbids two worktrees on the **same branch** — so each session worktree gets its **own session branch** (e.g. `agent/<sessionId>`), which is the natural shape for capture→review anyway.
> - **Remote git → clone (2).** No local copy exists, so clone is the only option; shallow keeps it fast.
> - **Local folder → in-place (3), not copy.** With no isolation boundary (AQ1) a copy buys nothing and costs: doubled disk, and it severs the live external tool (Obsidian editing the real vault). In-place is simplest and correct for the single-user laptop. **Concurrency caveat (honest):** two sessions on the **same** vault both writing in place can clobber each other — but that is the *same* risk a human running two editors has, and AO0's contract is explicitly **last-write-wins + snapshot, no merge**. If concurrent same-vault sessions become a real pain, the mitigation is a per-session copy *in that adapter only* — a localized change behind the registry, not a contract change. v1 ships in-place; the snapshot gives provenance either way.

### The selection rule

The mounter registry selects deterministically from data **already on the AO1 `Filesystem` record** — no new field required:

```
selectMountAdapter(fs):
  if fs.kind === 'code':
      local = (fs.connectionId == null) || isLocalPath(fs.resourceRef.repo)   // a local path / no forge → on host
      return local ? GitWorktreeAdapter      // adapter 1
                   : GitCloneAdapter         // adapter 2
  if fs.kind === 'doc_set':
      // v1: only local folders. fs.source ∈ {local, obsidian} → in-place.
      if fs.source === 'gdrive' | 'dropbox' | 's3':  return CloudSyncAdapter[source]  // adapter 4 — DEFERRED (throws "not built" in v1)
      return LocalFolderAdapter                                                       // adapter 3
  // open vocab: an unknown (kind, source) with no adapter → no-op mount + needs_attention (never silently wrong)
```

**Discriminants, all present on AO1's `Filesystem` (no new column):**
- **`kind`** (`code` | `doc_set`) — the coarse split. Already on the record + the `mount()` seam input.
- **`source`** (`local` | `github` | `obsidian` | `gdrive` | …) — distinguishes local-folder from cloud, and is a strong **locality hint** for `code` too. Already stored (`filesystems.source`, AO1 §1).
- **locality of a `code` filesystem** — derived: `connectionId == null` (or a `resourceRef.repo` that is a local path) ⇒ **local** ⇒ worktree; a forge `connectionId` + `owner/repo` ⇒ **remote** ⇒ clone.

> **AO1 field flag — NONE required, but ONE clarity nit.** The selection closes on existing columns (`kind`, `source`, `connectionId`, `resourceRef`). The only soft gap: distinguishing *local git path* from *remote forge* for adapter 1-vs-2 currently leans on `connectionId == null` **plus** parsing whether `resourceRef.repo` is a path vs `owner/repo`. That is derivable today, so **no migration is needed**. If a later WP wants it explicit, an optional `source:'local'`-for-`code` convention (already legal under the open `source` vocab) makes adapter-1 selection a pure `source` check — but that is a **convention, not a new field**, and AO2 must not add a column. **Flagged, not required.**

### v1 vs deferred — the honest cut

- **v1 builds:** the **git adapters** (1 worktree + 2 clone — both ride the one extended `GitRunner`) and the **thin local-folder adapter** (3). Both are reachable on the host **today with zero new connector** (a local repo / a local Obsidian vault both already sit on disk under AQ1). The **keystone** — real checkout + edit + test + capture — is proven on **git** (adapter 1 or 2, live-proof hard rule 9); the local-folder adapter is proven thin (mount a folder, edit, snapshot).
- **v1 defers:** the **cloud-sync adapters** (4 — GDrive / Dropbox / S3). Each has a **hard connector dependency that does not exist yet** (no held-Connection client for those services), and AO0 already marks them "later, connector-gated". They are **named in the registry as future adapters** and the selector throws an explicit "adapter not built" (→ `needs_attention`) for them — **never silently wrong**. They are built **in each cloud connector's own WP**, not bolted into AO2.
- **The cut, stated plainly:** AO2 ships **git (full keystone) + local-folder (thin)**; AO2 does **not** ship any networked cloud filesystem. This keeps AO2 at S–M (Phase 4 scope correction) and keeps the keystone honest — a real agent really building this repo from a real worktree — without waiting on connectors that aren't designed yet.

### Reconcile with AO1's single `FilesystemMounter`

**Stays one interface, registry behind it — yes.** AO1 shipped exactly one seam type, `FilesystemMounter` (`shared/src/filesystem.ts:121`). AO2's implementation is a **registry-backed `FilesystemMounter`** whose `mount`/`captureBack` select a per-source adapter and delegate — `session-provisioning` still sees one mounter (hard rule 6). The per-source adapters can each *also* implement the same `FilesystemMounter` shape (so the registry is just a `Map<key, FilesystemMounter>` + a selector), or a narrower internal `MountAdapter` interface — an architecture choice, but the **outward seam is unchanged**, so AO1 needs no type change. **Naming collisions checked:** "mount adapter" ≠ harness `SandboxAdapter` (a run-unit, different layer) ≠ AN "connection provisioning" (held auth) — the three are locked distinct in Phase 3. No clash.

### Salvage note — closed PR #370 (`feat/AO2-materialize-substrate-sandbox`)

The pre-AQ1 branch is mostly dead, but two fragments are **AQ1-compatible salvage**:
- **`GitRunner.clone` + `bundle` + `FakeGitRunner`** (commit `443c705d`, `+122` to `git-export-runner.ts`) — the inbound-git verb sketch. **Salvageable** for adapter 2 (remote clone) and the bundle capture, after re-review against the hardened-env contract. **Does NOT cover `worktree`** — adapter 1's `git worktree add/remove` is **new** (the worktree decision is post-AQ1, this pass). Extend the same runner.
- **`filesystemCaptures` schema + migration 0041** (commit `ad0c3ec8`) — `filesystem_captures` table (`sessionId`, `filesystemId`, `writeback`, `capturePath`, `commitSha`) as capture provenance for AO3. **Salvageable** — it is source-agnostic (a row per capture, with `capturePath` pointing at a bundle *or* a snapshot dir), so it serves all v1 adapters. Re-number to the current migration tail.
- **`SandboxFilesystemMounter`** (`filesystem-mounter.ts`, `+417`) — its `mount` is **clone-only, single-strategy** (no worktree, no folder adapter) and it carries the dead `owner-scoped-auth-resolver` + isolation wiring. **Re-architect as the registry**, salvaging only the captureBack/bundle/scaffolding-exclusion shape — not the single-strategy mount.
- **DEAD (do not salvage):** `docker-sandbox-adapter.ts`, `isolated-harness-adapter.ts`, `isolated-session-*.ts`, `owner-scoped-auth-resolver.ts`, and the branch's deletion of `plans/AQ1/*` / `plans/AQ2/*` — all reverted by / contradicting AQ1 (Phase 2 rejections 1+2).

---

## Phase 6 — Self-critique (1 round)

- **Did the adapter model add a layer for its own sake?** No — it is **forced** by AO0's OPEN `kind`/`source` + genuinely different transports (git ≠ folder ≠ cloud API). The alternative (a `switch (source)` inside `session-provisioning`) is what hard rule 6 forbids and is strictly worse: it leaks source-knowledge into the provisioning flow and re-opens on every new source. The registry is the *smaller* long-term surface, and it reuses a pattern already in the codebase (harness `AdapterPool`) — no novel abstraction.
- **Is the adapter set over-built for v1?** No — v1 is **git + thin local-folder**, both host-reachable today; cloud is **named but unbuilt** (an explicit `needs_attention` throw, not a stub-from-memory — MEMORY: *no stubs from memory*). The keystone is proven on git only. Honest cut.
- **Worktree vs clone — over-clever?** The worktree pick is the *opposite* of clever: it is literally the human git flow this repo already mandates, applied to the agent. It also avoids re-downloading a repo that's already on disk. The own-session-branch caveat is the only nuance and it's the natural capture→review shape anyway.
- **New AO1 field?** None required — selection closes on `kind` + `source` + `connectionId` + `resourceRef`, all shipped. The local-vs-remote-`code` derivation is the only soft spot; flagged as a future *convention* (legal under open `source`), explicitly **not** a column AO2 adds.
- **Vocabulary collisions?** Checked: **mount adapter** (AO2) vs **sandbox adapter** (harness run-unit) vs **connection provisioning** (AN2) — three layers, locked distinct in Phase 3. **mounter registry** vs **adapter pool** (harnesses) — distinct names, same pattern. No clash.
- **Capture-back still not landing, per-adapter?** Yes — every adapter's capture stops at durable+reviewable (commit/bundle/snapshot/cloud-push-as-publish-is-landing). Hard rule 3 + Phase 2 rejection 5 hold across the set.

---

## Consumers / deps

- **AO1 (merged, dep).** Supplies the `FilesystemMounter`/`FilesystemAuthResolver` seam types, the `kind`+`source` discriminants the selection rule keys on, the injection resolution path, and `lsRemote` reachability. AO2 implements the seam **as a registry of mount adapters**; it does not re-model and adds no column.
- **AN2 (unmerged, composes-later, NOT a blocker).** AO2's DoD needs only inherited auth (free). Held-connection provisioning composes when AN2 lands: AN2 places held secrets/MCP pointers into the working dir at spawn; the git adapters then authenticate via the ambient held token exactly as via inherited `$HOME`. **AO2 is not blocked on AN2.**
- **Cloud connector WPs (future, own the deferred adapters).** The GDrive/Dropbox/S3 mount adapters (set #4) are built **in those connectors' WPs**, registered into the mounter registry there — not in AO2. AO2 ships the registry seam they plug into.
- **AQ1 (merged, foundation).** Defines the host working directory AO2 mounts into; removed the boundary the old AO2 assumed; makes local sources (repo, vault) physically present → worktree/in-place natural.
- **AO3 (gated on AL7).** Consumes captured output (the `filesystem_captures` provenance row → bundle/snapshot) → review → land. Capture-back hands AO3 a committed/bundled/snapshotted working set; AO2 never lands.

**Is AO2 blocked on AN2? No.** AN2 carries *held* connections; AO2's live-proof uses the *inherited* path, free under AQ1 (real `$HOME`, real `gh`/`git`). A single-user laptop with `gh auth login` done can `git push` from the working dir with zero provisioning. The git adapters reach DoD without AN2. The two compose orthogonally later (files vs auth).

---

## The stale in-flight build — do NOT assume it survives

`feat/AO2-materialize-substrate-sandbox` (was at write-tests) was built **pre-AQ1 against the dead model** and conflicts head-on with `origin/main`:
- it **resurrects** the AQ1-deleted isolation adapters (`docker-sandbox-adapter.ts` +139, `isolated-harness-adapter.ts` +264, `isolated-session-worker.ts`, `isolated-session-protocol.ts`) — a direct violation of AQ1 + Phase 2 rejection 2;
- it **deletes** `plans/AQ1/concept.md` (-94) and the AQ2 docs — reverting the locked decision;
- its `filesystem-mounter.ts` (+417) is **clone-only single-strategy** (no worktree, no folder adapter — Phase 5 supersedes it) and its `owner-scoped-auth-resolver.ts` (+117) was architected around the boundary + an AO2-owned auth path (rejection 1).

**Treat none of it as load-bearing.** AO2 must be re-architected from this locked concept on a fresh branch off `origin/main`. Salvage only the AQ1-compatible fragments named in the Phase 5 salvage note (`GitRunner.clone`/`bundle` `443c705d`; `filesystemCaptures` schema `ad0c3ec8`; the captureBack/scaffolding-exclusion shape), and only after re-review.

---

## Spec corrections for `TRACK-AO.md` AO2 (apply verbatim)

The AQ1-implication note (lines 79) is correct and stays. The body below it (81-117) still encodes the dead model **and is git-only**. Apply these edits:

**1. Workpackage sentence (line 81).** Replace "The sandbox is already isolated per session, so this is a plain checkout into it" with: *"The session runs in a host working directory (AQ1 — no isolation). **Mount is per-source, adapter-dispatched** behind one `FilesystemMounter` seam: a **local git repo → `git worktree add`**, a **remote repo → `git clone`**, a **local folder (Obsidian/`doc_set`) → work in place + snapshot**; **cloud-synced sources (GDrive/Dropbox/S3) are deferred** to their connector WPs. Plus capture-back before the working dir is `rm -rf`'d."* Drop "already isolated per session" everywhere.

**2. What exists today (line 85).** Correct: `GitRunner` is export-only — `init/add/commit/push/lsRemote`, **no `clone`/`worktree`/`fetch`/`checkout`** (`git-export-runner.ts:34-71`). Add: *the sandbox is now a host working dir (`LocalSandboxAdapter`); the harness runs host-local with the real `$HOME` (`cli-harness-adapter.ts:376-380`); AO1 shipped the `FilesystemMounter`/`FilesystemAuthResolver` seam types (with `kind`+`source` discriminants) and the injection model; the **harness layer already demonstrates the registry pattern** AO2's mounter follows (`SandboxAdapter` + `AdapterPool.select()`).*

**3. AC#1 — keep, de-isolate AND generalize beyond `code`.** Rephrase "the sandbox contains that repository's working tree" → "for a **`code`** filesystem the **session working directory** contains its working tree at its branch (via the **worktree** adapter when the repo is local on host, the **clone** adapter when remote), and the agent (running host-local) can read, edit, and run its build/test commands; for a **`doc_set`** filesystem the working directory contains the folder's files (the **local-folder** adapter, work-in-place + snapshot). **Mount dispatches per-source behind one `FilesystemMounter` contract; the provisioning flow never branches on source.**"

**4. AC#4 — REWRITE (the stale one).** Replace the whole AC#4 ("The bound Connection's auth **is provisioned into the sandbox** … no broker-only path.") with:
> **AC#4 (rewritten).** A session for a `code` filesystem can run a real authenticated `git fetch`/push against the repo **using the agent's inherited host auth** (`$HOME` — `gh`/`git`/`~/.ssh`, free under AQ1). AO2 builds **no** auth-into-sandbox mechanism: inherited auth is ambient (AQ1); held-connection provisioning is **AN2's** job and composes later without changing AO2's mount. The filesystem row stores no secret; AO2 never extracts inherited auth (AN1 hard rule 4).

**5. AC#2 — keep, sharpen the verb (per-source).** "captured (committed/written back) rather than lost when the sandbox is destroyed" → "…rather than lost when the **working directory is `rm -rf`'d** on destroy. **Capture-back is source-aware, routed through the mount adapter:** git → commit (+ bundle); local folder → snapshot; (cloud → push, deferred). **push/PR/publish to an external target is landing, AL7/AO3, not AO2**."

**6. NEW AC — the adapter set + local-folder v1 scope.** Add:
> **AC#6 (new).** Mount is implemented as a **registry of mount adapters** selected by `(kind, source)` behind the single `FilesystemMounter` seam. **v1 ships:** a **local-git worktree** adapter, a **remote-git clone** adapter, and a **thin local-folder** adapter (`doc_set` — work-in-place + snapshot). **Cloud-sync adapters (GDrive/Dropbox/S3) are NOT built in AO2** — they are named in the registry and selecting one yields an explicit `needs_attention` ("adapter not built"), never a silent failure; they are built in their connector WPs. A `switch (source)` in `session-provisioning` is a defect — all source differences live inside an adapter.

**7. NEW contract line — worktree vs clone vs in-place.** Add to contracts: *"For `code`: a **local** repo (on host, `connectionId` null / local path) mounts via **`git worktree add`** on a per-session branch (`agent/<sessionId>`) — instant, shared object store, no network, mirroring the human worktree flow; a **remote** repo mounts via shallow **`git clone`**. For `doc_set`: a **local folder** mounts **in place** (no copy — there's no boundary under AQ1; concurrency on the same vault is last-write-wins + snapshot, never merged). The one extended `GitRunner` serves both git adapters (`clone`/`worktree`/`fetch`/`checkout` reusing `buildGitEnv`)."*

**8. Validation scenarios (105-110).** Scenario 4 ("authenticated `git fetch`/push … using the provisioned auth") → "…using the agent's **inherited host auth** (`$HOME`); no provisioned-auth step." **Add a scenario:** *"A `code` filesystem whose repo is local-on-host mounts via `git worktree add` (no clone, no network) and captures via commit on its session branch; a `doc_set` local folder mounts in place, the agent edits a file, and capture-back snapshots the changed subtree."* Cloud scenarios are explicitly out of v1.

**9. Pre-build gates → Concept (line 94).** Change to: *`DONE — /concept AO2 RE-LOCKED + GENERALIZED post-AQ1 (plans/AO2/concept.md). Mount (was materialize) = per-source, adapter-dispatched behind one FilesystemMounter seam: local-git worktree · remote-git clone · local-folder in-place; cloud-sync deferred to connector WPs. AO2 is NOT auth-injection (inherited free / held = AN2), NOT isolation (AQ2), NOT a sync engine, NOT landing. Stale pre-AQ1 (clone-only, isolation) branch discarded; GitRunner.clone/bundle + filesystemCaptures schema salvageable.`*

**10. Plan calls (line 111).** Replace "checkout into the isolated sandbox — no shared worktrees" → "**adapter-dispatched mount** into the host working directory (AQ1 — no isolation): worktree for local git, clone for remote git, in-place for local folder; one extended `GitRunner` for both git adapters; cloud-sync adapters deferred". Keep the inbound-git capability + tool surface + capture-back + live-proof.

**11. Contracts / constraints (line 113).** Replace the "auth **is provisioned into the sandbox** … no broker-only path" sentences with: *"**One uniform `mount`/`captureBack` contract; per-source mount adapters behind a mounter registry** (worktree/clone/local-folder in v1; cloud deferred) — the provisioning flow is source-agnostic. Inherited host auth is ambient and free; held-connection auth is AN2's provisioning, composed later — AO2 implements no auth path and never extracts inherited auth. Capture-back (commit/bundle/snapshot) runs before `rm -rf`; landing (push/PR/publish) is AL7/AO3. Mount is driven by the bot's `FilesystemInjection` (AO1), never a global path; a no-filesystem session degrades to today's behavior."*

**12. Scope / complexity.** AO2 stays **S–M** (not L): auth is mooted (inherited free, held = AN2) and isolation is gone. The real residual is (a) `GitRunner` `clone`/`worktree`/`fetch`/`checkout` verbs, (b) the **registry-backed `FilesystemMounter`** + the three v1 adapters (worktree, clone, local-folder), (c) the two `session-provisioning` hook calls (Phase 4.5 + teardown), (d) the `filesystem_captures` provenance row, (e) the live-proof. Recommend **Complexity L → M**, **Effort L (~5d) → M (~2-3d)**. The git keystone (worktree/clone + edit + test + capture) is the proof; the local-folder adapter is thin; cloud is deferred.

---

**Concept LOCKED.** (re-lock + per-source adapter generalization)
