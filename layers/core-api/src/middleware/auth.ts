import type { HyperIdleDb } from "@hyperidle/db";
import { createLogger } from "@hyperidle/diagnostics";
import type { ApiErrorResponse } from "@hyperidle/domain-model";
import { API_ERROR_CODES } from "@hyperidle/domain-model";
import { constantTimeStringEqual, type HyperIdleEnv } from "@hyperidle/domain-model/http";
import { findUser } from "@hyperidle/user";
import type { Context, MiddlewareHandler } from "hono";

/**
 * @lore: auth middleware — constant-time comparator; empty-key cannot occur in production; rejected requests WARN-log path/method/IP, never the key value
 */

export interface AuthMiddlewareOptions {
	db: HyperIdleDb;
	/** Composition-owned key. Production omits this and reads the deployment env. */
	apiKey?: string;
}

const authLogger = createLogger({ pkg: "server.auth" });

function readSourceIp(c: Context): string | null {
	if (process.env.HYPERIDLE_TRUST_PROXY === "true") {
		const xff = c.req.header("x-forwarded-for");
		if (xff) {
			const first = xff.split(",")[0]?.trim();
			if (first) return first;
		}
	}
	const env = (c.env ?? {}) as { remoteAddr?: { address?: string } };
	return env.remoteAddr?.address ?? null;
}

function rejectUnauthorized(c: Context, message: string, logMessage: string): Response {
	authLogger.warn(logMessage, {
		path: c.req.path,
		method: c.req.method,
		sourceIp: readSourceIp(c),
	});
	const response: ApiErrorResponse = {
		error: message,
		code: API_ERROR_CODES.UNAUTHORIZED,
	};
	return c.json(response, 401);
}

async function resolveApiKeyActorUserId(
	_c: Context<HyperIdleEnv>,
	db: HyperIdleDb,
): Promise<string> {
	const humanUser = await findUser(db, { kind: "human" });
	return humanUser?.id ?? "u-founder";
}

export function createAuthMiddleware(
	options: AuthMiddlewareOptions,
): MiddlewareHandler<HyperIdleEnv> {
	const { db } = options;
	const expectedApiKey = options.apiKey ?? process.env.HYPERIDLE_API_KEY ?? "";

	return async (c, next) => {
		const apiKey = c.req.header("X-API-Key") ?? "";

		if (!constantTimeStringEqual(apiKey, expectedApiKey)) {
			return rejectUnauthorized(
				c,
				"Missing or invalid API key",
				"rejected request: invalid or missing API key",
			);
		}

		c.set("userId", await resolveApiKeyActorUserId(c, db));

		await next();
	};
}

/** Stateless auth for db-less test apps — checks the API key, sets no userId. */
export const authMiddleware: MiddlewareHandler = async (c, next) => {
	const apiKey = c.req.header("X-API-Key") ?? "";
	const expectedKey = process.env.HYPERIDLE_API_KEY ?? "";

	const ok = constantTimeStringEqual(apiKey, expectedKey);

	if (!ok) {
		authLogger.warn("rejected request: invalid or missing API key", {
			path: c.req.path,
			method: c.req.method,
			sourceIp: readSourceIp(c),
		});
		const response: ApiErrorResponse = {
			error: "Missing or invalid API key",
			code: API_ERROR_CODES.UNAUTHORIZED,
		};
		return c.json(response, 401);
	}

	await next();
};
