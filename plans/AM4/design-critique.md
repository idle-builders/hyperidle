# Design Critique: AM4 Harness detection & onboarding

DESIGN-CRITIQUE: variant=c-cards score=8/10  rounds=1  axes: H:8 S:8 T:8 C:8 Co:9 St:7 A:8 AS:9 PP:8

Reviewer read all three rendered variants (screenshots in `plans/AM4/design/{a,b,c}/screenshot.png`) plus the lifted presentation mappers and fixtures. Variant C (Provider cards) is the right pick and clears the ≥7 bar. Scoring below is for C; A (7.1) and B (7.4) are not re-litigated — the designer's relative ordering is sound.

## Verdict
**PASS — score 8/10.** Ship the design. C honestly serves both the first-run "what's my next step" job and the durable settings-inspect job from one uniform card chrome. The descriptor-driven contract is the strongest dimension: identical card, zones appear purely from `discovery.state` + `authAction`. No per-backend branch exists in the rendered surface (verified by reading `AM4HarnessVariantC.stories.tsx` + `AM4HarnessPresentation.ts`). All tokens; zero hardcoded color; no AI-aesthetic tells in the frame (single column, left-aligned, no hero, no card grid, no decorative icons).

### CRITICAL
- None.

### WARNING
- [AM4HarnessPresentation.ts:69-71 `showsToggle` + VariantC.stories.tsx:58-64] **The toggle is rendered for `unauthenticated` backends but permanently `disabled` and `on={false}`.** Screenshot shows no toggle for Codex/OpenCode (because `showsToggle` returns true only for `ready`+`unauthenticated`, and the card header still renders it) — wait: actual render shows toggle absent on Codex/OpenCode in the screenshot because `isEnableable` is false yet `showsToggle` is true, so a *disabled* toggle should appear. The screenshot does NOT show a disabled toggle on the needs-sign-in cards, meaning the rendered state and the mapper disagree, OR the disabled toggle is visually invisible. Either way the affordance is ambiguous: a disabled toggle next to "Sign in needed" reads as "broken switch," not "auth first." → Build decision: for `unauthenticated`, drop the toggle entirely (let the auth CTA be the only affordance) OR render it with an explicit "Enable after sign-in" affordance. Do not ship a bare disabled toggle. This couples to the architecture enable/disable ruling below.
- [VariantC.stories.tsx:112-114] **Capabilities Fold always shows File editing / MCP / Sub-agents rows even when the descriptor reports all `false`.** With production discovery NOT running the session probe (AM2 `@lore`), real `ready` backends return `fileEditing:false, toolUse:false`. The fold would render "File editing: No / MCP: No / Sub-agents: No" — which reads as a degraded/broken backend, not "caps confirmed after first run." The fixtures mask this by hardcoding `true`. → Build: gate the runtime-cap rows on the same "caps known" predicate `capabilitySummary` uses, or render the "confirmed after first run" line inside the fold when all caps are false.

### SUGGESTION
- [VariantC.stories.tsx:37] `hasCaps` is computed inline (`models.length > 0 || fileEditing || mcpSupport`) but omits `toolUse`/`subAgents`. A backend with only `subAgents:true` would suppress the fold. Minor; lift to a `hasCaps(d)` mapper for parity with the other predicates so the fold-visibility rule is descriptor-driven in one place too.
- [approved.md states table] The `missing` state row says "build: install hint from reason" — but no in-scope fixture exercises `missing` (cursor is `unavailable`, not `missing`). Ensure the build story includes a `missing` card so the install-hint path is actually rendered+snapshotted, not just specified.
- Header copy "you can run agents as soon as one is ready" is good, action-oriented, not a superlative. Keep it.

### What's Working Well
- **The descriptor-driven contract made literal.** Uniform card + conditional zones is exactly the "zero per-backend hard-coding" spec requirement expressed as visual structure, not just code discipline. This is the best embodiment of the three variants and the reason C beats A/B.
- **The tinted auth-zone inset** (`--surface-page` on `--surface-elevated` card) is the one distinctive, purposeful detail — it makes the next step unmissable on exactly the backends that need it while ready backends stay quiet. Premium without chrome.
- Actionable-first ordering + readiness counts header (pulled from B) genuinely improve the first-run read without B's vanishing-section problem.
