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

// @lore BC5 T7b: the routine scheduler's `fireRoutine` is gone —
// `tools/eval`'s scenarios drive a subscription wake through the real
// `edit_user`/subscription-fire mechanism instead. `createStandaloneSearchDocuments`
// stays: it is a standalone `search_documents` runner other composition
// roots still need outside any request that already has one in scope.
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
