# Developer Guide

Walkthrough docs for contributors — onboarding, commands, testing, and conventions. Depth (coding rules, test archetypes, design tokens) lives in `.claude/rules/` and `docs/ui-design/`; these guides link, never restate.

- [getting-started.md](getting-started.md) — prerequisites, five-command quick start, ports/env table, 12-package repo map
- [commands.md](commands.md) — full `npm` script reference grouped by task, post-AT1 affected-slice semantics
- [testing.md](testing.md) — test commands, affected-slice mechanics, E2E lanes, `requireHarness` path
- [mock-data-policy.md](mock-data-policy.md) — no mock data in runtime code; lint + inventory enforcement (path frozen — do not rename)
- [design-system.md](design-system.md) — MockProviders isolation harness, story enforcement, no viewer/snapshot-net facts
- [linting-and-formatting.md](linting-and-formatting.md) — Biome/ESLint split, three lint-chained guards, AI7 page-anatomy rules
- [work-packages.md](work-packages.md) — work-package spec locations, per-WP progress/retro files, pointer to `.claude/rules/skill-discovery.md`
