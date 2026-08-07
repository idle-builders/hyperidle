# Developer Guide

Walkthrough docs for contributors — onboarding, commands, testing, and conventions. Depth (coding rules, test archetypes, design tokens) lives in `.claude/rules/` and `docs/ui-design/`; these guides link, never restate. Architectural boundary rules live in [`governance/README.md`](../../../governance/README.md), which is the only place they are written down.

- [getting-started.md](getting-started.md) — prerequisites, five-command quick start, ports/env table, repo map of the 33 workspace packages
- [commands.md](commands.md) — full `npm` script reference grouped by task, affected-slice semantics, governance commands
- [testing.md](testing.md) — test commands, affected-slice mechanics, E2E lanes, `requireHarness` path
- [mock-data-policy.md](mock-data-policy.md) — no mock data in runtime code; lint + inventory enforcement (path frozen — do not rename)
- [design-system.md](design-system.md) — MockProviders isolation harness, story enforcement, no viewer/snapshot-net facts
- [linting-and-formatting.md](linting-and-formatting.md) — the real `lint` chain, Biome/ESLint split, the architectural governance lint, the production/development file rule
- [work-packages.md](work-packages.md) — work-package spec locations, per-WP progress/retro files, pointer to `.claude/rules/skill-discovery.md`
