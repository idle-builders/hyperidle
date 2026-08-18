import { CapacityExceededError, InvalidTransitionError } from "@hyperidle/domain-model";

// VersionConflictError was removed from domain-model (never instantiated in production;
// the error-handler detects it via err.name, not instanceof). Inlined here to keep
// the test valid: the handler's name-based branch still fires for this class.
class VersionConflictError extends Error {
	constructor(_id: string, _expected: number, _actual: number) {
		super(`Version conflict for ${_id}: expected ${_expected}, got ${_actual}`);
		this.name = "VersionConflictError";
	}
}
import { Hono } from "hono";
import { describe, expect, it } from "vitest";
import { errorHandler } from "../middleware/error-handler.js";

/**
 * Helper: create a tiny Hono app with the error handler and a route that
 * throws the given error.
 */
function appThatThrows(err: Error): Hono {
	const app = new Hono();
	app.onError(errorHandler);
	app.get("/test", () => {
		throw err;
	});
	return app;
}

describe("errorHandler middleware", () => {
	it("maps InvalidTransitionError to 409 CONFLICT", async () => {
		const app = appThatThrows(new InvalidTransitionError("shaped", "shipped"));
		const res = await app.request("/test");
		expect(res.status).toBe(409);
		const body = (await res.json()) as { code: string; error: string };
		expect(body.code).toBe("CONFLICT");
		expect(body.error).toContain("shaped");
	});

	it("maps CapacityExceededError to 409 CONFLICT", async () => {
		const app = appThatThrows(new CapacityExceededError("team-1", 3));
		const res = await app.request("/test");
		expect(res.status).toBe(409);
		const body = (await res.json()) as { code: string };
		expect(body.code).toBe("CONFLICT");
	});

	it("maps VersionConflictError to 409 CONFLICT", async () => {
		const app = appThatThrows(new VersionConflictError("item-1", 2, 3));
		const res = await app.request("/test");
		expect(res.status).toBe(409);
		const body = (await res.json()) as { code: string };
		expect(body.code).toBe("CONFLICT");
	});

	it("maps errors with 'not found' in message to 404 NOT_FOUND", async () => {
		const app = appThatThrows(new Error("Entity not found: bet-123"));
		const res = await app.request("/test");
		expect(res.status).toBe(404);
		const body = (await res.json()) as { code: string };
		expect(body.code).toBe("NOT_FOUND");
	});

	it("maps generic errors to 500 INTERNAL_ERROR without stack traces", async () => {
		const app = appThatThrows(new Error("Something unexpected happened"));
		const res = await app.request("/test");
		expect(res.status).toBe(500);
		const body = (await res.json()) as { code: string; error: string };
		expect(body.code).toBe("INTERNAL_ERROR");
		// Must not expose the original error message or stack trace
		expect(body.error).toBe("Internal server error");
	});
});
