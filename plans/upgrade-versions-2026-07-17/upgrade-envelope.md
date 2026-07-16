# Compatibility envelope (web-verified 2026-07-17)

- **Electron:** 42.5.0 → **43.1.1** (GA stable, latest patch). Bundles Node v24.18.0, Chromium 150.0.7871.47, V8 15.0.245.13. [electronjs.org/blog/electron-43-0](https://www.electronjs.org/blog/electron-43-0), [releases.electronjs.org/release/v43.1.1](https://releases.electronjs.org/release/v43.1.1)
- **Node:** major **24**, set by Electron 43.1.1's bundled runtime. Repo already declares this (`.node-version` = `24.18.0`, `engines.node` = `>=24.0.0`) — no repo change needed. Node 24 is Active LTS until 2026-10-20, security support to 2028-04-30. [endoflife.date/nodejs](https://endoflife.date/nodejs)
- **DB:** `@electric-sql/pglite` 0.5.1(pinned)/0.5.3(resolved) → **0.5.4** (latest patch, same Postgres major/dialect — no Drizzle dialect change).
- **TypeScript: CAPPED at 6.0.3** (current — already the newest 6.x release; no newer 6.x patch exists). **Do NOT bump to 7.0.2 (GA 2026-07-08).** TS 7 is the Go-native rewrite (tsgo) and ships **without a stable programmatic compiler API** — that lands in 7.1, "several months" out per the TypeScript team. `typescript-eslint`'s peerDependency range is `>=4.8.4 <6.1.0`, i.e. it explicitly excludes TS 7. Bumping now would break linting (typescript-eslint) and any tool depending on the Strada compiler API (ts-morph, custom transformers). Revisit once typescript-eslint ships TS 7 support and 7.1's API is stable. [devblogs.microsoft.com/typescript/announcing-typescript-7-0](https://devblogs.microsoft.com/typescript/announcing-typescript-7-0/), [github.com/typescript-eslint/typescript-eslint/issues/12518](https://github.com/typescript-eslint/typescript-eslint/issues/12518)
- **React + react-dom:** 19.2.7 — already latest, no change.
- **Drizzle-orm + drizzle-kit:** 0.45.2 / 0.31.10 — already latest, no change.

## Constraints derived
- Any Electron-coupled native addon / `electron-builder` must support Node 24 ABI — `electron-builder` (^26.15.3) and `esbuild` (^0.28.1) are already at latest per npm, no bump needed, compat implicitly OK (they're already used against Node 24 floor from the prior Electron 42 upgrade).
- `@types/node` must stay in the **24.x** line to match the Node major (do NOT take the `26.1.1` "latest" — that targets a Node major outside this envelope).
- TS-coupled tooling (`typescript-eslint`, `eslint`, `biome`, `vite`, `vitest`, `tsx`, `knip`) must keep supporting **TypeScript 6.0.3** — all outdated versions found are minor/patch only, no major TS-version jump implied.
- Electron 43 breaking changes reviewed: rounded frameless corners on Linux (cosmetic), download-folder default change, native image SRGB normalization, removed Linux-only `dialog.showHiddenFiles` (unused in this repo). No blocking breaks for this app.
- `@anthropic-ai/sdk` 0.106.0 → 0.112.1: changelog reviewed, all changes additive (new beta features/headers), no removed/renamed methods. Low risk despite 0.x minor jumps.

## Local machine note (out of repo scope)
Active shell `node` resolves to `~/.hermes/node` (v22.23.0) via `~/.local/bin/node`, ahead of brew's node (26.4.0→26.5.0 available) on PATH. This is behind the repo's declared floor (`>=24.0.0`) but is a personal machine/PATH configuration outside this repository — not touched by this upgrade. Flagged in the final report as an action item for the user.
