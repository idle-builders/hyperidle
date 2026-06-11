# AF15 — Code Review (Phase 4)

**Verdict: NOT DONE** — code is functionally correct and all 6 ACs are satisfied, but the builder **deviated from the approved plan** by keeping dead code it was explicitly instructed to delete, and justified the deviation with a **factually false `@lore`/comment** that re-introduces the exact stale claim AF15 was supposed to purge. One WARNING must be fixed before ship; one minor comment is actively false.

Gates: `npm run check` PASS (12/12 packages). `npm run lint` PASS (warnings/infos only, baseline). `npm run knip` PASS. AF15 tests: 22 web + 21 integration, all green.

---

## AC table

| # | AC | Verdict | Evidence |
|---|----|---------|----------|
| 1 | Launch sections reachable; non-launch removed | **PASS (functional) / WARNING (catalog)** | `SettingsPage.tsx:85-94` mounts `SettingsAgents` (`settings-section-agents`), `:137-146` mounts `SettingsWorker` (`settings-section-worker`). `SettingsTeams` never built — correctly absent. **BUT** the dead `SETTINGS_SECTIONS` trio was NOT deleted (plan task 6 + design §1). See WARNING-1. |
| 2 | Editing one model tier does not erase another tier's credential | **PASS** | `server-config.ts:202-225` `mergeTier` preserves `current.apiKey` on omitted patch; drops on provider-away; `model-gateway.ts:55-96` deep-partial schema with the 3 guards exactly as specced. Test `AF15-model-gateway-partial.integration.test.ts:145` proves `reasoning.hasApiKey` stays true after `fast.model` patch; `:176` proves provider-away drops key. All 10 cases green. |
| 3 | Backend section reports actual mode | **PASS** | `SettingsBackend.tsx:21-27` `resolveBackendState()` reads `window.__HYPERIDLE__.backendMode`; three states mapped at `:29-44`. Dead `isLocal=true` removed. Test `AF15-SettingsBackend.test.tsx`. |
| 4 | Re-running setup doesn't duplicate teams | **PASS** | `teams-routes.ts:333-342` first-team guard returns existing at 200. Test asserts team count=1, teamMembers=1, AI-agent count unchanged after 2nd POST; fresh DB still 201. |
| 5 | Persistent-looking toggles persist; non-persistable not shown as persistent | **PASS** | No dead toggle in UI (design §2 audit). Email-digests confirmed absent (`AF15-SettingsPage.test.tsx`). Mute persists factory-level (per-user deferred per arch, not an AC). |
| 6 | First org relationship creatable from UI incl. solo founder via `function` | **PASS** | `org.ts:54-64` GET returns `teams:{id,name}[]` (teamMembers⋈teams, non-dissolved). `SettingsOrgChart.tsx` deletes `deriveTeams`, sources select from `data.teams` (id value/name label), relaxes solo short-circuit, defaults mechanism to `function`. Tests prove team-edge 201, function-edge 201 + round-trip, solo form renders. |

---

## CRITICAL
None.

## WARNING

**WARNING-1 — Dead `SETTINGS_SECTIONS` catalog retained against the plan, with a false justification.**
- Plan task 6 + Contracts §5 + design §1 + Migrations: **delete** `SETTINGS_SECTIONS`, `SettingsSection`, `SettingsSectionId` (zero live consumers; "only stale `SettingsWorker` `@lore`"). The builder instead **kept and edited them** (`settings-types.ts:22-49`).
- Builder's justification (`settings-types.ts:13-17`): *"AppShell uses SETTINGS_SECTIONS for its sidebar nav; the plan's 'zero live consumers' claim was incorrect (grep missed AppShell)."* **This is false.** Word-exact grep across `packages/web/src`: `SETTINGS_SECTIONS` appears ONLY in its own definition and three comment lines (two in `SettingsWorker.tsx`, one in `settings-types.ts`). `layouts/AppShell.tsx` and `shell/Sidebar.tsx` contain **no reference**. `SettingsSectionId`/`SettingsSection` have zero importers. The only live imports from `settings-types.ts` are `AgentConfig` and `SettingsData`.
- This is self-contradictory: the same builder removed the identical "AppShell filters SETTINGS_SECTIONS" claim from `SettingsWorker.tsx:9-12` as *stale and grep-disproven*, then re-asserted it in `settings-types.ts:13` to keep the dead code alive.
- **Fix:** delete the trio per the plan (`SETTINGS_SECTIONS`, `SettingsSection`, `SettingsSectionId`) and the false `@lore` at `settings-types.ts:13-17`. Keep `TeamSetting`/`UserSetting`/`SettingsData`/`AgentConfig` etc. (correctly retained). `npm run check` will confirm zero dangling refs.

## MINOR / SLOP

**MINOR-1 — Actively false comment at `settings-types.ts:47-48`** (the spot-check item). `// "worker" is filtered by AppShell to only show in shared-mode Electron` — no such filter exists (the builder itself proved this when removing the twin claim from SettingsWorker). If the trio is deleted per WARNING-1 this vanishes; if for some reason it survives, the comment must go. Trivial, false, flagged.

**MINOR-2 — Weak assertion (non-blocking).** `AF15-model-gateway-partial.integration.test.ts:100` "re-key" case asserts only `status===200`, not that the new key replaced the old. The headline preservation/drop tests cover merge semantics, so coverage is adequate; consider asserting the replacement to harden.

## Informational (not blocking)

- `AppShell.P4-settings.test.tsx:110-138` was edited (plan listed it as "frozen"). The **frozen artifact** — the `teams:[]`/`users:[]`/`mutedTeams:[]` mock shape (lines ~73-82) — is **intact**. The edited assertion (`getByText("Teams")` → `getAllByText("Agents")`, "7"→"9 sections") is benign: "Teams" came from the main sidebar team-roster, not a settings catalog; "Agents" is the new section heading. The removed `@lore U1` "Products→Teams" comment (spot-check item 1) was correctly dropped. No semantic regression.
- `W3-settings.test.tsx:188` relaxed `/local|shared/` → `/web|local|shared/` — correct, matches AC-3's new web state.

## Security (focus: no plaintext-at-rest / no secret exposure; AF11 coordination)
PASS. `mergeTier` carries `current.apiKey` (already-ciphertext) forward untouched; `encryptModelGatewayKeys`→`encryptTierApiKey` (`server-config.ts:283`) is idempotent (decrypt-detect leaves valid ciphertext). GET still strips via `sanitizeConfig` (test `:257`). Provider-away drops key (no orphaned ciphertext under wrong provider). No new path/SSRF surface. PATCH auth + rate-limit unchanged (`requireBoundary public-data`). No AF11 regression.

## Docs (`docs/guides/user/settings.md`) — `/write-docs` rubric

| Dim | Score | Note |
|---|---|---|
| Attention/lede | 4 | Opens with the concrete action (click Settings). |
| Scannability | 5 | Section table + sub-headings; strong F-pattern. |
| Progressive insight | 4 | Table → org/autonomy/backend/worker detail. |
| Accuracy vs code | 5 | Org direct/function/team, solo hint, 3 backend modes, worker shared-mode gate — all match code. |
| Activation | 4 | Tells solo founder to use Function edges (matches relaxed UI). |
| Concision | 4 | Tight, no filler. |
| Correct terminology | 4 | No banned terms; "Worker"/"Backend" consistent. |
| Completeness | 4 | Covers all launch sections incl. the two newly mounted. |
| Honesty | 5 | Worker correctly described as desktop+shared-only; no overpromise. |
| Structure | 4 | Logical order mirrors page. |
| **Total** | **43/50** | All dims ≥3. Doc claims verified against code. PASS. |

---

## What must change to reach DONE
1. Delete `SETTINGS_SECTIONS` / `SettingsSection` / `SettingsSectionId` from `settings-types.ts` per plan task 6, and remove the false `@lore` (lines 13-17) and the false worker-filter comment (lines 47-48). Re-run `npm run check` + `knip`.

That is the only blocking item. Everything else (ACs, security, docs, tests) is sound.
