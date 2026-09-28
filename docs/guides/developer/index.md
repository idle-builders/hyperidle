# Developer Guide

Walkthrough docs for contributors — onboarding, commands, testing, and conventions. Depth (coding rules, test archetypes, design tokens) lives in `.claude/rules/` and `docs/interface/ui-design.md`; these guides link, never restate. Architectural boundary rules live in [`tools/governance/README.md`](../../../tools/governance/README.md), which is the only place they are written down.

- [getting-started.md](getting-started.md) — prerequisites, five-command quick start, repo map of 35 workspace packages
- [commands.md](commands.md) — `npm` script reference grouped by task
- [testing.md](testing.md) — test commands, affected-slice mechanics, E2E lanes, `requireHarness` path
- [mock-data-policy.md](mock-data-policy.md) — no mock data in runtime code; lint + inventory enforcement (path frozen — do not rename)
- [linting-and-formatting.md](linting-and-formatting.md) — the real `lint` chain, Biome/ESLint split, the architectural governance lint, the production/development file rule
