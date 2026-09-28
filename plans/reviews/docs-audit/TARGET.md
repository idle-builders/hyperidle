# Docs target — the final file map

Every builder links to these paths only. Evidence per page: `A`–`E` audit notes and `truth-sheet.md`
in this folder. Rules: `.claude/rules/docs.md`.

**How to write every page**
- Keep every fact from the old pages that is still true in code. Drop everything false. Verify each
  claim against the code, never against another doc.
- Say what is true now. No history ("was deleted", "used to"), no track or work-item ids (BC5, AQ1…),
  no dates of decisions, no restating lint rules (link to the rule or `tools/governance/README.md`).
- Plain, simple words. Short. One page owns one subject; others link to it.
- Gaps are fine — a missing fact is better than a false one. Do not invent.

## Map (old → new)

| New page | Owns | Built from |
|---|---|---|
| `docs/index.md` | one-line pointer per folder | new |
| **product/** (published) | | |
| `product/index.md` | reading order | same |
| `product/what-is-hyperidle.md` | what it is, for whom, harnesses | same |
| `product/how-work-flows.md` | tasks, owners, reviews, subscriptions — the loop | same + `human-ai-collaboration.md` |
| `product/how-knowledge-compounds.md` | documents compound across the team | same |
| **guides/user/** (published) | | |
| `index.md`, `getting-started.md`, `the-interface.md`, `agents.md`, `running-your-team.md`, `settings.md`, `connections.md` | as named | same |
| `guides/user/views.md` | Conversations, Work, Knowledge walkthrough | `three-core-views.md` |
| **guides/developer/** (published) | | |
| `index.md`, `getting-started.md`, `commands.md`, `testing.md`, `mock-data-policy.md` (path frozen), `linting-and-formatting.md` | as named | same; `testing.md` also takes the harness test rules from `agent-layer/harness-coverage-enforcement.md` |
| **deployment/** (published) | | |
| `index.md`, `laptop.md`, `self-hosting.md`, `shared-backend.md`, `releases.md` | as named | same; `index.md` absorbs `guides/user/deployment.md` |
| **architecture/** | | |
| `architecture/index.md` | links | same |
| `architecture/overview.md` | 4 layers, modules, the 18 actions declared once and served as HTTP + MCP + UI client, `changes` as event log, events, core→orchestration hand-off, what HyperIdle does not do | `system-overview`, `as-implemented-domain-architecture`, `runtime-simplification`, `data-flow-examples`, `decisions`, `run-unit-model`, `system-boundary` |
| `architecture/security.md` | who can read/write what, websocket topics, the one credential | `authorization-model`, `credential-model` |
| `architecture/connections.md` | held vs inherited connections | `connection-model` |
| `architecture/plugins.md` | what a plugin contributes, install, bundled plugins | same |
| **agent-layer/** | | |
| `agent-layer/index.md` | links | same |
| `agent-layer/agent-model.md` (name kept — website test) | what an agent is, fields, statuses, models | same + `model-routing-and-cost` |
| `agent-layer/harnesses.md` | the four harnesses, capability descriptor, bring-your-own key | `harness-capability-descriptor` |
| `agent-layer/return-gate.md` | how a session must report back | `return-gate-enforcement` |
| **objects/** (replaces `process-layer/` + `knowledge-architecture/`) | | |
| `objects/index.md` | the four objects + session + plugins, one line each | new |
| `objects/task.md` | tree, states, dependencies, owner/handoff, needs-review, verdicts, lifecycle propagation | `tasks-and-sessions`, `handoff-and-lifecycle-propagation`, `the-four-primitives` |
| `objects/thread.md` | threads, host kinds, message types, verdicts, the review flow (agent asks, human clears) | `human-interface-layer/thread-primitive` (object half) |
| `objects/document.md` | the documents table, tree, slot, scope, status, `as` (memory/artifact), usage | `the-canonical-store`, `artifact-primitive` |
| `objects/user.md` | humans and agents as one user, team as a name, subscriptions, inbox | `teams`, `subscriptions-and-retros`, `human-interface-layer/notification-primitive` |
| `objects/session.md` | sessions, states, work intents, concurrency limit, notes, watch/stop | `tasks-and-sessions` (session half), `wip-and-cost-limits` |
| `objects/documents-in-sessions.md` | the `knowledge/` sandbox tree, manifest, selection, writeback | `the-knowledge-fabric-how-knowledge-moves`, `sync-and-conflict-resolution` |
| `objects/folders.md` | filesystems: kinds, mounting, writeback, injection | `filesystem-primitive` |
| **interface/** (replaces `human-interface-layer/`, `information-architecture/`, `blocks/`, `ui-design/`) | | |
| `interface/index.md` | links | new |
| `interface/overview.md` | the shell, sidebar entries, what the UI is for | `human-interface-layer/overview`, `the-three-views` |
| `interface/navigation.md` | routes, opening any reference (open handler), shortcuts | `app-shell-always-present`, `open-contract`, `cross-view-navigation-map` (rules only) |
| `interface/messages.md` | how a thread renders: the part model | `part-model`, `thread-primitive` (rendering half) |
| `interface/reviews.md` | the review page and its canvas kinds | `review-primitive` |
| `interface/blocks.md` | blocks derived from markdown at read time | all of `blocks/`, `block-primitive` |
| `interface/ui-design.md` | stack, themes, component tiers, page scaffold, where the lint rules live | `ui-design/*`, `guides/developer/design-system.md` |

**Deleted, no successor:** `requirements/` (all), `archive/` (all), `product/product-decisions.md`,
`guides/developer/work-packages.md`, `guides/developer/design-system.md` (→ ui-design),
`guides/user/deployment.md` (→ deployment/index), `human-interface-layer/content-examples-for-design-reference.md`,
`human-interface-layer/decisions.md`, `information-architecture/{conversations,work,knowledge}-view.md`,
`ui-design/settings-consistency.md`, `process-layer/canonical-shapes.md`, and every old folder above
once its content has moved.

## Pointers outside docs/ to repoint (same change)

| Where | To |
|---|---|
| `layers/core-ui/src/block/types.ts:2-3` (drop "frozen"), `block/derive-blocks.ts:4`, `block/__tests__/types.test.ts:7` | `docs/interface/blocks.md` |
| `layers/core-ui/src/ds/PageScaffold.tsx:5`, `.claude/rules/design-system.md:66` | `docs/interface/ui-design.md` |
| `layers/agent-orchestration/filesystems/src/filesystem-shape.ts:14`, `layers/core-ui/src/settings/SettingsFilesystems.stories.tsx:9,50`, `layers/agent-execution/harness-registry/src/cli-mcp-config.ts:154` | `docs/objects/folders.md` |
| `layers/core-api/src/boot.ts:193`, `layers/agent-orchestration/run-orchestration/src/connection-provisioning.ts:31` | `docs/architecture/security.md` |
| `layers/core-api/src/boot.ts:12`, `layers/core-api/src/api-middleware-stack.ts:10`, `layers/agent-orchestration/run-orchestration/src/context.ts:411` | `docs/architecture/overview.md` |
| `.claude/rules/testing.md:100` | `docs/guides/developer/testing.md` |
| comments citing requirement ids like "S-9.2" | reword to say the rule plainly |
| `CLAUDE.md` Documentation section, `README.md:124` ("three-layer"), `.claude/rules/docs.md` folder list, `AGENTS.md` if it lists folders | new folder list |
| `applications/website/src/lib/docs-nav.ts`, `applications/website/src/__tests__/doc-links.test.ts` | new published paths |
| `applications/website/src/**/*.astro` copy | no "bets", no role presets, no trust-gating, no "ten minutes" |

Left alone: migration SQL comments (history), the governance fixture `docs/architecture/index.md`
(path still exists).
