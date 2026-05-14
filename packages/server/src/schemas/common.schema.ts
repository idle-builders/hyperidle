/**
 * Common wire schemas for API responses.
 *
 * These Zod schemas define shared shapes used across multiple API endpoints:
 * - wireMoneySchema: { minor, currency } for money values
 * - progressSchema: { done, total } for task progress
 * - errorResponseSchema: standard ApiErrorResponse shape
 * - paginationSchema: query parameter pagination
 *
 * @lore api-typesafety: These schemas live in the server package (not shared)
 * because they encode the wire format of HTTP responses, not the domain types.
 * The db package has the raw Drizzle types; these composites express the
 * API contract the frontend consumes.
 */

import { CURRENCY_CODES } from "@hyperidle/shared";
import { z } from "zod";

/**
 * WireMoney: structured money value on the wire.
 * minor = integer cents/pence (no floats), currency = ISO 4217 code.
 */
export const wireMoneySchema = z.object({
	minor: z.number().int().min(0),
	// @lore api-typesafety: CURRENCY_CODES is a readonly string[] from @hyperidle/shared.
	// Zod v4 requires a [string, ...string[]] tuple for z.enum(). The `as unknown as` cast
	// is the idiomatic escape hatch — CURRENCY_CODES is guaranteed non-empty at compile time.
	currency: z.enum(CURRENCY_CODES as unknown as [string, ...string[]]),
});

export type WireMoney = z.infer<typeof wireMoneySchema>;

/**
 * Progress: task completion counter.
 * Both done and total must be non-negative integers.
 */
export const progressSchema = z.object({
	done: z.number().int().min(0),
	total: z.number().int().min(0),
});

export type Progress = z.infer<typeof progressSchema>;

/**
 * Standard API error response shape.
 * Matches the ApiErrorResponse type from @hyperidle/shared.
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

export type ErrorResponse = z.infer<typeof errorResponseSchema>;

/**
 * Pagination query parameters with sensible defaults.
 * limit: 1-100, default 50. offset: >= 0, default 0.
 */
export const paginationSchema = z.object({
	limit: z.coerce.number().int().min(1).max(100).default(50),
	offset: z.coerce.number().int().min(0).default(0),
});

export type Pagination = z.infer<typeof paginationSchema>;
