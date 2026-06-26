/**
 * AL5 — Registry index: official catalog + community URL loader.
 *
 * RegistryIndex is the wire shape for a surface catalog JSON file.
 * OFFICIAL_REGISTRY_INDEX is the curated first-party catalog (single source of truth).
 * loadRegistryIndex(url) fetches + validates a community index from any URL.
 *
 * @lore AL5: The official index and FIRST_PARTY_SURFACE_MANIFESTS are kept in sync
 * — the official index wraps the existing manifests with name/version metadata.
 * The server reads from OFFICIAL_REGISTRY_INDEX.surfaces (index-driven path, AC2).
 * Both server and web import from this module so there is exactly one copy.
 *
 * @lore AL5: loadRegistryIndex is URL-agnostic — it works for any URL including
 * OFFICIAL_REGISTRY_INDEX_URL (the published canonical location). At AL5 the
 * official index is embedded as a constant; the URL is reserved for future
 * remote-fetch of upgrades.
 */

import type { SurfaceManifest } from "./review-surface.js";
import { FIRST_PARTY_SURFACE_MANIFESTS } from "./review-surface.js";

// ── RegistryIndex wire shape ──────────────────────────────────────────────────

/**
 * A surface catalog JSON file — served at a URL or embedded as a constant.
 * Mirrors the shadcn registry index format (name + version + entries).
 */
export interface RegistryIndex {
	/** Human-readable catalog name, e.g. "HyperIdle Official Registry". */
	readonly name: string;
	/** Semver. Community registries declare their own version. */
	readonly version: string;
	/** The surface manifests in this catalog. */
	readonly surfaces: readonly SurfaceManifest[];
}

// ── Official registry index (curated first-party catalog) ────────────────────

/**
 * The canonical URL where the official index is published.
 * At AL5 the index is embedded as a constant; this URL is reserved for
 * future remote-upgrade checks.
 */
export const OFFICIAL_REGISTRY_INDEX_URL = "https://registry.hyperidle.com/surfaces/index.json";

/**
 * The curated official catalog — authoritative source for the server's
 * surface-registry endpoint and the web browse dialog.
 *
 * @lore AL5 AC2: The server MUST use .surfaces from this index (not a
 * separate copy of FIRST_PARTY_SURFACE_MANIFESTS) so the two stay in sync.
 */
export const OFFICIAL_REGISTRY_INDEX: RegistryIndex = {
	name: "HyperIdle Official Registry",
	version: "1.0.0",
	// Re-use the existing first-party manifests — single source of truth.
	surfaces: FIRST_PARTY_SURFACE_MANIFESTS,
};

// ── Community index loader ────────────────────────────────────────────────────

/**
 * Fetches + validates a registry index from a URL.
 * Works for community registries and (when published) the official URL.
 *
 * Throws on network error, non-2xx response, or missing required fields.
 *
 * @lore AL5: No eval / no runtime execution of fetched code — this only
 * loads and validates the JSON manifest catalog. Code comes via `add` (build-time).
 */
export async function loadRegistryIndex(url: string): Promise<RegistryIndex> {
	let response: Response;
	try {
		response = await fetch(url);
	} catch (err) {
		throw new Error(
			`Failed to fetch registry index from ${url}: ${err instanceof Error ? err.message : String(err)}`,
		);
	}

	if (!response.ok) {
		throw new Error(`Registry index fetch failed: ${response.status} from ${url}`);
	}

	const json: unknown = await response.json();

	// Validate required fields.
	if (
		typeof json !== "object" ||
		json === null ||
		typeof (json as Record<string, unknown>)["name"] !== "string" ||
		typeof (json as Record<string, unknown>)["version"] !== "string" ||
		!Array.isArray((json as Record<string, unknown>)["surfaces"])
	) {
		throw new Error(
			`Invalid registry index from ${url}: missing required fields (name, version, surfaces)`,
		);
	}

	return json as RegistryIndex;
}
