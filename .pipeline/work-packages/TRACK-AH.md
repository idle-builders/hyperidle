# Track AH: Onboarding, Configuration & Runtime Coherence

Founder feedback from first real startup (2026-06-12): the setup story doesn't hold together. Onboarding asks for one Anthropic key, but Settings offers three key types — and plaintext keys can exist in the database, which must never happen. The Settings "Models" table is a global three-tier (reasoning/workhorse/fast) construct when models should be chosen per agent. Agents are created with no harness, and the only way to "add" one is a free-text field — so harness selection does not actually work. Adding an agent gives no indication of which team it lands in. A manually-created team gets no org-chart edge back to the founder. There are two separate surfaces that edit the Assistant's soul. And the headline failure: **with a valid Anthropic key set, the Assistant is inert — no streaming, no error, no sign of life.** Multi-line text fields also render as giant rounded pills.

This track makes the configuration surface coherent and the agent runtime actually run: one credential model with no plaintext, per-agent model + harness chosen from real options, an Assistant that visibly responds, and an org chart that reflects what was created.

**Scope rules.** Onboarding, Settings, credential storage, agent/model/harness configuration, the assistant response path, the org-chart wiring around team/agent creation, and a live agent-path test lane. No new process-layer primitives, no cost-model changes, no knowledge-fabric changes beyond what the assistant turn needs. `npm run verify` must pass after every workpackage merges (same rule as Tracks AD–AG). Open source, no enterprise features. **Hard requirement for every workpackage in this track: the acceptance criteria are proven by driving the real running app with Playwright against a real backend and a real model — the live agent-path lane defined in AH5 — with NO mocked agent, credential, session, or LLM routes on the proof path. Screenshots of the working state are captured. Unit tests alone do not satisfy any acceptance criterion here.** This rule exists because the current suite is green while the Assistant is dead: all 72 E2E specs mock every HTTP route, every integration test injects a fake/scripted harness, the one real-adapter test mocks `callLlm`, and the agent-layer evals (the only real-LLM path) never run in CI and never go through the frontend. See `CLAUDE.md` for tech stack and `.pipeline/work-packages/pipeline-manifest.yaml` for the dependency graph.

**Reference docs:** `docs/agent-layer/`, `docs/architecture/`, `docs/human-interface-layer/`, `docs/information-architecture/`, `docs/ui-design/`, `.claude/rules/aesthetic-quality.md`. Relevant prior tracks: X3 (Agent Configuration DB+UI), X4 (Model Gateway), X5 (Multi-Harness Adapter), X6 (Built-in Harness), AD8b (Assistant Agent + Overlay), AE2 (Team Creation & Onboarding), AF11 (credential hardening), AF15 (Settings reachability).

**Carried realizations (from the 2026-06-12 mapping pass).** These are the concrete defects behind the founder feedback; each workpackage below resolves a named subset.
- **Key never reaches the runtime.** Onboarding stores the Anthropic key via the desktop bridge (`window.__HYPERIDLE__.credentials.set("anthropic", …)`). The server resolves keys through `EnvCredentialResolver` (reads `process.env.ANTHROPIC_API_KEY`) in local mode, or `server_credentials` in shared mode. Nothing proven to bridge the onboarding-stored key into the process the server's resolver reads — so a key set at onboarding may never reach the LLM call. (AH1)
- **Two credential systems.** `anthropic` / `openrouter` keys live in the encrypted `server_credentials` table; `openai-compatible` keys live as **plaintext** inside the `server_config.modelGateway` JSON and never appear in the Credentials section. (AH1)
- **Stale model IDs.** Defaults and the Models dropdown hard-code `claude-opus-4-20250514` / `claude-sonnet-4-20250514` / `claude-haiku-3-5-20241022`. Current models are Opus 4.8 / Sonnet 4.6 / Haiku 4.5. (AH2 — consult the `claude-api` skill for current IDs; never hard-code from memory.)
- **Tier ≠ provider, and tiers are global.** Agents can pick a tier (`users.model_tier_preference`) but not a provider; the model itself is a single global 3-tier table, not an agent property. (AH2)
- **Harness is free text and unenforced.** `users.harness_type` is a free-text field in Settings → Agents; only `claude-code`, `builtin`, and on-PATH CLI binaries register as adapters. A typo or any unregistered value yields no eligible adapter and a silent session failure. Onboarding-created agents get no harness at all. (AH2 / AH3)
- **Two divergent soul paths.** Settings → Assistant (`PATCH /api/users/:id/assistant`) and Settings → Agents (editing the assistant agent's `soulPrompt`) both write the assistant persona; separately, `ClaudeAgentSdkAdapter` reads `CLAUDE.md` from the workspace while `BuiltinHarnessAdapter` reads inline `users.soul_prompt` — the same agent can get a different persona depending on which harness runs. (AH3)
- **Org chart not wired on creation.** Team creation (`POST /api/teams`) does not insert an org-chart edge linking the team/its agents to the founder. (AH4)
- **Textareas are pills.** A shared input style with a large border-radius (sized for single-line inputs) is applied to `<textarea>`, so multi-line fields render as giant rounded pills. One shared-style fix resolves it everywhere. (AH3 owns the fix; verified across surfaces.)

---

### AH1 — One credential model, no plaintext, reaches the runtime

**Workpackage.** As a founder who entered an API key during setup, I want that single key to be stored once, securely, and actually used by my agents — and I want Settings to show me the same key I entered, never a different or empty set of slots — so that "I set a key" reliably means "my agents can think," with no plaintext copy sitting in a database anywhere.

**Why this matters.** This is the root of the headline failure: the founder set a valid Anthropic key and the Assistant stayed inert with no error. If the key the user enters at onboarding cannot be read by the process that makes the LLM call, nothing in the product works — every agent, every session, every assistant turn dead on arrival. And a plaintext key in the DB is an unacceptable security posture for an open-source product people will self-host. Onboarding asking for one key while Settings shows three unrelated slots also makes the user doubt whether anything they entered took effect.

**What exists today.** Onboarding (`SetupFlow.tsx`) collects only an Anthropic key and writes it to the desktop credential bridge. Settings exposes a fixed catalog of three credentials (Anthropic, OpenRouter, Shared Backend) via the bridge (`CredentialsTab.tsx`), plus a separate `openai-compatible` API-key field inside Settings → Models that persists into `server_config.modelGateway` as plaintext JSON. The server reads credentials through `EnvCredentialResolver` (process env, local) or `DbCredentialResolver` (encrypted `server_credentials`, shared). `migrateServerConfigEncryption()` re-encrypts model-gateway keys at boot, but the env→runtime bridge for the onboarding key is unproven and the two credential systems have divergent lifecycles. `getServerSecret()` falls back to an empty string when no key env var is set, silently skipping encryption.

**What's genuinely missing.** A single credential path that (a) accepts the key once at onboarding, (b) stores it encrypted in exactly one place with no plaintext fallback, (c) is read by the same resolver the runtime uses, and (d) is reflected truthfully in Settings. The onboarding key must demonstrably reach an LLM call. The `openai-compatible` key must move into the encrypted store and out of `server_config` plaintext. Settings must present the credential model that onboarding actually populated, not a parallel set of empty slots.

**Depends on.** None.

**Complexity.** L

**Acceptance criteria.**
- A key entered once during onboarding is afterward visible as "set / valid" in Settings — the same credential, not an empty or different slot — and the user is never asked to re-enter it to make agents work.
- No API key is ever stored in plaintext in the database or in any config row; the `openai-compatible` key is stored in the same encrypted credential store as the others.
- The server boots refusing to store credentials with no encryption secret available, rather than silently writing plaintext — a misconfigured deployment fails loudly, not quietly.
- The credential the user set is readable by the resolver the agent runtime actually uses, such that a provisioned session resolves a real key end-to-end (provably, not by inspection).
- Onboarding and Settings agree on the credential model: the providers offered at setup are the providers manageable in Settings, with no orphaned or contradictory slots.

**Validation scenarios.**
- **(Playwright, required)** Given a fresh install, when the user completes onboarding with a valid Anthropic key, then a Playwright run drives setup, navigates to Settings → Credentials, and a screenshot shows the Anthropic credential as set/valid — with no empty re-entry slot.
- **(Playwright, required)** Given a key set through onboarding, when the user triggers an action that provisions a session against the runtime (a real assistant turn or session start), then the run reaches an actual LLM request using the stored key — captured by a screenshot of the streaming/working state or a deterministic test harness that proves the key resolved (no `MissingCredentialError`).
- Given any credential write path (onboarding, Settings, model-gateway), when the row is read back from the database directly, then the stored value is ciphertext, never the plaintext key.
- Given a server started with no encryption secret configured, when a credential write is attempted, then it is rejected with a clear startup/runtime error rather than silently persisting plaintext.

**Plan calls.** `/concept` recommended — this reshapes the credential model (one store, one resolver, onboarding↔settings parity) and touches a load-bearing security boundary. Then `/architecture`. `/design` only for the Settings credential surface if its shape changes. Consult the `claude-api` skill if any provider/validation detail is needed.

**Contracts / constraints.**
- Encryption stays AES-256-GCM via the existing `credential-encryption` module; no new crypto.
- Never return a plaintext key in any API response (preserve the `hasApiKey: boolean` pattern, A-SEC-2).
- The bridge→runtime path must also work in the web/E2E environment so the Playwright proof is possible — desktop-bridge-only credential storage that the test environment cannot reach is itself a defect this workpackage closes.
- Backward compatibility: any legacy plaintext key already in the DB is migrated to ciphertext, not left readable.

**Out of scope.** Per-agent provider preference (AH2). Periodic credential re-validation (note as a follow-up). Shared-backend auth model changes. Adding new providers beyond the existing Anthropic / OpenRouter / OpenAI-compatible set.

**Effort.** L (~1–1.5d)

---

### AH2 — Per-agent model and a harness that actually selects

**Workpackage.** As a founder configuring an agent, I want to set that agent's model and harness on the agent itself — choosing from the models and harnesses the system can actually run — so that every agent has a working brain and a working body by construction, and I never type a harness name into a blank box hoping it exists.

**Why this matters.** Models belong to agents, not to a global three-row table: a builder and a brand-voice agent should be able to run different models, and the current global reasoning/workhorse/fast table cannot express that. Worse, harness selection is a free-text field while only a handful of adapters actually register — so an agent created at onboarding has no harness at all, and a hand-typed value silently yields no eligible adapter and a dead session. Until an agent reliably has a runnable (model, harness) pair, nothing the agent is asked to do can succeed. This is the second root cause behind the inert Assistant.

**What exists today.** `users` carries `model_tier_preference` (reasoning/workhorse/fast) and a free-text `harness_type`. The actual model per tier lives globally in `server_config.modelGateway` (Settings → Models), with hard-coded, now-stale model IDs. The adapter pool registers `claude-code`, `builtin`, and any on-PATH CLI binaries (`aider`/`goose`/`opencode`); `adapter-pool.select({ harnessType })` filters by type but nothing validates that a configured `harness_type` matches a registered adapter, and a null value (onboarding default) means "any adapter." Settings → Agents edits name/role/harness/tier/sessions/soul; Settings → Models edits the global tiers.

**What's genuinely missing.** Model selection as a per-agent property (provider + model id, chosen against the current model catalog), the removal or demotion of the global three-tier table to a sane default rather than the primary control, and harness selection as a constrained choice over actually-registered adapters with no free-text path and no agent left harness-less. Onboarding-created agents must come out with a working default harness and model.

**Depends on.** None. (Pairs with AH1 for an end-to-end runnable agent; AH3 depends on both.)

**Complexity.** L

**Acceptance criteria.**
- Each agent's model is configured on the agent and can differ between agents; two agents on the same team can run different models.
- Harness is chosen from the set of harnesses the system can actually run; an agent cannot be saved with a harness that has no registered adapter, and there is no free-text harness entry.
- Every agent — including those created during onboarding and team creation — has a working default model and harness, so a freshly created agent is runnable without further configuration.
- The model choices presented reflect the current model catalog (current Claude model IDs), not stale identifiers; defaults point at current models.
- The global three-tier Models table no longer functions as the per-agent model mechanism — it is either removed or clearly demoted to a system default, with no contradiction between it and per-agent model settings.

**Validation scenarios.**
- **(Playwright, required)** Given two agents, when the user sets a different model on each through Settings → Agents and reloads, then a screenshot shows each agent persisting its own distinct model.
- **(Playwright, required)** Given the agent edit/add form, when the user opens the harness control, then a screenshot shows a constrained selector listing only registered harnesses (no text box), and attempting to save with no valid harness is prevented.
- Given an agent created via onboarding/team creation, when its configuration is read back, then it has a non-null, registered harness and a current-model assignment — provably runnable.
- Given the agent's configured (model, harness), when a session is provisioned for it, then the adapter pool selects a matching adapter and resolves the configured model (no "any adapter" fallback masking a missing harness).

**Plan calls.** `/concept` recommended — this reshapes where "model" and "harness" live (agent-owned vs global) and the agent configuration model. Then `/architecture`. `/design` for the revised Settings → Agents and Settings → Models surfaces (per-agent model picker, constrained harness selector, what becomes of the tier table). Consult the `claude-api` skill for the current model catalog and IDs.

**Contracts / constraints.**
- Harness type must be validated against the live adapter registry, server-side, not just constrained in the UI.
- Migration: existing agents with a tier preference but no per-agent model get a sensible current-model default; no agent ends up unrunnable after migration.
- Keep the multi-harness adapter abstraction (X5) intact; this changes configuration and selection, not the adapter interface.
- If per-agent provider selection is introduced, the resolver must respect it before falling back to any system default.

**Out of scope.** Building new harness adapters. The credential storage model (AH1). The assistant response trigger (AH3). Cost/appetite model changes.

**Effort.** L (~1.5d)

---

### AH3 — The Assistant actually responds (one soul, real textareas)

**Workpackage.** As a founder messaging my Assistant, I want it to visibly answer — streaming a reply, or telling me plainly what's wrong if it can't — so that the product's first and most central interaction is alive instead of a silent void; and I want exactly one place to shape its persona, edited in a real text box, not two conflicting fields rendered as giant pills.

**Why this matters.** The Assistant overlay is the product's front door and the surface the user lands on right after onboarding. Today, with a valid key set, a message to the Assistant produces nothing — no streamed tokens, no error, no spinner that resolves. A silent dead end at the front door is the single most damaging failure the product can have. Two divergent persona surfaces compound the confusion: the user edits the soul in one place and the running agent may read a different one. The pill-shaped textareas make every long-form edit feel broken on top of it.

**What exists today.** The Assistant agent (`ast-{userId}`) and overlay (AD8b) exist; onboarding seeds a welcome message. Sending a message writes a message row, but whether anything consumes that message and provisions an agent turn is unproven — there may be no trigger, no harness on the assistant agent (AH2), and no key reaching the runtime (AH1), any of which leaves the turn dead and, critically, silent. Persona is editable in two places: Settings → Assistant (`PATCH /api/users/:id/assistant`) and Settings → Agents (the assistant agent's `soulPrompt`); separately the two harness adapters source persona differently (`CLAUDE.md` vs inline `soul_prompt`). A shared input style applies a single-line border-radius to `<textarea>`, producing the pill shape.

**What's genuinely missing.** A proven trigger path from "user sent a message to the assistant" to a streamed agent response visible in the overlay, with a clear, surfaced error state whenever the turn cannot run (missing key, no harness, provider failure) — never silence. A single canonical persona surface that the running agent demonstrably reads regardless of harness. And a textarea that renders as a proper multi-line box.

**Depends on.** AH1 (the key must reach the runtime), AH2 (the assistant agent must have a working harness and model). These are the other two root causes of the silence; AH3 owns the trigger, the visible response/error, the soul consolidation, and the textarea fix.

**Complexity.** L

**Acceptance criteria.**
- Sending a message to the Assistant produces a visible, streaming response in the overlay when the agent is correctly configured.
- When a turn cannot run (no key, no/invalid harness, provider error), the user sees a clear, specific error or guidance in the overlay — the Assistant is never silent.
- The Assistant's persona is editable in exactly one place; the persona the user saves is provably the persona the running agent uses, regardless of which harness executes the turn.
- Multi-line text fields (assistant persona, agent soul prompt, and any other `<textarea>`) render as proper rectangular text areas, not rounded pills, across Settings.
- A first-time user who finishes onboarding with a valid key can message the Assistant and get a real answer without any additional configuration.

**Validation scenarios.**
- **(Playwright, required)** Given a fresh install completed through onboarding with a valid key, when the user opens the Assistant overlay and sends a message, then a Playwright run captures the streaming/answered state in a screenshot — a real model response, not the seeded welcome text.
- **(Playwright, required)** Given an install with no valid key, when the user messages the Assistant, then a screenshot shows a clear error/guidance state in the overlay (proving the failure is surfaced, never silent).
- **(Playwright, required)** Given Settings open, when the persona-editing surface and the agent soul field render, then a screenshot shows rectangular multi-line text areas, not pills — verified on at least two distinct textarea instances.
- Given the user edits the Assistant persona and saves, when the next assistant turn runs, then the response reflects the saved persona — and there is exactly one editing surface, with no second field writing the same data.

**Plan calls.** `/architecture` required — the core work is wiring the message→turn→stream→render path and the error surface; identify exactly where the turn is triggered and how stream events reach the overlay. `/design` for the consolidated persona surface and the error/empty/loading states of the overlay. `/concept` only if the persona model itself needs reshaping. No new nouns (Assistant, Soul, Harness are established).

**Contracts / constraints.**
- The persona must resolve through one canonical source that both harness adapters read; eliminate the `CLAUDE.md`-vs-inline divergence for the assistant persona.
- Error states must be specific enough to act on (distinguish missing key from missing harness from provider error) without leaking secrets.
- The textarea fix is to the shared input/textarea style so it resolves everywhere; do not patch a single instance.
- Streaming must work in the web/E2E environment so the Playwright proof is possible.

**Out of scope.** New assistant tools/capabilities (AE3). Team-agent (non-assistant) session UX. Cost display. The credential and per-agent-config mechanics themselves (AH1, AH2) — this workpackage consumes them.

**Effort.** L (~1.5–2d)

---

### AH4 — Teams and agents land in the org chart

**Workpackage.** As a founder who creates a team or adds an agent, I want it to appear connected to me in the org chart and to clearly belong to a team — so that the structure I see reflects the structure I built, instead of orphaned teams and agents floating with no relationship to anyone.

**Why this matters.** The org chart is how the founder reasons about who reports to whom and which agents belong where. When a manually-created team has no edge back to the founder, and adding an agent gives no sense of which team it joins, the structure on screen stops matching reality — the founder can't trust it, and downstream features that read the org graph (routing, scoping) inherit the gap. Creation flows that silently produce disconnected nodes erode confidence in the whole model.

**What exists today.** Team creation (`POST /api/teams`, `teams-routes.ts`) builds the team, its `teamMembers` group, and an AI agent per role, and assigns a lead — but inserts no org-chart edge linking the team or its agents to the founder. Settings → Org Chart (`SettingsOrgChart.tsx`) can add edges manually (direct/function/team) after the fact. Settings → Agents "Add agent" collects name/role/harness/tier/sessions/soul with no team/placement context — the form does not say where the agent will live. Onboarding's first team and the founder's own assistant are wired in their own paths; manually-created teams are not.

**What's genuinely missing.** Org-edge creation as part of team creation (the founder is connected to the team they make), and placement context in the add-agent flow (which team an agent joins, surfaced and chosen at creation), so the org chart is correct by construction rather than requiring manual edge repair.

**Depends on.** None.

**Complexity.** M

**Acceptance criteria.**
- Creating a team produces an org-chart edge connecting it to the founder; the new team appears connected in the org chart with no manual edge-adding step.
- Adding an agent makes clear, before confirmation, which team (or scope) the agent will belong to, and the created agent lands in that team.
- After creating a team and adding agents, the org chart reflects the actual structure — no orphaned teams or agents disconnected from the founder.
- Existing manual org-edge management continues to work and does not conflict with the edges now created automatically (no duplicates, no contradictions).

**Validation scenarios.**
- **(Playwright, required)** Given a founder, when they create a new team and then open the org chart, then a screenshot shows the team connected to the founder — without visiting Settings → Org Chart to add an edge by hand.
- **(Playwright, required)** Given the Add-agent form, when it is opened, then a screenshot shows the team/placement the agent will join, and after creating, the agent appears under that team.
- Given a team created through the team-creation flow, when the org graph is read back, then an edge linking the founder to the team exists.
- Given both an auto-created edge and the manual org-edge UI, when the user inspects the org chart, then there are no duplicate or contradictory edges for the same relationship.

**Plan calls.** `/architecture` required — defines where edges are created in the team-creation path and the placement contract for agent creation. `/design` for the add-agent placement affordance and any org-chart arrival changes. No new nouns (Team, Agent, Org edge established).

**Contracts / constraints.**
- Edge creation must be idempotent — re-running creation or setup does not produce duplicate edges (consistent with AF15's setup idempotency).
- Reuse the existing org-edge mechanism (`/api/org`); do not introduce a parallel relationship store.
- Agent placement must be explicit in the API, not inferred after the fact.

**Out of scope.** Org-chart visual redesign beyond showing the new edges correctly. Multi-team membership for a single agent. Reporting-relationship semantics changes. The assistant agent's wiring (AH3).

**Effort.** M (~1d)

---

### AH5 — Live agent-path smoke lane (real model, frontend-driven, in CI)

**Workpackage.** As a maintainer, I want an automated lane that drives the real UI through the real backend to a real — cheap, fast — model and asserts the Assistant actually responds, so that a dead-Assistant-class regression fails CI instead of shipping green. This lane is the execution vehicle for every other workpackage's Playwright proof in this track.

**Why this matters.** The whole reason the inert Assistant reached the founder is that nothing automated exercises the message→turn→stream→render path against anything real. The 72 Playwright specs intercept every call with `page.route()` and assert only that UI chrome renders; the integration tests inject `ScriptedHarnessAdapter` / `CapturingHarnessAdapter` that yield canned events; the single test touching the real `BuiltinHarnessAdapter` mocks `callLlm`; and `packages/eval` (the one place with real LLM calls) is not in `.github/workflows/ci.yml` and never goes through the frontend. The result is a test pyramid that mocks the entire span between the UI boundary and the LLM boundary — exactly where the bug lives. Without a real-path lane, AH1–AH4 can be "proven" by mocked specs and the product can still be dead. This lane makes "the agent works" a thing CI can fail on.

**What exists today.** Agent-layer evals (`packages/eval`, real `@anthropic-ai/sdk` calls, headless, scenario-based) exist but run nowhere in CI and never drive the UI. The model gateway already supports `openrouter` and `openai-compatible` providers (baseUrl + model + key), so a real third-party model is reachable without a new adapter. Playwright is wired for E2E. CI runs check/lint/knip/mock-inventory/build/attestation — no live agent step. There is no test at any tier that posts a user message to the assistant and asserts a real response renders.

**What's genuinely missing.** A frontend-driven, no-mock Playwright lane that runs a real agent turn against a genuinely cheap and fast model, with the model selected dynamically from OpenRouter's live catalog (never a hardcoded permanent id), plus a CI job that runs the lane off the hot per-PR path with a real key supplied as a secret and a bounded token budget.

**Model selection (the crux).** The lane does not need a *smart* model — it needs the cheapest, fastest *recent* model that reliably emits a tool call when the test prompt names the exact tool and arguments. Determinism comes from **prescriptive prompts** ("call `create_task` with `title=X`"), not from model intelligence, so the model only has to follow an explicit instruction and format one tool call. Agent *quality* — judging whether the agent makes good decisions — is the evals' job, and the evals use more expensive models; that is a separate lane, not this one. Two things still matter here: the model must be **current (2026-generation)** so it exercises modern tool-calling behavior rather than a 2024 relic, and the serving must be **redundant** so a single provider outage can't redden CI. The architecture queries OpenRouter's authenticated endpoints API at selection time (`GET /api/v1/models` and `GET /api/v1/models/{id}/endpoints`) and applies, in order:

- **Hard gates (disqualify):** the *serving provider's* `supported_parameters` must include `tools` — tool support is per-provider, not per-model, so some providers of a nominally tool-capable model drop it (e.g. the cheapest gpt-oss-20b endpoint lacks `tools`); the model is 2026-generation; combined prompt+completion price under a documented ceiling (~$0.50 / 1M completion); and **at least two** tool-capable providers above an `uptime_last_30m` floor (≥99%), so no single endpoint outage can flake the lane. Exclude `:free` variants — they are rate-limited and unreliable in CI.
- **Rank the survivors** by live `throughput_last_30m` (higher better) and `latency_last_30m` (lower TTFT better), price as the final tiebreaker. Route the winner through OpenRouter's `:nitro` suffix so the fastest qualifying provider serves it. (These throughput/latency fields populate only on authenticated reads — the selection logic has a key; anonymous reads return them as 0/null.)

Current best fits — all 2026, tool-capable, cheap, multi-provider (verified 2026-06-12): **`deepseek/deepseek-v4-flash`** is the default — strongest performer of the cheap 2026 set, tool-capable on Baidu / DeepInfra / Cloudflare at ≥99% uptime (redundant), ~$0.10/$0.20 per 1M, 1M context. Alternates: **`google/gemma-4-26b-a4b-it`** (MoE, ~4B active → fast; ~$0.06/$0.34; DeepInfra/Cloudflare/Novita) and **`qwen/qwen3.5-flash-02-23`** (cheapest/fastest, ~$0.065/$0.26, but currently single-provider on Alibaba — a redundancy risk, so ranked below despite the price). The 2025 **`openai/gpt-oss-20b`** remains a proven-tool-reliability fallback. **No single id is hardcoded as permanent — the default is the top-ranked survivor at run time; on delisting or an uptime/redundancy drop, selection falls through to the next candidate automatically.**

**Depends on.** AH1 (the credential must reach the runtime), AH2 (an agent must have a working OpenRouter-capable model + harness). The lane then becomes the proof target for AH3 and AH4.

**Complexity.** M

**Acceptance criteria.**
- An automated, frontend-driven lane sends a message to the Assistant and asserts a real, streamed model response renders — against a real model, with no mocked agent, credential, session, or LLM routes anywhere on the path.
- The lane's model is selected at run time from OpenRouter's live catalog by the documented gates (per-provider tool support, 2026-generation, price ceiling, ≥2 providers ≥99% uptime, no `:free`) ranked by live throughput/latency and routed `:nitro` — not a hardcoded id; if the top choice is delisted or drops below the redundancy/uptime floor, selection falls through to the next candidate and the lane still runs.
- The lane exercises at least one real tool-using agent action driven by a prescriptive prompt (the prompt names the exact tool and arguments), so the tool-call path is covered without depending on model intelligence.
- The lane runs in CI (pre-merge and/or scheduled, off the hot per-PR path given E2E cost/latency) and genuinely gates: a deliberately re-broken trigger or stream path makes the lane fail.
- Each run's token cost is bounded by a configured cap and reported; a single run costs cents, not dollars.

**Validation scenarios.**
- **(Playwright, required)** Given the lane configured with an OpenRouter key, when it drives onboarding → open Assistant → send a message, then a screenshot captures a real model response distinct from the seeded welcome text, with no `page.route` mock on the assistant/session/credential path.
- **(Playwright, required)** Given an agent task that requires a tool call, when the lane runs the turn, then the tool is actually invoked and its effect is observable in the UI (screenshot).
- Given the preferred model is delisted from OpenRouter, when model selection runs, then it resolves to the next qualifying tool-capable cheap model and the lane completes.
- Given a regression that breaks the message→turn trigger, when the lane runs in CI, then it fails (proving the lane guards the path, not just exercises it).
- Given a completed run, when its cost is reported, then total tokens and dollar cost are within the configured budget.

**Plan calls.** `/architecture` required — the live model-selection-from-catalog logic, where the lane plugs into CI, how the real key is provided as a CI secret and budget-capped, and how it reuses the openrouter/openai-compatible provider seam. No `/concept` (no new nouns). No `/design` (it's test infrastructure, not a user surface).

**Contracts / constraints.**
- Reuse the existing `openrouter` / `openai-compatible` provider path in the model gateway; no new harness adapter for the lane.
- No mocked agent, credential, session, or LLM calls on the proof path — that prohibition is the entire point of the workpackage.
- Model id is resolved dynamically from OpenRouter's live catalog every run; the allowlist and price ceiling are the policy, not a frozen id.
- The real OpenRouter key is a CI secret, never committed; runs are budget-capped and the lane fails closed if the budget is exceeded.
- This lane is the execution target for the Playwright proofs required by AH1–AH4; those workpackages do not stand up their own parallel real-path harness.

**Out of scope.** Judging agent *output quality* — that is the agent-layer evals' job and the evals run more expensive models; this lane only proves the path is alive and a tool call fires, not that the answer is good (wiring the existing evals into CI is a sensible sibling follow-up). On-device/local-model inference as a future cost optimization. Replacing or deleting the existing mocked E2E specs (they still have value for UI-chrome coverage).

**Effort.** M (~1d)
