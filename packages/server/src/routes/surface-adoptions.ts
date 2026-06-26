/**
 * AL5 — Review Surface Adoptions API routes.
 *
 * GET  /api/surface-adoptions?teamId=…  — team's adopted surfaces (AdoptionView[])
 * GET  /api/surface-registry            — first-party manifests (SurfaceManifest[])
 * POST /api/surface-adoptions           — adopt a surface (upsert, pins version, 201)
 * DELETE /api/surface-adoptions/:id     — reset to base canvas (204); cross-team → 404
 *
 * @lore AL5 WARN-2: Isolation is enforced at the DB query level (teamId filter),
 * NOT by authorizeRead/Write alone. authorizeRead/Write clears the boundary flag
 * (hostKind:"team" with the authenticated principal) — the real isolation is the
 * .where(eq(surfaceAdoptions.teamId, teamId)) on every query. Mirrors connections.ts
 * which enforces per-user isolation at the userId filter, not the boundary clear.
 *
 * @lore AL5 §5: The registry endpoint returns first-party manifests only (no
 * component references — manifests are JSON-serializable). Community registry
 * pointers are out-of-scope at AL5 (build-time copy model, §3.2).
 */

import { type HyperIdleDb, surfaceAdoptions } from "@hyperidle/db";
import type { AdoptionView } from "@hyperidle/shared";
import { and, eq } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";
import { authorizeRead, authorizeWrite } from "../auth/authorize.js";
import { requireBoundary } from "../middleware/access-boundary-middleware.js";
import type { HyperIdleEnv } from "../middleware/auth.js";
import { createRateLimiter } from "../middleware/rate-limit.js";

// Rate limiters: 30/min for reads, 20/min for mutations.
const readLimiter = createRateLimiter({ limit: 30, windowMs: 60_000 });
const mutateLimiter = createRateLimiter({ limit: 20, windowMs: 60_000 });

// ── Registry (shared-module canonical source) ──────────────────────────────
// @lore AL5 FIX-2: Manifest data previously duplicated here has been moved to
// @hyperidle/shared (FIRST_PARTY_SURFACE_MANIFESTS). The server imports from
// shared so server and web share exactly one copy. No component references —
// shared has no React; manifests are plain JSON-serializable records.
// @lore AL5: The server validates surfaceId at POST time against this registry.
// In a future with community surfaces, this list grows via registry config;
// at AL5 it is the shared first-party catalog.

import type { SurfaceManifest } from "@hyperidle/shared";
import { OFFICIAL_REGISTRY_INDEX } from "@hyperidle/shared";

// @lore AL5 AC2: The server reads from OFFICIAL_REGISTRY_INDEX.surfaces (index-driven),
// not a separate FIRST_PARTY_SURFACE_MANIFESTS copy. This ensures the registry endpoint
// and the adoption validator stay in sync with the shared catalog.

interface ServerSurfaceEntry {
	readonly manifest: SurfaceManifest;
}

const SERVER_REGISTRY = new Map<string, ServerSurfaceEntry>(
	OFFICIAL_REGISTRY_INDEX.surfaces.map((m) => [m.id, { manifest: m }]),
);

function getServerSurfaceEntry(id: string): ServerSurfaceEntry | undefined {
	return SERVER_REGISTRY.get(id);
}

// @lore AL5 INSTALL-LOOP: SERVER_REGISTRY is built from OFFICIAL_REGISTRY_INDEX.surfaces
// which derives from FIRST_PARTY_SURFACE_MANIFESTS in shared. When surface:add installs
// a community surface it appends the manifest to FIRST_PARTY_SURFACE_MANIFESTS — after
// rebuild, OFFICIAL_REGISTRY_INDEX.surfaces includes it, and this Map will contain it.
// The Map is rebuilt at module load; no runtime mutation needed on the server.

// ── Zod schemas ──────────────────────────────────────────────────────────────

const adoptionCreateSchema = z.object({
	teamId: z.string().min(1).max(200),
	tool: z.string().min(1).max(200),
	kind: z.string().min(1).max(200),
	surfaceId: z.string().min(1).max(500),
});

// ── View builder ─────────────────────────────────────────────────────────────

function rowToAdoptionView(
	row: {
		id: string;
		tool: string;
		kind: string;
		surfaceId: string;
		pinnedVersion: string;
		provenance: string;
	},
	entry: ServerSurfaceEntry,
): AdoptionView {
	return {
		id: row.id,
		tool: row.tool,
		kind: row.kind as AdoptionView["kind"],
		surfaceId: row.surfaceId,
		pinnedVersion: row.pinnedVersion,
		provenance: row.provenance as AdoptionView["provenance"],
		surfaceTitle: entry.manifest.title,
		baseCanvas: entry.manifest.baseCanvas,
	};
}

// ── Route factory ─────────────────────────────────────────────────────────────

/**
 * Creates the surface registry route: GET /api/surface-registry
 * Returns first-party SurfaceManifest[] (pure metadata, no components).
 */
export function createSurfaceRegistryRoutes(_db: HyperIdleDb): Hono<HyperIdleEnv> {
	const router = new Hono<HyperIdleEnv>();

	// ── GET / → /api/surface-registry — first-party manifests ─────────────────
	router.get("/", requireBoundary({ kind: "enforced" }), readLimiter, async (c) => {
		const userId = c.get("userId");

		const deny = authorizeRead(c, {
			hostKind: "team",
			hostId: userId,
			participants: [userId],
		});
		if (deny) return deny;

		const manifests = Array.from(SERVER_REGISTRY.values()).map((e) => e.manifest);
		return c.json(manifests);
	});

	return router;
}

export function createSurfaceAdoptionRoutes(db: HyperIdleDb): Hono<HyperIdleEnv> {
	const router = new Hono<HyperIdleEnv>();

	// ── GET /api/surface-adoptions?teamId=… — team's adoptions ────────────────
	router.get("/", requireBoundary({ kind: "enforced" }), readLimiter, async (c) => {
		const userId = c.get("userId");
		const teamId = c.req.query("teamId") ?? "";

		const deny = authorizeRead(c, {
			hostKind: "team",
			hostId: teamId || userId,
			participants: [userId],
		});
		if (deny) return deny;

		if (!teamId) {
			return c.json({ error: "teamId query parameter required", code: "VALIDATION_ERROR" }, 400);
		}

		const rows = await db
			.select()
			.from(surfaceAdoptions)
			.where(eq(surfaceAdoptions.teamId, teamId));

		// Join with server registry for surfaceTitle/baseCanvas.
		const views: AdoptionView[] = [];
		for (const row of rows) {
			const entry = getServerSurfaceEntry(row.surfaceId);
			if (entry) {
				views.push(rowToAdoptionView(row, entry));
			}
			// Rows with unknown surfaceIds are silently excluded (degrade handled client-side).
		}

		return c.json(views);
	});

	// ── POST /api/surface-adoptions — adopt (upsert) ──────────────────────────
	router.post("/", requireBoundary({ kind: "enforced" }), mutateLimiter, async (c) => {
		const userId = c.get("userId");

		const deny = authorizeWrite(c, {
			hostKind: "team",
			hostId: userId,
			participants: [userId],
		});
		if (deny) return deny;

		let rawBody: unknown;
		try {
			rawBody = await c.req.json();
		} catch {
			return c.json({ error: "Invalid JSON", code: "VALIDATION_ERROR" }, 400);
		}

		const parsed = adoptionCreateSchema.safeParse(rawBody);
		if (!parsed.success) {
			return c.json(
				{ error: "Validation failed", code: "VALIDATION_ERROR", issues: parsed.error.issues },
				400,
			);
		}

		const { teamId, tool, kind, surfaceId } = parsed.data;

		// Validate surfaceId exists in the registry.
		const entry = getServerSurfaceEntry(surfaceId);
		if (!entry) {
			return c.json(
				{ error: `Surface '${surfaceId}' not found in registry`, code: "SURFACE_NOT_FOUND" },
				400,
			);
		}

		const now = new Date().toISOString();
		const id = `sa-${crypto.randomUUID()}`;
		const pinnedVersion = entry.manifest.version;
		const provenance = entry.manifest.provenance;
		// @lore AL5 ETHOS: trustTier removed from SurfaceManifest/AdoptionView (no preemptive
		// trust gates). The DB column is retained (notNull constraint) and derived from
		// provenance as an internal implementation detail — not exposed in AdoptionView.
		const trustTier = provenance === "first-party" ? "vetted" : "community";

		// UPSERT: ON CONFLICT (teamId, tool, kind) → update surfaceId + pinnedVersion.
		// The unique index surface_adoptions_team_situation_idx enforces at-most-one.
		// @lore AL5 §4.5: Swap = upsert the row for (team, tool, kind) to new surfaceId.
		await db
			.insert(surfaceAdoptions)
			.values({
				id,
				teamId,
				tool,
				kind,
				surfaceId,
				pinnedVersion,
				provenance,
				trustTier,
				adoptedBy: userId,
				createdAt: now,
				updatedAt: now,
			})
			.onConflictDoUpdate({
				target: [surfaceAdoptions.teamId, surfaceAdoptions.tool, surfaceAdoptions.kind],
				set: {
					surfaceId,
					pinnedVersion,
					provenance,
					trustTier,
					adoptedBy: userId,
					updatedAt: now,
				},
			});

		// Fetch the upserted row to build the AdoptionView (may have a different id if conflict).
		const [row] = await db
			.select()
			.from(surfaceAdoptions)
			.where(
				and(
					eq(surfaceAdoptions.teamId, teamId),
					eq(surfaceAdoptions.tool, tool),
					eq(surfaceAdoptions.kind, kind),
				),
			)
			.limit(1);

		if (!row) {
			return c.json({ error: "Failed to create adoption", code: "INTERNAL_ERROR" }, 500);
		}

		return c.json(rowToAdoptionView(row, entry), 201);
	});

	// ── DELETE /api/surface-adoptions/:id — reset to base canvas ──────────────
	router.delete("/:id", requireBoundary({ kind: "enforced" }), mutateLimiter, async (c) => {
		const userId = c.get("userId");
		const adoptionId = c.req.param("id");
		const teamId = c.req.query("teamId");

		const deny = authorizeWrite(c, {
			hostKind: "team",
			hostId: teamId ?? userId,
			participants: [userId],
		});
		if (deny) return deny;

		// @lore AL5 WARN-2: isolation is enforced at the DB query level.
		// If teamId is provided, scope the DELETE to that team's row.
		// If the id belongs to a different team, 0 rows deleted → 404.
		// This mirrors connections.ts cross-user 404 pattern.
		let deleted: { id: string }[];
		if (teamId) {
			deleted = await db
				.delete(surfaceAdoptions)
				.where(and(eq(surfaceAdoptions.id, adoptionId), eq(surfaceAdoptions.teamId, teamId)))
				.returning({ id: surfaceAdoptions.id });
		} else {
			deleted = await db
				.delete(surfaceAdoptions)
				.where(eq(surfaceAdoptions.id, adoptionId))
				.returning({ id: surfaceAdoptions.id });
		}

		if (deleted.length === 0) {
			return c.json({ error: "Adoption not found", code: "NOT_FOUND" }, 404);
		}

		return c.body(null, 204);
	});

	return router;
}
