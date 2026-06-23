/**
 * AN1 — External Connections shared types.
 *
 * The OPEN per-(user × service) connection set. DISTINCT from the closed infra
 * credential catalog (credential.ts — 4-entry singleton). These types model
 * what the UI and agents see about a connection's availability — never the
 * secret itself.
 *
 * @lore AN1: Two resolvers, one encryption primitive. The closed catalog
 * (serverCredentials table, CredentialResolver) stays untouched. The open set
 * (serviceConnections table, ServiceConnectionResolver) uses the same AES-GCM
 * encryption primitive but is a separate table, separate resolver, separate type.
 */

/** Where a connection's authority comes from. CLOSED set. */
export const CONNECTION_AUTH_SOURCES = ["harness", "token", "mcp-oauth"] as const;
export type ConnectionAuthSource = (typeof CONNECTION_AUTH_SOURCES)[number];

/** Whether the connection is currently usable. CLOSED set. */
export const CONNECTION_HEALTH = ["usable", "needs-attention", "expired"] as const;
export type ConnectionHealth = (typeof CONNECTION_HEALTH)[number];

/** Provenance of the connector. CLOSED set (AN4 consumes; AN1 records). */
export const TRUST_TIERS = ["vetted", "community"] as const;
export type TrustTier = (typeof TRUST_TIERS)[number];

/**
 * The agent-facing / UI-facing view of a connection. NEVER carries a secret —
 * only the FACT of availability + health (concept "state-only-in-responses").
 *
 * @lore AN1: No token/encryptedToken/secret/clientId/clientSecret field.
 * Enforced at the type level + response builder level. The view is safe to
 * pass to the browser and to agent-facing surfaces.
 */
export interface ServiceConnectionView {
	id: string; // absent/derived sentinel for harness rows (not deletable)
	service: string; // display name
	via: string; // server-rendered "where the tools come from" string
	authSource: ConnectionAuthSource;
	health: ConnectionHealth;
	trustTier: TrustTier;
	toolCount: number | null; // null until AN2 connects out (optional at AN1)
	removable: boolean; // false for harness-derived rows
}
