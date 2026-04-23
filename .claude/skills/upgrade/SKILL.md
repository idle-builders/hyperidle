---
name: upgrade
description: "Check all dependencies (packages, runtimes, tooling) for updates, research changelogs via subagents, and apply upgrades group-by-group with verification gates and rollback."
argument-hint: "[scope: 'all', 'packages', 'runtime', or specific package names]"
user-invocable: true
---

# Upgrade — Dependency Update Orchestrator

**Why:** Dependencies rot silently. Security patches go unnoticed, breaking changes accumulate until the jump is painful, and "we'll update later" becomes "we can't update at all." Regular, systematic upgrades — researched, grouped, verified — keep the codebase current without the drama of a big-bang update.

---

## Phase 1: Scan

Discover everything that's outdated. Run these and capture structured results:

```bash
# Package dependencies (all workspaces)
bun outdated 2>&1 || true

# Runtime & tooling versions (all managed via Homebrew)
bun --version
node --version
git --version
brew outdated --json 2>/dev/null || true

# Playwright browsers (if relevant)
npx playwright --version 2>/dev/null || true

# GitHub Actions — extract all `uses:` references from workflow files
grep -r 'uses:' .github/workflows/ 2>/dev/null || true
```

Check root `package.json` for existing runtime declarations:
- `"packageManager"` field (e.g., `"bun@1.3.11"`) — the declared Bun version
- `"engines"` field (e.g., `{ "node": ">=24.0.0" }`) — the declared Node requirement
- If these fields don't exist yet, the skill will create them during Tier 6

Compare runtime versions against latest via Homebrew:
- **Bun/Node/Git:** `brew outdated --json` shows what's behind
- Cross-check with `bun --version`, `node --version`, `git --version`

Check GitHub Actions for updates:
- Parse all `uses: owner/action@vN` references from `.github/workflows/*.yml`
- For each action, fetch the latest release tag from `https://api.github.com/repos/{owner}/{action}/releases/latest`
- Compare current tag against latest (e.g., `actions/checkout@v4` vs latest `v4.x.x` or `v5`)
- Flag major version bumps separately from minor/patch tag updates

Parse `bun outdated` into a structured list: `{ name, current, wanted, latest, workspace }`.

**If nothing is outdated and runtimes are current, report "Everything is up to date" and stop.**

---

## Phase 2: Categorize & Group

Classify every outdated package into upgrade groups. Process groups in this order (lowest risk first):

### Tier 1: Patch updates (batch all together)
All packages where only the patch version changed (`x.y.Z`). Low risk — bug fixes only. Skip changelog research for these.

### Tier 2: Minor updates — devDependencies (batch by ecosystem)
Group monorepo siblings and related tools:
- **Lint/format:** `@biomejs/*`, `eslint`, `eslint-plugin-*`, `typescript-eslint`, `typescript`
- **Test:** `vitest`, `@testing-library/*`, `@playwright/test`, `jsdom`, `@axe-core/*`, `pixelmatch`, `pngjs`
- **Build:** `vite`, `@vitejs/*`, `postcss`, `autoprefixer`, `tailwindcss`
- **Types:** `@types/*` packages

### Tier 3: Minor updates — production dependencies (batch by family)
Group monorepo siblings:
- **Drizzle:** `drizzle-orm`, `drizzle-kit`
- **DnD Kit:** `@dnd-kit/*`
- **React:** `react`, `react-dom`
- **React ecosystem:** `react-router-dom`, `focus-trap-react`
- **Hono:** `hono`, `@hono/*`
- **Claude SDK:** `@anthropic-ai/*`
- **Ink:** `ink` and related
- Everything else: individual or small logical groups

### Tier 4: Major updates (one at a time)
- **Skip `.0.0` releases** — wait for at least `.0.1` or `.1.0` before upgrading. First major releases carry the highest bug density.
- **Exception:** Libraries that use major versions for minor feature additions (e.g., `eslint`, `typescript`, `daisyui`) — these can be upgraded at `.0.0`. Identify these by checking release frequency: if a library ships 1+ major per year, it's a "major-as-minor" library.
- Major updates of monorepo siblings must be grouped together.

### Tier 5: GitHub Actions
Actions pinned to a major tag (e.g., `@v4`) auto-receive minor/patch updates. Focus on:
- **Major tag bumps** (e.g., `actions/checkout@v4` -> `@v5`): research changelog, apply individually
- **Third-party actions** with SHA pins: check for newer releases
- **Deprecated actions**: flag for replacement

Apply action updates by editing `.github/workflows/*.yml` directly. Commit as `chore(ci): upgrade {action} v{old} -> v{new}`. Verification: push to a branch and confirm CI passes (or at minimum, validate YAML syntax).

### Tier 6: Runtime & tooling updates
Runtimes are real dependencies — treat them like packages, not informational footnotes.

Everything that isn't managed through npm/bun packages is managed through **Homebrew**. Check brew formulae for updates and upgrade them directly.

**Scan brew-managed tools:**
```bash
# Check installed versions and available updates
brew info bun --json | head -1
brew info node --json | head -1
brew info git --json | head -1
brew outdated --json
```

**Bun:**
1. Compare `bun --version` against `brew info bun` latest
2. If outdated: run `brew upgrade bun`
3. After upgrade: update (or add) `"packageManager": "bun@{new-version}"` in root `package.json`
4. Verify: `bun --version` matches, `bun install` succeeds

**Node.js:**
1. Compare `node --version` against `brew info node` latest
2. If outdated: run `brew upgrade node`
3. After upgrade: update (or add) `"engines": { "node": ">={major}.0.0" }` in root `package.json` — pin to the major, not the exact patch
4. Verify: `node --version` matches

**Git:**
1. Compare `git --version` against `brew info git` latest
2. If outdated: run `brew upgrade git`
3. No package.json changes needed

**Other brew-managed tools** (check if installed):
```bash
# Discover other dev tools managed by brew that we use
brew list --formula
```
If any project-relevant formulae (e.g., `postgresql`, `redis`) are outdated, upgrade them too.

**Verification after runtime upgrades:**
- `bun install` must succeed (Bun validates `packageManager` and `engines` fields)
- `bun run check && bun run lint && bun run test` must pass — runtime bumps can expose new behavior

**Commit:** `chore(deps): set runtime versions (bun {version}, node >={version})`

**Grouping heuristic:** If two packages share an npm scope (`@scope/a`, `@scope/b`) or are from the same upstream monorepo, they belong in the same group. When in doubt, group together — separate upgrades of tightly-coupled packages cause more breakage than joint upgrades.

---

## Phase 3: Research (parallel subagents)

For each group with **minor or major** updates, spawn a **general-purpose** research subagent that:

1. Fetches release notes / changelog between current and target version:
   - npm registry: `https://registry.npmjs.org/{package}` — get `repository` URL
   - GitHub Releases API: `https://api.github.com/repos/{owner}/{repo}/releases`
   - Fallback: `CHANGELOG.md` via GitHub contents API
2. Scans for keywords: `BREAKING`, `deprecated`, `removed`, `migration`, `renamed`
3. Checks our codebase for usage of affected APIs:
   - `Grep` for deprecated/removed function names in our source
   - Identify files that will need migration changes
4. Produces a structured report:
   ```
   ## {group name}: {packages} {current} -> {target}
   Risk: LOW | MEDIUM | HIGH
   Breaking changes: [list or "none"]
   Deprecations: [list or "none"]
   Migration steps: [list or "none needed"]
   Our files affected: [list or "none"]
   ```

**Spawn all research agents in parallel** — one per group. Tier 1 (patch-only) groups skip research entirely.

**Important:** Don't blindly trust changelogs. A "breaking change" that affects an API we don't use is not a risk. Cross-reference every claimed breaking change against our actual usage.

### Subagent prompt template

For each research subagent, include:
- The package name(s) and version range (current -> target)
- Our workspace(s) that depend on it
- Instruction to fetch changelogs, identify breaking changes, and grep our codebase for affected APIs
- Request for the structured report format above
- Instruction to keep the report concise — focus on what affects US, not the full changelog

---

## Phase 4: Apply (sequential, group by group)

For each group, in tier order:

### 4a. Pre-upgrade snapshot
```bash
cp bun.lock bun.lock.backup
```

### 4b. Update versions
Edit `package.json` files to set new version ranges (`^{target}`). For monorepo-internal workspace packages, update all locations where the dependency appears.

### 4c. Install
```bash
bun install
```

### 4d. Apply migration steps
If the research phase identified code changes needed (renamed APIs, changed imports, new required config), apply them now. This is where the bulk of major-version work happens.

### 4e. Verify
Run the full verification pipeline:
```bash
bun run check && bun run lint && bun run test
```

If Playwright-tested packages changed:
```bash
cd packages/web && npx playwright test
cd packages/design-system && npx playwright test
```

### 4f. On success — commit
```bash
git add package.json packages/*/package.json bun.lock
# Also stage any migration code changes
git commit -m "chore(deps): upgrade {group description}"
```

Use descriptive group names: `chore(deps): upgrade test tooling (vitest, playwright)`, `chore(deps): upgrade drizzle-orm 0.39 -> 0.41`, `chore(deps): patch updates (12 packages)`.

### 4g. On failure — fix or rollback

**Max 3 fix attempts per group:**
1. Read the error output carefully — type errors, lint failures, test failures
2. Fix the issue (update imports, adjust types, fix test expectations)
3. Re-run verification
4. If still failing after 3 attempts: **rollback this group**:
   ```bash
   git checkout -- package.json packages/*/package.json bun.lock
   # Also revert any migration code changes
   git checkout -- .
   bun install
   ```
5. Log the group as `SKIPPED` with the failure reason and the error output

**Rollback is atomic per group.** A failed Tier 3 group does not affect successfully applied Tier 1 and 2 groups.

---

## Phase 5: Unused dependency check

While scanning, flag packages that are in `package.json` but not imported anywhere in the codebase. These should be removed rather than upgraded.

```bash
# For each dependency, check if it's actually imported
# Skip: @types/* (used by TypeScript implicitly), build tools (vite, postcss, etc.)
```

Report unused packages separately — don't auto-remove them, just flag.

---

## Phase 6: Report

Produce a final summary:

```
## Upgrade Report

### Applied
- chore(deps): {group} — {packages} ({old} -> {new})
- chore(deps): {group} — {packages} ({old} -> {new})

### Skipped (failed verification)
- {group}: {failure reason}

### Deferred (.0.0 major)
- {package} {current} -> {target} — waiting for post-release patches

### Unused (candidates for removal)
- {package} — not imported in any source file

### GitHub Actions
- {action}@{tag}: [up to date | upgraded {old} -> {new} | major available (deferred)]

### Runtime (Homebrew)
- Bun: {old} -> {new} via `brew upgrade bun`, packageManager set to bun@{new} [up to date | upgraded]
- Node: {old} -> {new} via `brew upgrade node`, engines.node set to >={major}.0.0 [up to date | upgraded]
- Git: {old} -> {new} via `brew upgrade git` [up to date | upgraded]

### Verification (final state)
- Type check: PASS
- Lint: PASS
- Tests: PASS ({n} suites, {m} tests)
```

---

## Rules

- **Never upgrade without verification.** Every group must pass `check + lint + test` before committing. No exceptions.
- **Never force through a broken upgrade.** If it breaks after 3 fix attempts, roll it back cleanly and report it. A partial upgrade is better than a broken codebase.
- **Commit per group, not per package.** Atomic commits that can be individually reverted if issues surface later.
- **Research before major upgrades.** Don't yolo a major version bump without reading the changelog. The 2 minutes of research prevents 2 hours of debugging.
- **Respect `.0.0` caution.** First major releases carry the most bugs. Wait for a patch unless it's a "major-as-minor" library.
- **Don't upgrade what isn't used.** Flag unused packages for removal instead of upgrading.
- **Group monorepo siblings.** Upgrading `drizzle-orm` without `drizzle-kit` (or vice versa) causes version mismatches. Always upgrade together.
- **Pin, don't widen.** When upgrading, set `^{target}` — don't change to `*` or `>=`.
- **Rollback beats debugging.** If an upgrade causes mysterious failures, roll it back and research more. Don't burn 30 minutes guessing.
- **Leave the lockfile clean.** After all upgrades, `bun.lock` should reflect exactly what's in `package.json`. Run `bun install` one final time to confirm.
