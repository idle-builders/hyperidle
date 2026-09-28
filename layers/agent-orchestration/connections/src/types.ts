/**
 * Agent-orchestration–scoped connection vocabulary.
 *
 * HeldAuthSource/HELD_AUTH_SOURCES remain in domain-model: run-orchestration also
 * uses them, and service→service imports are forbidden by governance. Domain-model
 * (framework) is the only legal shared location.
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
 * @lore: InheritedConnectionFact source — provenance string, not harness dependency; values must stay byte-identical; Connections view id/via are built from them
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
