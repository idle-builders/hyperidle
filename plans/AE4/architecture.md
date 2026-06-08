# AE4 Architecture Plan: Mobile & Responsive Access

## Required reading

- `plans/AE4/concept.md` -- concept check, doc contradiction list
- `plans/AE4/design/approved.md` -- approved design (drawer sidebar)
- `packages/web/src/layouts/AppShell.tsx` -- current shell layout
- `packages/web/src/shell/Sidebar.tsx` -- sidebar component
- `packages/web/src/hooks/useViewportBreakpoint.ts` -- viewport hook
- `packages/server/src/middleware/cors.ts` -- CORS middleware
- `packages/server/src/__tests__/cors.integration.test.ts` -- CORS tests
- `packages/web/src/__tests__/U6-viewport-breakpoint.test.ts` -- viewport tests
- `packages/web/src/__tests__/U6-AppShell-sidebar.test.tsx` -- shell tests
- `packages/web/index.html` -- HTML entry point
- `packages/design-system/src/tokens.css` -- Hearth tokens

## Plan reconciliation: spec vs reality

| Spec assumption | Reality | Resolution |
|---|---|---|
| `useViewportBreakpoint()` exists but unused | EXISTS. Returns `{ sidebarMobile: boolean }` at <= 768px. Tests exist in `U6-viewport-breakpoint.test.ts`. The hook is **imported nowhere** outside its own test file. | Consume the hook in AppShell. No changes to the hook needed. |
| Tailwind breakpoints configured | EXISTS. `tailwind.config.ts` has standard Tailwind breakpoints (sm: 640px, md: 768px, lg: 1024px). No custom breakpoints. | Use Tailwind responsive prefixes (`md:` for >= 768px). |
| CORS allows only localhost/127.0.0.1 | EXISTS. `cors.ts` hardcodes `ALLOWED_DEV_ORIGIN = "http://localhost:5173"` and `ELECTRON_ORIGIN_PREFIX = "http://127.0.0.1"`. No env-var override exists. | Add `HYPERIDLE_CORS_ORIGINS` env var support. |
| PWA manifest does not exist | CORRECT. No `manifest.json`, no service worker, no PWA meta tags. Only `favicon.svg` in public/. | Create manifest + icons + meta tags. |
| AppShell renders `Sidebar | main` unconditionally | CORRECT. AppShell.tsx line 373-486: `<div className="flex h-screen ..."><Sidebar .../><main ...>`. No viewport conditional. | Add conditional rendering based on `useViewportBreakpoint()`. |
| `--surface-overlay` is the scrim color | INCORRECT. `--surface-overlay` in tokens.css is a solid surface (#ffffff light / #352e23 dark) for modals/popovers. The scrim (translucent backdrop) is NOT a token. DaisyUI's `modal-backdrop` class or inline `rgba(26,21,16,0.55)` is used. | Use inline rgba for the drawer scrim, matching the DESIGN.md "Scrim" definition. |
| Sidebar width is `w-[200px]` | CORRECT. Sidebar.tsx line 178: `className="flex flex-col w-[200px] shrink-0 h-full p-[12px]"`. | In drawer wrapper, override width to 280px. |
| RichMessageCard verdict buttons wrap | CORRECT. Line 379: `className="... flex flex-wrap gap-[9px] ..."`. Buttons have `min-h-[44px]`. Already mobile-friendly. | No changes needed to RichMessageCard. |
| Conversations page detail header has 24px horizontal padding | CORRECT. Line 446: `px-[24px] py-[18px]`. | Reduce to `px-[12px]` on mobile for density. |
| Sidebar sub-items are ~32px height | CORRECT. Sub-item buttons have `py-[6px]` (6+6=12 vertical padding) + 13px font = ~30px rendered height. Below 44px. | Add responsive touch-target padding in drawer mode. |

## Phase 0 -- Interrogation

### Q1: Should AppShell pass sidebarMobile to child routes via outlet context?

**My read:** No. Child routes (Conversations, WorkTeam, KnowledgeList, etc.) need to know the viewport for layout decisions (e.g., stacking panels vertically instead of horizontally). But `useViewportBreakpoint()` is a lightweight hook they can call directly. Passing it through context adds coupling for no benefit.

**Decision:** Each page that needs viewport awareness calls `useViewportBreakpoint()` directly.

### Q2: Should the drawer use DaisyUI's drawer component or raw Tailwind?

**My read:** DaisyUI's drawer component uses a checkbox-toggle pattern (`<input type="checkbox" id="drawer">`) that doesn't play well with React state management. Every other overlay in the codebase (CocOverlay, GlobalSearchPanel, dialogs) uses React state + conditional rendering + Tailwind classes. Follow the existing pattern.

**Decision:** Raw Tailwind + React state. No DaisyUI drawer.

### Q3: Should mobile header height be 48px or derive from safe-area?

**My read:** 48px fixed height + `env(safe-area-inset-top)` padding. The safe-area inset adds space above the header for the notch/dynamic island. The header itself is always 48px. Standard iOS/Android PWA pattern.

**Decision:** 48px + safe-area-inset-top.

### Q4: Where does the back arrow logic live?

**My read:** In AppShell, not in individual pages. AppShell already knows the current route via `useLocation()`. It can derive "is this a detail route?" from the pathname pattern. Pages don't need to know about the mobile header.

**Decision:** AppShell derives `isDetailRoute` from `location.pathname` and renders back arrow vs hamburger accordingly.

### Q5: How to handle the drawer close on navigation?

**My read:** Add an effect in AppShell that closes the drawer whenever `location.pathname` changes. This covers all cases: tapping a sidebar item, using back arrow, or browser navigation. The sidebar's existing onClick handlers navigate (which triggers the effect), so no new props needed on Sidebar.

**Decision:** `useEffect(() => { setDrawerOpen(false); }, [location.pathname]);`

---

## Acceptance criteria + verification

### AC-1: Mobile browser authentication

**Criterion:** A founder can open the web app from a mobile browser at a non-localhost URL and authenticate via API key.

**Verification:** Integration test in `cors.integration.test.ts`:
- Set `HYPERIDLE_CORS_ORIGINS=https://hyperidle.local:3001`.
- Send request with `Origin: https://hyperidle.local:3001`.
- Assert `Access-Control-Allow-Origin: https://hyperidle.local:3001`.
- Send request with unlisted origin.
- Assert no `Access-Control-Allow-Origin` header.

### AC-2: Sidebar collapses to drawer at mobile viewport

**Criterion:** At viewport <= 768px, the sidebar is not visible in the normal flow. A hamburger button opens it as a left-edge drawer.

**Verification:** Component test in `AE4-mobile-drawer.test.tsx`:
- Set `window.innerWidth = 375`, render AppShell.
- Assert sidebar is NOT in the normal DOM flow (no `data-ds-shell="Sidebar"` in the main layout).
- Assert hamburger button (`data-testid="mobile-hamburger"`) is visible.
- Click hamburger.
- Assert sidebar appears in the drawer (`data-testid="mobile-drawer"` contains `data-ds-shell="Sidebar"`).
- Assert scrim is visible (`data-testid="mobile-scrim"`).
- Click scrim.
- Assert drawer is closed.

### AC-3: Views usable at 375px

**Criterion:** Conversations, Work, and Knowledge views render without horizontal overflow at 375px width.

**Verification:** Playwright E2E test:
- Set viewport to 375x812 (iPhone SE).
- Navigate to `/conversations`, assert no horizontal scrollbar.
- Navigate to `/work/portfolio`, assert no horizontal scrollbar.
- Navigate to `/knowledge`, assert no horizontal scrollbar.
- Verify content is visible and interactive.

### AC-4: Touch targets >= 44px

**Criterion:** All interactive elements meet 44px minimum touch target at mobile viewport.

**Verification:** Already enforced by ESLint rule `design/require-touch-target-min` at viewport <= 1024px. Additionally, the following specific elements need verification:
- Sidebar sub-items in drawer mode: add `min-h-[44px]` class.
- Filter chips: add `min-h-[44px]` class on mobile.
- Mobile header buttons: 48px (inherent).

Static enforcement via existing ESLint rule + visual inspection.

### AC-5: PWA manifest enables install-to-homescreen

**Criterion:** A `manifest.json` exists with correct values, linked from `index.html`.

**Verification:** Unit test in `AE4-pwa-manifest.test.ts`:
- Import/read `manifest.json` and assert required fields: `name`, `short_name`, `start_url`, `display`, `icons`.
- Assert `display` is `"standalone"`.
- Assert `icons` array contains 192x192 and 512x512 entries.

Plus: manual verification that "Add to Home Screen" prompt appears in mobile Safari / Chrome.

### AC-6: Review flow works end-to-end on mobile

**Criterion:** On a 375px viewport, a user can open a thread, read a review message, see verdict buttons, and tap a verdict.

**Verification:** Playwright E2E test at 375x812:
- Navigate to `/conversations/:threadId` (a thread with a review message).
- Assert RichMessageCard is visible.
- Assert verdict buttons (Approve, Reject, etc.) are visible and tappable.
- Assert mobile header shows back arrow.
- Tap back arrow, assert navigation to `/conversations`.

---

## Ordered task list

### Task 1: CORS configurable origins (server)

**Files:**
- `packages/server/src/middleware/cors.ts` -- modify `resolveOrigin()` to check `HYPERIDLE_CORS_ORIGINS` env var.
- `packages/server/src/__tests__/cors.integration.test.ts` -- add tests for env-var-based origins.

**Implementation:**

```typescript
// In cors.ts, before the export:
function parseConfiguredOrigins(): ReadonlyArray<string> {
  const raw = process.env.HYPERIDLE_CORS_ORIGINS;
  if (!raw) return [];
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

const CONFIGURED_ORIGINS = parseConfiguredOrigins();

// In resolveOrigin():
function resolveOrigin(origin: string, _c: Context): string | undefined {
  if (origin === ALLOWED_DEV_ORIGIN) return origin;
  if (origin === ELECTRON_ORIGIN_PREFIX || origin.startsWith("http://127.0.0.1:")) return origin;
  // AE4: configurable origins from HYPERIDLE_CORS_ORIGINS
  if (CONFIGURED_ORIGINS.includes(origin)) return origin;
  return undefined;
}
```

**Tests:**
- `vi.stubEnv("HYPERIDLE_CORS_ORIGINS", "https://hyperidle.local:3001,https://10.0.1.5:3001")`.
- Assert allowed origin returns correct header.
- Assert unlisted origin returns null.
- Assert empty env var = existing behavior.

**Depends on:** Nothing.

### Task 2: PWA manifest and icons (web)

**Files:**
- `packages/web/public/manifest.json` -- new file.
- `packages/web/public/icon-192.png` -- new file (generated from favicon.svg).
- `packages/web/public/icon-512.png` -- new file (generated from favicon.svg).
- `packages/web/index.html` -- add `<link rel="manifest">` and Apple meta tags.

**Implementation:**

`manifest.json`:
```json
{
  "name": "HyperIdle",
  "short_name": "HyperIdle",
  "start_url": "/",
  "display": "standalone",
  "background_color": "#f5f0e6",
  "theme_color": "#16764f",
  "icons": [
    { "src": "/icon-192.png", "sizes": "192x192", "type": "image/png" },
    { "src": "/icon-512.png", "sizes": "512x512", "type": "image/png" }
  ]
}
```

In `index.html <head>`:
```html
<link rel="manifest" href="/manifest.json">
<meta name="theme-color" content="#16764f">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-status-bar-style" content="default">
<link rel="apple-touch-icon" href="/icon-192.png">
```

Icon generation: Use a script or manual conversion of `favicon.svg` to PNG at 192px and 512px. Sharp or Playwright can render SVG to PNG.

**Depends on:** Nothing.

### Task 3: AppShell responsive layout with drawer (web -- core task)

**Files:**
- `packages/web/src/layouts/AppShell.tsx` -- major changes.
- `packages/web/src/hooks/useViewportBreakpoint.ts` -- no changes needed.
- `packages/web/src/__tests__/AE4-mobile-drawer.test.tsx` -- new test file.

**Implementation details:**

1. Import `useViewportBreakpoint` in AppShell.
2. Add `const { sidebarMobile } = useViewportBreakpoint();`
3. Add `const [drawerOpen, setDrawerOpen] = useState(false);`
4. Close drawer on pathname change: `useEffect(() => { setDrawerOpen(false); }, [location.pathname]);`
5. Derive `isDetailRoute` from pathname for back-arrow logic.
6. Conditional rendering:

```
if (sidebarMobile) {
  return (
    <ToastRegion>
      <div className="flex flex-col h-screen bg-[var(--surface-container)]">
        {/* Mobile header */}
        <header className="shrink-0 flex items-center h-[48px] px-[12px] bg-[var(--surface-elevated)] border-b border-[var(--border-subtle)]" style={{ paddingTop: 'env(safe-area-inset-top)' }}>
          {isDetailRoute ? (
            <button onClick={navigateBack} aria-label="Back" className="w-[48px] h-[48px] ...">
              {/* chevron-left SVG */}
            </button>
          ) : (
            <button onClick={() => setDrawerOpen(true)} aria-label="Open navigation" data-testid="mobile-hamburger" className="relative w-[48px] h-[48px] ...">
              {/* hamburger SVG */}
              {hasAttentionItems && <span className="absolute top-[8px] right-[8px] w-[6px] h-[6px] rounded-full bg-[var(--accent-primary)]" />}
            </button>
          )}
          <span className="flex-1 text-[15px] font-[600] text-[var(--text-primary)] truncate">{pageTitle}</span>
          <button onClick={commandK.open} aria-label="Search" className="w-[48px] h-[48px] ...">
            {/* search SVG */}
          </button>
        </header>

        {/* Main content -- full width */}
        <main className="flex-1 flex flex-col overflow-hidden bg-[var(--surface-elevated)] min-w-0 text-[15px]">
          {/* same settings/outlet logic as desktop */}
        </main>

        {/* Drawer overlay */}
        {drawerOpen && (
          <>
            <div data-testid="mobile-scrim" className="fixed inset-0 z-40 bg-[rgba(26,21,16,0.55)]" onClick={() => setDrawerOpen(false)} />
            <div data-testid="mobile-drawer" className="fixed inset-y-0 left-0 z-50 w-[280px] bg-[var(--surface-container)]" style={{ paddingTop: 'env(safe-area-inset-top)' }}>
              <Sidebar {/* same props as desktop */} />
            </div>
          </>
        )}

        <GlobalSearchPanel ... />
        <CocOverlay ... />
      </div>
    </ToastRegion>
  );
}
// else: existing desktop layout
```

**Key implementation details:**

- `isDetailRoute`: derived from pathname matching `/conversations/:id`, `/work/bet/:id`, `/work/bet/:id/task/:id`, `/knowledge/:id`, `/agents/:id`, `/work/routine/:id`.
- `pageTitle`: derived from pathname + active view. For detail routes, ideally shows the entity name (thread title, bet name). For list routes, shows "Conversations" / "Work" / "Knowledge".
- `navigateBack`: explicit parent path (`/conversations`, `/work/portfolio`, `/knowledge`), not `navigate(-1)`.
- `hasAttentionItems`: `(conversationsBlockingCount ?? 0) > 0 || knowledgeTriageCount > 0`.
- The drawer wrapper sets `w-[280px]` which is wider than Sidebar's own `w-[200px]`. The Sidebar's `w-[200px]` class needs to be overridden. Two approaches:
  - (A) Make the Sidebar `w-full` inside the drawer wrapper (the wrapper constrains width).
  - (B) Add a `className` prop to Sidebar.
  - **Chosen: (A).** Wrap Sidebar in a `<div className="w-full">` within the drawer, and change Sidebar's `w-[200px]` to `w-full` when rendered in drawer context, OR simply let the Sidebar render at 200px inside a 280px container (the extra 80px is fine -- sidebar padding absorbs it).

  Actually, re-reading: the Sidebar has `w-[200px]` as a hard class. In the drawer (280px wide), the Sidebar would render at 200px, leaving 80px of dead space. Better to make the Sidebar fill its container. The cleanest approach: pass a `className` override prop OR use a wrapper that sets `[&>aside]:!w-full` via Tailwind child selector. Simplest: change Sidebar from `w-[200px]` to `w-full` and let the PARENT (AppShell) control width via `w-[200px]` on desktop and `w-[280px]` on drawer.

  **Decision:** Modify Sidebar to use `w-full` instead of `w-[200px]`. AppShell wraps Sidebar in a `<div className="w-[200px] shrink-0">` on desktop and `<div className="w-[280px]">` in the drawer.

- The drawer animation: use CSS transition on `transform`. Initially `translate-x-[-100%]`, when open `translate-x-0`. The drawer div is always in the DOM when `drawerOpen` is true (no enter-animation needed if we use conditional rendering; the scrim fades via opacity). For simplicity in v1, skip the slide animation (just appear/disappear). The builder can add CSS transitions in a polish pass.

**Drawer focus trap:**
- When drawer opens, focus moves to the first focusable element in the sidebar.
- When drawer closes, focus returns to the hamburger button.
- Escape key closes drawer (already handled by the pathname-change effect if Escape triggers a navigation, or add explicit Escape handler).
- Use `focus-trap-react` (already in dependencies) or manual focus management.

**Tests:**
- Desktop (1920px): sidebar renders in normal flow, no hamburger, no drawer.
- Mobile (375px): sidebar NOT in normal flow, hamburger visible, drawer openable.
- Mobile drawer: sidebar content is accessible inside drawer.
- Mobile scrim click: closes drawer.
- Mobile pathname change: closes drawer.
- Mobile back arrow: visible on detail routes, navigates to parent.

**Depends on:** Nothing.

### Task 4: Responsive content areas (web -- per-page adjustments)

**Files:**
- `packages/web/src/pages/Conversations.tsx` -- responsive header padding, stacked dial-in panel.
- `packages/web/src/pages/WorkPortfolio.tsx` -- single-column grid on mobile.
- `packages/web/src/pages/WorkTeam.tsx` -- responsive table/card layout.
- `packages/web/src/pages/KnowledgeList.tsx` -- responsive pill wrapping (already flex-wrap).
- `packages/web/src/pages/KnowledgeDetail.tsx` -- stacked thread panel on mobile.

**Implementation per page:**

**Conversations.tsx:**
- Detail header: `px-[24px]` becomes `px-[12px] md:px-[24px]`.
- Dial-in split: `flex-row` becomes `flex-col md:flex-row`. The SessionActivityPanel stacks below the thread on mobile.
- Filter chips: add `min-h-[44px] md:min-h-0` for touch targets on mobile.
- "New thread" button: already pill-shaped and small, fits at 375px.

**WorkPortfolio.tsx:**
- Bet card grid: check current grid classes. If using `grid-cols-2` or similar, add `grid-cols-1 md:grid-cols-2`. If using flex-wrap, the cards will naturally stack.

**WorkTeam.tsx:**
- Task table (if present): wrap in `overflow-x-auto` for horizontal scroll on mobile.
- Agent rows: likely already stack vertically. Verify.

**KnowledgeList.tsx:**
- Scope pills: already use flex-wrap. Verify they don't overflow at 375px.
- Create button: already in header.

**KnowledgeDetail.tsx:**
- Thread panel: if rendered as a side panel, change to `flex-col md:flex-row`.

**Depends on:** Task 3 (mobile header provides back navigation context).

### Task 5: Touch target enforcement (web)

**Files:**
- `packages/web/src/shell/Sidebar.tsx` -- sidebar sub-items and section headers.
- Various pages with interactive elements below 44px on mobile.

**Implementation:**
- Sidebar sub-item buttons: add responsive `min-h-[44px]` when in mobile context. Since the Sidebar doesn't know about mobile (design decision: Sidebar is unchanged), the touch target increase should be done via CSS responsive classes. Add `md:min-h-0 min-h-[44px]` to sub-item button classes. This means: 44px on mobile (< 768px), natural height on desktop.

  Wait -- the Sidebar is rendered inside a 280px drawer on mobile. Tailwind responsive classes use `min-width` media queries (`md:` means >= 768px). Since the drawer is at mobile viewport (< 768px), classes without prefix apply. So `min-h-[44px] md:min-h-0` on sub-item buttons will give 44px on mobile, 0 (natural) on desktop.

  But: the Sidebar component shouldn't have different styling based on viewport because it's the same component. The approved design says "The Sidebar component itself is NOT modified for mobile." However, adding responsive Tailwind classes is a viewport-based adjustment, not a component API change. This is acceptable -- the same component renders with responsive utility classes that adapt to viewport.

  **Decision:** Add responsive `min-h-[44px] md:min-h-0` to Sidebar sub-item buttons for touch target compliance.

- Filter chips in Conversations: add `min-h-[44px]` (they're always small; the 44px won't hurt on desktop either since they're inline buttons).

**Depends on:** Task 3.

### Task 6: Doc updates (docs)

**Files (from concept.md -- 9 locations):**
1. `docs/human-interface-layer/one-app-two-form-factors.md`
2. `docs/human-interface-layer/what-the-meta-layer-actually-ships-at-this-layer.md`
3. `docs/human-interface-layer/decisions.md`
4. `docs/human-interface-layer/the-three-views-the-rail.md`
5. `docs/requirements/usability-requirements.md` (lines 9, 71, 85)
6. `docs/requirements/decisions.md`
7. `docs/architecture/decisions.md`
8. `docs/architecture/the-human-interface-the-factory.md`

**Change:** Replace "Desktop-only" statements with:
> Desktop is the primary form factor. The same web app is accessible from mobile browsers for review triage and agent unblocking. No native mobile app. No offline support.

**Depends on:** Nothing (can run in parallel with other tasks).

---

## Type signatures

### `useViewportBreakpoint` -- NO CHANGES

```typescript
export interface ViewportBreakpoint {
  sidebarMobile: boolean;
}
export function useViewportBreakpoint(): ViewportBreakpoint;
```

### AppShell internal state additions

```typescript
// New state in AppShell
const { sidebarMobile } = useViewportBreakpoint();
const [drawerOpen, setDrawerOpen] = useState(false);

// Derived
const isDetailRoute: boolean = /^\/(conversations|work\/bet|work\/routine|knowledge|agents)\/[^/]+/.test(location.pathname);
const hasAttentionItems: boolean = ((conversationsBlockingCount ?? 0) > 0) || (knowledgeTriageCount > 0);
```

### CORS resolveOrigin -- modified signature

```typescript
// No signature change -- internal implementation only
function resolveOrigin(origin: string, _c: Context): string | undefined;

// New internal helper
function parseConfiguredOrigins(): ReadonlyArray<string>;
```

### Sidebar -- minor class change

```typescript
// No props change.
// Internal: w-[200px] changes to w-full.
// AppShell wraps Sidebar in width-constraining container.
```

---

## Security & abuse cases

| Concern | Status | Resolution |
|---|---|---|
| **CORS origin injection** | Applicable | `HYPERIDLE_CORS_ORIGINS` values are matched exactly via `Array.includes()`. No regex, no wildcards, no partial matching. The `resolveOrigin` function already prevents prefix-bypass attacks (tested: `http://127.0.0.1.evil.com` is rejected). Same strict matching applies to configured origins. |
| **Rate limiting on mobile** | N/A | Existing rate limiter (`HYPERIDLE_RATE_LIMIT_PER_MIN`) applies to all /api routes regardless of client. No change needed. |
| **PWA scope escalation** | N/A | `manifest.json` scope is `/` (same as the web app). No additional attack surface. |
| **Input trust boundary** | N/A | No new input surfaces. Mobile uses the same API endpoints. |
| **Secret handling** | N/A | No new credentials. Auth still uses `HYPERIDLE_API_KEY`. |
| **Path traversal** | N/A | No new path inputs. |
| **SSRF** | N/A | No new outbound URLs. |
| **Drawer XSS** | N/A | The drawer renders the same Sidebar component. No new user-supplied content rendering. |

---

## Protected tests

```
protectedTests: [
  "packages/web/src/__tests__/U6-viewport-breakpoint.test.ts",
  "packages/web/src/__tests__/U6-AppShell-sidebar.test.tsx",
  "packages/server/src/__tests__/cors.integration.test.ts"
]
```

These existing tests must continue to pass unmodified. The AppShell sidebar test (`U6-AppShell-sidebar.test.tsx`) runs at the default viewport (1920px), so it will hit the desktop branch and pass. CORS tests all verify existing behavior that remains unchanged.

---

## Migrations

### Sidebar width change: `w-[200px]` to `w-full`

| Call site | File | Migration |
|---|---|---|
| Sidebar component | `packages/web/src/shell/Sidebar.tsx` line 178 | Change `w-[200px]` to `w-full` |
| AppShell (desktop) | `packages/web/src/layouts/AppShell.tsx` | Wrap `<Sidebar>` in `<div className="w-[200px] shrink-0">` |
| AppShell (mobile drawer) | `packages/web/src/layouts/AppShell.tsx` | Wrap `<Sidebar>` in drawer div at `w-[280px]` |
| Sidebar.stories.tsx | `packages/web/src/shell/Sidebar.stories.tsx` | Wrap story render in `<div className="w-[200px]">` |
| Sidebar.test.tsx | `packages/web/src/__tests__/Sidebar.test.tsx` | May need width container wrapper for pixel-exact assertions (unlikely to break since tests check content, not width). |
| AD3 sidebar test | `packages/web/src/__tests__/AD3-sidebar-single-team.test.tsx` | Same as above. |
| AD5 sidebar test | `packages/web/src/__tests__/AD5-sidebar-conversations-badge.test.tsx` | Same as above. |
| W3 sidebar test | `packages/web/src/pages/__tests__/W3-sidebar.test.tsx` | Same as above. |

These test files render Sidebar standalone, not inside AppShell. Since Sidebar becomes `w-full`, the tests either need a width-constraining wrapper or will render full-width (which doesn't affect content assertions). Low risk.

---

## Risks and ambiguities

### Risk 1: Safe area insets on older browsers

`env(safe-area-inset-top)` is supported on iOS 11.2+ and all modern Android browsers. For older browsers, the `env()` fallback is 0px (no effect), which is acceptable -- the header is still 48px without notch compensation.

### Risk 2: Drawer animation performance

CSS `transform: translateX()` is GPU-accelerated. No jank expected. But if the sidebar is complex (many DOM nodes), initial render in the drawer might lag on low-end phones. Mitigation: the Sidebar is relatively lightweight (3 sections + max 5 thread items + max ~5 team items).

### Risk 3: Focus trap in drawer

`focus-trap-react` is already a dependency. But adding a focus trap to the drawer means import + wrapping the sidebar. If focus-trap-react causes issues (e.g., conflicts with the existing CoC overlay focus management), fall back to manual focus management (`useRef` + `focus()` on open, restore on close).

### Risk 4: AppShell size increase

AppShell is already 487 lines. Adding the mobile branch (conditional rendering) will add ~60 lines. Total ~550 lines. This is manageable but approaching the complexity threshold. Consider extracting the mobile header into a separate `MobileHeader` component file in `packages/web/src/shell/` if it exceeds 600 lines.

### Ambiguity: Icon generation for PWA

The `favicon.svg` needs to be converted to 192px and 512px PNGs. Options:
- (A) Use a build-time script with Sharp.
- (B) Manually export PNGs and commit them.
- (C) Use SVG icons in the manifest (limited browser support).

**Decision:** (B) Manually export PNGs. This is a one-time operation, the icons rarely change, and build-time generation adds a dependency. The builder can use any tool (Figma, Inkscape, `npx svg2png`) to produce the PNGs.

---

## Task dependency graph

```
Task 1 (CORS)  ──┐
Task 2 (PWA)   ──┤── All independent, can run in parallel
Task 6 (Docs)  ──┘
                  │
Task 3 (AppShell drawer) ── depends on nothing, but is the largest task
                  │
Task 4 (Responsive content) ── depends on Task 3 (uses mobile header context)
                  │
Task 5 (Touch targets) ── depends on Task 3 (Sidebar width change)
```

**Recommended execution order:**
1. Tasks 1, 2, 6 in parallel (independent, small).
2. Task 3 (core shell change).
3. Tasks 4, 5 in parallel (both depend on Task 3).
4. Final: `npm run verify` to validate everything together.
