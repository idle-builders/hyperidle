/** Where a connection's authority lives. CLOSED set. */
export const CONNECTION_AUTH_SOURCES = ["token", "mcp", "inherited"] as const;
export type ConnectionAuthSource = (typeof CONNECTION_AUTH_SOURCES)[number];

/** Whether the connection currently works. CLOSED set. */
export const CONNECTION_HEALTH = ["working", "needs-attention"] as const;
export type ConnectionHealth = (typeof CONNECTION_HEALTH)[number];

/**
 * Held auth sources only — what a user can create.
 * (inherited is never created by a user — it is reflected from the harness/environment.)
 *
 */
export const HELD_AUTH_SOURCES = ["token", "mcp"] as const;
export type HeldAuthSource = (typeof HELD_AUTH_SOURCES)[number];

/**
 * The UI/agent-facing view of a connection. NEVER carries a secret — only the
 * FACT of availability + health. Safe to send to the browser.
 *
 * `via` is server-constructed — never a raw URL or secret echo.
 * token → "API key · stored encrypted"; mcp → "\<host\>"; inherited → "\<harness\> · \<name\>".
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
	/** The agents it is kept from; every other agent of its owner reaches it. Always empty for an inherited one. */
	withheldFrom: string[];
}
