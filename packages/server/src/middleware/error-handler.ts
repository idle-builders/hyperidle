import { API_ERROR_CODES } from "@hyperidle/shared";
import type { ApiErrorResponse } from "@hyperidle/shared";
import { createLogger } from "@hyperidle/shared";
import type { ErrorHandler } from "hono";

const log = createLogger({ pkg: "server" });

/**
 * Global error handler that returns consistent ApiErrorResponse shape.
 * Never exposes stack traces.
 */
export const errorHandler: ErrorHandler = (err, c) => {
	log.error(`Unhandled error: ${err.message}`);

	const response: ApiErrorResponse = {
		error: "Internal server error",
		code: API_ERROR_CODES.INTERNAL_ERROR,
	};

	return c.json(response, 500);
};
