/**
 * L2 — Founder/Actor Routing Schema (domain tag constants).
 *
 * Pins the canonical-domain-tag contract from
 * `docs/work-packages/TRACK-L.md` L2 contracts/constraints:
 *
 *   "domain_tag is free-form text; canonical values
 *    (market, growth, portfolio, product, design, tech, content)
 *    live in packages/shared/src/constants/domains.ts."
 */

import { DOMAIN_TAGS, type DomainTag } from "@hyperidle/shared";
import { describe, expect, expectTypeOf, it } from "vitest";

const EXPECTED_DOMAIN_TAGS = [
	"market",
	"growth",
	"portfolio",
	"product",
	"design",
	"tech",
	"content",
] as const;

describe("L2: DOMAIN_TAGS canonical list", () => {
	it("contains exactly the seven canonical values in the spec order", () => {
		expect(DOMAIN_TAGS).toEqual(EXPECTED_DOMAIN_TAGS);
	});

	it("has length 7", () => {
		expect(DOMAIN_TAGS).toHaveLength(7);
	});

	it("has no duplicates", () => {
		expect(new Set(DOMAIN_TAGS).size).toBe(DOMAIN_TAGS.length);
	});

	it("is a readonly tuple (not mutable string[])", () => {
		expectTypeOf(DOMAIN_TAGS).toMatchTypeOf<readonly DomainTag[]>();
	});
});

describe("L2: DomainTag type union", () => {
	it("is a literal-string union of the seven canonical tags", () => {
		expectTypeOf<DomainTag>().toEqualTypeOf<
			"market" | "growth" | "portfolio" | "product" | "design" | "tech" | "content"
		>();

		// Each tag is assignable.
		const all: DomainTag[] = [
			"market",
			"growth",
			"portfolio",
			"product",
			"design",
			"tech",
			"content",
		];
		expect(all).toHaveLength(7);
	});
});
