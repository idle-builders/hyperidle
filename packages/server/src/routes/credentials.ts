/**
 * Credential CRUD endpoints for server-side credential management.
 *
 * NEVER include credential values in responses. All response shapes
 * expose only { name, state, lastValidatedAt }.
 *
 * @lore P3: These endpoints are for shared-mode deployments where credentials
 * are stored encrypted in the server_credentials table. In local mode,
 * credentials live in safeStorage on the desktop.
 */

import { type HyperIdleDb, serverCredentials } from "@hyperidle/db";
import type { CredentialName, CredentialState } from "@hyperidle/shared";
import { CREDENTIAL_CATALOG, isCredentialName } from "@hyperidle/shared";
import { eq } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";
import type { HyperIdleEnv } from "../middleware/auth.js";
import { encryptCredentialValue, getServerSecret } from "../services/credential-encryption.js";

interface CredentialStatusResponse {
	name: CredentialName;
	state: CredentialState;
	lastValidatedAt: string | null;
}

function buildStatusResponse(
	name: CredentialName,
	row: { validationState: string; lastValidatedAt: string | null } | undefined,
): CredentialStatusResponse {
	if (!row) {
		return { name, state: "absent", lastValidatedAt: null };
	}
	return {
		name,
		state: row.validationState as CredentialState,
		lastValidatedAt: row.lastValidatedAt ?? null,
	};
}

const setCredentialBodySchema = z.object({
	value: z.string().min(1),
});

export function createCredentialRoutes(db: HyperIdleDb): Hono<HyperIdleEnv> {
	const router = new Hono<HyperIdleEnv>();

	/** GET /api/credentials — list all catalog entries with state */
	router.get("/", (c) => {
		const rows = db.select().from(serverCredentials).all();
		const rowMap = new Map(rows.map((r) => [r.name, r]));

		const response: CredentialStatusResponse[] = CREDENTIAL_CATALOG.map((entry) =>
			buildStatusResponse(entry.name, rowMap.get(entry.name)),
		);

		return c.json(response);
	});

	/** PUT /api/credentials/:name — set credential (encrypt + store) */
	router.put("/:name", async (c) => {
		const name = c.req.param("name");
		if (!isCredentialName(name)) {
			return c.json({ error: "Unknown credential name", code: "VALIDATION_ERROR" }, 400);
		}

		let rawBody: unknown;
		try {
			rawBody = await c.req.json();
		} catch {
			return c.json({ error: "Invalid JSON", code: "VALIDATION_ERROR" }, 400);
		}

		const parsed = setCredentialBodySchema.safeParse(rawBody);
		if (!parsed.success) {
			return c.json(
				{ error: "Validation failed", code: "VALIDATION_ERROR", issues: parsed.error.issues },
				400,
			);
		}

		const { value } = parsed.data;
		const serverSecret = getServerSecret();
		const encryptedValue = encryptCredentialValue(value, serverSecret);
		const now = new Date().toISOString();

		// Upsert: update if exists, insert if not
		const existing = db
			.select()
			.from(serverCredentials)
			.where(eq(serverCredentials.name, name))
			.get();

		if (existing) {
			db.update(serverCredentials)
				.set({
					encryptedValue,
					validationState: "present_untested",
					lastValidatedAt: null,
					updatedAt: now,
				})
				.where(eq(serverCredentials.name, name))
				.run();
		} else {
			db.insert(serverCredentials)
				.values({
					name,
					encryptedValue,
					validationState: "present_untested",
					lastValidatedAt: null,
					updatedAt: now,
				})
				.run();
		}

		const row = db.select().from(serverCredentials).where(eq(serverCredentials.name, name)).get();

		return c.json(buildStatusResponse(name, row));
	});

	/** DELETE /api/credentials/:name — remove credential */
	router.delete("/:name", (c) => {
		const name = c.req.param("name");
		if (!isCredentialName(name)) {
			return c.json({ error: "Unknown credential name", code: "VALIDATION_ERROR" }, 400);
		}

		db.delete(serverCredentials).where(eq(serverCredentials.name, name)).run();

		return c.body(null, 204);
	});

	/** POST /api/credentials/:name/validate — validate against external service */
	router.post("/:name/validate", async (c) => {
		const name = c.req.param("name");
		if (!isCredentialName(name)) {
			return c.json({ error: "Unknown credential name", code: "VALIDATION_ERROR" }, 400);
		}

		// Check if credential exists
		const row = db.select().from(serverCredentials).where(eq(serverCredentials.name, name)).get();

		if (!row) {
			return c.json({ valid: false, error: "Credential not set" }, 200);
		}

		// @lore P3: Validation calls external services. In test environments,
		// we return a simple "present but untested" result without making real calls.
		// A real implementation would decrypt and call the target service.
		// For now, we update the state to "present_untested" and return the result.
		// Full validation against external services is a follow-up.
		const validationResult = { valid: false as boolean, error: undefined as string | undefined };

		// Mark as attempted — update state based on result
		const now = new Date().toISOString();
		const newState: CredentialState = validationResult.valid ? "valid" : "present_untested";

		db.update(serverCredentials)
			.set({ validationState: newState, lastValidatedAt: now, updatedAt: now })
			.where(eq(serverCredentials.name, name))
			.run();

		// Response MUST NOT include the raw value
		const result: { valid: boolean; error?: string } = { valid: validationResult.valid };
		if (validationResult.error) {
			result.error = validationResult.error;
		}
		return c.json(result);
	});

	return router;
}
