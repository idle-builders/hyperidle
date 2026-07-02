# AO3 — Agent output becomes reviewable and landable — Architecture

> Producer: planner. Input: `requirements.md` (APPROVED Round 2, 6 ACs, single AL7-faithful loop), `refine-critique.md`, AL7 as-built (`docs/process-layer/staged-operation.md`). DESIGN-CLASS none (the `code_diff` canvas already exists). Verified against origin/main code at file:line (AL7 #351 + AO2 #376 merged).
>
> **Faithfulness contract.** AO3 reuses AL7's router / grant / Outcome spine **UNCHANGED** (`tool-registry.ts` `invoke`, `proposed-call-workflow.ts` `composeTailoredGrant`, `threads.ts` verdict path, `operationOutcomes` PK). AO3 adds exactly three things: (1) a capture→`code_diff` loader, (2) the `land_change` registered tool, (3) the AC5 lint rule. No new gate, no new grant machinery, no new canvas, no schema migration.

---

## 1. Context

AL7 shipped the execution spine; its proof vehicle `commit_file` only writes to the sandbox (`commit-file.ts:34-69`, no git). AO2 shipped `filesystem_captures` — a git bundle + commit SHA per session end (`mounter-registry.ts:172`, `capture-store.ts:33`) — with **zero readers** (`capture-store.ts:5` promises "AO3 reads this"). The residual: render the captured multi-file diff as the proof pane of a `land_change` Proposed Call, and land it via a real authenticated push. The loop is locked by the requirement (do not redesign it):

```
session 1: agent edits N files in AO2 mount → attempts land_change
   → AL7 router captures Proposed Call (status=captured) → onAbortSession → session 1 ends
   → endSession → captureBack writes filesystem_captures row (bundle + commitSha)
review:  GET /api/reviews/:reviewMessageId → AO3 loader reads the capture the PC's
         originSessionId points at → builds code_diff payload → proof pane
approve: threads.ts verdict → composeTailoredGrant (UNCHANGED) → proposed_call_granted
session 2: agent re-attempts land_change → router CAS-consumes grant → land_change handler
         pushes the captured commit to the connected remote → recordOutcome(pushed ref)
```

---

## 2. Constraints

- **Spine unchanged.** No edits to `invoke`'s router branch, `composeTailoredGrant`, `recordOutcome`, the CAS, or the verdict handler. `land_change` is just another `ToolDefinition` with `reversibility:"irreversible"` (the `commit_file` precedent, `commit-file.ts:71-80`).
- **Zero migrations.** All tables exist: `filesystem_captures`, `proposed_calls`, `tailored_grants`, `operation_outcomes` (`schema.ts:951,1112,1161,1188`). The capture↔PC link already exists via `proposed_calls.originSessionId` → `filesystem_captures.sessionId`. **No new column.**
- **AL7 hard-rule 2.** HyperIdle's own code never pushes of its own accord. `land_change` is the *agent's* tool, invoked by the agent's session under the grant; HyperIdle books the checkpoint. Lint-enforced (AC5).
- **Trust-first, not a cage.** AC5 constrains HyperIdle's own source only; a CLI agent's shell `git push` is trusted + AL7-gated and untouched.
- **No agent-fabricable capture reference** (resolved §4).
- TypeScript strict, Drizzle only, result types; `createGitRunner` is the sole git surface (already server-imported: `filesystem-reachability.ts:7`).

---

## 3. Resolved open question — `land_change` ↔ capture-id resolution

**Decision: the capture is resolved from session/task context. The agent passes NO capture id.** `land_change`'s input schema carries no capture reference (only an optional future `prTitle`/`message`, unused in v1).

**Justification (lower trust surface + most deterministic, the critique's stated preference):**
1. **The id does not exist when the agent could pass it.** The `filesystem_captures` row is written at session-1 *end* (`mounter-registry.ts:160`, inside `captureBack`), *after* the `land_change` call was already captured by the router. In session 1 there is no capture id to pass.
2. **Fabrication-proof.** A session-scoped capture is fully determined by the producing session; an agent-supplied id is a forgeable surface for landing a different commit.
3. **Redundant.** The operation payload ("which commit") is implied by the session/task that produced it — unlike `commit_file`, whose args (`path`, `content`) *are* the payload and must be agent-supplied. This is the justified divergence from the `commit_file` arg shape.

**Two resolution sites, both context-only:**
- **Loader (`reviews.ts`)** has the Proposed Call → resolve **exactly** via `filesystem_captures.sessionId == proposedCall.originSessionId AND writeback == 'git'`. One git capture per session (one `captureBack` per session end) → deterministic, exact.
- **Handler (session 2)** has only `ctx.taskId` + `ctx.sessionId` (session 2's id ≠ session 1's). Resolve via the task: the `git` capture whose session belongs to `ctx.taskId` and whose `sessionId != ctx.sessionId`, most recent by `createdAt`. Under the single-loop model (one prior captured session per task at land time) this is deterministic. Query: `filesystem_captures JOIN sessions ON sessions.id = filesystem_captures.session_id WHERE sessions.task_id = ctx.taskId AND filesystem_captures.session_id != ctx.sessionId AND filesystem_captures.writeback = 'git' ORDER BY created_at DESC LIMIT 1`. (Edge: multiple prior un-landed captures on one task → picks most recent; acceptable v1, flagged §9.)

---

## 4. Types / contracts

### 4.1 `land_change` tool (`packages/server/src/tools/land-change.ts`, NEW)

Mirrors `commit-file.ts` exactly in registration shape:

```ts
const landChangeInputSchema = z.object({
  // v1 carries NO capture reference — resolved from session/task context (§3).
  // Optional cosmetic, unused in v1 push-existing-commit path:
  message: z.string().optional(),
});
type LandChangeInput = z.infer<typeof landChangeInputSchema>;

async function handler(args: LandChangeInput, ctx: ToolContext): Promise<ToolResult> { … }

export const landChangeTool: ToolDefinition<LandChangeInput> & {
  readonly reversibility: "irreversible";
} = {
  name: "land_change",
  description:
    "Push the change the agent captured in this task's session to the connected git target. Irreversible — routed to human review before it lands.",
  inputSchema: landChangeInputSchema,
  handler,
  reversibility: "irreversible",
};
```

Registered by appending `toRegistered(landChangeTool)` to `ALL_TOOL_DEFINITIONS` (`tool-registry.ts:~330`, beside `commitFileTool`). **No `roles` filter** (available to every agent role, like `commit_file`). The router (`tool-registry.ts:614-657`) handles capture/grant/Outcome with zero changes — it sees an irreversible tool and does its job.

**Handler outline (runs only in grant-bearing session 2, after CAS-consume):**
1. Resolve capture row via task context (§3 handler query). Not found / non-git → `err("NO_CAPTURE", …)` (→ `failed` Outcome, AC6).
2. Resolve remote URL: load `filesystems` by `capture.filesystemId`, parse `resourceRef` (`shared/filesystem.ts:30` — `{ kind:"code", repo, branch }`); `repo` is the clone URL / local path. Non-code → `err`.
3. Materialize the bundle into an OS temp dir (`fs.mkdtemp`): `runner = createGitRunner(tmp)`; `runner.cloneBundle(capture.capturePath)` (new verb §4.3).
4. Read the bundled ref deterministically: `runner.bundleListHeads(capture.capturePath)` → the single `refs/heads/<ref>` (do **not** derive the branch by convention — the two adapters disagree, §9).
5. `runner.remoteAdd("land", remoteUrl)`; `runner.push("land", <ref>)` (existing `push`, `git-export-runner.ts:~430`). Auth = inherited host env (AQ1) via `buildGitEnv` allowlist (HOME/SSH_AUTH_SOCK/GH_TOKEN); held-connection auth is AN2's job, out of scope.
6. Return `ok({ pushedSha: capture.commitSha, ref, remote: remoteUrl })`. `recordOutcome` (spine) writes the receipt; the loader surfaces it.

The handler imports `createGitRunner` directly from `@hyperidle/fabric` (server already does, `filesystem-reachability.ts:7`) — the **real** runner, so AC3's zero-stub git test exercises real git. No `ToolContext` change.

### 4.2 Capture → `code_diff` payload (`packages/server/src/reviews/capture-code-diff.ts`, NEW)

What AO2 persisted (`schema.ts:951`): `capturePath` = a **git bundle** (`<id>.bundle`, named-ref, full ancestry, shallow-safe), `commitSha` = the single squashed authored commit (`git-worktree-adapter.ts:140-147`, `git-clone-adapter.ts:103`). The bundle's only ref is the agent branch; the commit's first parent is the base (host HEAD / cloned branch HEAD). So the captured diff = the diff of `commitSha` vs its first parent.

**Transform `loadCaptureCodeDiff(capture, runnerFactory): Promise<CodeDiffPayload | null>`:**
1. `tmp = fs.mkdtemp(...)`; `runner = createGitRunner(tmp)`.
2. `runner.cloneBundle(capture.capturePath)` → all objects (commit + parent + trees) present.
3. `patch = runner.show(capture.commitSha)` (new verb §4.3) → raw unified diff of the single commit (`git show --no-color --format= <sha>`).
4. `parseUnifiedDiff(patch)` (pure fn, §4.4) → `CodeDiffPayload`.
5. `finally` rm the temp dir.

Output shape is the **existing** `CodeDiffPayload` (`packages/web/src/pages/review/review-artifact.ts:148-181`) — mirror it server-side (it is web-local today; either import the type or declare a matching server-side `interface` and let `tsc` check the GET response, since the route currently returns `c.json` of plain objects):

```ts
type CodeDiffLineKind = "add" | "del" | "ctx";
interface CodeDiffLine { kind: CodeDiffLineKind; oldNo: number | null; newNo: number | null; text: string }
interface CodeDiffHunk { header: string; lines: CodeDiffLine[] }
interface CodeDiffPayload {
  prTitle: string; description: string; checks: string[];
  files: { path: string; band: "logic"|"test"|"trivia"; rationale?: string;
           added?: number; removed?: number; hunks?: CodeDiffHunk[] }[];
  triviaSummary: string;
  trivia?: { count: number; summary: string; added: number; removed: number };
}
```

### 4.3 `GitRunner` additions (`packages/fabric/src/services/git-export-runner.ts`, MODIFY)

Three thin, native-git, side-effect-free read verbs (added to `GitRunner` interface + `createGitRunner` + `FakeGitRunner`):
- `cloneBundle(bundlePath: string): Promise<void>` → `git clone -- <bundlePath> .` (cwd = the runner's temp dir; reject leading `-`).
- `show(sha: string): Promise<string>` → `git show --no-color --format= -- <sha>`... use `git show --no-color --format= <sha>` returning the patch text (reject leading `-`).
- `bundleListHeads(bundlePath: string): Promise<{ ref: string; sha: string }[]>` → parse `git bundle list-heads <bundlePath>` (lines `"<sha> <ref>"`).

`push` already exists (`push(remote, branch)`, `git-export-runner.ts:~430`) — reused, not modified.

### 4.4 `parseUnifiedDiff` (`packages/server/src/reviews/parse-unified-diff.ts`, NEW, pure)

Pure parser: unified-diff text → `CodeDiffPayload`. Per-file from `diff --git a/… b/…` / `+++ b/<path>`; per-hunk from `@@ -a,b +c,d @@` (header preserved verbatim, line numbers tracked); per-line `+`→`add`, `-`→`del`, ` `→`ctx`. `band` heuristic: `*.test.*`/`*.spec.*` → `test`; lockfiles/`*.min.*`/generated (`package-lock.json`, `*.snap`) → `trivia`; else `logic`. `prTitle` = capture commit subject (or `message` arg); `added`/`removed` counted per file; `trivia`/`triviaSummary` rolled up. Pure → fast unit test, no git.

---

## 5. Schema

**ZERO migrations.** Reuses `filesystem_captures` (`schema.ts:951`), `proposed_calls` (`:1112`, the `originSessionId` column is the capture link), `tailored_grants` (`:1161`), `operation_outcomes` (`:1188`). The capture↔PC join is `proposed_calls.originSessionId = filesystem_captures.sessionId`; the handler↔capture join is via `sessions.task_id`. No column, no index, no table added.

---

## 6. APIs / handlers — where each registers

| Artifact | File | Wiring |
|---|---|---|
| `land_change` tool | `packages/server/src/tools/land-change.ts` (NEW) | `toRegistered(landChangeTool)` appended to `ALL_TOOL_DEFINITIONS`, `tool-registry.ts:~330` |
| Capture→diff loader | `packages/server/src/reviews/capture-code-diff.ts` (NEW) | called from `reviews.ts` GET handler |
| Unified-diff parser | `packages/server/src/reviews/parse-unified-diff.ts` (NEW, pure) | imported by the loader |
| GitRunner verbs | `packages/fabric/src/services/git-export-runner.ts` (MODIFY) | interface + `createGitRunner` + `FakeGitRunner`; re-exported via `packages/fabric/src/index.ts` (already exports the runner) |
| Reviews loader hook | `packages/server/src/routes/reviews.ts` (MODIFY) | when `opRow.toolId === "land_change"`, build a `code_diff` `ReviewArtifact` from the loader and add it to `artifactsWithOp` |
| AC5 lint rule | `packages/eslint-plugin-authz/src/rules/no-unbrokered-git-push.ts` (NEW) + index + `eslint.config.ts` | server+fabric file glob |

**`reviews.ts` change (additive, `:130-194`):** after `opRow` loads, if `opRow.toolId === "land_change"`, resolve the capture (`originSessionId == proposedCall.originSessionId, writeback='git'` — needs `originSessionId` added to the existing `select`), call `loadCaptureCodeDiff`, and push a `{ id, kind:"code_diff", tool:"git", app:"Git", sourceHref:"", title: prTitle, payload }` artifact into `artifactsWithOp`. The existing `proposedCallView` nesting (verbatim args + Outcome) is untouched — the human still sees the captured verb (AL7 model) *and* the diff. On capture-not-found / non-git, fall through to today's behavior (no `code_diff` artifact). The loader needs `createGitRunner` injected (import from `@hyperidle/fabric`); thread it as a small factory so the runtime test can pass a real runner.

---

## 7. Ordered tasks (AC-tagged, each with its verification)

> Red-phase first per the validation-before-implementation rule. Builder writes the failing test, then the code.

1. **GitRunner read verbs** (`cloneBundle`, `show`, `bundleListHeads`) — interface + real + Fake. *Satisfies the substrate for AC2/AC3.* **Verify:** zero-stub git integration (`git-export-runner.integration.test.ts` sibling): create a real repo, commit, `git bundle create`, then `cloneBundle`+`show` returns the real patch and `bundleListHeads` returns the real ref/sha. `npm run test:integration`.
2. **`parseUnifiedDiff`** pure parser → `CodeDiffPayload`. *AC2.* **Verify:** unit test (`parse-unified-diff.test.ts`) feeds a known 3-file patch, asserts `files[].hunks[].lines` kinds/line-numbers + band classification. `npm run test`.
3. **`loadCaptureCodeDiff`** loader (capture row → clone bundle → show → parse). *AC2.* **Verify:** service integration (`capture-code-diff.integration.test.ts`) seeds a real `filesystem_captures` row from a real bundle of N changed files, asserts the payload's files equal the bundle's diff. `npm run test:integration`.
4. **`land_change` tool** registered (`reversibility:"irreversible"`), handler resolves capture by task + pushes via `GitRunner.push`. *AC1, AC3.* **Verify (AC1):** service integration (`land-change.integration.test.ts`, real db+app) — invoke via `buildToolRegistry` with a session-1 workflow → `AWAITING_REVIEW` + a `captured` `proposed_calls` row; with a grant-bearing session-2 workflow → CAS-consumes + an `operation_outcomes` row. **Verify (AC3):** zero-stub git integration to a **local bare remote** (`git init --bare`) — drive approve→grant→session-2 `land_change`; assert the bare remote's ref advances to `capture.commitSha` and the Outcome receipt carries it.
5. **Reviews loader hook** in `reviews.ts` (add `originSessionId` to the select; on `land_change`, attach the `code_diff` artifact). *AC2.* **Verify:** route integration — seed a `land_change` Proposed Call + its capture, `GET /api/reviews/:reviewMessageId` → response `artifacts` contains a `code_diff` whose `files` equal the capture diff AND the response still references the seeded capture's commitSha. `npm run test:integration`.
6. **At-most-once landing.** *AC4.* **Verify:** extend AC3's bare-remote harness — after the successful push, fire a second `land_change` under the (now consumed) grant → assert it returns `AWAITING_REVIEW` (grant gone → router routes to review, no handler run), the remote ref is unchanged (same sha), and no second `operation_outcomes` row. (Rides the spine's CAS `tool-registry.ts:626-637` + Outcome PK `schema.ts:1190` — the handler adds no idempotency logic.)
7. **Non-approve + failure paths.** *AC6.* **Verify:** runtime test — `request-changes` verdict → PC `held`, no push, remote unchanged; forced push failure (bad remote) → `operation_outcomes.status="failed"` with the error surfaced. `npm run test:integration`.
8. **AC5 lint rule** `authz/no-unbrokered-git-push` + allowlist + `@lore`; wire into `eslint.config.ts`. *AC5.* **Verify:** ESLint rule unit test (RuleTester, mirroring `eslint-plugin-authz/src/rules/__tests__/*`) — a `.push(remote, branch)` on a runner-named receiver in a non-allowlisted file flags; the same in `git-export.ts` / `land-change.ts` passes; `Array.push` does not flag. `npm run lint` stays green.
9. **DOC-CLASS light** — short addition to `docs/process-layer/staged-operation.md` (capture→`land_change`→push bridge, proof-pane = captured diff, superseded "system lands"). *No AC; closes DOC-CLASS.* (Done at `/pipeline:write-docs`, not in this build.)

Closing: `npm run verify` (check + lint + knip + test:all + build + attestation).

---

## 8. The AC5 ESLint rule

- **Where:** `packages/eslint-plugin-authz/src/rules/no-unbrokered-git-push.ts`, registered in `eslint-plugin-authz/src/index.ts` (`rules` + `recommendedRules` + `configs.recommended`), wired in `eslint.config.ts` for the server+fabric glob (`packages/server/src/**/*.ts`, `packages/fabric/src/**/*.ts`).
- **Detection (pure AST, high precision per the authz-plugin convention):** flag a `CallExpression` whose callee is a `MemberExpression` with property `push` **and** exactly **two** arguments **and** whose receiver's terminal name is runner-shaped — identifier `runner`/`gitRunner`, a member access ending in `.runner` (matches the real call `deps.runner.push(…)`, `git-export.ts:478`), or an identifier matching `/Runner$/i`. The 2-arg + runner-receiver shape keeps `Array.push` (typically 1 arg, non-runner receiver) out.
- **Allowlist mechanism:** a hardcoded module allowlist in the rule — `{ "packages/fabric/src/services/git-export.ts", "packages/server/src/tools/land-change.ts" }` — checked against `context.filename`. Mirrors `scripts/honest-harness-guard.allowlist.json`. Two legitimate pushers, nothing else.
- **`@lore`:** documents that this guards **HyperIdle's own code never pushes of its own accord** (AL7 hard-rule 2, `staged-operation.md:128`), is a *self-code* constraint **not** agent containment — a CLI agent's trusted shell `git push` is AL7-gated and unaffected (`staged-operation.md:175`) — and that the purged "broker is the only path" containment (`staged-operation.md:41-43`) is deliberately **not** re-imported.

---

## 9. Risks / @lore / trade-offs

- **[Biggest risk] Bundle ref name is not derivable by convention.** The two adapters bundle different refs: `git-worktree-adapter` uses `refs/heads/agent/<basename(sandboxPath)>` (`:92,147`), `git-clone-adapter` uses `refs/heads/<resourceRef.branch>` (`:80,103`). The `filesystem_captures` row stores neither. **Mitigation:** read the ref from the bundle itself via `bundleListHeads` (§4.3) — never derive `agent/<sessionId>`. `@lore` this on the handler + loader.
- **At-most-once relies entirely on the spine CAS.** The `land_change` handler runs only after the single-statement CAS claims the grant (`tool-registry.ts:626-637`); a second attempt finds the grant consumed and routes to review (no handler, no push). `recordOutcome`'s PK = `proposedCallId` (`schema.ts:1190`) blocks a duplicate Outcome. The handler must add **no** idempotency logic of its own — and AC4's test must prove the second attempt is `AWAITING_REVIEW` with an unchanged remote. Defense-in-depth: re-pushing the same sha is a git-level no-op anyway, but we do not rely on that.
- **Push-credential path.** v1 uses inherited host env (AQ1) through `buildGitEnv`'s allowlist (`git-export-runner.ts:~210` — HOME/SSH_AUTH_SOCK/GH_TOKEN). Held-connection token injection (`GIT_CONFIG_*`, AO1/AN2) is **out of scope**. The bare-remote integration test provides a credential-free local remote (`git init --bare <dir>` → `file://<dir>` or a path), so AC3/AC4 prove the push path with zero auth and zero stubs. `@lore` that real-host auth (GitHub) is AN2's job; landing only needs a remote URL + ambient auth.
- **Loader does a git clone per review GET.** Building the diff clones the bundle into a temp dir on each `GET /api/reviews/:id` for a `land_change` PC. Human-triggered, infrequent → acceptable; not cached in v1. Trade-off noted; a cached payload column is a future optimization (would then need a migration — explicitly deferred).
- **Handler capture resolution picks most-recent git capture for the task.** Under the single-loop model (one prior captured session per task at land time) this is exact. Multiple un-landed captures on one task is an edge the v1 model does not produce; `@lore` the assumption so a future multi-capture task forces an explicit capture-selection design.
- **Session 2 does not re-mount session 1's edits.** AO2 mounts session 2 fresh from origin; the agent's session-1 changes live only in the bundle. `land_change` therefore pushes the **bundle's** commit, never session 2's worktree — correct and intentional. `@lore` so no one "re-derives from the worktree."
- **`CodeDiffPayload` type duplication.** The canonical type is web-local (`review-artifact.ts:162`). The server loader mirrors it (declared interface or shared move). Keep it a structural mirror checked by `tsc` on the route response; do not couple server→web. If it drifts often, a `@hyperidle/shared` home is the follow-up (not v1).

---

## 10. Plan reconciliation (every named symbol verified on origin/main)

| Symbol | File:line | Role in AO3 |
|---|---|---|
| `commitFileTool` | `commit-file.ts:71` | precedent `land_change` mirrors (registration, irreversibility, ctx) |
| `ALL_TOOL_DEFINITIONS` | `tool-registry.ts:~300` | append `toRegistered(landChangeTool)` |
| router CAS / `recordOutcome` | `tool-registry.ts:626-657` | reused UNCHANGED (capture / consume / Outcome) |
| `classifyReversibility` | `tool-registry.ts:~210` | sees `reversibility:"irreversible"` on `land_change` |
| `composeTailoredGrant` | `proposed-call-workflow.ts` / `threads.ts:1508` | reused UNCHANGED (approve path) |
| verdict handler | `threads.ts:1416-1528` | reused UNCHANGED |
| `proposed_calls.originSessionId` | `schema.ts:1131` | capture↔PC link (no new column) |
| `operationOutcomes` PK | `schema.ts:1188-1195` | at-most-once Outcome |
| `filesystemCaptures` (capturePath, commitSha, sessionId, filesystemId, writeback) | `schema.ts:951-973` | the capture AO3 finally reads |
| `reviews.ts` GET loader | `reviews.ts:87-195` | add `code_diff` artifact for `land_change` |
| `CodeDiffPayload` | `review-artifact.ts:162-181` | the loader's output contract |
| `createGitRunner` / `GitRunner.push` | `git-export-runner.ts` (exported `fabric/src/index.ts:132`) | landing push + new read verbs |
| git-export legit pusher | `git-export.ts:478` | AC5 allowlist member #1 |
| ResourceRef `{kind:"code",repo,branch}` | `shared/filesystem.ts:30` | remote URL resolution |
| authz plugin pattern | `eslint-plugin-authz/src/index.ts`, `rules/*` | AC5 rule home |
