# Compatibility envelope — foundation-first upgrade (web-verified 2026-06-29)

## Floor (the deciders)
- **Electron** `36.9.5` → `42.5.0` — bundles **Node 24.15**, Chromium 148, V8 14.8. *(latest in-support major; no LTS concept)*
- **Node** `24`.x — set by Electron 42; Active LTS until 2026-10-20. Local + `engines` + `.node-version`.
- **TypeScript** `6.0.3` → `6.0.3` — already latest stable. **TS 7.0 is RC only — do NOT adopt** (breaks typescript-eslint `<6.1.0`).
- **React** + react-dom `19.0.0` → `19.2.7` — pair-locked. **≥19.2.3 mandatory** (CVE-2025-55182). Needs `@types/react` 19.2.17, react-compiler `1.0` GA (repo's `eslint-plugin-react-compiler@19.1.0-rc.2` is an abandoned RC → move to the `react-compiler@1.0` line).
- **PGlite** `0.4.4` → `0.5.1` — emulates Postgres 17. PGlite treats minors as breaking → check 0.4→0.5 data-format/migration notes (desktop data dir).
- **Drizzle** orm `0.39.0`→`0.45.2`, kit `0.30.0`→matching 0.4x. Supports PG17 + `drizzle-orm/pglite`. **Stay off `1.0.0-beta`.**

## Derived constraints
- Native ABI = Node 24 / V8 14.8. App ships only PGlite (WASM, no ABI). `@duckdb/node-api@^1.5.2` is a dev-only Node addon → needs a **Node 24** prebuild (verify before bumping; it runs under Node/tsx, not Electron).
- TS ceiling **6.0.x** (not 7.0).
- `@vitejs/plugin-react` v6 **drops Babel** (uses Oxc) → breaks the current react-compiler Babel wiring; needs `reactCompilerPreset` opt-in path. Vite 8 (Rolldown) is available but a 6→8 two-major jump coupled to this.

## Top risks
- Electron 36→42 = ~48wk of breaking changes (Chromium 126→148, Node 20→24 in main, preload/contextIsolation/sandbox/CSP, electron-builder config drift). Read each major's breaking-changes doc; verify-gate + rollback per the skill.
- React build toolchain (Vite/plugin-react/react-compiler), not React itself, is the real React-side risk.
- PGlite 0.4→0.5 + Drizzle 0.39→0.45 both ship breaking changes in minors → review notes, regenerate migrations.

## Apply order (bottom-up)
L0 floor → L1 runtime(Node24) → L2 framework(drizzle/TS-tools/react-eco/electron-builder) → L3 leaves. Verify+commit per group; rollback the group on 3 failed fixes; cap to envelope, never blind-latest.
