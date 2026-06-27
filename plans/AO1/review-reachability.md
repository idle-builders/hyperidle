# AO1 Reachability Rework (v2) — Review

**Scope:** the reachability rebuild that replaced the rejected `NoopAuthResolver` stub. PR #366 draft, branch `concept/AO0-product-substrate`, commits `610a5d54`/`60de13f4`/`4246c778`.
**Reviewer mandate (founder):** confirm the new probe path is GENUINELY REAL — not a mock dressed up. Sanity-break the real mapping.

## VERDICT: DONE — the probe path is REAL. Ship after the MAJORs are addressed (none block the "real probe" AC).

The reachability AC ("unreachable surfaces as `needs_attention` via a REAL probe, never a stub") is **met by a real probe**, proven by a sanity-break that turned the real wiring red. The rejected `NoopAuthResolver` is no longer the production default — `ServiceConnectionResolverAdapter` (wrapping the real AN1 `ServiceConnectionResolver`) is wired at `app.ts:413-417`. `probeLocalPath` hits real `fs.access`; `probeGitRemote` shells out to real `git ls-remote`. Lane A is hermetic (`file://` + real `git init`), Lane B skips loudly. No mock survives on the production path.

The MAJOR findings are correctness bugs in the *edges* of the real path (short-form repo mapping, a dead deferral branch), not a fake-probe regression.

---

## REALITY VERDICT (the most important question): the path is REAL.

Evidence, file:line:
- **`probeGitRemote` shells out for real.** `filesystem-reachability.ts:168` → `runner.lsRemote(url, …)` → `git-export-runner.ts:328-358` spawns native `git ls-remote --quiet -- <url>` via `spawnGit` (`:188 spawn("git", …)`). `exitCode === 0 → reachable`; non-zero → `needs_attention` with redacted stderr tail. No mock, no fabricated result.
- **`probeLocalPath` hits real `fs`.** `:116-129` → `fs.access(targetPath, R_OK, …)`. ENOENT/EACCES → `needs_attention`. Real syscall.
- **Lane A creates a REAL git repo and ls-remotes it via `file://`.** `AO1-filesystem-reachability.test.ts:41-54`: `git init -b main` + real `git add`/`git commit` in a `mkdtempSync` dir, then `probeGitRemote("file://"+tempRepoDir)` → asserts `reachable` from a real exit 0 (`:266-272`). The bogus case `file://${missingPath}` → real exit non-zero → `needs_attention` (`:274-280`). Assertions are on exit-code-derived results, not hardcoded.
- **Real resolver wired in production.** `app.ts:416` `new ServiceConnectionResolver(options.db, getServerSecret())` passed to `createFilesystemRoutes` → per-request `ServiceConnectionResolverAdapter` (`filesystems.ts:103-111`). `ServiceConnectionResolver.resolve` (`service-connection-resolver.ts:39-58`) does a real per-user DB SELECT + AES-256-GCM decrypt. The Noop only survives as a named test/fallback double (`filesystem-reachability.ts:21-33`) — exactly the disposition the architecture (§v2·4) mandated.

## SANITY-BREAK RESULTS (3 breaks, all went RED, all restored — tree clean)

| # | Break applied | Tests that went RED | Verdict |
|---|---|---|---|
| 1 | Invert `lsRemote` exit-code logic (`git-export-runner.ts:346` `exitCode === 0` → `!== 0`) | **5 RED** — Lane A `file://` reachable, `file://` missing-path unreachable, bogus-https unreachable, `resolveFilesystemState` git-probe-runs, connection-backed Noop needs_attention | Real exit code drives the result. ✅ |
| 2 | Force `probeLocalPath` always reachable (`filesystem-reachability.ts:119` `if (err)` → `if (false && err)`) | **3 RED** — missing-path code, missing-folder doc_set, `probeLocalPath` ENOENT | Real `fs.access` drives the result. ✅ |
| 3 | Force `probeGitRemote` always reachable (`:169` `if (result.reachable)` → `if (true || …)`) | **1 RED** — route-level AC5 `code+git → needs_attention` (`AO1-filesystems.integration.test.ts:686`) | Route-level state is bound to the real probe. ✅ |

**If any of these stayed green it would be CRITICAL — none did.** Every break flipped a real assertion. The tests genuinely exercise the real probe path, not a parallel mock. All three edits were reverted; `git status` is clean (only this review file added).

Baselines (post-restore, all green):
- Lane A unit: **20/20 pass** (`AO1-filesystem-reachability.test.ts`).
- Registry/injection + route AC5: **31/31 pass** (`AO1-filesystems.integration.test.ts`).
- Lane B: **3 skipped loudly** without env (`AO1-reachability-lane-b.integration.test.ts`).
- git-export regression: **105 pass / 1 skip** — injection added no regression.
- `npm run check`: PASS (13 packages). `npm run lint`: PASS (warnings only, no errors).

---

## CRITICAL

None. The probe is real; the founder's rejection condition (a memory-built stub) is resolved.

---

## MAJOR

### M1 — `owner/repo` short form is mis-probed as a LOCAL path, not a GitHub remote
`filesystem-reachability.ts:314-321 repoToUrl` maps `owner/repo` (no scheme, not absolute) to `file://` + `path.resolve(cwd)`. Verified:
```
repoToUrl("owner/repo")               => file:///private/tmp/owner/repo   (WRONG — probes a local path)
repoToUrl("https://github.com/owner/repo") => https://github.com/owner/repo  (OK)
```
The architecture **explicitly specified** the short form: §v2·3 "prefixed to `https://github.com/<owner>/<repo>.git` when it's the `owner/repo` short form … a real, testable branch — not a guess." That branch is **not implemented**. Consequence: a real GitHub `code` filesystem registered with the conventional `owner/repo` (the form the spec uses, e.g. `octocat/Hello-World`) will be probed as a non-existent local directory and **permanently read `needs_attention` even with a valid connection** — a false negative on the central happy path. The full-URL form works; the short form silently fails. The route schema (`filesystems.ts:38-42`) accepts `repo: z.string().min(1)` with no normalization, so both forms reach the probe. Fix: prefix `^[^/]+/[^/]+$` → `https://github.com/<owner>/<repo>.git` before the local-path fallback (mirror `extractLocalPath:304`'s scheme check). Note: the route AC5 integration test passing `repo:"owner/repo"` (`AO1-filesystems.integration.test.ts:675`) only goes green **because** of this bug (it becomes a missing local path → needs_attention) — the test does not catch it, it depends on it.

### M2 — `resolveFilesystemState` decrypts the token twice on the `code`+connection path
`:262` `await deps.authResolver.resolve(row.connectionId)` decrypts the token (inside `ServiceConnectionResolverAdapter.resolve`, `:70-82`) then **discards** it (returns `provision:{mode:"none"}`). `:277` then calls `resolveToken` which decrypts **again**. The first `resolve()` call exists only as a non-null probe — a wasted SELECT + AES-GCM decrypt per inspect. The `instanceof ServiceConnectionResolverAdapter` downcast at `:274` is also a seam leak: `resolveFilesystemState` claims to take an abstract `FilesystemAuthResolver` but secretly depends on the concrete adapter to get the raw token. Either (a) add `resolveToken` to the `FilesystemAuthResolver` interface (shared `filesystem.ts:77`), or (b) drop the `resolve()` call entirely and gate on `resolveToken() !== null`. As written, `ServiceConnectionResolverAdapter.resolve()` (the whole `FilesystemAuth` wrapper, `:70-82`) is dead for the probe path — it is never the value used.

---

## MINOR

### m1 — Dead ternary on the doc_set deferral (builder self-flagged "canResolve dead")
`:290-291`:
```ts
const resolved = await deps.authResolver.canResolve(row.connectionId);
return resolved ? "needs_attention" : "needs_attention";
```
Both arms are identical — `resolved` is computed (a real DB round-trip) then discarded; the ternary is a no-op. The *deferral itself is honest and correct* (GDrive/Dropbox/S3 → `needs_attention`, no fake "check that always passes" — confirmed against §v2·3 "honestly DEFERRED, not stubbed"), but the `await canResolve` line is pure waste and the dead ternary reads as a refactor left half-done. Collapse to `return "needs_attention"; // doc_set+connection deferred — no GDrive/Dropbox connector (AO honest deferral)`. This is the builder's own flagged dead `canResolve` — confirmed dead, drop it.

### m2 — Four `async`-without-`await` functions (Biome `useAwait`, slop)
`sourceOf` (`:61`, returns null), `probeLocalPath` (`:116`, wraps `new Promise`), `withTimeout` (`:350`, wraps `Promise.race`), and `ServiceConnectionResolverAdapter.sourceOf` (`:61`). `async` adds nothing — they return promises directly. Drop `async` (return the promise) to silence the lint warning and stop implying an await happens.

### m3 — `parseUrlHost` host-scoped config uses `protocol//host` without a trailing slash nuance
`:159` builds `http.${parsed}/.extraHeader` where `parsed` = `https://github.com`. Result key `http.https://github.com/.extraHeader` matches the architecture §v2·2 verified form. OK — but the unauthenticated fallback `"http./.extraHeader"` (`:159`) is unreachable (only built when `token` is truthy, and a token always has a parseable URL by then in practice). Minor dead fallback; not load-bearing.

### m4 — `extractLocalPath` returns `null` → `reachable` (silent pass on unparseable bare-local ref)
`resolveFilesystemState:238-241`: a `connectionId == null` row whose `resourceRef` doesn't yield a path returns `reachable` ("backward compat with test-only paths"). This is the one spot that can mark something reachable **without** a real probe. Low risk (only fires on a malformed bare-local ref, which the Zod schema makes hard to construct), but it is the lone "reachable without proof" branch — prefer `needs_attention` for an unparseable ref so "surface, never silent" holds uniformly.

---

## Lens checks

- **Honest-deferral (founder-required):** PASS. doc_set+connection → `needs_attention` is an explicit deferral, not a fake check (§v2·3 verified). The dead ternary (m1) is sloppy but does not pretend to verify. GDrive/Dropbox/S3 are documented-deferred, not stubbed.
- **No-network-in-CI:** PASS. Lane A is hermetic — `file://` against a real local repo + `fs.access`; one `https://localhost:9999` case (connection-refused, no internet) for the non-zero path. No `github.com` in Lane A. Lane B (real PAT) `it.skipIf(SKIP)` with a loud, var-naming skip reason (`AO1-reachability-lane-b.integration.test.ts:48-50`) — never faked. Route AC5 integration `repo:"owner/repo"` resolves to a `file://` path (per M1), so it too is hermetic — no accidental network call in `test:integration`.
- **Token never in URL/argv:** PASS. `lsRemote` argv is `["ls-remote","--quiet","--",url]` only; token injected via `GIT_CONFIG_COUNT/KEY_0/VALUE_0` env (`git-export-runner.ts:336-341`, `buildGitEnv:160-170`). `redactArg` scrubs `gh[pousr]_…` shapes + URL creds from any logged stderr (`:97-112`); `lsRemote` reason is redacted + 300-char-capped (`:350-351`). Token base64'd as `x-access-token:<token>` host-scoped header (`filesystem-reachability.ts:157-165`).
- **Register has a timeout:** PASS. `resolveFilesystemState` wraps the git probe in `withTimeout(…, 30_000)` (`:280`) and local in `withTimeout(…, 5_000)` (`:242`); timeout → `needs_attention` reason "probe timeout" (`:354`). Register (`filesystems.ts:208`) and GET `/:id` (`:265`) both run the timed probe.
- **LIST does not live-probe per row:** PASS. `filesystems.ts:248-251` returns `rows.map(rowToFilesystem)` from stored `state` — no `resolveFilesystemState` call in the list branch. Comment + @lore document the perf constraint. Only register + GET `/:id` probe live. This is exactly the reviewer-flagged constraint from §v2 "list = cached, inspect = live."
- **Regression (registry/injection 31 tests):** PASS — 31/31 green post-restore; git-export 105/1-skip green. Injection of `lsRemote` + `GitConfigInjection` into the export runner added no regression (the existing `runExpectOk` paths and env allow-list are untouched except the additive `extraConfigs` param, defaulted off).
- **Doc staleness:** PASS. `docs/process-layer/filesystem-primitive.md:55,95,124` describes `attached|reachable|needs_attention` + "Unreachable → needs-attention, never silent" — consistent with the implemented behavior; no stale "stub" claim.

## AC table

| AC | Status | Evidence |
|---|---|---|
| Unreachable surfaces as `needs_attention` via a **REAL probe**, never a stub (founder 2026-06-27) | **PASS** | Sanity-break #1/#2/#3 each turned the real wiring red; real `git ls-remote` + real `fs.access`; Noop removed as production default, real `ServiceConnectionResolver` wired `app.ts:416`. |
| `local`/Obsidian folder → real `fs` probe | **PASS** | `probeLocalPath` `fs.access(R_OK)`; Lane A real-folder reachable + missing-folder needs_attention (`:240-261`). |
| `code`/git forge → real `git ls-remote` with real token from AN1 resolver | **PASS (mechanism); LIMITED on short-form (M1)** | Lane A `file://` real exit-code proof; Lane B proves encrypt→store→decrypt→`GIT_CONFIG_*`→authed `ls-remote` against real GitHub (local-only). **M1:** `owner/repo` short form mis-routed to local path. |
| GDrive/Dropbox/S3 deferred-not-stubbed | **PASS** | `:284-291` → `needs_attention`, documented honest deferral; no fabricated probe. (m1: dead ternary, cosmetic.) |

## Confirmation
All three sanity-break edits restored; `git status --short` empty before this file. Only `plans/AO1/review-reachability.md` added. No production code touched by this review.
