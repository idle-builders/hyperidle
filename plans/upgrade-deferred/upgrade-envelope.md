# Compatibility envelope — deferred-majors upgrade (2026-06-29)

## Floor (UNCHANGED — set by PR #383, already current)
- Electron `42.5.0` (bundles Node 24.15, Chromium 148, V8 14.8)
- Node `24`.x (local `node@24` 24.18.0, engines `>=24`, `.node-version` 24.18.0)
- TypeScript `6.0.3` (TS 7.0 RC-only → not adopted; gates typescript-eslint)
- React + react-dom `19.2.7`
- PGlite `0.5.1` (Postgres 17) / Drizzle orm `0.45.2` / kit `0.31.10`
- Vite `8` (Rolldown) + @vitejs/plugin-react `6` (Oxc)

## Scope of THIS run — Layer 2/3 deferred majors + leftovers
| Group | Pkgs | Current → target | Layer | Risk |
|---|---|---|---|---|
| A | tailwindcss + daisyui | 3.4.19→4.x, 4.12.24→5.x | L2 build/UI | HIGH |
| B | @tiptap/* + tiptap-markdown | 2.27.2→3.x, 0.8.10→0.9 | L3 editor | MED-HIGH |
| C | nodemailer + @types/nodemailer | 6.10.1→9.x, 6.4.24→8.x | L3 mail | MED |
| D | concurrently | 9.2.3→10.x | L3 dev | LOW |
| E | @hono/zod-validator | 0.7.6→0.8 | L3 server | LOW |
| F | esbuild (desktop) | 0.25.12→0.28 | L2 electron build | LOW |
| G | @types/node (design-system) | 22.20.0→ align ^24 (NOT 26) | L1 align | LOW |
| H | @duckdb/node-api, @types/estree | patch | L3 | LOW |

## Derived constraints (every target must satisfy)
- Node 24 ABI; TS 6.0.3 ceiling; React 19.2; Tailwind becomes 4 (Group A) → daisyui must be the v5 line that supports TW4.
- `@types/node` aligns to the Node MAJOR (24), never blind-latest 26.
- Targets are web-verified per group in research phase below; pin `^target`, never widen.
