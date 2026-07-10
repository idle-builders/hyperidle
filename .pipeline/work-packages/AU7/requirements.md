DOC-CLASS: minor

# AU7 Requirements

## Required Reading

- `.pipeline/work-packages/TRACK-AU.md`
- `plans/strategy-kernel-plugin-split/as-should-dependency-graph.md`
- `plans/strategy-kernel-plugin-split/as-is-vs-should-dependency-graph.md`
- `docs/architecture/runtime-simplification.md`
- `docs/architecture/system-overview.md`
- `docs/agent-layer/index.md`

## Goal

Retire Strategy and Fabric as runtime concepts. HyperIdle should boot as core app
plus agent layer plus editable/default configuration: no active Strategy
singleton, no Strategy port needed by production runtime, no Fabric bootstrap or
Fabric service bundle required by app boot, and no minimal Strategy fallback used
to run the product.

## Value

Maintainers can explain and change runtime behavior through the current
architecture instead of preserving old Kernel/Strategy/Fabric seams. Operators
keep the same Work, Conversation, Knowledge, Users, Settings, routine,
notification, session, tool, MCP, and harness behavior while hidden legacy
runtime nouns stop competing with app configuration and trigger-backed agent
runs.

## Success

- Production server boot succeeds without registering or selecting a Strategy.
- Runtime package dependencies no longer include `@hyperidle/fabric` or
  `@hyperidle/strategy-minimal`.
- Remaining Strategy/Fabric source packages and active runtime seam files are
  deleted or archived outside the runtime/workspace source graph:
  `packages/fabric`, `packages/strategy-minimal`,
  `packages/shared/src/strategy-port.ts`, and
  `packages/server/src/services/strategy-registry.ts` must not remain as live
  source/runtime/test fixtures.
- Former Fabric service behavior is reachable through
  `packages/server/src/app-runtime` and core/agent services.
- Agent-capable behavior continues through the AU6 request/runtime boundary.
- Durable rows with historical `strategy`/`fabric` names remain readable.
- Docs describe Fabric and Strategy only as legacy compatibility, not active
  runtime boundaries.

## Scope

In scope: retire runtime imports, boot wiring, active Strategy registry usage,
minimal Strategy fallback usage, package dependencies, legacy Strategy/Fabric
source package deletion/archive, tests that still require legacy packages as
fixtures, and docs that still teach Strategy/Fabric as active runtime concepts.

Out of scope: data table renames, plugin marketplace, remote worker scheduling,
new settings UI, new harnesses/tools/MCP servers, prompt quality, relevance
quality, and the AU8 mechanical dependency guard.

## Retirement Vocabulary

Strategy/Fabric retirement means the old nouns stop participating in production
runtime boot and execution and no longer exist as live source packages or test
fixtures. Durable Strategy/Fabric-era table names may remain only where needed
to preserve old records; they must be read through current app concepts and must
not require a Strategy/Fabric package, port, registry, bootstrap, or fallback.

## Guide Draft

Developers should model the runtime as:

1. Core app owns durable product records, app services, events, settings, and
   user-visible state.
2. Agent layer owns session requests, admission, provisioning, harnesses, tools,
   MCP, context, capture, writeback, and lifecycle publication.
3. Built-in/plugin defaults seed editable configuration; they do not run as a
   hidden Strategy/Fabric layer.

To find former Fabric behavior, look in `packages/server/src/app-runtime` and
core/agent services. To start agent work, create or consume an
`AgentSessionRequest`; do not register a Strategy, import Fabric runtime, or use
minimal Strategy as fallback.
