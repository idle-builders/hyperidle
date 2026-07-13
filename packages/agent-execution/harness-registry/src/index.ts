/**
 * Barrel for @hyperidle/harness-registry (agent-execution Layer Service).
 *
 * DB-free: deps = @hyperidle/shared only, never @hyperidle/db (Mechanism B).
 * The canonical harness descriptor type is sourced from @hyperidle/shared (the
 * verified db-free cross-boundary type home, §7.3), re-exported here so consumers
 * reference it without importing another Service.
 */
export { harnessCapabilities } from "./harness-capabilities.js";
export type { HarnessDescriptor } from "./harness-capabilities.js";
export type { HarnessCapabilityDescriptor } from "@hyperidle/shared";
