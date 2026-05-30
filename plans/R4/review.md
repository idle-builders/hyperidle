# R4 — Thread Identity Fix: Code Review

**Verdict: DONE**

## AC Completeness

| AC | Status | Evidence |
|----|--------|----------|
| AC-1: GET /api/threads/:id response includes an identities map matching the pattern used in the coach endpoint | PASS | `buildThreadIdentities` added to threads.ts lines 108-119; wired into GET /:id handler at line 316; returns `Record<string, { name: string; role?: string }>` — same shape as coach.ts `buildIdentities` (line 122). 9 tests verify shape, values, edge cases. |
| AC-2: ThreadShell renders sender names correctly for all messages in any thread | PASS | `useThreadDetail.ts` line 67 already decodes identities from the response with graceful fallback to `{}`; ThreadShell already consumes identities prop. The server now provides the data the frontend already expected. Tests verify exact name/role values for both human and AI senders. |

## Lens Findings

### Architecture (positive)

No findings. The change is entirely within `packages/server/src/routes/threads.ts` — correct layer. Private function, not exported, single call site. No cross-layer violations. `inArray` on `users.id` (primary key) via Drizzle ORM — no raw SQL. The `users` import was already present in the file (line 20). The response shape is backward-compatible (additive field).

### Security (positive)

No findings. The identities map is built from `messageRows.map(m => m.senderId)` — only senders who posted messages in the thread appear. Since only thread participants can post messages (authz at line 467), identities cannot leak information about non-participants. No new mutation endpoints. No new trust boundaries crossed.

### Adversarial (negative)

**[ADV-1] Minor: `select()` fetches all columns from users table.** The plan (section 4.1) specified `db.select({ id: users.id, name: users.name, role: users.role })` — selecting only the three needed columns. The implementation uses `db.select().from(users)` — selecting all columns including `kind`, `status`, `createdAt`, etc. Functional impact: none (extra columns are ignored in the loop). Performance impact: negligible (primary key lookup, 2-5 rows). Principle impact: the plan specified a narrower projection.

**Severity: SUGGESTION** — not worth blocking. The extra columns never leave the function boundary.

**[ADV-2] Minor: parameter type relaxed from plan.** The plan specified `senderIds: ReadonlyArray<string>`, the implementation uses `senderIds: string[]`. Since Drizzle's `inArray` accepts `string[]` and `ReadonlyArray<string>` is assignable to it via spread, this is inconsequential. The plan's version was slightly more defensive.

**Severity: SUGGESTION** — no runtime impact.

### Simplification (negative)

No findings. One private function (11 lines including early return), three lines added to the handler. No abstractions, no generics, no wrappers, no dead code. The conditional spread `...(row.role ? { role: row.role } : {})` matches the coach endpoint's pattern exactly. The implementation is irreducibly simple for what it does.

### AI Slop (negative)

**[SLOP-1] Minor: JSDoc comment is slightly verbose.** The `buildThreadIdentities` function has a 6-line JSDoc (lines 100-107) including a `@lore` tag. The `@lore` tag is project convention and justified. The first three lines of the JSDoc ("Build an identities map... Queries the users table... Returns an empty object...") are accurate but the function is self-documenting at 11 lines. Not blocking — `@lore` is required by project rules.

**Severity: OBSERVATION** — within project norms.

### Test Quality

The 9 tests are well-structured:
- Exact value assertions (not just `toBeDefined`) — e.g., `expect(body.identities["u-human"]?.name).toBe("Alice Founder")`
- Both participants tested individually and together
- Zero-messages edge case exercised via direct DB insert
- Non-messaging participant exclusion verified
- Coverage-style test verifying every senderId in messages has an identity entry
- "Not Unknown" test proving the fix actually resolves the original bug

The architecture critique's warning about weak assertions was addressed — tests assert exact `name` and `role` values.

## Summary

Clean, minimal fix. One function, three handler lines, nine tests. No regressions (4959 tests pass). Both ACs satisfied. Two minor deviations from plan (wider SELECT, relaxed parameter type) — neither has runtime impact.
