// AE6 — Old-to-new kind mapping for read-time normalization.
// Used as defense-in-depth when DB rows haven't been migrated yet
// (e.g., in tests, backup restores, or if migration runs partially).
//
// @lore AE6: This map is ONLY used at read-time; it never mutates the DB.
// The canonical migration is in framework/db/drizzle/0027_AE6_artifact_extensibility.sql.
// Keeping this in framework/domain-model means both the server routes and any future
// consumers can normalize old kinds without duplicating the mapping.

/** A mapping entry for a legacy artifact kind. */
export interface OldKindMapping {
	/** The new fundamental kind string. */
	readonly kind: string;
	/** The label to apply, or null if no label applies. */
	readonly label: string | null;
}

/**
 * Maps all 13 old artifact kinds (12 business-domain + unknown_kind) to
 * the 6 new fundamental kinds with optional labels.
 */
export const OLD_KIND_MAP: Readonly<Record<string, OldKindMapping>> = {
	code_diff: { kind: "code", label: null },
	contract: { kind: "text", label: "contract" },
	drafted_email: { kind: "text", label: "email" },
	decision: { kind: "text", label: "decision" },
	data_analysis: { kind: "text", label: "analysis" },
	comm_draft: { kind: "text", label: "communication" },
	deck: { kind: "html", label: "deck" },
	dashboard: { kind: "html", label: "dashboard" },
	screenshot: { kind: "image", label: null },
	design: { kind: "image", label: "design" },
	verification: { kind: "data", label: "test-results" },
	running_service: { kind: "url", label: "service" },
	unknown_kind: { kind: "text", label: null },
};
