# Apply plan — deferred-majors upgrade (web-verified 2026-06-29)

Bottom-up. One atomic commit per group. Per group: bump → `npm install` → migrate code → **targeted** `npm run check && npm run lint && npm run test` (full `npm run verify` ONCE at the very end, not per group). ≤3 fix attempts then roll back the group. Never blind `-u` the snapshot — read the diff first. Tests must not drive behavior.

Node: `export PATH="/opt/homebrew/opt/node@24/bin:$PATH"` (node@24 = 24.18.0, keg-only).

## Order & targets

### G — @types/node align (L1) — LOW, no code
- `packages/design-system/package.json`: `@types/node` `^22.20.0` → `^24` (resolves 24.13.x). **NOT** 26.x (ahead of runtime). Only package declaring it.
- Verify: `npm run check`.

### H — duckdb + estree patch (L3) — LOW, no code
- root `package.json`: `@duckdb/node-api` `^1.5.2-r.1` → `^1.5.4-r.1` (N-API prebuilds, Node24 fine).
- `@types/estree` already floats `^1.0.0`→1.0.9 via lockfile; no manifest edit.
- Verify: `npm install` + `npm run check`.

### F — esbuild (desktop, L2) — LOW, no code
- `packages/desktop/package.json`: `esbuild` `^0.25.0` → `^0.28.1`.
- Migrate: none. Verify: run `packages/desktop/scripts/bundle.ts` (`scripts/build-local.sh`) — confirm dangling-`require()` validation passes + bundle output OK. Then `npm run check`.

### C — nodemailer (fabric, L3) — LOW, no code
- `packages/fabric/package.json`: `nodemailer` `^6.x` → `^9.0.1`, `@types/nodemailer` `^6.4.17` → `^8.0.1` (types lag one major; 8.x is the 9.x pairing).
- We use raw SMTP text mail only — none of v7(SES)/v8(ENOAUTH rename)/v9(remote-content TLS) breaking surfaces are in our path. `smtp-adapter.ts` keys on EAUTH/ECONNREFUSED/etc, not NoAuth.
- Verify: `npm run check` + fabric smtp-adapter test.

### D — concurrently (root, L3) — LOW, no code
- root `package.json`: `concurrently` `^9.2.3` → `^10.0.3` (engines node>=22, we're 24). We use only `--names` + `--prefix-colors`, unchanged in v10.
- Verify: `npm run check`; smoke `npm run dev` launches (optional).

### E — @hono/zod-validator (server, L3) — LOW, no code
- `packages/server/package.json`: `@hono/zod-validator` `^0.7.6` → `^0.8.0`. Peer `hono >=4.10.0` (we have 4.12 ✓), `zod ^3.25||^4`. The hono floor is the only bumped peer.
- WATCH: pre-existing dual-zod brand (AF4 `@lore` in `validate.ts` — validator dedupes to zod 3.25.76; `schema as never` boundary). Confirm `npm run check` still passes that cast post-bump; do NOT change production behavior to satisfy it.
- Verify: `npm run check` + server validate tests.

### B — tiptap 2→3 (L3 editor) — MED, code edits
- All `@tiptap/*` `^2.12.0` → `^3.27.1` in `packages/design-system/package.json` (deps+devDeps) AND `packages/web/package.json`. `@tiptap/pm` must be exactly-lockstep (react@3 pins pm:3.27.1). `tiptap-markdown` `^0.8.10` → `^0.9.0` (peer `@tiptap/core ^3.0.1`, v3-only). ADD `@floating-ui/dom@^1.6.0`.
- Edits:
  1. `packages/design-system/src/body-editor/extensions.ts`: add `link: false` to BOTH `StarterKit.configure({...})` (full + mini) — StarterKit v3 bundles `link`, collides with our separate `Link` import → "Duplicate extension names" runtime error.
  2. `packages/design-system/src/body-editor/floating-toolbar.tsx`: import `BubbleMenu` from `@tiptap/react/menus` (moved); replace `tippyOptions={{ placement:"top", animation:false }}` → `options={{ placement:"top" }}` (Floating UI; no `animation` key).
- No change needed: use-body-editor.ts (`getMarkdown()` stable), slash-menu.tsx (standalone tippy.js + Suggestion/ReactRenderer v3-stable), BodyEditor.tsx.
- Verify: `npm run check` + `npm run lint` + `npm run test` → read snapshot diff (underline now active in StarterKit may shift DOM) → `ds:bless` only if changes are intended/explained. Viewer `:8098` BubbleMenu + slash menu + markdown round-trip.

### A — tailwind 4 + daisyui 5 (L2 build/UI) — HIGH, big migration. DO LAST.
Targets: `tailwindcss@^4.3.1`, `daisyui@^5.6.3`, ADD `@tailwindcss/vite@^4.3.1`, REMOVE `autoprefixer` (+ `postcss` if going full Vite-plugin path) — in `packages/web` + `packages/design-system`.

Build pipeline (Vite-plugin path, recommended):
1. `packages/web/vite.config.ts` + `packages/design-system/vite.config.ts`: add `tailwindcss()` from `@tailwindcss/vite` to `plugins`.
2. DELETE `packages/web/postcss.config.ts` + `packages/design-system/viewer/postcss.config.ts`.
3. DELETE `packages/web/tailwind.config.ts` + `packages/design-system/viewer/tailwind.config.ts` (go full CSS-first; do NOT keep via `@config`).
4. Rewrite `packages/web/src/index.css` head: `@import "@hyperidle/design-system/tokens.css"; @import "tailwindcss"; @plugin "daisyui"; @plugin "daisyui/theme"{hearth-light…}; @plugin "daisyui/theme"{hearth-dark…}; @theme{fonts+color-* extends}; @source "../../design-system/src/**/*.{ts,tsx}"; @source "./**/*.{ts,tsx}";` — drop the three `@tailwind` lines; KEEP existing `@layer components`/`@keyframes`.
5. Viewer CSS entry (confirm via `packages/design-system/viewer/main.tsx`): same `@import "tailwindcss"` + `@plugin daisyui` + both themes + BOTH `@source` roots (DS src + web src — preserve AL1 dual-root or web-story panes collapse).

DaisyUI theme migration — v5 CSS `@plugin "daisyui/theme"` blocks for hearth-light (`default:true; color-scheme:light`) + hearth-dark (`prefersdark:true; color-scheme:dark`). Rename: `primary`→`--color-primary` (all color keys), `base-100`→`--color-base-100`, `--rounded-box`→`--radius-box`, `--rounded-btn`→`--radius-field`, `--rounded-badge`→`--radius-selector`. Exact values are in the research report (a2557d4c report) — copy verbatim. Both web index.css AND viewer entry.

`@theme` extend: `--font-sans`/`--font-mono`; `--color-surface-page: var(--surface-page)` … and border tokens as `--color-border-*: var(--border-*)` (v4 has no border-only namespace — full color tokens, harmless extra utilities).

Utility renames in source (v4):
- `flex-shrink-0`→`shrink-0` (~10 occ)
- `outline-none`→`outline-hidden` (~12 occ: HostThreadSection, ConversationSurface, RecipientPicker×2, SessionView, SetupFlow, KnowledgeCreate, DS ThreadShell, SearchField, Composer, Select)
- `shadow-lg`→verify intent (TaskSheet.tsx:400, 1 occ)
- bare `blur`→`blur-sm` (only if bare, not backdrop-blur/arbitrary)
- NO `rounded-sm/md/xs`, `bg-opacity-*`, `flex-grow-*` in source. `rounded`/`rounded-lg`/`rounded-2xl` values unchanged in v4.

eslint-plugin-design updates (correctness-preserving):
- `no-off-scale-radius.ts` NAMED_PX table is v3 px — update to v4 values (doesn't change our verdicts but prevents future false reads); update its test fixture.
- `no-ai-aesthetic.ts`: add `bg-linear-*`/`bg-radial-*` to gradient regex (v4 renamed `bg-gradient-to-*`); update test fixture.

Verify: `npm run check` + `npm run lint` → `npm run dev` + `npm run ds:serve` visual check BOTH themes (pill buttons/badges via `--radius-field`/`--radius-selector`, card radii, focus rings) → `npm run test` read snapshot diff (should be ONLY the renamed utility class strings) → `ds:bless` → commit `.snap` in same commit. tokens.css needs NO change (Hearth `--r-*`/`--*` independent of DaisyUI).

## Exact CSS for Group A (copy verbatim into web index.css + viewer entry)

```css
@import "@hyperidle/design-system/tokens.css";
@import "tailwindcss";
@plugin "daisyui";

@plugin "daisyui/theme" {
  name: "hearth-light";
  default: true;
  color-scheme: light;
  --color-primary: #16764f;
  --color-primary-content: #ffffff;
  --color-secondary: #d97706;
  --color-secondary-content: #ffffff;
  --color-accent: #6b5d4d;
  --color-accent-content: #ffffff;
  --color-neutral: #ede7db;
  --color-neutral-content: #2c241a;
  --color-base-100: #f5f0e6;
  --color-base-200: #ede7db;
  --color-base-300: #e8e0d0;
  --color-base-content: #2c241a;
  --color-info: #2e7dba;
  --color-info-content: #ffffff;
  --color-success: #16764f;
  --color-success-content: #ffffff;
  --color-warning: #d97706;
  --color-warning-content: #ffffff;
  --color-error: #dc4a3a;
  --color-error-content: #ffffff;
  --radius-box: 16px;
  --radius-field: 9999px;
  --radius-selector: 9999px;
}

@plugin "daisyui/theme" {
  name: "hearth-dark";
  prefersdark: true;
  color-scheme: dark;
  --color-primary: #2eaa7a;
  --color-primary-content: #ffffff;
  --color-secondary: #d97706;
  --color-secondary-content: #ffffff;
  --color-accent: #a89880;
  --color-accent-content: #1a1510;
  --color-neutral: #231e16;
  --color-neutral-content: #ede5d8;
  --color-base-100: #1a1510;
  --color-base-200: #231e16;
  --color-base-300: #3d342a;
  --color-base-content: #ede5d8;
  --color-info: #4498d4;
  --color-info-content: #ffffff;
  --color-success: #2eaa7a;
  --color-success-content: #ffffff;
  --color-warning: #d97706;
  --color-warning-content: #ffffff;
  --color-error: #ee6a5a;
  --color-error-content: #ffffff;
  --radius-box: 16px;
  --radius-field: 9999px;
  --radius-selector: 9999px;
}

@theme {
  --font-sans: system-ui, -apple-system, "Segoe UI", sans-serif;
  --font-mono: ui-monospace, "SF Mono", "Cascadia Code", monospace;
  --color-surface-page: var(--surface-page);
  --color-surface-container: var(--surface-container);
  --color-surface-elevated: var(--surface-elevated);
  --color-surface-overlay: var(--surface-overlay);
  --color-text-primary: var(--text-primary);
  --color-text-secondary: var(--text-secondary);
  --color-text-tertiary: var(--text-tertiary);
  --color-border-subtle: var(--border-subtle);
  --color-border-default: var(--border-default);
  --color-border-strong: var(--border-strong);
}

@source "../../design-system/src/**/*.{ts,tsx}";
@source "./**/*.{ts,tsx}";
```
Viewer entry uses the same `@import`/`@plugin`/`@theme`, with `@source` roots `"../src/**/*.{ts,tsx}"` + `"../../web/src/**/*.{ts,tsx}"` (preserve the two-root glob from today's viewer JS config). Keep the existing `@layer components`/`@keyframes` blocks below the directives in web index.css.

Note: `default:true` on hearth-light, `prefersdark:true` on hearth-dark — confirm against today's tokens.css default theme selection before locking; if the app force-applies a theme via `data-theme`, the default flags are belt-and-suspenders.

## Final
- ONE `npm run verify` (full: check+lint+knip+test:all+build+attestation) on clean tree after all groups committed.
- Then `/ship`-style: commit attestation, push, open PR → main. Never auto-merge.
- Any group that can't go green after 3 attempts: roll back that group only, log SKIPPED with reason; lower committed groups stay.
