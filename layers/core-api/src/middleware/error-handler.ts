import { createLogger } from "@hyperidle/diagnostics";
import type { ApiErrorResponse } from "@hyperidle/domain-model";
import { API_ERROR_CODES } from "@hyperidle/domain-model";
import { CapacityExceededError, InvalidTransitionError } from "@hyperidle/task";
import type { ErrorHandler } from "hono";

const log = createLogger({ pkg: "server" });

/** Maps domain errors to HTTP status codes. Never exposes stack traces. */
export const errorHandler: ErrorHandler = (err, c) => {
	// Check both instanceof and error name — different class instances can share the same name
	if (
		err instanceof InvalidTransitionError ||
		err instanceof CapacityExceededError ||
		err.name === "InvalidTransitionError" ||
		err.name === "CapacityExceededError" ||
		err.name === "VersionConflictError"
	) {
		const response: ApiErrorResponse = {
			error: err.message,
			code: API_ERROR_CODES.CONFLICT,
		};
		return c.json(response, 409);
	}

	if (err.message.includes("not found") || err.message.includes("not found:")) {
		const response: ApiErrorResponse = {
			error: err.message,
			code: API_ERROR_CODES.NOT_FOUND,
		};
		return c.json(response, 404);
	}

	log.error(`Unhandled error: ${err.message}`);

	const response: ApiErrorResponse = {
		error: "Internal server error",
		code: API_ERROR_CODES.INTERNAL_ERROR,
	};

	return c.json(response, 500);
};
