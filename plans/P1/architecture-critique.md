# Architecture Critique: P1

ARCHITECTURE-SCORE: 8/10  rounds=1  score-line: SA:9 LI:10 AC:8 DM:8 N:9 MD:10 FMC:7 S:9 V:8

---

## CRITICAL

None.

## WARNING

**W-1. [plan Task 11e] Missing Langfuse-adjacent reference at `docs/architecture/deployment-architecture.md` line 51.** The plan covers lines 28 and 35 but line 51 reads `Managed observability (LangSmith / Helicone)`. This line does not contain the literal string "langfuse" so it passes the AC10 grep, but the plan's own Task 11c already cleans up `LangSmith / Helicone` from `components.md`. The deployment doc should receive the same treatment for consistency. Without it, "LangSmith" survives in one deployment doc while being deleted from every other doc. Fix: add line 51 to Task 11e's change list, updating to `Managed observability (OpenTelemetry planned)` or similar.

**W-2. [plan Task 8a, item 5] The h3-review-fixes test describe("(5) PATCH /config live rebuild") sends `langfusePublicKey` and `langfuseSecretKey` in its second PATCH body (lines 466-467). The plan says to remove these fields but does not specify what to send instead.** After the purge, the `patchConfigSchema` Zod schema no longer accepts those fields. If the test still sends them, `z.object().strict()` rejects the request with 400. The plan says "The test can still exercise the enable/disable/re-enable cycle without Langfuse keys" but does not specify the replacement body. Fix: explicitly state the replacement PATCH body, e.g. `{ enabled: true, adapter: "console" }`, so the builder does not have to infer the intent.

**W-3. [plan, Failure-Mode Coverage] The plan does not specify what happens to existing databases that have `observability.adapter` set to `"langfuse"` in `factory_settings`.** After the purge, `isAdapter("langfuse")` returns false, so `buildConfig` falls through to `DEFAULTS.adapter` ("console"). This is correct and safe behavior, but the plan should state it explicitly as a migration edge case so the builder does not introduce a "clean up old rows" migration that would be scope creep.

## SUGGESTION

**S-1. [plan Task 3, item 3] SafeObservabilityConfig simplification.** The plan proposes `export type SafeObservabilityConfig = ObservabilityConfig;` which is semantically identical to the base type. This is acceptable as the plan notes. Consider requiring a `@lore` comment: "Retained as a distinct type name for API-response semantics; may diverge when OTEL lands." Without the lore, a future agent will see a trivial alias and inline it.

**S-2. [plan Task 3, item 7] `redactObservabilityConfig` becomes `return { ...cfg }`.** The function is now a true no-op passthrough. The plan acknowledges this and keeps it for API contract stability. Consider adding a `@lore` comment documenting "kept as a hook for future adapter-specific redaction."

**S-3. [plan Task 4, item 4] `validatePatchBody` becomes `return null;` (always valid).** The function could be removed entirely since the Zod schema handles all remaining validation. The plan keeps it for structural clarity, which is reasonable. Either keep with a `@lore` comment or delete and let the Zod schema be the sole validator. The plan should state the rationale more firmly.

**S-4. [plan Task 10] SSRF test URL replacements.** The plan replaces `langfuse.com` with `example.com`. Using `example.com` is fine (IANA reserved) but `webhook.example.com` or `traces.example.com` (as the plan already uses on line 112) would be more descriptive. Minor.

**S-5. [plan, general] Orphaned database rows.** After the purge, any `factory_settings` rows keyed with `observability.langfuse_*` become orphaned. This is harmless (never read) and cleaning them would be scope creep. No action needed; noted for completeness.

## What's Working Well

1. **Exhaustive plan reconciliation table.** The "spec vs reality" table is a strong pattern. It caught the "no langfuse npm dependency" assumption early, and correctly identified every structural element by file and line number. The migration checklist at the bottom is a dual-entry verification of the same facts. This structure prevents the class of bugs where the plan references things that don't exist (CC-007).

2. **Protected-tests list is complete and correctly categorized.** The three-way split (protected / modified / deleted) is exactly right. The `dispatcher.test.ts` appears in both "protected" and "modified" lists -- the plan modifies the adapter-name test but protects all other assertions. This level of precision prevents test-contract drift (CC-008).

3. **Security analysis is appropriate for a deletion workpackage.** Rather than boilerplate STRIDE, the plan correctly marks each concern as N/A or positive (deletion reduces attack surface). The section earns its keep by noting that `sanitizeHttpUrl` survives for other consumers -- the shared SSRF infrastructure is not collateral damage.

---

## Score Breakdown

- **SA (Spec Alignment): 9.** Every AC maps to tasks. The plan found one additional doc file (`what-this-layer-is-not.md`) beyond the spec's explicit list. AC7 ("no langfuse npm dependency") is verified by confirmed absence.
- **LI (Layer Integrity): 10.** Pure deletion within the server and shared packages. No cross-layer reach. No new code beyond tightening a type union.
- **AC (API Contracts): 8.** GET/PATCH response shapes fully specified with TypeScript types. Zod schema specified. 400 rejection for `adapter: "langfuse"` covered. Minor gap: `validatePatchBody` always-null behavior is not explicitly called out as a contract change.
- **DM (Data Model Alignment): 8.** No schema changes. Orphaned `factory_settings` rows noted above. Config keys deleted from code but not database -- acceptable for a purge.
- **N (Naming): 9.** All comment renames are honest ("Langfuse outage" to "adapter outage"). No misleading names introduced.
- **MD (Module Depth): 10.** No new modules. Deletion reduces public surface: two exported functions removed, one type narrowed. Rare plan that makes the codebase simpler.
- **FMC (Failure-Mode Coverage): 7.** Plan identifies all error paths being removed. SSRF infrastructure correctly preserved. Dinged for: (a) not stating what happens when existing databases have `adapter=langfuse` in factory_settings (W-3), (b) test body replacement under-specified (W-2).
- **S (Simplicity): 9.** Appropriately minimal. Only potential over-engineering is keeping `validatePatchBody` and `redactObservabilityConfig` as passthroughs, but both justified by future OTEL work.
- **V (Verifiability): 8.** Every AC has concrete verification. Final grep + check + lint + test + dev chain is solid. Dinged because Task 8a does not specify the replacement PATCH body, and Task 8b does not name the specific test function for "rejects adapter: langfuse."

---

**Verdict:** Score >= 7. Plan approved to advance. WARNINGs W-1 through W-3 should be addressed by the builder during implementation -- they are informational, not blocking.
