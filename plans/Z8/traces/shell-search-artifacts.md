# Z8 Trace — App Shell, Sidebar, Global Search, Mobile, Toasts, Hints, Setup, Artifacts, 404/Errors

Every interactive and display element in the shell/search/setup/artifact domain, traced DOM → handler → hook → fetch → route → Drizzle → table. All paths absolute under `/Users/tg/hyperidle`.

---

## Element Inventory

### AppShell (`packages/web/src/layouts/AppShell.tsx`, 795 lines)

Two layout branches keyed on `useViewportBreakpoint().sidebarMobile` (`hooks/useViewportBreakpoint.ts:23` — `matchMedia("(max-width: 768px)")`, reacts to both `resize` and MQL `change`).

| # | Element | File:line | Handler / chain | Backend |
|---|---|---|---|---|
| 1 | Keyboard Cmd/Ctrl+K (global toggle) | `hooks/useCommandK.ts:25-36` (document keydown, `preventDefault`) | toggles `isOpen`; consumed at AppShell.tsx:238 | none (opens panel) |
| 2 | Keyboard Escape (settings overlay) | AppShell.tsx:313-333 (capture-phase, `stopImmediatePropagation`) | closes settings; Cmd+K inside settings closes settings then `commandK.open()` | none |
| 3 | Keyboard Escape (mobile drawer) | AppShell.tsx:118-131 (capture-phase, only registered while `drawerOpen`) | `setDrawerOpen(false)` | none |
| 4 | Keyboard `N` (Conversations view only) | AppShell.tsx:412-434 | opens RecipientPicker; skipped when target is input/textarea/contentEditable; Escape closes picker | none |
| 5 | `?settings=open` URL param | AppShell.tsx:241-253 | opens settings overlay, strips param (`replace:true`) | none |
| 6 | `?onboarding=true` URL param (AE2) | AppShell.tsx:259-271 | auto-opens CocOverlay, strips param | none |
| 7 | Route-change drawer auto-close | AppShell.tsx:110-112 | effect on `location.pathname` → `setDrawerOpen(false)` | none |
| 8 | Filter reset on view change (AC 64) | AppShell.tsx:380-383 | `setConversationsFilter("all")` on `activeView` change | none |
| 9 | Mobile back button (`data-testid=mobile-back-button`) | AppShell.tsx:616-637 | `navigateToParent` (AppShell.tsx:172-191) — explicit parent paths, never `navigate(-1)` except unknown prefix | none |
| 10 | Mobile hamburger (`mobile-hamburger`) + attention dot | AppShell.tsx:639-670 | `setDrawerOpen(true)`; dot at :664 shows when `conversationsBlockingCount > 0 \|\| knowledgeTriageCount > 0` (:456) | derives from #s below |
| 11 | Mobile page title | AppShell.tsx:459-470, rendered :672 | prefix match on pathname → Conversations/Work/Knowledge/Agents/HyperIdle | none |
| 12 | Mobile search button | AppShell.tsx:675-696 | `commandK.open` | none |
| 13 | Mobile scrim (`mobile-scrim`) | AppShell.tsx:713-719 | onClick `setDrawerOpen(false)` | none |
| 14 | Mobile drawer (`mobile-drawer`, role=dialog, aria-modal) | AppShell.tsx:721-743 | `FocusTrap` (focus-trap-react) `initialFocus:false, allowOutsideClick:true, fallbackFocus:[data-testid='mobile-drawer'], displayCheck:"none"`; contains full `<Sidebar/>` at 280px | — |
| 15 | RecipientPicker (replaces Outlet when open) | AppShell.tsx:564-576 | `handleRecipientPickerSelect` → `navigate(/conversations/${encodeURIComponent(recipient.id)})`; Outlet stays mounted but hidden (:577-581) | RecipientPicker fetches `/api/recipients` (out of this trace's domain) |
| 16 | Outlet context | AppShell.tsx:582-597 (`AppShellOutletContext` :47-59) | `selectedThreadId` from URL param (:401-402), filter state, `onNewThread`, threads + status + retry passed down (single-fetch pattern, U6 review V1) | — |
| 17 | Settings nav items (sidebar, settings mode) | AppShell.tsx:474-493 | NavItem onClick → `setActiveSettingsSection` + `scrollIntoView` of `#settings-section-{id}` | none (SettingsPage does its own fetches) |
| 18 | "worker" settings section visibility | AppShell.tsx:199-208 | only when `window.__HYPERIDLE__.backendMode === "shared"` | none |
| 19 | SettingsPage in main pane | AppShell.tsx:545-552 (wrapped in ErrorBoundary) | — | out of domain |
| 20 | CocOverlay | AppShell.tsx:754-759 / 786-791 | open via Sidebar Assistant button (`handleCocClick` :214), `?onboarding=true`, close via `handleCocClose`; context refs add/remove (:222-228) | out of domain (assistant thread) |
| 21 | GlobalSearchPanel mount | AppShell.tsx:747-751 / 779-783 | `open=commandK.isOpen`, `onNavigate=handleSearchNavigate` (:335-366, see Search Pipeline) | GET /api/search |
| 22 | `sanitizeRouteId` (I4 MED-1) | AppShell.tsx:81-94 (exported) | rejects len>200, `[/?#\\\s]`, control chars (C0+DEL+C1 literal-byte class :88), `"."`/`".."`/contains `..`, scheme prefix `^[a-zA-Z][a-zA-Z0-9+.-]*:`; returns `encodeURIComponent(id)` | — |

Data feeding the shell:
- `useCurrentUser()` → GET `/api/auth/me` (avatar initials :523-530, participant id :370).
- `useTeams()` (`hooks/useTeams.ts:29`) → GET `/api/teams` → `routes/teams-routes.ts` GET / (see Badge Derivations).
- `useConversationsThreads(user?.id)` (`hooks/useConversationsThreads.ts:133`) → GET `/api/threads?participant_id=<id>&limit=50` → `routes/threads.ts`; short-circuits to `ready/[]` when no user (N5); WS `thread_created` on the "conversations" channel bumps a tick to refetch (:210-222).
- `useFetch("/api/knowledge/triage-count")` (AppShell.tsx:443).

### Sidebar (`packages/web/src/shell/Sidebar.tsx`)

| Element | File:line | Handler | Notes |
|---|---|---|---|
| Brand wordmark "HyperIdle" | :188-190 | display only | — |
| Section headers Conversations/Work/Knowledge | `SectionHeader` :121-148 | `onViewChange` → AppShell `handleViewChange` :282-305: conversations→`/conversations`; work→ AD3: exactly 1 team → `/work/team/:id` else `/work/portfolio`; knowledge→`/knowledge`. Always `setSettingsOpen(false)` first | `data-section-header`, `aria-label` |
| Conversations blocking badge (`conversations-blocking-badge`) | :211-218 | display; caps at "99+" | see Badge Derivations |
| Thread sub-items (max 5) | :220-267 | `onSelectThread` → `navigate(/conversations/${encodeURIComponent(id)})` (AppShell :404-409); `aria-current="page"` on selected; empty state "No threads yet" | items sliced twice — AppShell :496-504 slices to 5, Sidebar :178 slices again |
| Team sub-items (only when ≥2 teams, AD3) | :275-314 | `onSelectTeam` → `navigate(/work/team/${encodeURIComponent(id)})` (AppShell :515) | static accent dot per item — purely decorative, NOT a health dot |
| Knowledge triage badge (`knowledge-triage-badge`) | :326-333 | display; "99+" cap | see Badge Derivations |
| Settings nav block (settings mode only) | :338-345 | renders `settingsNavItems` from AppShell | — |
| Search hint row (`sidebar-search-hint`) | :353-367 | onClick `onSearchClick` = `commandK.open`; click-only `div` (biome-suppressed a11y), ⌘K kbd label | — |
| Avatar button (`sidebar-avatar-btn`) | :374-395 | `onSettingsClick` = `handleAvatarClick` (AppShell :307-310): section→profile, settings open | shows `avatarUrl` img or initials |
| Assistant button | :398-412 | `onAssistantClick ?? onCocClick` → toggles CocOverlay; `aria-expanded` | "Assistant" label but CoC-named props |

### ToastRegion (`packages/web/src/shell/ToastRegion.tsx`)

- `useToast()` (:36-42) throws outside provider. `showToast(message)` (:52-62): single-toast invariant, replaces current, clears prior timer, auto-dismiss 4000ms (`TOAST_LIFETIME_MS` :24). Render: DaisyUI `toast toast-end z-50` + `role="status"` alert (:77-84), `data-testid="toast-region"`. No DB/network. Wraps both layout branches of AppShell (:608, :767). Consumed e.g. by Conversations detail via raw `ToastContext` (Conversations.tsx:222 — deliberately not `useToast` so tests render without provider).

### ErrorBoundary (`packages/web/src/components/ErrorBoundary.tsx`)

- Class component; `getDerivedStateFromError` (:46), `componentDidCatch` logs to console (:50-56). Fallback (:70-92): `role="alert"`, "Something went wrong", Reload button → `onReload ?? window.location.reload()`. Dev-only raw `error.message` behind `error-boundary-dev-message` (security MED-2: prod never leaks). Mounted twice in AppShell (around SettingsPage :550 and around Outlet :555). Does NOT catch event-handler/async errors.

### NotFound (`packages/web/src/pages/NotFound.tsx`)

- Catch-all `*` route, mounted OUTSIDE AppShell (`router.tsx:95` — standalone, no sidebar). ErrorState with sad-face icon; "Go to conversations" → `navigate("/conversations")` (:63), "Go back" → `navigate(-1)` (:71). No backend.

### RedirectLegacyConversation (`packages/web/src/pages/RedirectLegacyConversation.tsx`)

- `/conversations/review` mounts with `paramName="id"`, `/conversations/chat` with `paramName="thread"` (router.tsx:63-70). Reads param, `.trim() || null` (L9 CRITICAL — whitespace-only id → queue, never 404), carries remaining query params forward (:55-57), `<Navigate replace>` to `/conversations/${encodeURIComponent(id)}` or `/conversations` (:59-63). `replace:true` prevents bounce-loop.
- Legacy `/work/product/:productId` → `RedirectProductToTeam` (router.tsx:38-41): `<Navigate to={/work/team/${productId ?? ""}} replace />`.
- `/settings` → `<Navigate to="/conversations?settings=open" replace />` (router.tsx:86-90).

### FirstRunRedirect (`packages/web/src/pages/FirstRunRedirect.tsx`)

- Index route under AppShell (router.tsx:54). Parallel checks (:25-34): GET `/api/auth/me` (`res.ok`) and GET `/api/teams` (`teams.length > 0`). Both pass → `/work/portfolio`; any failure/catch → `/setup` (N5: failure-safe toward setup). Blank screen while pending (:51). `<Navigate replace>`.

### SetupFlow (`packages/web/src/pages/SetupFlow.tsx`, route `/setup`, OUTSIDE AppShell)

| Element | Line | Behavior |
|---|---|---|
| Name input (`setup-name`) | :237-248 | required, autoFocus |
| API key input (`setup-api-key`, type=password) | :251-262 | required; "Your key stays on this device" |
| Folder picker button | :275-297 | only rendered when `window.__HYPERIDLE__?.shell?.selectFolder` exists; `handleFolderPick` :135-138 awaits Electron bridge |
| Repo path input (`setup-repo`) | :298-313 | optional free text |
| Preset pills (software / Eng+UX / Full team / Growth / Custom) | :328-354 (`PRESETS` :35-45) | `aria-pressed`; switching away from custom resets chips (:339-341) |
| Custom function chips | :358-381 | `toggleCustomFunction` :122-126; from `TEAM_FUNCTIONS` (@hyperidle/shared) |
| Roster preview (`roster-preview`) | :384-389 | `rosterPreviewLabel` :53-62 → `defaultRoster(functions)` + `AGENT_ROLE_CATALOG` labels |
| Submit "Start HyperIdle" | :405-408 | disabled until `canStart` :132-133 (name + apiKey nonempty, functions valid, not submitting) |
| Error line | :393-401 | `role="alert"` with `submitError` |

**Submit chain** (`handleSubmit` :141-203):
1. `apiFetch POST /api/users` body `{name}` → `routes/users.ts` `createUserSetupRoute` (:69-146), mounted PRE-auth (`app.ts:270`) after rate limiter. Zod `{name 1..200, email? }`. If a human user already exists: requires `X-API-Key === process.env.HYPERIDLE_API_KEY` (constant-time compare, :100-110) and returns the existing human **200 (idempotent)**; otherwise inserts `users` row (kind=human, role=founder) **plus** deterministic assistant agent `ast-{id}` (AD8b, :131-143), returns 201. Tables: `users` (insert ×2, select).
2. `apiFetch POST /api/teams` body `{name: derivedTeamName, repoPath?, functions, userId}` → `routes/teams-routes.ts:319` (behind auth middleware). Team name derived from repo basename via `split("/")` or "My Team" (:169-171). Server: inserts `teams`, `team_members`, one `users` row per `defaultRoster()` role (soul template lookup in `factory_settings`), sets `leadAgentId` (prefers product_manager), best-effort welcome message in assistant thread `thr-ast-{userId}` (upserts assistant stub if missing). Tables: `teams`, `team_members`, `users`, `factory_settings` (read), `threads`/`messages` (welcome).
3. Credential: `window.__HYPERIDLE__.credentials.set("anthropic", key)` — **only when the Electron bridge exists** (:191-193).
4. `navigate("/work/portfolio?onboarding=true")` → AppShell auto-opens CocOverlay (AE2).

### api-fetch (`packages/web/src/services/api-fetch.ts`)

- `apiFetch` (:63-79): injects `X-API-Key` only on `/api*` URLs (`isApiUrl` :38-53 handles string/URL/Request, bare `/api`, `/api?`). Key resolution (:18-36): `window.__HYPERIDLE__.apiKey` (Electron) → `VITE_HYPERIDLE_API_KEY` → dev fallback literal `"hyperidle-dev-local"` → undefined (falls through; server 401 is the signal). Never overrides caller-supplied `X-API-Key`. Server side: auth middleware sets `c.set("userId", …)` (human user id, fallback `"u-founder"` — `middleware/auth.ts:198,229`).

### ArtifactPermalink (`packages/web/src/pages/ArtifactPermalink.tsx`, route `/artifacts/:id`, router.tsx:85)

- `useArtifact(id)` (`hooks/useArtifacts.ts:26-28`) → `useFetch` GET `/api/artifacts/${encodeURIComponent(id)}` → `routes/artifacts.ts:256-278`: select `artifacts` inner join `tasks` on `producingTaskId` where `artifacts.id = :id` limit 1 → 404 `{NOT_FOUND}` or `rowToArtifact`. States: loading text (:18), 404 → EmptyState "Artifact not found" (:22-27), other error → ErrorState (:28-32), populated → `<ArtifactPreview data>` + `<HostThreadSection hostKind="artifact" hostId>` (:36-39; thread surface posts via `/api/threads` family, L18).

### ArtifactSection (`packages/web/src/components/ArtifactSection.tsx`)

- `useArtifacts(filter, {limit})` (`hooks/useArtifacts.ts:19-24`) → GET `/api/artifacts?axis={task|bet|product|portfolio}&taskId/betId/teamId&limit` → `routes/artifacts.ts:146-254`: axis fan-out (bet/product resolve task ids from `tasks`, capped `MAX_TASK_ID_FANOUT=1000`), composite cursor `(createdAt,id)`, `limit+1` over-fetch, `desc(createdAt), desc(id)`, default 50, hard cap 200. Layouts: gallery → `ArtifactGalleryCard` grid; stack → `ArtifactStackItem` list; single → `ArtifactPreview(items[0])`. Default open handler navigates `/artifacts/:id` (:90). Overflow "View all" is a deliberate non-interactive `<span>` (L12 B-3, :207-214). Empty without heading → renders null (TaskSheet pattern).
- Write paths (agent-facing, not UI-triggered): POST `/api/artifacts` (:280-328, 64KB body limit, zod kind∈ARTIFACT_KINDS, kind/preview discriminant check, insert `artifacts`); PATCH `/api/artifacts/:id/preview` (:330-354, write-once: updates only `preview_json IS NULL`, else 409 IMMUTABLE).

### DB tables

- `artifacts` (`packages/db/src/schema.ts:762-779`): id PK, producing_task_id FK→tasks (restrict), kind text (open), label text (AE6), preview_json text, created_at; indexes on producing_task_id and created_at. Cost columns stripped in O2.
- `hint_progress` (`schema.ts:831-841`): user_id FK→users (cascade), hint_id, seen_at; composite PK (user_id, hint_id).

---

## Search Pipeline Trace

**Client:** Sidebar hint click / mobile search button / Cmd+K → `useCommandK` → `GlobalSearchPanel` (`components/GlobalSearchPanel.tsx`).

1. Panel reopen clears state (`search.clear()` :52-57; clear aborts in-flight fetch first — I4 W7, `useGlobalSearch.ts:328-341`).
2. `SearchField` value → `useGlobalSearch.setQuery` → effect (`useGlobalSearch.ts:274-321`): empty query → synchronous reset + abort (I4 N2); else 150ms debounce (`DEBOUNCE_MS` :46) → abort previous controller → `runSearch` (:228-264) → `apiFetch("/api/search?q=" + encodeURIComponent(query))`.
3. Response parsing (:208-220): per-row type-guard parsers (`parseConversation`/`parseWork`/`parseKnowledge`, :119-174) drop malformed rows; **all-malformed non-empty response → explicit error** "Search results could not be parsed" (I4 C4) instead of silent "No matches". Work parser accepts `team` or legacy `product` (U5 compat).
4. Rendering: three grouped sections (Conversations→ThreadRow, Work→BetCard, Knowledge→KnowledgeRow); all titles/snippets rendered as React text nodes — **no HTML injection surface**. 404 error → "Search coming soon" EmptyState (S-02, :150-172); other errors → ErrorState. Keyboard: `useKeyboardNavigation` (ArrowUp/Down wrap, Enter selects flat index, Escape closes); flat item list built :60-72. FocusTrap with `displayCheck:"none"`; backdrop click closes (:291). Recent-queries row is a static placeholder (:281-287).
5. Navigation: `onNavigate(type,id)` → AppShell `handleSearchNavigate` (:335-366): closes panel, runs **`sanitizeRouteId`** (I4 MED-1) per type → `/work/bet/:id`, `/knowledge/:id`, `/conversations/:id`. Unsafe work/knowledge id → silent return; unsafe conversation id → falls back to `/conversations`; unknown type → `/conversations`.

**Server:** `routes/search.ts` `createSearchRoutes` mounted at `/api/search` post-auth (`app.ts:433`).

- Validation: `q` trimmed, zod `min(1).max(200)` (:82-97; I2 HIGH-5 length cap). `pattern = %escapeLikePattern(q)%` (`services/like-escape.ts` — escapes `\`, `%`, `_`; clauses carry `ESCAPE '\\'`). Parameterized via Drizzle `sql` — no SQL injection.
- **Category 1 — conversations** (threads + messages): `threads ⋈ messages` where `threads.participants LIKE %"{escaped userId}"% ESCAPE '\\'` AND `messages.payload ILIKE pattern` AND `messages.deletedAt IS NULL`, `limit 50` (5×10 over-fetch, :126-145). JS dedupe + exact participant verification by parsing the participants JSON array (:148-163, prevents substring false-positives), capped at 5. Then 2 batch queries: thread rows ordered `lastActiveAt DESC` (:181-185) and all non-deleted messages ordered `createdAt ASC` (:192-202); first message text (≤80 chars) = title, last = snippet (≤120), `hostKindToConversationKind` maps bet/task/knowledge_item/artifact→"review", else "chat" (:48-58). Tables: `threads` (select ×2), `messages` (select ×2).
- **Category 2 — work (bets)**: `bets ⋈ teams` where `description|hypothesis|doneCondition ILIKE pattern`, `ORDER BY bets.createdAt DESC LIMIT 5` (:240-258). **No auth boundary** — intentional (team-scoped, @lore :237). Title via `deriveTitle(description, id)`. Tables: `bets`, `teams`.
- **Category 3 — knowledge**: `knowledgeItems LEFT JOIN knowledgeStrategyFabric` where `(scopeKind != 'user' OR updatedBy = userId)` AND `(title|body ILIKE pattern)`, `ORDER BY updatedAt DESC LIMIT 5` (:276-302). Null fabric → defaults layer "L0", kind "pattern" (:307-308). Tables: `knowledge_items`, `knowledge_strategy_fabric`.
- **Ranking:** there is none — per-category recency ordering only (lastActiveAt / createdAt / updatedAt DESC), 5-per-category caps, no scoring, no cross-category relevance.

---

## Badge Derivations

| Badge | Render site | Derivation | Refresh triggers |
|---|---|---|---|
| **conversationsBlockingCount (AD5)** | Sidebar.tsx:211-218 | AppShell.tsx:450-453: `conversationsThreads.threads.filter(t => t.hasUnresolvedReview).length`. `hasUnresolvedReview` is a server wire field on GET `/api/threads?participant_id=…&limit=50` rows; client guard `isThreadListRow` (useConversationsThreads.ts:67-85). Derived, NOT a separate fetch (AE4 lore :447-449). Counts only the user's first 50 threads. | initial fetch; WS `thread_created` on "conversations" channel (tick bump :210-222); manual `retry()`. **Not** refreshed when a review is resolved. |
| **knowledgeTriageCount (Y4)** | Sidebar.tsx:326-333 | AppShell.tsx:443-444: `useFetch<{count:number}>("/api/knowledge/triage-count")` → `routes/knowledge.ts:280-292`: `count(*)` from `knowledge_items` where `status IN ('draft','needs_human') AND (scope_kind != 'user' OR updated_by = userId)` — mirrors list-route visibility so other users' private items don't inflate. | **Once, at AppShell mount only.** AppShell persists across SPA navigation → stale after any triage action until full reload. |
| **Mobile hamburger attention dot (AE4)** | AppShell.tsx:664-669 | `hasAttentionItems = conversationsBlockingCount > 0 \|\| knowledgeTriageCount > 0` (:456) | inherits both stalenesses above |
| **Team agent counts + health dots** | **NOT in the Sidebar.** Sidebar team rows render a static decorative accent dot (Sidebar.tsx:303-307). The real counts live on WorkPortfolio.tsx:78-86,267-272 from GET `/api/teams` fields. | Server derivation, `routes/teams-routes.ts:222-290` (GET /): per team — `agentCount` = AI users where `users.teamId = team_members.id AND kind='ai'`; `activeAgentCount` = agents with any `sessions.state='active'` (batch `inArray` fetch, grouped); `agentHealthWarning` = any agent where `computeHealthSignals({sessions, harnessType, harnessAvailable}).degraded` (reviewer S4 — same logic as agent profile). Tables: `teams`, `team_members`, `users`, `sessions`, `bets`, `tasks`, `routines`. | one-shot per `useTeams()` mount (no cache, no poll, no WS) |
| **Sidebar thread list (top 5)** | Sidebar.tsx:220-267 | AppShell.tsx:496-504 slices threads to 5 with `{id,title,hasUnresolvedReview}`; titles are L8 placeholder stubs `"{HostKind} thread {id8}"` (useConversationsThreads.ts:104-123 — list endpoint emits no titles yet) | same as blocking count |

---

## Hint System Map

**Catalog** (`packages/shared/src/hint.ts`): closed union `HintId` of 6 ids; `HINT_CATALOG` entries `{id, copy, testId}`; `isHintId` guard (:74-76) used for server-side validation.

**Provider** (`packages/web/src/hooks/useHints.tsx`): `HintProvider` wraps the whole app (`App.tsx:18`). Boot fetch GET `/api/hint-progress` (:62-89) → `routes/hints.ts:27-36`: `select * from hint_progress where user_id = :userId` → `{dismissed:[{hintId,seenAt}]}`. Client filters ids through the catalog (:71-73). **API failure → `failed=true` → ALL hints hidden** (graceful degradation, P5 lore). `dismiss(hintId)` (:91-102): optimistic Set add + fire-and-forget POST `/api/hint-progress/:hintId/dismiss` → `routes/hints.ts:50-75`: `isHintId` 400 guard, `INSERT … ON CONFLICT DO NOTHING RETURNING` on `hint_progress` (composite PK userId+hintId) → 200 `{ok:true}` or 409 CONFLICT (client swallows both). `useHint(id)` (:125-141): `visible = ready && !failed && !dismissed.has(id)`; caller adds view-local trigger.

| Hint id | testId | Render site (visible && trigger) | Dismiss UI |
|---|---|---|---|
| `create-bet` | hint-create-bet | WorkTeam.tsx:192, rendered :307-321 | yes (:320 onClick dismiss) |
| `review-agents` (AB3) | hint-review-agents | WorkTeam.tsx:193, rendered :399-411 (`&& roster.length > 0`) | yes (:410) |
| `review-verdict` | hint-review-verdict | Conversations.tsx:218, rendered :425-439 (`&& hasReviewMessages`) | yes (:438) |
| `knowledge-empty` | hint-knowledge | KnowledgeList.tsx:763, rendered :700-714 | yes (:713) |
| `add-credential` | hint-add-credential | WorkBet.tsx:630, rendered :1085-1099 | yes (:1098) |
| `rail-indicators` | hint-rail | **NO render site anywhere** (grep: zero `useHint("rail-indicators")` calls) | **never shown, never dismissible** |

---

## Artifact Kind Matrix

AE6: kind is an open string; 6 fundamental kinds registered in `packages/shared/src/kinds/registry.ts` (`ARTIFACT_KINDS = text|code|image|data|html|url`). POST create constrains to the 6; reads are open. `OLD_KIND_MAP` (`kinds/old-kind-map.ts`) normalizes 13 legacy kinds at read time (`routes/artifacts.ts rowToArtifact` :85-141; stale discriminants re-injected for code; incompatible old text-like previews **nulled**). All rendering funnels through `ArtifactPreviewSurface` (`design-system/src/ArtifactPreviewSurface.tsx`) → `getKindDefinition(kind).summarize(preview)` — i.e. **every kind renders as a one-line text summary**, sizes gallery (96px) / full (240px).

| Kind | Preview schema (`packages/shared/src/kinds/*.ts`) | `displayTitle` | `summarize` (what the user actually sees) | Real renderer? |
|---|---|---|---|---|
| text | `{kind:"text", body, format? md\|plain}` | null (falls to task title) | first 120 chars of body + "…" | no markdown rendering |
| code | `{kind:"code", file, hunks[{header,lines[{add\|del\|ctx,text}]}]}` | file path | `"{file} (+adds -dels)"` | no diff view |
| image | `{kind:"image", url, width, height, alt?}` | null | `"W×H"` | **image never displayed** |
| data | `{kind:"data", headlines[{label,value}], rows?, charts?}` | null | `"label: value · …"` joined headlines | no table/sparkline |
| html | `{kind:"html", html, title?}` | title ?? null | title or `"HTML preview (N chars)"` | **html never rendered** (no XSS risk, no value either) |
| url | `{kind:"url", url, status? ok\|degraded\|down, statusLabel?}` | url | `"url — statusLabel/status"` | **not a clickable link** |
| (unregistered) | `fallbackPreviewSchema` accepts any object (server) | — | surface shows `"{kind}: preview not available"` (:37) | fallback |
| (null preview) | — | — | "PREVIEW PENDING" / "PREVIEW NOT YET RENDERED" (:20-22) | placeholder |

Companion chips: `ArtifactKindBadge` (uppercased `kind.replace(/_/g," ")`, any string). `ArtifactCostChip` (`design-system/src/ArtifactCostChip.tsx`): `money === null` → em dash "—" (L17 pending signal); full variant adds token total via `totalTokens`. `ArtifactTimestamp` for createdAt. Thread pill on GalleryCard/StackItem renders only when `data.threadCount > 0`.

---

## FLAGS

**HIGH**

1. **Setup re-submission creates duplicate teams + full agent rosters.** `/setup` is always routable (router.tsx:47); nothing redirects away when setup is complete. POST `/api/users` is idempotent (returns existing human, users.ts:104-110), but POST `/api/teams` (teams-routes.ts:319) has **no idempotency/uniqueness** — every re-submit inserts a new `teams` + `team_members` + N `users` agent rows. One stale tab or curious revisit = a phantom team forever in the sidebar.
2. **API key silently discarded outside Electron.** SetupFlow step 3 (`SetupFlow.tsx:191-193`) only stores the required "Anthropic API key" when `window.__HYPERIDLE__?.credentials?.set` exists. In a plain browser the field is mandatory, collected, then dropped with no error and no fallback (e.g. POST /api/credentials) — user believes their key is saved.
3. **`rail-indicators` hint is dead AND violates the Rail purge.** Defined in `packages/shared/src/hint.ts:54-58` with copy describing the deleted Rail ("Active bets, blockers, and cost alerts appear here"); zero render sites; can never be shown or dismissed; server still accepts its dismissal. The Rail purge is a stated hard requirement — this is a surviving occurrence in shared code.

**MEDIUM**

4. **Search thread candidate set is nondeterministic.** `matchingThreadRows` (search.ts:126-145) is a join with `LIMIT 50` and **no ORDER BY** — for common terms the DB returns arbitrary rows, the JS cap takes the first 5 verified, so the user's most recent matching conversations can be invisible while stale ones rank.
5. **Message search probes raw JSON, not message text.** `messages.payload ILIKE %q%` (search.ts:140) matches JSON structure: queries like `text`, `type`, `kind`, `{` match essentially every message, returning junk conversation hits. Title/snippet extraction parses `.text`, but matching doesn't.
6. **knowledgeTriageCount badge never updates.** Fetched once at AppShell mount (AppShell.tsx:443) and AppShell never remounts during SPA navigation — triaging knowledge items leaves the Y4 badge (and the mobile attention dot) stale until a hard reload.
7. **conversationsBlockingCount (AD5) only refreshes on `thread_created`.** Resolving a review emits no refetch (useConversationsThreads.ts:210-222 listens for one event type) — the blocking badge over-counts after reviews are resolved until another thread is created or a manual retry.
8. **Artifact `threadCount` is hardcoded 0 server-side** (artifacts.ts:138 and :323) while `ArtifactGalleryCard`/`ArtifactStackItem` ship "N threads" pill logic gated on `count > 0` — the pill is unreachable dead UI against the real API.
9. **ArtifactCostChip is permanently "pending".** O2 stripped cost columns; the route always returns `NULL_COST` (artifacts.ts:67), so every chip renders "—" forever and the full-variant token branch is dead code. The POST body still accepts cost and silently ignores it (wire-compat trap for agent authors).
10. **No artifact kind has a real renderer.** Per the matrix: images render as "W×H" text, html as a char count, code as "+a -d", url as non-clickable text. The `/artifacts/:id` "single_full_preview" surface is a 240px text box for all 6 kinds. Not a regression, but the kind system's display value is currently ~zero.
11. **Setup re-auth uses raw env compare, not the auth middleware.** users.ts:101-103 compares `X-API-Key` to `process.env.HYPERIDLE_API_KEY` directly — a shared-mode user authenticated via bearer login session (auth.ts:109) would get 401 from this pre-auth route even though they're authenticated elsewhere; also bypasses any future key-rotation logic in the middleware.

**LOW**

12. `RedirectProductToTeam` with a missing/empty param navigates to `/work/team/` which matches no route → lands on NotFound instead of the portfolio (router.tsx:40).
13. NotFound mounts outside AppShell — 404s lose all navigation chrome; "Go back" is `navigate(-1)` which on direct entry exits the app/history.
14. GlobalSearchPanel `AVATAR_PLACEHOLDER` hardcodes cool gray `#374151` in a data URI (GlobalSearchPanel.tsx:40-41) — AQ-008/AQ-018 violation invisible to the color lint.
15. Sidebar search hint is a click-only `<div>` with biome a11y suppressions (Sidebar.tsx:351-353) — keyboard users must know ⌘K; no focusable affordance.
16. `handleSearchNavigate` inconsistency: an unsafe conversation id falls back to `/conversations`, unsafe work/knowledge ids silently no-op (AppShell.tsx:339-359) — same failure, two behaviors.
17. Search panel's 404 → "Search coming soon" branch (GlobalSearchPanel.tsx:150) is now dead-ish: `/api/search` is mounted whenever db exists (app.ts:433); the branch would mask a genuine route-loss regression as "coming soon".
18. Knowledge search result `layer` is parsed and validated client-side but never displayed (KnowledgeRow gets title/kind/status/timestamp only).
19. Recent-queries row is a permanent "No recent queries" placeholder (GlobalSearchPanel.tsx:281-287, deferred to J8+).
20. Sidebar thread titles are placeholder stubs (`"Task thread a1b2c3d4"`, useConversationsThreads.ts:104-113) — search results show real first-message titles for the same threads, so sidebar and search disagree on naming.
21. `escapeLikePattern` doc block describes SQLite semantics (like-escape.ts) while the stack is Postgres/PGlite with ILIKE — comment drift only; behavior correct.
22. HintProvider fetches once at boot — hint dismissals made in another session/device reappear locally until reload; the 409 duplicate-dismiss is swallowed (acceptable, but indistinguishable from network failure in logs).
23. CoC naming (`CocOverlay`, `onCocClick`, `cocOverlayOpen`, `CocContext`) persists through AppShell/Sidebar despite the CoS/CoC purge directive; Sidebar already exposes `onAssistantClick` aliases but AppShell still wires the deprecated props (AppShell.tsx:516-517).
24. Team-name derivation splits repo path on `/` only (SetupFlow.tsx:170) — a Windows path `C:\repos\app` becomes the entire string as team name.
25. GET/PATCH `/api/artifacts*` have no per-user/team boundary beyond the API key (routes built on bare `Hono`, no `userId` use) — any authenticated caller reads all artifacts and can set any artifact's preview once. Consistent with "bets are team-scoped" but worth noting as the only unscoped PATCH in this domain.
