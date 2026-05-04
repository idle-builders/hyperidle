# L15 — Slop Scan

Read-only scan of the diff `main..HEAD` on `feat/L15-…` for AI-specific code
anti-patterns. Findings only — no code changes. Severity ranked.

Scope (implementation files only — tests excluded):
- `/Users/tobiasgrundmann/Development/hyperidle/.worktrees/L15-2/packages/pipeline/src/brief.ts`
- `/Users/tobiasgrundmann/Development/hyperidle/.worktrees/L15-2/packages/pipeline/src/runner.ts`
- `/Users/tobiasgrundmann/Development/hyperidle/.worktrees/L15-2/.claude/hooks/session-start.ts`
- `/Users/tobiasgrundmann/Development/hyperidle/.worktrees/L15-2/.claude/hooks/session-start-adversarial.ts`
- `/Users/tobiasgrundmann/Development/hyperidle/.worktrees/L15-2/.claude/settings.json` (config — not scanned for code slop)
- `/Users/tobiasgrundmann/Development/hyperidle/.worktrees/L15-2/CLAUDE.md` (doc — not scanned)

## Summary

| Severity | Count |
|---|---|
| MUST-FIX | 2 |
| SHOULD-FIX | 6 |
| CONSIDER | 4 |
| **Total** | **12** |

The L15 implementation is small (~430 net lines across two source files plus
two ~70-line hooks) but accreted three families of slop: (a) unsafe `as`
casts laundering `unknown` through the TOON codec, (b) try/catch blocks that
swallow IO failures and return a meaningless boolean, (c) a `persistHandoverBrief`
call that fires on every task completion with a near-empty payload, paying the
write cost for a record whose only non-empty field is `ledgerEntry`.

---

## MUST-FIX

### S1. `toRecord` is a hand-rolled `as unknown as` ladder, applied seven times
**File:** `/Users/tobiasgrundmann/Development/hyperidle/.worktrees/L15-2/packages/pipeline/src/brief.ts:97-99`
**Snippet:**
```ts
function toRecord<T>(value: T): Record<string, unknown> {
    return value as unknown as Record<string, unknown>;
}
```
**Used at:** lines 104, 148, 175, 239, 242, 248, 268.
**Why this is slop:** `.claude/rules/typescript.md` and the repo-level
`/Users/tobiasgrundmann/Development/hyperidle/.claude/rules/typescript.md`
explicitly forbid "unsafe `as` casts". Naming the helper `toRecord` and
hiding the double-cast inside it does not make the cast safe — it makes it
invisible. The actual contract is "TOON `encode` accepts any object"; the
correct fix is to widen `encode`'s parameter type in
`packages/shared/src/toon-codec.ts:6` to `object` (or generic
`<T extends object>`), not to launder every input through a cast.
**Fix:** Either (a) change `encode(obj: Record<string, unknown>)` to
`encode(obj: object)` upstream and delete `toRecord` + all seven call sites
that wrap with it, or (b) drop the helper and accept that the encode boundary
itself is the right place to declare the type contract — typed at the codec,
not laundered at every caller.

### S2. `readBrief` / `readPrefetch` / `readMemory` decode with seven `as` casts on raw codec output
**File:** `/Users/tobiasgrundmann/Development/hyperidle/.worktrees/L15-2/packages/pipeline/src/brief.ts:111`, `:155-164`, `:186-192`
**Snippet:**
```ts
const raw = decode(readFileSync(p, "utf-8")) as Record<string, unknown>;
return {
    fromPersona: (raw.fromPersona as string | undefined) ?? "",
    toPersona: (raw.toPersona as string | undefined) ?? "",
    priorScore: (raw.priorScore as string | null | undefined) ?? null,
    targetFiles: (raw.targetFiles as string[] | undefined) ?? [],
    ...
};
```
This is the same anti-pattern flagged in L11 S5 (`decodeThreadDetail`):
field-level `as` casts that pretend to validate but only assert. If a future
writer ships `targetFiles: "single-string"`, `(raw.targetFiles as string[])`
silently coerces and downstream `.map(p => …)` in
`session-start-adversarial.ts:62` blows up at runtime with a useless stack.
**Fix:** Define a zod schema once for `BriefData`, `MemoryData`, `PrefetchData`,
and `parse` the decoded record. The `?? defaults` ladder becomes `.default(…)`
on each schema field. Net: about -30 lines, real validation, removes 12 `as`
casts.

---

## SHOULD-FIX

### S3. Two try/catch blocks in `primeStoryState` swallow errors and return a boolean that nobody acts on
**File:** `/Users/tobiasgrundmann/Development/hyperidle/.worktrees/L15-2/packages/pipeline/src/runner.ts:191-211`
**Snippet:**
```ts
function primeStoryState(cwd: string, storyId: string): boolean {
    try {
        setActiveStory(cwd, storyId);
    } catch {
        return false;
    }
    const existing = readMemory(cwd, storyId);
    if (existing) return true;
    const stub: MemoryData = { … };
    try {
        writeMemory(cwd, storyId, stub);
        return true;
    } catch {
        return false;
    }
}
```
**Why this is slop:**
1. The TS rule says "Let unexpected errors propagate — no swallowing with try-catch."
2. The boolean return value is wired into `HYPERIDLE.briefInjected` (line 251)
   for "A/B comparison", but `primeStoryState` returns `true` whether memory
   *existed* or was *just stubbed* — the metric conflates two different
   states. The doc comment claims "Returns whether memory existed at session
   start" — the code returns whether memory exists *now*, after stub write.
   The comment is a lie.
3. Empty `catch {}` swallows the cause; if `setActiveStory` fails (disk full,
   permission), the run silently proceeds with the SessionStart hook reading
   stale `.pipeline/active-story` from a previous run. That's a correctness
   bug, not a recoverable error.
**Fix:** Remove both try/catches. Let IO errors propagate — the runner's
outer try/catch at line 389 already handles them. Either rename the function
to `ensureStoryStateInitialized` and return `void`, or split into
`memoryExisted(cwd, storyId): boolean` (read-only) called *before*
`primeStoryState(cwd, storyId): void` so the metric measures what the comment
claims.

### S4. `persistHandoverBrief` writes a near-empty record on every task notification
**File:** `/Users/tobiasgrundmann/Development/hyperidle/.worktrees/L15-2/packages/pipeline/src/runner.ts:167-180`
**Snippet:**
```ts
persistHandoverBrief(cwd, storyId, {
    fromPersona,
    toPersona: "",
    priorScore: null,
    targetFiles: [],
    openIssues: [],
    ledgerEntry: sys.summary ?? "",
    artifactPaths: [],
});
```
**Why this is slop:** Of seven fields, six are hard-coded empty/null and the
only payload is `sys.summary` (a free-form string). The data contract
`BriefData` advertises `targetFiles`, `openIssues`, `priorScore`,
`artifactPaths` — *none* of which the runner can populate from
`task_notification`. The skill that produced the task didn't return them, so
the runner makes them up as empty.
The next persona's SessionStart hook (`session-start-adversarial.ts:62`)
prints `(none)` for `artifactPaths`. So the adversarial pipeline — the
*only* consumer the brief was designed for — gets nothing useful.
**Fix:** Either (a) wire the producer skill to emit a structured handover
artifact (JSON file path in `sys.summary`, parsed here) so `targetFiles` /
`artifactPaths` are real, or (b) collapse `BriefData` for now to
`{ fromPersona, ledgerEntry }` and add the rich fields when a producer
actually fills them. Shipping the empty-array fields hides the fact that the
contract is unfulfilled.

### S5. `normalizeMemory` is 26 lines of `?? defaults` after the writer already supplies all fields
**File:** `/Users/tobiasgrundmann/Development/hyperidle/.worktrees/L15-2/packages/pipeline/src/brief.ts:118-143`
**What:** Every writer of `MemoryData` (the only one is `primeStoryState` at
runner.ts:199-204) supplies all fields. The `@lore` at line 115 explains the
reason: "TOON encodes empty arrays as zero lines, so decode loses the key."
That's a TOON codec round-trip bug, not a memory-shape concern. Fixing the
codec (or `encode`-ing empty arrays as `key: []`) deletes the entire
`normalizeMemory` function and its mirror in `readBrief` / `readPrefetch`.
**Fix:** Push the array-preservation fix into
`packages/shared/src/toon-codec.ts`. Replace `normalizeMemory` and the
parallel `?? []` ladders in `readBrief` / `readPrefetch` with a single zod
parse (see S2). Currently the bug is documented at three sites and patched
at every reader.

### S6. Doc-comment narrates what the next two lines literally say
**File:** `/Users/tobiasgrundmann/Development/hyperidle/.worktrees/L15-2/packages/pipeline/src/brief.ts:230-235`
**Snippet:**
```ts
/**
 * Format the standard SessionStart injection — story memory (stable),
 * handover brief (per-step delta), and pre-fetched data. Sections are
 * labelled explicitly so personas can't conflate "stable" with
 * "just-handed-off".
 */
export function formatSessionContext(input: SessionContextInput): string {
```
The function body literally builds three sections labelled
`"## Story context (stable):"` / `"## Just-handed-off:"` / `"## Pre-fetched"`.
The doc-comment restates the section labels as prose. Keep the *why*
(personas can't conflate stable with delta), drop the *what*. The CLAUDE.md
project rule already documents the same sections — duplicating the rationale
in the function header is filler.
**Fix:** Reduce to one line: `// Adversarial variant deliberately drops free-form summaries — see formatAdversarialContext.`

### S7. `inferSkillName` regex pair has overlapping behaviour and unclear intent
**File:** `/Users/tobiasgrundmann/Development/hyperidle/.worktrees/L15-2/packages/pipeline/src/runner.ts:58-64`
**Snippet:**
```ts
function inferSkillName(text: string | undefined): string | undefined {
    if (!text) return undefined;
    const slash = text.match(/\/([a-z][a-z0-9-]*)/);
    if (slash) return slash[1];
    const word = text.match(/^([a-z][a-z0-9-]*)/);
    return word ? word[1] : undefined;
}
```
This is pre-existing code — but L15 adds a new caller at runner.ts:169
(`inferSkillName(sys.summary) ?? "unknown"`). `sys.summary` is a free-form
human sentence; the leading-word fallback ("Successfully …" → returns
`"successfully"` as a "skill name") will silently mis-tag spans for
`HYPERIDLE.persona`. L15 is now adding the second call site of a brittle
heuristic instead of plumbing the persona through directly.
**Fix:** L15 already maintains `taskPersonas: Map<string, string>` at line 254
and writes to it on `task_started`. By the time `task_notification` fires the
entry exists. Drop the `?? inferSkillName(sys.summary)` fallback — if the
map lookup misses, that's a real bug worth surfacing as `"unknown"` directly.

### S8. `error` field in `RunResult` packs `${message}\n${stack}` into one string
**File:** `/Users/tobiasgrundmann/Development/hyperidle/.worktrees/L15-2/packages/pipeline/src/runner.ts:390`
**Snippet:**
```ts
const errorMsg = err instanceof Error ? `${err.message}\n${err.stack}` : String(err);
```
Pre-existing — but the `RunResult.error: string | null` contract is consumed
by `recordSpanError` (line 392) AND embedded in JSON output. A multi-line
`message\nstack` blob is awful to grep through OTel logs. L15 didn't introduce
this, but it inherited the pattern when adding `persistHandoverBrief`'s
`appendOutput(storyId, '[brief] write failed: ${message}')` at runner.ts:220
— note that one drops the stack while the outer one keeps it. Two ways of
flattening the same error type, neither typed.
**Fix:** Out of scope for L15 alone, but flag for the next runner pass: switch
`RunResult.error` to `{ message: string; stack?: string } | null`.

---

## CONSIDER

### S9. Settings.json variant-hook gating routes adversary personas via PERSONA env var that the runner never sets
**File:** `/Users/tobiasgrundmann/Development/hyperidle/.worktrees/L15-2/.claude/settings.json` (referenced; not in scope to read)
**File:** `/Users/tobiasgrundmann/Development/hyperidle/.worktrees/L15-2/.claude/hooks/session-start.ts:62`
**What:** `session-start.ts` reads `process.env.HYPERIDLE_PERSONA` for prefetch
selection, but the runner at `runner.ts:255-292` never `env`-passes
`HYPERIDLE_PERSONA` into the `query()` call. So the prefetch path will never
fire from the runner — only from a manually-launched session that exports
the var. Either the runner needs to set the env per-task (but `query()`
sub-tasks run in the same process — they can't), or the prefetch design needs
to be selected differently.
**Fix:** Either remove the prefetch path from `session-start.ts` (the
adversarial hook already excludes it) or document the manual-shell A/B
workflow this is built for. Right now it's dead code from the runner's
perspective.

### S10. `taskPersonas` map is mutated on `task_started`, deleted on `task_notification`, but never cleared on the abort path
**File:** `/Users/tobiasgrundmann/Development/hyperidle/.worktrees/L15-2/packages/pipeline/src/runner.ts:254`, `:170`
**What:** `taskSpans` is cleared by `endLingeringTaskSpans` (line 404). Its
sibling `taskPersonas` is not. Memory leak is bounded by the run lifetime,
but the asymmetry says "I added the map and forgot the symmetric cleanup."
**Fix:** Either drop `taskPersonas` entirely (use the persona as a span
attribute and read it back) or add a `taskPersonas.clear()` call next to
`taskSpans.clear()` at line 409. Cosmetic; no correctness impact.

### S11. `HYPERIDLE_CWD` env fallback in both hooks duplicates the runner's `cwd` parameter
**File:** `/Users/tobiasgrundmann/Development/hyperidle/.worktrees/L15-2/.claude/hooks/session-start.ts:53`, `/Users/tobiasgrundmann/Development/hyperidle/.worktrees/L15-2/.claude/hooks/session-start-adversarial.ts:48`
**Snippet:** `const cwd = input.cwd ?? process.env.HYPERIDLE_CWD ?? process.cwd();`
**What:** Three-way fallback, never tested under any of the non-default
branches. The hook input `{cwd}` is documented in the Claude Code hooks spec
and is the canonical source. `HYPERIDLE_CWD` is invented here with no
producer in the codebase.
**Fix:** `grep -r HYPERIDLE_CWD` returns only these two hook files. Drop the
env fallback. If `input.cwd` is missing, `process.cwd()` is the right and
only fallback.

### S12. Empty-catch comment "// Hook stdin malformed; fall back to env-derived cwd." — comment hides a swallowed error
**File:** `/Users/tobiasgrundmann/Development/hyperidle/.worktrees/L15-2/.claude/hooks/session-start.ts:48-50`, `/Users/tobiasgrundmann/Development/hyperidle/.worktrees/L15-2/.claude/hooks/session-start-adversarial.ts:43-45`
**Snippet:**
```ts
} catch {
    // Hook stdin malformed; fall back to env-derived cwd.
}
```
The adversarial variant says `// fall through` — literally describing control
flow, not why. Both hooks log the outer error to stderr (lines 75 / 67) but
swallow JSON.parse failures silently. If the hooks spec ever ships a
breaking JSON shape, the hooks degrade to "no context injected" with no
breadcrumb in the run logs.
**Fix:** Replace empty body with `process.stderr.write('hook: malformed stdin JSON\n');`
or remove the try/catch and let it propagate to the outer `main().catch` —
the user-visible behaviour is identical (process exits 0) but the failure is
visible in stderr.

---

## VERDICT

**REVISE.** Two MUST-FIX (S1: seven `as unknown as` casts smuggled through
`toRecord`; S2: 12 field-level `as` casts in the read path) directly violate
the project's TypeScript rule. The fix is one zod schema per persisted shape
plus a one-line widening of the codec signature — net deletion across both
files.

The six SHOULD-FIX items describe a coherent shape: the L15 brief surface was
designed for rich handover data (`targetFiles`, `openIssues`, `artifactPaths`,
`priorScore`) that no producer fills, so every brief write is a sparse stub.
Either land a producer that fills the fields, or collapse `BriefData` to
`{ fromPersona, ledgerEntry }` until one exists. Shipping the empty-array
contract today encodes a promise the runner can't keep, and it shows up
as `(none)` in adversarial-context output.

S1 + S2 + S5 + S6 together remove the three readers' decoder ladders, the
`toRecord` helper, the `normalizeMemory` function, and the narrating
doc-comment — net about -60 lines for honest types.

Files referenced (absolute):
- `/Users/tobiasgrundmann/Development/hyperidle/.worktrees/L15-2/packages/pipeline/src/brief.ts`
- `/Users/tobiasgrundmann/Development/hyperidle/.worktrees/L15-2/packages/pipeline/src/runner.ts`
- `/Users/tobiasgrundmann/Development/hyperidle/.worktrees/L15-2/.claude/hooks/session-start.ts`
- `/Users/tobiasgrundmann/Development/hyperidle/.worktrees/L15-2/.claude/hooks/session-start-adversarial.ts`
- `/Users/tobiasgrundmann/Development/hyperidle/.worktrees/L15-2/packages/shared/src/toon-codec.ts` (referenced for S1/S5 fix)
