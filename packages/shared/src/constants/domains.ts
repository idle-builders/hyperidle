/**
 * L2 — Founder/Actor Routing Schema (TRACK-L L2).
 *
 * Canonical domain tags. The `threads.domain_tag` column is free-form
 * text; consumers MAY emit tags outside this list (e.g. product-
 * specific labels), but UI surfaces should treat the canonical list
 * as the rendering reference set.
 */

import { z } from "zod";

export const DOMAIN_TAGS = [
	"market",
	"growth",
	"portfolio",
	"product",
	"design",
	"tech",
	"content",
] as const;

export type DomainTag = (typeof DOMAIN_TAGS)[number];

/**
 * @lore L2 review WARN-2: even though L2 has no write path for
 * `threads.domain_tag`, the validator is encoded NOW so future agents
 * who add a write surface (POST/PATCH /api/threads, agent emitter,
 * etc.) reach for a single source of truth instead of inventing their
 * own. Use as: `domainTagSchema.parse(input)` at every wire boundary.
 */
export const domainTagSchema = z.enum(DOMAIN_TAGS);

/** Optional/nullable variant for columns where `domain_tag` is unset. */
export const domainTagNullableSchema = domainTagSchema.nullable();
