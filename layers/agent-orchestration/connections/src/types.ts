/**
 * Agent-orchestration–scoped connection vocabulary.
 *
 * @lore AU44-b8: InheritedConnectionFact moved from framework/domain-model/src/connection.ts.
 * Used exclusively within the agent-orchestration connections service and the boot
 * composition root.
 *
 * HeldAuthSource/HELD_AUTH_SOURCES remain in domain-model: run-orchestration (a service)
 * also uses them, and service→service (run-orchestration→connections) is a crossing that
 * governance forbids. Domain-model (framework) is the only legal shared location.
 */
import type { ConnectionHealth } from "@hyperidle/domain-model";

/**
 * One inherited-reach fact: a service the machine already holds auth
 * for, found by a connections-domain probe (harness MCP configs, logged-in
 * CLIs). The connections domain owns the probe, the cache and the projection
 * of these facts — the harness capability descriptor carries NO reach field.
 *
 * Identity only — never a token value: name, kind,
 * provenance, health — no secret, token, env, or command field may ever
 * appear here. Adding one requires editing this type — a visible, reviewable
 * act.
 *
 * @lore AU36 (D2): `source` is the renamed `InheritedToolDescriptor.harness`
 * field — a plain provenance string ("which config the auth was found in"),
 * NOT a dependency on the harness model. The VALUES are unchanged
 * ("claude-code" | "codex" | "opencode" | "environment") because the view
 * `id`/`via` are built from them and the Connections view must stay
 * byte-identical.
 */
export interface InheritedConnectionFact {
	/** Server/CLI identity, e.g. "github", "linear", "gh". */
	readonly name: string;
	readonly kind: "mcp-server" | "cli";
	/** Provenance: "claude-code" | "codex" | "opencode" | "environment". */
	readonly source: string;
	/** evidence-first; "unknown" when not provable from probe output. */
	readonly health: ConnectionHealth | "unknown";
}
