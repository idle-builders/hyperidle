/**
 * L2 — Founder/Actor Routing Schema (TRACK-L L2).
 *
 * Identity primitives for the two founders (CEO + CPO).
 *
 * `Actor` is the wire-format shape returned by `GET /api/me`.
 * `REASSIGN_VERB` is the canonical verb name for "Reassign to <co-founder>"
 * (transport: `PATCH /api/threads/:id/route`); see TRACK-L L2 AC.
 */

/** Founder role. */
export type ActorRole = "CEO" | "CPO";

/** Persisted/wire-format actor row. `domain_tags` is the wire field. */
export interface Actor {
	id: string;
	role: ActorRole;
	// biome-ignore lint/style/useNamingConvention: API contract — `domain_tags` is the wire field name (snake_case) shared between client + server.
	domain_tags: readonly string[];
}

/** Canonical verb for "Reassign to <co-founder>" (TRACK-L L2 AC). */
export const REASSIGN_VERB = "reassign-to-cofounder" as const;
