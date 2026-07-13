/**
 * harness-registry — the execution Layer's read-model of which agent harnesses
 * exist and their coarse capability shape. DB-FREE by contract (Mechanism B):
 * this Service holds zero domain-Service or `@hyperidle/db` reference. Its only
 * dependency is `@hyperidle/shared` (the db-free canonical type source).
 *
 * @lore AU19: the supported harness set is builtin / claude-code / codex /
 * opencode / cursor-agent (cursor-agent is inert today). The registry names them
 * as data; concrete adapters (CLI spawn, remote WS client) are the rest of the
 * `harness-registry` Service migrated in Increment 4 — all inside agent-execution,
 * where the execution-boundary guard permits harness/LLM/MCP symbols.
 */

/** Coarse, db-free descriptor of a supported harness. */
export interface HarnessDescriptor {
	readonly name: string;
	readonly kind: "local" | "remote";
	/** Whether this harness spawns an external CLI binary (vs the in-process builtin). */
	readonly spawnsCli: boolean;
}

const REGISTRY: readonly HarnessDescriptor[] = [
	{ name: "builtin", kind: "local", spawnsCli: false },
	{ name: "claude-code", kind: "local", spawnsCli: true },
	{ name: "codex", kind: "local", spawnsCli: true },
	{ name: "opencode", kind: "local", spawnsCli: true },
	{ name: "cursor-agent", kind: "local", spawnsCli: true },
];

/** The supported harness capability descriptors. */
export function harnessCapabilities(): readonly HarnessDescriptor[] {
	return REGISTRY;
}
