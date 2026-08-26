# BA3 — Code Review

Branch `claude/pipeline-ba3-bc1ba7` · scope `git diff origin/main...HEAD` (39 files).
Reviewer: independent, read-only. Verified against `plan.md` + amendment, `build-plan.md`, and the
binding rules. Targeted `check`/`vitest`/break-tests run; full `npm run verify` and the harness lane
(needs real binaries) were not run.

---

## BLOCKING

### B1 — Assistant agents silently drop `modelOptions` (offered-but-dead control)

- **Where:** `layers/core-api/src/routes/assistant.ts:54` (`patchSoulPromptSchema`) and its PATCH
  handler (`:395`+), GET response (`:344`); UI sends it at
  `layers/core-ui/src/settings/SettingsAgents.tsx:269`.
- **What:** The Agents editor (`AgentEditor.tsx`) is shared by normal agents and assistant agents
  (`ast-*`). For an assistant, save routes to `PATCH /api/users/:userId/assistant`. That route's zod
  schema has `systemPrompt`, `harnessType`, `modelId`, `modelProvider` — **but not `modelOptions`** — so
  `safeParse` strips it. The handler builds its `AgentOrchestrationRunConfigPatch` from those four fields
  only; `modelOptions` is never written. The GET response likewise omits `modelOptions`.
- **Reachability:** the assistant schema accepts an arbitrary `harnessType`/`modelId`, and `claude-code`
  declares the `Effort` option for **every** model (`harness-discovery.ts` `CLAUDE_EFFORT_OPTION`). So an
  assistant configured on claude-code renders the "Model options" control, the user sets Effort, saves —
  and it is silently discarded. On reload the control shows the default again.
- **Impact:** This is the exact defect BA3 exists to remove — "a control offered that does nothing" —
  reproduced for an entire class of agents. Fails AC *"Options set on an agent reach the harness when
  that agent runs"* and the amendment's intent. The UI half was wired (SettingsAgents sends
  `modelOptions` on the assistant branch); only the server half is missing.
- **Fix direction:** add `modelOptions` to `patchSoulPromptSchema`, thread it into the patch, and return
  it from the assistant GET — mirroring `agents.ts`.

---

## NON-BLOCKING DEFECTS

### D1 — Duplicate spread in the builtin tool loop

- **Where:** `layers/agent-execution/harness-registry/src/builtin-harness-adapter.ts:499-500`.
- `...builtinModelOptions(config),` appears **twice** in the `runLoop` `callLlm({...})`. Idempotent, so
  behaviour is unaffected, but it is a copy-paste slip no review caught and Biome does not flag it
  (only a pre-existing complexity warning on `runLoop`). Delete the duplicate line.

### D2 — Mis-attached `@lore` comment after import reorder

- **Where:** same file, `:35-38`. The diff moved the `import { modelOptionRequestFields }` line so the
  `@lore X6: ModelTier is exported twice…` comment now sits directly above it, appearing to document
  `modelOptionRequestFields` while it actually explains the `ModelTier` import at `:14`. Cosmetic; move
  the comment back to the `ModelTier` import or drop it.

---

## SCOPE

### S1 — Unrelated design-system re-pointing bundled into BA3

- **Where:** `.claude/rules/design-system.md` and `pipeline.config.yml` (commit "Point the design-system
  config and rule at the design system").
- Repoints the design system from `framework/design-system` (which no longer exists — verified
  `framework/design-system/src/tokens.css` is absent) to `layers/core-ui/src/ds/`. The change is
  **correct** (the old path is dead), but it has nothing to do with per-agent harness model options.
  This is an unrelated edit riding BA3's PR. Recommend splitting it out or getting explicit founder
  approval to keep it; it should not be attributed to BA3's scope.

---

## CLAIMS RE-TESTED (positive evidence)

1. **OpenRouter wire switch (`/v1/messages` → `/v1/chat/completions`) — JUSTIFIED, low residual risk.**
   The justification holds: `/v1/messages` silently accepts and discards unknown fields, so
   `reasoning_effort` was a no-op there; the native endpoint validates it (proven by the tamper test).
   Crucially, the switch **converges production onto the already-tested wire**: the locked harness matrix
   pins builtin to `openai-compatible`, which already runs through the same `callOpenAiWire`
   (`toOpenAiMessages`/`parseOpenAiResponse`) that existing multi-turn/return-enforcement harness tests
   exercise. Production builtin-on-OpenRouter previously diverged to the *Anthropic* wire, which the
   harness lane never tested — so this change reduces, not increases, the untested surface.
   *Residual:* the `openrouter` provider branch's own multi-turn tool loop is only asserted single-turn
   (`builtin-model-options.integration.test.ts`); it delegates to the identical `callOpenAiWire`, so the
   gap is real but minor. Cache-token usage fields (`cache_read_input_tokens`) are not parsed on the
   OpenAI path, but no consumer reads them — `trackUsage` uses only `input/outputTokens` — so no usage
   regression. **Not blocking; author correctly flagged no full multi-turn proof.**

2. **Codex cache read degrades safely — HOLDS.** `parseCodexModelCache` guards every access: `JSON.parse`
   in try/catch, object/array shape checks, per-row `slug`/`visibility`/`supported_in_api` gates,
   `supported_reasoning_levels` array-checked, effort string-checked, `context_window` number-checked.
   Disk read (`readCodexModelsFromDisk`) is try/catch → null. No half-success or throw path found; every
   failure yields `[]` = today's behaviour. No fallback list. Solid.

3. **Storage equivalence (unconfigured agent byte-identical) — HOLDS at every layer.**
   - Store: `serializeModelOptions({})` → `NULL` (not `"{}"`); insert always writes `NULL` for empty;
     update only touches the column when `"modelOptions" in patch`; `parseModelOptions(null)` → `{}`;
     absent row → `DEFAULT` with `{}`.
   - Provisioner: `...(Object.keys(modelOptions).length > 0 ? { modelOptions } : {})` → field absent when
     empty → adapters build today's invocation. CLI adapter appends option argv only when non-empty,
     after template resolution and the empty-`--model` filter.
   - Round-trip: client casts `GET /api/agents` straight to `AgentConfig[]`; `agentToEditorDraft` seeds
     `draft.modelOptions`; save sends it back. So a save while a probe is failing does **not** prune
     unrendered stored keys (§6 rule holds) — `reconcileForModel` runs only on explicit model-switch,
     never on save.
   - DB integration tests pass (store + core-api route, 15 tests). Production packages typecheck clean.

4. **Type-level carrier guard — VERIFIED both directions (break-tested).**
   Adding a declared key with no carrier → `TS2741: Property 'bogus' is missing`. Adding a carrier for an
   undeclared key → `TS2353: 'bogus' does not exist`. Clean when correct. Depends on `as const satisfies`
   exactly as documented.

5. **ESLint block move — CONFIRMED both halves (structural + semantics).** The removed block sat *before*
   the core-ui `layers/core-ui/src/**` navigate block (`eslint.config.ts:892`), which redefines
   `no-restricted-syntax`; flat config's last-matching-block-wins meant the harness-literal ban was
   silently replaced and never fired on `harness-presentation.ts`/`SettingsHarnesses.tsx`. The new block
   (`:938`) sits *after* it and **restates the AM5 navigate selector**, so nothing is dropped — block 892
   was navigate-only, verified by reading. `AgentEditor.tsx` is correctly added. (The single-file eslint
   break-test could not run locally — typed-linting needs the full project harness — but semantics +
   reading + the author's recorded 2026-08-25 break-test agree.)

6. **Seam schema completeness — no other field stripped.** `AgentOrchestrationRunConfigPatch` is a mapped
   type over `AgentOrchestrationRunConfigView`'s 7 fields; the intake `validateBody` schema now lists all
   7 (`systemPrompt`, `harnessType`, `modelTierPreference`, `modelId`, `modelProvider`,
   `maxConcurrentSessions`, `modelOptions`). The `satisfies` guard cannot catch an omission, but there is
   no current omission.

## OTHER VERIFIED POINTS

- **Re-engage path** carries option argv in **both** branches (`cli-harness-adapter.ts:855`, `:872`).
- **Builtin-on-Anthropic shows no options** — coherent, not a gap. Anthropic's reasoning is a thinking
  budget, explicitly scoped out; the Anthropic descriptor keeps `options:[]`, so no dead control renders.
  Edge: an agent switched OpenRouter→Anthropic after configuring keeps a stored `reasoning_effort` that
  `callAnthropic` ignores at runtime; acceptable (no control is offered on that path, value genuinely
  unusable).
- **§9 cleanups done:** `scope` field removed from `HarnessModelOptionDescriptor` + its test;
  `SessionView.stories.tsx` stale option fixtures cleared; `deriveComposerPills` confirmed already
  deleted (only a historical lore comment remains); doc pill-language rewritten in `part-model.md` and
  `three-core-views.md` (in-scope, accurate).
- **No WP-ID leakage** into production/code — `BA3` appears only under `.pipeline/`.
- **Migration:** `0061_agent_model_options.sql` + journal entry follow the established pattern; per-
  migration snapshots stopped at 0025 in this repo, so their absence matches convention (0060 has none).
- **Plan §7 doc correction** (`harness-capability-descriptor.md:227`) was not made, but making the ESLint
  rule actually fire rendered its "ESLint-enforced" claim true, so no false doc remains. Acceptable.

---

## VERDICT

**NOT DONE.** One blocking defect (B1: assistant-agent option path is half-wired — the control is offered
but the value is silently dropped, the precise defect BA3 exists to remove). The core mechanism for
normal agents is sound and well-proven; fix B1, delete the duplicate spread (D1), and decide S1's scope.
