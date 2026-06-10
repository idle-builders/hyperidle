# Settings — Live Browser/API Test Results (Z8)

Tested 2026-06-10 against running dev stack (web :5173, API :3001). Chromium headless 1440x900.
Test harness: `/Users/tg/hyperidle/test-settings.mjs`. Screenshots: `/tmp/test-settings/`.
Direct API probes with `X-API-Key: hyperidle-dev-local`. DB is PGlite at `/Users/tg/hyperidle/hyperidle-pg/`.

## Verdict Table

| Flag | Claim | Test | Verdict | Evidence |
|---|---|---|---|---|
| 1 (HIGH) | SettingsWorker unreachable | Enumerated all settings section headings + grepped imports | **CONFIRMED** | Section headings = `[Profile, Org chart, Models, Assistant, Appearance, Credentials, Notifications, Backend]` — no "Worker" heading. `has_Worker_section=false` in rendered DOM. `SettingsWorker` imported only by itself + tests. |
| 2 (HIGH) | SettingsAgents unreachable | Same enumeration + grep | **CONFIRMED** | No "Agents" section in the stacked settings page. `bodyText` "Agents" match is the global left nav (`Conversations/Work/Knowledge`), not a settings section. No production import of `SettingsAgents`. |
| 3 (MED) | Teams section is a ghost | grep `SETTINGS_SECTIONS` production refs | **CONFIRMED** | `SETTINGS_SECTIONS` (settings-types.ts:33, lists `{id:"teams"}`) imported by zero page components — only by itself and the unmounted `SettingsWorker.tsx`. No `SettingsTeams.tsx`. Stacked page never reads the constant. |
| 4 (HIGH) | Backend checks wrong field → always "Local (laptop)" | Opened Backend section in browser | **CONFIRMED** | Rendered text: `Backend / BACKEND / Local (laptop) / Agent sessions run locally on this machine.` In a plain browser (no Electron bridge) it still reads `platform`, never `backendMode`. |
| 5 (HIGH) | Models autosave wipes stored openai-compatible apiKey | API: set fast tier openai-compatible+apiKey, then PATCH editing reasoning tier without resending fast.apiKey | **CONFIRMED** | After step 1 `fast.hasApiKey=true`; after editing reasoning model (full-replacement PATCH) `fast.hasApiKey=false`. Key silently erased. |
| 6 (MED) | openai-compatible apiKey stored plaintext | Set `apiKey:"sk-PLAINTEXT-PROBE-XYZ"`, grep PGlite data dir | **CONFIRMED** | `grep` hit in `hyperidle-pg/pg_wal/000000010000000000000001`: `...example.com/v1","apiKey":"sk-PLAINTEXT-PROBE-XYZ"}}}`. Stored as cleartext JSON in `server_config.config`, no AES-256-GCM. |
| 7 (MED) | Credential dot always "No credential" for anthropic/openrouter | Browser: read Models tier credential labels; API GET model-gateway | **CONFIRMED** | UI label = `"No credential"`. GET model-gateway `hasApiKey` = `{reasoning:false, workhorse:false, fast:false}` for default anthropic config; PATCH rejects apiKey for anthropic, so the dot can never go green. Real creds live in `server_credentials`, never consulted. |
| 8 (LOW) | Email digests does not persist | API GET /api/settings + solo gating check | **CONFIRMED** | `notifications` response has no `emailDigests` key (`emailDigests key present: False`). Also solo-gated in UI (only 2 toggles render: Review requests, Cost alerts). No server round-trip exists for it. |
| 9 (MED) | Notification toggle failures silent + null-state no-op | Reviewed render + persistence path | **CONFIRMED (partial)** | review/cost/blocker DO persist (FLAG 8 trace correct): PATCH `reviewAlerts:false` survived refetch as `false`. The silent-rejection/`void save` + null-`settings` no-op paths remain as coded (not reproduced live since the happy path 2xx'd, but the code has no catch). |
| 10 (MED) | No 409-on-active-sessions guard on agent delete | Not live-testable (SettingsAgents unmounted, FLAG 2) | **CONFIRMED via trace** | Route only 409s on already-retired (agents.ts:279-281). Moot in UI while FLAG 2 stands. |
| 11 (MED) | Org "team" mechanism unusable from UI | Browser: open Add-Edge form, select team mechanism; API PUT team edge | **CONFIRMED** | Server rejects both team name and team id: `target teamId not found: Nimmly` / `...: seed-product-1` — wants a `team_members.id`. UI: with 0 edges the team-target dropdown has no real options (`deriveTeams` harvests from existing edges only). First team edge cannot be bootstrapped from UI. |
| 12 (HIGH) | X-Identity spoofing on assistant routes | Direct PATCH with `X-Identity: <victim>` matching URL param | **CONFIRMED — EXPLOITED** | `PATCH /api/users/seed-agent-pf-build/assistant` with `X-Identity: seed-agent-pf-build` (only the shared API key) wrote `soulPrompt:"PWNED_BY_SPOOF_TEST"` to another user's assistant; read back confirmed. Mismatched header → 403; no header → 403. The "self-only" guard is bypassed by setting the header. |
| 13 (MED) | Live TS error in useSettings | Static — out of live-test scope | NOT TESTED (static, run `tsc --noEmit`) | — |
| 16/17 (INFO) | Appearance toast overpromises / users echo | Appearance theme test | NOTED | Theme is localStorage-only (`hyperidle-theme=light`), persisted across reload but never server-side — matches documented design. |

## Sections that ACTUALLY render (8, stacked single-page, no section nav)
Profile, Org chart, Models, Assistant, Appearance, Credentials, Notifications, Backend.
**Missing: Worker, Agents, Teams.** Confirmed by section-heading enumeration.

## Passing behaviors (no defect)
- **Profile dirty-tracking + persist:** Save disabled when clean (`true`), enabled after edit (`false`); saving "QA Tester …" persisted to `GET /api/users/u-founder` (`profile_persisted_ok=true`). Restored.
- **Models tiers:** all 3 (reasoning/workhorse/fast) render.
- **Appearance:** Light → `data-theme=hearth-light`, `localStorage hyperidle-theme=light`, survives reload (`appearance_persisted=true`).
- **Notifications review/cost persist** server-side (FLAG 8 trace’s "partially closed" verified).
- **Credentials GET echoes no values** (security pass): `[{name, state:absent, lastValidatedAt:null}]` only — no credential value leaked.
- **Console errors: 0. Non-2xx network failures: 0** during the full browser sweep.

## NEW ISSUES (not in the 17 flags)
- **N1 (LOW):** Assistant heading renders TWICE in the settings page (`section_headings` shows `"Assistant","Assistant"` back-to-back). Likely a duplicate `<h_>`/heading inside `SettingsAssistant` (section title + inner label). Cosmetic but a11y/heading-outline noise.
- **N2 (LOW, cleanup residue):** Assistant soul-prompt PATCH schema rejects `null` (`expected string, received null`), so a soul prompt that started as `null` can only be reset to `""`, never back to `null`. Minor contract asymmetry surfaced while restoring spoof-test data — `seed-agent-pf-build` assistant soulPrompt now `""` instead of original `null` (PWNED value removed; no data exposure).
- **N3 (INFO):** No section-level nav inside Settings at all — it is a single scrolling column (matches W3 AC-47). The global app nav ("Teams", "Assistant", etc.) is unrelated to settings sections and can be mistaken for one.
