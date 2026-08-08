/**
 * @hyperidle/core-api — Layer composition barrel.
 *
 * The core-api Layer composes its Service packages (Increment 0: `knowledge`).
 * A Layer package MAY depend on its own Services (that is composition); a
 * Service package may NOT depend on another Service (Mechanism C). The Layer is
 * the only place a cross-Service wiring is named.
 *
 * @lore AU19: this barrel re-exports Service surfaces so downstream Applications
 * and lower Layers reach core-api through one boundary, never by deep-importing
 * a Service's internals.
 */

export type { KnowledgeScope } from "@hyperidle/knowledge";
export { list as listKnowledge } from "@hyperidle/knowledge";
// AU29 §2.5.2: the first-boot core-state face — the composition roots (desktop,
// tools/setup) call this + agent-orchestration's applyFactoryRunConfigDefaults,
// in that order, instead of a database package writing service-owned tables.
export { applyFactoryCoreState } from "./bootstrap/factory-state.js";
