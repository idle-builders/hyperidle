/**
 * Common wire schemas for API responses.
 *
 * These Zod schemas define shared shapes used across multiple API endpoints:
 * - progressSchema: { done, total } for task progress
 * - errorResponseSchema: standard ApiErrorResponse shape
 * - paginationSchema: query parameter pagination
 *
 * @lore api-typesafety: These schemas live in the server package (not shared)
 * because they encode the wire format of HTTP responses, not the domain types.
 * The db package has the raw Drizzle types; these composites express the
 * API contract the frontend consumes.
 *
 * @lore AU21 Increment 14a: `wireMoneySchema` (the generic `{minor,currency}`
 * money validator) is deleted — its only real callers were bet/task/routine
 * cost display fields, all removed along with the rest of the cost feature.
 */

import { z } from "zod";

/**
 * Progress: task completion counter.
 * Both done and total must be non-negative integers.
 */
export const progressSchema = z.object({
	done: z.number().int().min(0),
	total: z.number().int().min(0),
});

/**
 * Standard API error response shape.
 * Matches the ApiErrorResponse type from @hyperidle/domain-model.
 */
export const errorResponseSchema = z.object({
	error: z.string(),
	code: z.string(),
	details: z
		.object({
			issues: z.array(z.unknown()),
		})
		.optional(),
});

/**
 * Pagination query parameters with sensible defaults.
 * limit: 1-100, default 50. offset: >= 0, default 0.
 */
export const paginationSchema = z.object({
	limit: z.coerce.number().int().min(1).max(100).default(50),
	offset: z.coerce.number().int().min(0).default(0),
});
