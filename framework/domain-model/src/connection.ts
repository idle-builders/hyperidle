/**
 * ServiceConnection shared types.
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
 *
 * @lore AU44-b8: survivor in domain-model. Callers include run-orchestration
 * (a service) and boot.ts (composition root). Moving to @hyperidle/connections
 * would require run-orchestration to cross-import connections (service→service),
 * which governance forbids. Domain-model (framework) is the only legal shared location.
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

// InheritedConnectionFact moved to @hyperidle/connections.
