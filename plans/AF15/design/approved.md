# AF15 — Settings reachability & persistence — Approved Design

```
DESIGN-CLASS: routine  ref=SettingsPage (stacked-page component family)  pattern=existing settings sections
```

User task: a user opening Settings reaches every launch section, and every control either persists or visibly admits it can't. One variant — the existing `SettingsPage` stacked-scroll family. No new component shapes; this is mounting, honesty, and one unblock. Stays inside the 19-component budget (zero net-new components).

---

## 1. Section reachability — mount vs remove (AC: no dead nav)

`SettingsPage.tsx` is a **single stacked scroll page**, not a sidebar nav. It hardcodes its `<section>` list (Profile, Org chart, Models, Assistant, Appearance, Credentials, Notifications, Backend). The `SETTINGS_SECTIONS` array + `SettingsSectionId` union in `settings-types.ts` are **vestigial** — grep confirms the only reference is a stale `@lore` comment in `SettingsWorker.tsx`; no live consumer. There is no rendered "nav" to go dead; "dead nav" here = sections that exist as code but are unreachable on the page, plus the misleading section-id catalog.

**Decisions:**

| Section | Built? | Tested? | Decision | Rationale |
|---|---|---|---|---|
| `SettingsAgents` | yes | yes (`X3-SettingsAgents.test.tsx`) | **MOUNT** | Agent config (soul prompt, harness, tier, sessions) is core to making the product yours. Reachable nowhere today. |
| `SettingsWorker` | yes | yes (`SettingsWorker.test.tsx`) | **MOUNT, self-gating** | Worker registration. Component already renders an honest desktop/shared-mode gate when the bridge is absent — safe to always mount; it degrades to an explanatory message in web/local. |
| `SettingsTeams` | **no component** | — | **REMOVE from catalog** | Referenced by `SettingsSectionId`/`SETTINGS_SECTIONS` but no `SettingsTeams.tsx` exists. Team membership is managed in the Work surface roster, not Settings. Drop the `"teams"` id + array entry. Do not build a stub. |

**Placement on the stacked page** (top → bottom, density-first — config the user touches most sits highest):

```
Profile → Org chart → Models → Agents (NEW) → Assistant → Appearance →
Credentials → Notifications → Worker (NEW) → Backend
```

- **Agents** sits directly after Models: both are "how my AI runs." Section title `AGENTS` (uses the existing `SectionTitle` 13px/600 uppercase).
- **Worker** sits just before Backend: both are runtime/host concerns. Section title `WORKER`.
- Both wrapped in the existing `<section id=… data-testid=…>` + `<SectionTitle>` pattern — identical to every other section. No new shape.

**Catalog cleanup:** only the **section-catalog trio** — `SETTINGS_SECTIONS` / `SettingsSection` / `SettingsSectionId` — is dead (zero live consumers; only a stale `SettingsWorker` `@lore`). Delete the trio; the `"teams"`/`"worker"`/`"agents"` ids vanish with the union. **`TeamSetting`/`UserSetting` are NOT dead and are KEPT** — they back `SettingsData.teams`/`.users`, consumed by `useSettings.ts` (corrected in arch; the earlier "knip-dead" claim was a factual error caught in critique). Design requires: **no section id in the catalog that has no rendered section** — satisfied by deleting the trio.

---

## 2. Honest toggle affordances (AC: a control that can't persist must not present as persistent)

Audit of every settings control:

| Control | Surface | Persists via | Verdict |
|---|---|---|---|
| Notification type mutes | `SettingsNotifications` | `useNotificationMute` → `PUT /api/notifications/mute/:key` | Persistent — correct. AF15 backs this with per-user persistence (arch). |
| Theme swatch cards | `SettingsAppearance` | `useTheme` | Persistent — correct. |
| Worker enable / pause / max-concurrent | `SettingsWorker` | Electron bridge (`window.__HYPERIDLE__.worker`) | Persistent **in shared-mode Electron only**; component already gates honestly otherwise. Correct. |
| Model tier fields | `SettingsModels` | debounced `PATCH /api/model-gateway` | Persistent — but the **save clobbers adjacent tier keys** (fixed in arch, not a design issue). |
| Org Add-Edge: `mechanism="direct"` target (user select) | `SettingsOrgChart` `AddEdgeForm` | `PUT /api/org/edges` → `orgEdges.target` (user id) | Persistent — correct. Server validates target against `users.id`. |
| Org Add-Edge: `mechanism="function"` target (free-text role) | `SettingsOrgChart` `AddEdgeForm` | `PUT /api/org/edges` → `orgEdges.target` (open string) | **Persistent — verified.** Server schema `putOrgEdgeSchema` = `z.string().min(1)`; route (`org.ts` `mechanism==="function"` branch) only requires non-empty; value stored verbatim in `orgEdges.target`, returned in `GET /api/org` `edges[]`, rendered in the edge table (`edge.target`). **Round-trips fully.** No teams and no second human required — this is the real solo-founder first-relationship path (see §3). |
| Org Add-Edge: `mechanism="team"` target (team select) | `SettingsOrgChart` `AddEdgeForm` | `PUT /api/org/edges` → `orgEdges.target` (teamMembers.id) | Persistent once the select is sourced from real teams (arch §4). The dropdown is the only honesty risk and it's a *data-source* bug, not a persistence one — the write path itself is sound. |
| ~~Email digests~~ | — | — | **Already removed by AF8.** No longer in the UI. AC satisfied by prior work; AF15 must not reintroduce it. |

**Design conclusion:** there is **no remaining dead toggle in the UI.** No honest-affordance redesign is required — only a verification gate (a test asserting Settings renders no control without a persistence path). The "Saving…" transient in Models and the toast on save are the persistence-feedback affordances; keep them. Worker's bridge-absent message is the honest "cannot act here" affordance; keep it.

If any future control genuinely cannot persist, the honest pattern (documented here for re-use, not built now): render it **disabled** with a 12px `--text-tertiary` caption stating why (e.g. "Requires the desktop app"), never as an interactive-looking enabled control. This mirrors `SettingsWorker`'s existing gate copy.

---

## 3. First org-chart relationship — unblock team-edge creation (AC: a first relationship can be created from the UI)

**The bug (UX-visible):** `SettingsOrgChart` derives the "team" target dropdown from *existing* `mechanism="team"` edges (`deriveTeams(edges)`). On a fresh org there are no such edges, so the Team-target select is **empty** — the first team edge is uncreatable. Circular dependency: you need a team edge to create a team edge.

Compounding: the server expects `mechanism="team"` target to be a **`teamMembers.id`** (org route line 106-118), but the UI feeds it a derived *team name string* → even a typed value fails validation. The UI's team concept and the server's team concept disagree.

**Design decision — make the Team target a real, populated source.** The Team-target control must offer the actual teams that exist in the system (the `teams` / `teamMembers` the user created during setup), not a self-referential derivation. Concretely:

1. The `function` mechanism path is the **primary solo first-relationship path** (target = free-text role; zero dependencies — no second human, no team; persists + round-trips, audit §2). The `direct` path **also works end-to-end** (target = a user from the `users` list) *when a second human exists*. Either satisfies "a first org-chart relationship can be created from the UI"; `function` is the one that holds on a fresh solo org.
2. For `team` mechanism: replace `deriveTeams(edges)` with a real team list sourced from the API. The Add-Edge form's Team select populates from the system's teams (id + name), and submits the team's **id** (matching server expectations) while displaying its **name**. Architecture owns whether `GET /api/org` is extended to return a `teams: {id,name}[]` array or a separate fetch — design requires: **the Team target select is populated from real teams and submits an id the server accepts.**
3. Remove the `deriveTeams` circular derivation entirely.

**Solo short-circuit interaction (important):** `SettingsOrgChart` currently returns an explanatory message and renders **no Add-Edge UI** when exactly 1 human user exists (line 188). That is correct for *direct* (human→human reporting) edges — there's no second human to point at. But it must not block *team*/*function* edges, which don't require a second human. Design decision: keep the solo guidance copy, but **still render the Add-Edge control** so a solo founder can create their first relationship. The guidance becomes a hint above the form, not a replacement for it.

**The solo founder's real first-relationship path is `mechanism="function"`** (free-text role), NOT `team`. Verified: `function` requires zero teams and zero second human; it persists and round-trips (audit §2). So the form, when relaxed for a solo founder, must default the mechanism to `function` (or at minimum not pre-select `team`/`direct`, both of which dead-end for a lone human). The solo hint copy: *"Add a function (e.g. 'Engineering', 'Design') to describe your role, or add a second human to define reporting lines."* — it names the affordance that actually works on the same form.

**Dead-end-loop fix (critique WARNING — verified against code):** the prior "No teams yet — create one in Work" placeholder is a **dead end**. The ONLY team-creation path in the entire web app is `SetupFlow.tsx` (`POST /api/teams`); there is **no Work-roster "create team" affordance** (`WorkTeam.tsx` manages an existing team's agents, it does not create teams). Pointing a post-setup solo founder to "Work" to make a team is illusory — the same circular dependency this WP exists to kill. **Resolution:** do not route the user to a non-existent affordance. The empty-`team` state must instead steer them to the path that works:

**Empty states:**
- No edges yet: keep "No edges defined." + the `+ Add Edge` button (existing).
- Team select with zero teams: a single **disabled** option, copy = *"No teams yet — use a Function relationship instead, or run Setup to create your first team."* This points only at affordances that genuinely exist (the `function` mechanism on this very form; the Setup flow which is the real team-creation surface). It does **not** claim Work creates teams. The `team` mechanism is simply not the first-relationship path for a fresh org — `function` is.

No new component — this is the existing inline `AddEdgeForm` with a real data source and the solo guard relaxed.

---

## 4. Component mapping (zero net-new)

| Element | Component | Source |
|---|---|---|
| Section wrappers + titles | `<section>` + `SectionTitle` | existing in `SettingsPage.tsx` |
| Agents table/edit/add | `SettingsAgents` | existing, mounted |
| Worker toggle/status | `SettingsWorker` | existing, mounted |
| Notification toggles | `Toggle` (design-system) | existing |
| Org Add-Edge form | inline `AddEdgeForm` | existing, data source fixed |
| Backend mode readout | plain text rows | existing `SettingsBackend` (source fixed in arch) |

Hearth tokens only. No `rounded-3xl`, no oversized padding, no new card grids. Section gap `--space-8` (24px, already used). Internal section gap `18px` (already used).

---

## 5. States (page-level)

- **Loading:** each section owns its skeleton (Agents/Org already have `skeleton` rows; Models has 3 skeleton bars). Backend/Worker render instantly.
- **Error:** per-section error text (`text-error` / `--status-error`) — pattern already present in Agents, Org, Models.
- **Empty:** Agents "No agents configured."; Org "No edges defined."; Worker honest bridge-absent message. All existing.
- **Populated:** the stacked sections.
- **Mobile:** Settings is one of the three mobile tabs already; the stacked single-column page is inherently mobile-friendly (`max-w-[680px] mx-auto`). New sections inherit this — no extra adaptation. Verify ≥44px touch targets on the new Worker toggle and Agents action buttons (AQ-015) — existing DaisyUI `toggle`/`btn-xs` sizing already used elsewhere on this page.

---

## 6. Rejected directions (did-we-consider)

- **(a) Build a `SettingsTeams` stub to satisfy the catalog reference.** Rejected — team membership lives in the Work roster; a Settings duplicate is scope creep and a second source of truth. Remove the dead reference instead.
- **(a) Hide Worker entirely in web/local mode (filter it out).** Rejected — always-mount + self-gating is more honest and matches the component's existing internal guard; a disappearing section is worse than an explained one. (This also kills the stale `@lore` claim that AppShell filters `SETTINGS_SECTIONS`, which no longer happens.)
- **(b) Re-introduce an "Email digests" toggle as a disabled honest control.** Rejected — AF8 removed it deliberately (digest is an egress mode, not a notification type). Reviving it, even disabled, contradicts the locked AF8 concept. Leave removed.
- **(b) Add a "Settings saved" global banner.** Rejected — per-section toasts + the Models "Saving…" transient already give feedback; a global banner is redundant chrome.
- **(c) Auto-create a default team edge on first load.** Rejected — silently writing org structure violates User Sovereignty; the user must create their first relationship explicitly. We unblock the control, we don't act for them.
- **(c) Free-text team name input for `team` mechanism.** Rejected — server validates target against `teamMembers.id`; a free-text name can never validate. Must be an id-backed select.
- **(c) Keep the solo short-circuit blocking all edge creation.** Rejected — it blocks legitimate team/function edges for a solo founder. Relax to show guidance + form.

---

## 7. Open questions for the architect

1. **Org teams data source:** extend `GET /api/org` to return `teams: {id,name}[]` (the `teamMembers` rows joined to `teams.name`), or add a separate fetch? Recommend extending `/api/org` — one round-trip, matches the existing denormalized-`users` convenience pattern.
2. **Section-id catalog:** RESOLVED — delete only `SETTINGS_SECTIONS`/`SettingsSection`/`SettingsSectionId` (the dead trio). **Keep `TeamSetting`/`UserSetting`** (they back live `SettingsData` fields; the earlier "delete them too" recommendation was based on the now-corrected false dead-type claim).
3. **Toggle-persistence guarantee test:** a component test asserting Settings renders no enabled-looking control lacking a persistence path — confirm this is the right shape vs. an E2E reload assertion (recommend both: component test for absence, E2E for the persist-across-reload AC).
