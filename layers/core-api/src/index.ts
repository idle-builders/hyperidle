/**
 * @hyperidle/core-api — Layer composition barrel.
 *
 * The core-api Layer composes its Service packages (Increment 0: `knowledge`).
 * A Layer package MAY depend on its own Services (that is composition); a
 * Service package may NOT depend on another Service (Mechanism C). The Layer is
 * the only place a cross-Service wiring is named.
 *
 * @lore AU31 §7.2 (R2, founder-ratified): this barrel is the layer's PUBLIC
 * FACE, not a grab-bag re-export of every Service surface — a plain `export …
 * from "<service>"` here is exactly the laundering shape R2 exists to catch.
 * The former `listKnowledge`/`KnowledgeScope` re-export (AU19) had zero
 * consumers anywhere in the tree and is deleted rather than reshaped; a
 * genuinely-needed Service capability is wrapped in a function this package
 * owns, never re-exported by name.
 */

// BC4 follow-up (architecture.md §8.3): `fireRoutine` now takes a
// `search_documents` runner (never `@hyperidle/document` itself) — this is
// the same standalone composition `service-bootstrap.ts`'s own scheduler
// wiring uses, exposed so `tools/eval`'s scenarios (the direct `fireRoutine`
// callers outside any request that already has a runner in scope) build the
// SAME thing rather than a second implementation.
export { createStandaloneSearchDocuments } from "./actions/compose.js";
// AU29 §2.5.2: the first-boot core-state face — the composition roots (desktop,
// tools/setup) call this instead of a database package writing service-owned tables.
export { applyFactoryCoreState } from "./bootstrap/factory-state.js";
export type {
	ComposeApiApplicationOptions,
	ComposedApiMiddleware,
} from "./compose-api-application.js";
// AU44 batch 8: moved from @hyperidle/http-middleware (dissolved)
export { composeApiApplication } from "./compose-api-application.js";
// AU31 §7.1: `./routes/health` is deleted as an entry — `health` is the one
// symbol a composition root mounts outside `/api` for backward compatibility
// (`authHealth` stays internal to `app.ts`, core-api's own auth-gated variant).
export { health } from "./routes/health.js";
// AU31 §7.1 (export-map shrink): `./service-bootstrap` is deleted as an entry
// (§7 clause 1) — these three are core-api's own composition functions, not a
// Service's, so re-exporting them here is the face's own content, not a
// laundered Service value. `bootCoreApi`'s `serviceBootstrap` option is what
// every composition root calls this through (`applications/**`).
export {
	DEFAULT_REAPER_STALE_AFTER_MS,
	registerAgentLayerServices,
	registerCoreDomainServices,
} from "./service-bootstrap.js";
// AU31 §7.1: `./services/agent-orchestration-port-composition` is deleted as
// an entry — same reasoning: core-api's own outbound-seam client, needed by a
// composition root BEFORE `bootCoreApi` runs (the port is passed IN as an
// option), so it cannot fold into `./boot`'s own result.
export {
	buildAgentOrchestrationPort,
	buildSeamBackedAgentRunConfigWriter,
	buildSeamBackedReviewVerdictRecorder,
	buildSeamBackedWorkIntentRecorder,
	createInProcessAgentOrchestrationTransport,
	createNetworkAgentOrchestrationTransport,
} from "./services/agent-orchestration-port-composition.js";
// AU31 §7.1: `tools/eval`'s one legitimate cross-package consumer of
// routine-firing — an own-module re-export (`./services/…`, not a Service
// package specifier), so R2 does not read it as a Service value escaping.
// `provisionTeamRoutines` (the `@hyperidle/routine` half the deleted
// `routines.ts` barrel also carried) is NOT re-exported here: `tools/eval` is
// a tooling composition root, and `tooling → service [import]` is allowed in
// its own (development) world, so it imports `@hyperidle/routine` directly.
export { fireRoutine } from "./services/routine-scheduler-bindings.js";
