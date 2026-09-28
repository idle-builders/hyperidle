/** @lore: wire schemas — live in the server package (not shared) because they encode HTTP response wire format, not domain types */

import { z } from "zod";

export const progressSchema = z.object({
	done: z.number().int().min(0),
	total: z.number().int().min(0),
});

export const errorResponseSchema = z.object({
	error: z.string(),
	code: z.string(),
	details: z
		.object({
			issues: z.array(z.unknown()),
		})
		.optional(),
});

export const paginationSchema = z.object({
	limit: z.coerce.number().int().min(1).max(100).default(50),
	offset: z.coerce.number().int().min(0).default(0),
});
