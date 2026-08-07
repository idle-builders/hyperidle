---
name: upgrade-versions
description: "Foundation-first, layered dependency upgrade. Pin the platform floor (Electron → Node, DB engine, TypeScript, React) from web-verified latest-supported versions, derive the compatibility envelope, then upgrade every layer above it to the newest version that fits — bottom-up, verified per layer, with rollback."
argument-hint: "[scope: 'all', 'floor', 'runtime', or specific package names]"
user-invocable: true
min_tool_calls: 24
---

# Upgrade Versions — Foundation-First Layered Upgrade

Dependencies form a stack. The **floor** — Electron, the Node runtime it bundles, the database engine, the language compiler, the UI runtime — decides what everything above it is *allowed* to be. Upgrade the floor first, derive the **compatibility envelope** it creates, then climb the stack: each higher layer goes to the newest version that *fits the envelope*, not blindly to `latest`.

The old "patch → minor → major by risk tier" model is wrong for a platform like this: it would happily bump a leaf package to a version that needs a newer Node than Electron ships, or a TypeScript that a plugin doesn't support yet. **Layers, not tiers.** Lowest level first, always.

## Non-negotiable: verify every version against the web

`npm view <pkg> version` tells you the newest *published* version. It does **not** tell you the newest version that *supports your floor*. For every floor decision and every layer target you MUST check the authoritative source on the web and cite version + date:

- **Electron → Node/Chromium/V8 mapping:** `https://www.electronjs.org/docs/latest/tutorial/electron-timelines` and the per-release blog post. Electron has no "LTS" — it supports the **latest 3 stable majors**; "latest LTS" = newest stable still in support. Confirm which Node major it bundles.
- **Node support / EOL:** `https://endoflife.date/nodejs`.
- **Peer/engine ranges:** each package's own release notes / README / `engines` + `peerDependencies` on npm. React's supported TS, Drizzle's supported Postgres/PGlite, a vite/vitest's required Node, an eslint plugin's supported typescript-eslint — read it, don't assume.
- **DB engine:** PGlite release notes + the Postgres major it emulates; Postgres version policy at `https://endoflife.date/postgresql`.

Never infer a current third-party version range from training knowledge. Cite the URL + the version + the date you saw. Treat web content critically (per project rules) — prefer first-party release notes over blog aggregators.

---

## The layers (this is the apply order)

```
Layer 0  FLOOR — the deciders. Web-verified. Sets the whole envelope.
  ├─ Electron            (keystone: bundles Node + Chromium + V8 ABI)
  ├─ DB engine           (PGlite / Postgres major)
  ├─ TypeScript          (language compiler — gates every TS-coupled tool)
  └─ React + react-dom   (UI runtime — gates @types/react and the React ecosystem)

Layer 1  RUNTIME — align local + declared Node to what Layer 0 demands.
  ├─ Node (brew / node manager), engines.node, .node-version
  └─ Git + other brew-managed dev tools

Layer 2  FRAMEWORK TIER — directly coupled to a Layer-0 dep.
  ├─ DB-coupled:   drizzle-orm + drizzle-kit          (← DB engine)
  ├─ TS-coupled:   typescript-eslint, @typescript-eslint/*, eslint, biome,
  │                vite, vitest, tsx, knip            (← TypeScript + Node)
  ├─ React-coupled: @types/react, @types/react-dom, react-router-dom,
  │                react-compiler/eslint-plugin-react-*, focus-trap-react,
  │                @dnd-kit/*, @testing-library/*     (← React)
  └─ Electron-coupled: electron-builder, esbuild, any native addon
                                                      (← Electron Node/V8 ABI)

Layer 3  LEAVES — everything else. Newest version that fits the envelope.
```

Within a layer, group monorepo siblings / same-upstream packages and upgrade them together (split bumps of coupled packages cause more breakage than joint ones).

---

## Phase 0: Map the stack & current state

Run in the worktree. Capture structured results.

```bash
# Package state across all workspaces
npm outdated 2>&1 || true

# Floor versions as they are now
node --version
npx tsc --version 2>/dev/null || true
grep -E '"electron"|"react"|"react-dom"|"typescript"|"@electric-sql/pglite"|"drizzle-orm"' -r layers/*/package.json layers/*/*/package.json framework/*/package.json applications/*/package.json tools/*/package.json package.json

# Runtime & tooling (Homebrew-managed)
git --version
brew outdated --json 2>/dev/null || true
brew list --formula 2>/dev/null || true

# CI
grep -rh 'uses:' .github/workflows/ 2>/dev/null | sort -u

# Declared runtime floor
grep -A2 '"engines"' package.json
```

Parse `npm outdated` into `{ name, current, wanted, latest, workspace }`. Tag each package with the layer it belongs to (0/1/2/3) using the map above. Anything you can't place defaults to Layer 3.

**If the floor is already current and nothing is outdated, report "Everything is up to date" and stop.**

---

## Phase 1: Decide the floor (web-verified) → write the envelope

This is the load-bearing phase. For each floor dep, web-verify the newest *supported* version and what it constrains:

1. **Electron** → choose newest stable in-support major. Record the Node major + Chromium + V8 it bundles. This Node major is the hard runtime ceiling/floor for the whole repo. Note native-ABI implications (any native addon must support this Node/V8).
2. **DB engine (PGlite / Postgres)** → newest release; record the Postgres major it targets (Drizzle dialect must match).
3. **TypeScript** → newest stable; note it gates typescript-eslint, vite, vitest, tsx, biome's TS support.
4. **React + react-dom** → newest stable (keep the pair locked); note the @types and react-compiler/eslint-plugin versions it requires.

Write `plans/<id>/upgrade-envelope.md` (or print it inline if no plan folder) — the contract every later layer is checked against:

```
## Compatibility envelope (web-verified <date>)
- Electron:   <old> → <target>   bundles Node <maj>.x, Chromium <n>, V8 <n>   [src URL]
- Node:       <maj>.x  (set by Electron; local + engines + .node-version)      [src URL]
- DB:         PGlite <old> → <target>  (emulates Postgres <maj>)               [src URL]
- TypeScript: <old> → <target>                                                 [src URL]
- React:      <old> → <target>  (needs @types/react <range>, react-compiler <range>) [src URL]
- Constraints derived: <e.g. native addons must support Node <maj> ABI; vitest must support Node <maj>; ...>
```

Do not proceed to Phase 2 until the envelope is written and every line has a cited source.

---

## Phase 2: Research each higher layer against the envelope (parallel subagents)

Spawn one **general-purpose** research subagent per Layer-2/Layer-3 group. Each agent's job is **not** "what's the latest" — it's **"what's the newest version of this group that satisfies the envelope."** Give every agent the envelope verbatim.

Subagent prompt must include:
- The package(s) + current version + workspace(s).
- The full envelope (Node major, TS, React, DB, Electron).
- Instruction: find the newest release whose `engines` + `peerDependencies` are satisfied by the envelope; if `latest` requires something outside the envelope, report the highest compatible version instead and say why latest was rejected.
- Fetch release notes (npm `repository` → GitHub Releases API → `CHANGELOG.md` fallback), scan for `BREAKING`/`removed`/`deprecated`/`migration`, and grep our source for affected APIs.
- Cross-reference every claimed breaking change against our *actual* usage — a break in an API we don't call is not a risk.
- Return the structured report:

```
## <group>: <packages> <current> → <recommended target>
Fits envelope: YES | CAPPED (latest=<x> needs <constraint outside envelope>, using <y>)
Risk: LOW | MEDIUM | HIGH
Breaking changes (that affect us): [list or none]
Migration steps: [list or none]
Our files affected: [list or none]
Sources: [URLs + dates]
```

Spawn all group agents in one batch. Patch-only-within-envelope groups can skip deep research but still get a one-line confirmation they're inside the envelope.

---

## Phase 3: Apply bottom-up, layer by layer

Process **Layer 0 → 1 → 2 → 3**, group by group inside each layer. Each group: snapshot → bump → install → migrate → verify → commit-or-rollback. Never start a higher layer until the lower one is green and committed.

### 3a. Snapshot
```bash
cp package-lock.json package-lock.json.backup
```

### 3b. Bump versions
Edit the relevant `package.json` files to `^<target>` (pin to target, never widen to `*`/`>=`). Update every workspace location the dep appears in. For floor deps, also update `engines`/`.node-version` in the same step as the runtime layer.

### 3c. Install
```bash
npm install
```

### 3d. Migrate
Apply the code changes the research phase identified (renamed APIs, moved imports, new required config). This is where major-version work lands.

### 3e. Verify
```bash
npm run verify
```
If the changed layer touches rendered UI / Playwright-tested packages, also run the relevant `npx playwright test`. The design-system snapshot net runs inside `test:all` (see project rules) — read any snapshot diff before re-blessing; never blind `-u`.

### 3f. Commit on green
```bash
git add -A
git commit -m "chore(deps): upgrade <layer-N group> (<old> → <new>)"
```
One atomic commit per group — individually revertible.

### 3g. Fail → fix ≤3, else roll back the group
1. Read the error (type/lint/test/build).
2. Fix (imports, types, config, test expectations — but never change production behavior just to pass a test; per project rules tests must not drive behavior).
3. Re-verify.
4. Still red after 3 attempts → roll back this group only:
   ```bash
   git checkout -- .
   cp package-lock.json.backup package-lock.json
   npm install
   ```
   Log it `SKIPPED` with the error and the constraint that blocked it. A skipped higher layer never invalidates a committed lower one. If a *floor* group can't go green, stop and report — the envelope is wrong and everything above is suspect.

---

## Phase 4: Runtime alignment (Layer 1 — do this with/just after the Electron bump)

Node is a real dependency; align it to the envelope's Node major.

```bash
brew outdated node && brew upgrade node    # if the brew major < envelope target, else use the node manager to install the exact line
node --version                              # must satisfy the envelope
```
- Set root `package.json` `"engines": { "node": ">=<major>.0.0" }` (pin the major, not the patch).
- Set `.node-version` to the exact line the team should use.
- Upgrade `git` and other project-relevant brew formulae if behind.
- Re-run `npm install` + `npm run verify` — runtime bumps surface new behavior.
- Commit: `chore(deps): set runtime to node >=<major> (matches Electron <target>)`.

---

## Phase 5: GitHub Actions

GitHub Actions are real, versioned dependencies — upgrade them every run, not just the npm tree.

1. **Enumerate** every external action: `grep -rhn 'uses:' .github/workflows/ | grep -v 'uses: \./' | sort -u`. (`uses: ./…` are local reusable workflows — skip them.)
2. **Find the latest major** for each `owner/action`. Pinned to a major tag (`@v4`) already auto-gets minor/patch, so the only manual move is the **major bump** (`@v4 → @v5`) plus any SHA-pinned third-party action. Check the action's GitHub **releases** page (or `https://api.github.com/repos/{owner}/{action}/releases/latest`) — verify the version on the web, don't infer from memory. Note that a single repo may be referenced at mixed tags (e.g. `actions/checkout` at both `@v4` and `@v6`) — bring them all to one latest major.
3. **Research the major changelog** for behavioral breaks before bumping — these are CI-runtime breaks, not code breaks, and don't show up in `npm run verify`:
   - `actions/checkout` ≥v5 raised the runner Node floor; v7 **blocks fork-PR checkouts for `pull_request_target` / `workflow_run`** — grep workflows for those triggers; if none use them it's N/A.
   - `actions/setup-node` ≥v6 requires a newer runner Node — fine on GH-hosted `ubuntu-latest`, confirm `node-version:` is still pinned where expected.
   - Docker / cloud setup actions: skim the major notes for renamed inputs.
4. **Edit** `.github/workflows/*.yml`, then **validate YAML** parses (e.g. `python3 -c "import yaml,sys; [yaml.safe_load(open(f)) for f in sys.argv[1:]]" .github/workflows/*.yml`).
5. **Commit** the workflow edits: `chore(ci): upgrade {action(s)} v{old} → v{new}` (one commit for the whole CI bump is fine — they share one verification).
6. **Regenerate the verify attestation — REQUIRED, easy to miss.** The attestation fingerprint (`scripts/check-attestation.ts` → `sourceHash`) covers **all tracked source, including `.github/`**. Any workflow edit changes that fingerprint, so the attestation carried over from `origin/main` no longer matches and CI **fails at "Validate test attestation"** even though every action bump is correct. After committing the workflow edits, run `npm run verify` (regenerates `.verify-attestations/<sha>.json`), then commit that file: `git add .verify-attestations/ && git commit -m "chore(ci): regenerate verify attestation for actions upgrade"`. CI then validates green. (This is also why a CI-only change can never skip `verify` — there is no docs-fast-path for `.yml`.)
7. Push; CI confirms on the PR (the run itself exercises the bumped `checkout`/`setup-node`). Per project rules, never weaken or modify rulesets/branch protection to make CI pass.

---

## Phase 6: Unused dependency sweep

Flag (don't auto-remove) packages in `package.json` not imported anywhere — `knip`/`knip:production` already cover this in verify. Skip `@types/*` and build tools that are used implicitly. Report as removal candidates.

---

## Phase 7: Report

```
## Upgrade Report — foundation-first

### Envelope (web-verified <date>)
- Electron <old> → <new> (Node <maj>, Chromium <n>, V8 <n>)
- Node <old> → <new>; TypeScript <old> → <new>; React <old> → <new>; PGlite <old> → <new>

### Applied (bottom-up)
- L0 <group> <old> → <new>
- L1 runtime: node >=<maj>, git <new>
- L2 <group> <old> → <new>
- L3 <group> <old> → <new>

### Capped to fit envelope
- <pkg>: latest <x> needs <constraint>; pinned <y>

### Skipped (failed verify, rolled back)
- <group>: <reason + error>

### GitHub Actions
- <action>@<tag>: [current | upgraded | major deferred]

### Unused (removal candidates)
- <pkg>

### Final verification
- check / lint / test / build: PASS  (or list failures)
```

---

## Rules

- **Floor first, always.** Never bump a higher layer before the floor it depends on is set and the envelope is written. Lowest level decides the rest.
- **Web-verify every version.** Cite URL + version + date. `npm latest` is a candidate, not a decision — confirm it supports the envelope.
- **Target the top of the envelope, not blind latest.** The right version is the newest one that *fits*, even when a newer one exists.
- **Never upgrade without verification.** Every group passes `check + lint + test (+ build for floor)` before commit.
- **Rollback beats debugging.** ≤3 fix attempts per group, then clean rollback. A partial, green upgrade beats a broken one.
- **Commit per group, atomic, layer-labelled.** Individually revertible.
- **Group coupled packages.** Monorepo siblings / same-upstream / locked pairs (react+react-dom, drizzle-orm+kit, @types with their lib) upgrade together.
- **Pin, don't widen.** `^<target>`; never `*`/`>=` for libs.
- **Tests must not drive behavior; rulesets are sacrosanct.** Per project rules — fix code or roll back, never weaken gates or contort production to pass.
- **Leave the lockfile clean.** Final `npm install` so `package-lock.json` matches `package.json` exactly. npm is the package manager — no bun.
- **Worktree isolation.** Run in a dedicated worktree off fresh `origin/main` (per project Git rules); a fresh worktree needs `npm install` before any version is trustworthy (stale node_modules masquerade as upgrade failures).
```
