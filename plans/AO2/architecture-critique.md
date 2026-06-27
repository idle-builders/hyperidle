# Architecture Critique: AO2

ARCHITECTURE-SCORE: 6/10  rounds=2  score-line: SA:7 LI:7 AC:8 DM:8 N:8 MD:7 FMC:5 S:6 V:7

Re-critique of rev2 (commit c3d6c67d). Reviewed against the **reconciled** ACs (`plans/AO2/reconciliation.md`). The credential model (durable-auth → disposable-sandbox, creds present in sandbox) remains accepted as settled.

**Round-2 verdict: four of the five round-1 findings are genuinely resolved. The CRITICAL is NOT — it is narrowed but still open, and the mechanism, while structurally sound, ships with an incomplete + partly-wrong scaffolding inventory, and one omission leaks a real credential into the durable bundle.** Score stays at 6; the CRITICAL holds.

---

## Round-2 re-verification (all claims re-checked against origin/main)

**Hardwired-cwd constraint (the justification for keeping root-mount): VERIFIED TRUE.** `claude-agent-sdk-adapter.ts:252` (`cwd: config.sandboxPath`) and `cli-harness-adapter.ts:377` + `:603` (`cwd: session.sandboxPath`, spawn + re-engage) both hardwire cwd to the sandbox root with no per-adapter override on the AO2 surface. Moving the repo to a subdir WOULD force rewriting every adapter's cwd. **Keeping root-mount is a sound call given this constraint** — the designer made the right structural decision and correctly retracted the false "disjoint subtrees" premise. ✓

**W1 (captureBack handle) — RESOLVED.** `AdmittedSession` gains `readonly mountedFilesystems` (§5, line 188); Phase 5.5 populates it; `runSession` iterates it before each destroy. Carrying-the-rows over re-querying is the right call (no mid-session injection drift). ✓

**W2 (auth coherence / orphaned seam) — RESOLVED, and the data flow is now coherent + AN2-subsumable as claimed.** Verified against the real seam (`shared/src/filesystem.ts:77-98`): `FilesystemAuthResolver.resolve(connectionId)` + `resolveToken(connectionId)` are both keyed on `connectionId` only — exactly what a detached run can supply. `OwnerScopedAuthResolver` implements that seam; `resolveToken` does `SELECT userId WHERE id=connectionId` → `ServiceConnectionResolver.resolve(row.userId, id)`. Confirmed `ServiceConnectionResolver.resolve(userId, connectionId)` enforces per-user isolation via `AND(id, userId)` (`service-connection-resolver.ts:39-46`, `@lore AN1`), so deriving `userId` from the row first is **required and correct** — it reuses the one decrypt path, adds no crypto, adds no method to the concrete class. `mount`'s `auth` param is now live (provisioning calls `authResolver.resolve(connectionId)` and passes the result; the mounter contributes the host the seam can't supply). AN2 subsumes by swapping the seam impl — genuinely true now, not aspirational. ✓

**W3 (bundle ref-spec) — RESOLVED.** Pinned to `git bundle create <path> refs/heads/<branch>` (named ref, not bare `HEAD`, not a `<base>..HEAD` range — the range form is what breaks on shallow clones). Lane A restores the bundle (`git clone <bundle>` → `git log`) as an **assertion**, not a hope. The shallow-bundle behavior is proven in-build. ✓

**W4 (sanity-break) — RESOLVED.** §Live-proof now names the revert→red: un-wire the Phase 5.5 mount → Lane A's `.git`/restored-bundle assertions go red. States the test simulates the agent edit (correct harness-agnostic boundary). Adds the anti-pollution negative assertion. ✓

---

## CRITICAL (narrowed, still open)

- **[§5b exclude-list completeness] The scoped-capture scaffolding inventory is incomplete and partly wrong against the real writers on origin/main. The mechanism is sound; the list it runs on is not — and one omission leaks a real credential into the durable bundle.**

  The mechanism itself is **structurally correct** — I verified it empirically (tmp repo): `.git/info/exclude` does NOT hide a *tracked* overwritten `AGENTS.md` (`M AGENTS.md` still shows), which is exactly why the pathspec overwrite-guard (`git add -- . ':(exclude)AGENTS.md'`) is needed, and the guard correctly drops it. So far so good. **But the same test proves the fatal property: anything NOT on the list is staged.** `.codex-home/auth.json` (an UNlisted path) staged cleanly into the commit. The design is only as good as its inventory, and the inventory is wrong in three verified ways:

  1. **`/CLAUDE.md` is missing from the exclude list AND mis-inventoried in §1.** The §1 writer table and §5b both say `writeSandboxAgentsMd` writes `AGENTS.md`. It does **not** — it dual-writes **both `AGENTS.md` AND `CLAUDE.md`** every session (`context-assembly-prompt.ts:10,260,264`, `@lore AK1`). `CLAUDE.md` is absent from the §5b exclude list. In the self-hosting case (HyperIdle tracks `CLAUDE.md` at root — `git ls-files` confirms) the overwrite-guard's tracked-collision set also omits it, so an assembly-overwritten `CLAUDE.md` is staged.

  2. **`/.codex-home/` is missing from the exclude list — and it contains a copied credential (`auth.json` from `~/.codex`).** `provision-return-hook.ts:216-235` writes a per-session `CODEX_HOME` at `<sandbox>/.codex-home/` containing `auth.json` + `config.toml` copied from the host's `~/.codex`. The plan lists `/.codex/` but NOT `/.codex-home/`. On a codex-harness session this directory is staged into the commit and **`git bundle`'d into the durable capture path that survives `rm -rf <sandbox>`** — i.e. the disposable-auth guarantee (§4: "durable artifact never carries the secret") is violated for the codex case via the back door of capture pollution. This is the single most serious instance of "a missed writer pollutes the capture."

  3. **The self-hosting tracked-collision set is bigger than the plan models.** `git ls-files` shows HyperIdle tracks at root: `AGENTS.md`, `CLAUDE.md`, `.mcp.json`, AND a heavily-populated `.claude/` tree (agents, hooks, rules). The §5b overwrite-guard names only `AGENTS.md`/`.mcp.json` as the collision set. `.claude/settings.json` written by `provisionReturnHook` (`provision-return-hook.ts:118-151`) overwrites into a directory the repo legitimately tracks; the guard as specified won't subtract it.

  **Fix (mechanism stays, correct the inventory + make the build prove it):**
  - Derive the exclude list from the **actual** writer set, complete: `/AGENTS.md`, `/CLAUDE.md`, `/.mcp.json`, `/.claude/`, `/.codex/`, `/.codex-home/`, `/.opencode/`, `/.fabric/`, `/context/`, `/knowledge/`, `/work/`, `/opencode.json`. (Verified writers: `context-assembly.ts:91-106` → `.fabric context/ knowledge/ work/`; `context-assembly-prompt.ts` → `AGENTS.md`+`CLAUDE.md`; `session-provisioning.ts:753` → `.mcp.json`; `cli-mcp-config.ts:87,122` → `.codex-home/config.toml`+`opencode.json`; `provision-return-hook.ts:118,198,222,350` → `.claude/`, `.codex/`, `.codex-home/`, `.opencode/`.)
  - The overwrite-guard's tracked-collision pathspec must be built from `git ls-files` ∩ the **complete** list (so `CLAUDE.md` and `.claude/` are subtracted in the self-hosting case), not a hardcoded `AGENTS.md`/`.mcp.json` pair.
  - **Strengthen Lane A's negative assertion to be load-bearing for the secret leak:** assert the restored bundle contains NONE of `AGENTS.md`, `CLAUDE.md`, `.mcp.json`, `.fabric/`, `context/`, **`.codex-home/`** — and specifically that no `auth.json` and no secret string is present. A negative assertion that omits the credential-bearing path proves nothing about the leak. Recommend Lane A run at least one variant under the codex `cliMcpDialect`/`settings-codex` path (or directly seed a `.codex-home/auth.json` before capture) so the test actually exercises the dir that leaks.
  - Recommend deriving the list from a single shared constant co-located with (or imported by) the provisioning writers, so a future writer added to provisioning can't silently fall off the capture exclude list. A free-floating literal in the mounter is the exact thing that drifted here.

  Until the inventory is complete and Lane A proves the codex-secret path stays out of the bundle, AC2 ("captures the agent's changes, not lost on destroy") captures injected control files in the common case and **a real credential in the codex case**. This is load-bearing and must be fixed before `/write-tests`.

---

## WARNING

- **[§5b] `.codex-home/auth.json` capture is a credential-disclosure path, not just pollution — call it out in §Security explicitly.** The §Security "Capture pollution / self-host overwrite" bullet frames the risk as cosmetic (injected `AGENTS.md`/`.mcp.json`). It is not — the codex `auth.json` case makes capture-pollution a STRIDE Information-Disclosure finding: a host credential reaches a durable, post-teardown artifact. The disposability guarantee in §4 ("the bundle is `git bundle` of commits/objects — contains no `.git/config` secret") is true for the `.git/config` token but silently false for any *staged* secret file. Add an explicit invariant: capture stages only paths diffed against the pristine clone `HEAD` AND on the agent-authored set, never any provisioning-written path, and Lane A proves the codex case.

---

## SUGGESTION

- **[§4] Header-shape note is now consistent — confirm the helper carries the protocol segment.** The verified convention is `http.${protocol}//${host}/.extraHeader` (`filesystem-reachability.ts:161` builds `http.${parsed}/.extraHeader` where `parsed = ${protocol}//${host}` from `extractOrigin`, line 177-181). The plan's §4 shorthand once read `http.<host>/.extraHeader`; the shared-helper factoring (§2) resolves drift — just ensure the extracted helper returns the full `${protocol}//${host}` origin, not bare host.

- **[§1] Fix the §1 writer table — `writeSandboxAgentsMd` writes `AGENTS.md` AND `CLAUDE.md`.** The table (line 86) and the prose under it understate the writer. Correcting it is the same edit that fixes the exclude-list omission #1; do both together so the table is the source of truth for the list.

- **[§6] `filesystem_captures.writeback` denormalization** — unchanged from round 1; fine as a point-in-time snapshot, document it as non-authoritative.

---

## What's Working Well

- **Root-mount was the right call, and it's now honestly argued.** Rev2 verified the hardwired-cwd constraint before deciding, retracted the false "disjoint subtrees" premise, and chose to solve the collision at capture-time rather than force-rewrite every adapter. That is the correct structural judgment for the real codebase — confirmed against `claude-agent-sdk-adapter.ts:252` + `cli-harness-adapter.ts:377/603`.
- **The auth seam is now coherent end to end.** The `OwnerScopedAuthResolver` → `ServiceConnectionResolver.resolve(userId, id)` flow reuses the single decrypt path, respects AN1 per-user isolation, keeps `mount`'s `auth` param live, and is genuinely AN2-subsumable. The round-1 orphaned-seam/vestigial-param finding is fully closed.
- **Capture durability is now proven, not hoped.** Pinned `refs/heads/<branch>` bundle + Lane A restore-and-read-back assertion + named revert→red sanity-break. The mechanism the build will produce is testable and the test is real.
- **The capture mechanism is structurally sound** (empirically verified: `info/exclude` + pathspec overwrite-guard correctly drop tracked-and-overwritten scaffolding). The remaining defect is inventory completeness, not design — a smaller, well-scoped fix than round 1's "make a real decision you skipped."
