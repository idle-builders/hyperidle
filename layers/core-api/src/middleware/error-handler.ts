import { createLogger } from "@hyperidle/diagnostics";
import type { ApiErrorResponse } from "@hyperidle/domain-model";
import { API_ERROR_CODES } from "@hyperidle/domain-model";
import { CapacityExceededError, InvalidTransitionError } from "@hyperidle/work";
import type { ErrorHandler } from "hono";

const log = createLogger({ pkg: "server" });

/**
 * Global error handler that returns consistent ApiErrorResponse shape.
 * Maps domain errors to appropriate HTTP status codes.
 * Never exposes stack traces.
 */
export const errorHandler: ErrorHandler = (err, c) => {
	// Map domain errors to HTTP status codes
	// Check both instanceof and error name to handle different class instances
	// (e.g. task-state-machine has its own InvalidTransitionError)
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

	// Check for "not found" errors from services
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
