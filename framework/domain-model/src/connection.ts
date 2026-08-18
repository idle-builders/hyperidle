/**
 * AN1 — ServiceConnection shared types.
 *
 * Closed sets for auth source and health, the per-user × service UI view,
 * and runtime type guards.
 *
 * @lore AN1: "Connection" (the db-connection noun) collides with this module.
 * Code uses the `ServiceConnection*` prefix (table, resolver, view) to
 * disambiguate. User-facing copy says "connection" / "connected service".
 *
 * @lore AN1: This file MUST remain dependency-free of server imports so
 * `@hyperidle/domain-model` stays a leaf package. No server, no DB, no Node builtins.
 */

/** Where a connection's authority lives. CLOSED set (concept Phase 4). */
export const CONNECTION_AUTH_SOURCES = ["token", "mcp", "inherited"] as const;
export type ConnectionAuthSource = (typeof CONNECTION_AUTH_SOURCES)[number];

/** Whether the connection currently works. CLOSED set (concept Phase 4). */
export const CONNECTION_HEALTH = ["working", "needs-attention"] as const;
export type ConnectionHealth = (typeof CONNECTION_HEALTH)[number];

/**
 * Held auth sources only — what a user can create.
 * (inherited is never created by a user — it is reflected from the harness/environment.)
 */
export const HELD_AUTH_SOURCES = ["token", "mcp"] as const;
export type HeldAuthSource = (typeof HELD_AUTH_SOURCES)[number];

/**
 * The UI/agent-facing view of a connection. NEVER carries a secret — only the
 * FACT of availability + health (concept hard-rule 1). Safe to send to the browser.
 *
 * @lore AN1: `via` is server-constructed — never a raw URL or secret echo.
 * token → "API key · stored encrypted"; mcp → "<host>"; inherited → "<harness> · <name>".
 *
 * @lore AN1: No `trustTier` field — ETHOS §2 kills preemptive security gates.
 * Adding one requires a concept-doc update first.
 */
export interface ServiceConnectionView {
	/** sc-<uuid> (held) | inherited:<harness>:<name> (projected) */
	id: string;
	/** Display name of the connected service, e.g. "Stripe", "GitHub". */
	service: string;
	/** Server-constructed description of where the tools come from. */
	via: string;
	authSource: ConnectionAuthSource;
	health: ConnectionHealth;
	/** false for inherited (HyperIdle stores nothing; no DELETE target exists). */
	removable: boolean;
}

/**
 * AU36 — one inherited-reach fact: a service the machine already holds auth
 * for, found by a connections-domain probe (harness MCP configs, logged-in
 * CLIs). The connections domain owns the probe, the cache and the projection
 * of these facts — the harness capability descriptor carries NO reach field.
 *
 * Identity only (AN1 hard-rule 4, re-pinned in this home): name, kind,
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
