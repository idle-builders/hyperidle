import { describe, expect, test } from "vitest";
import { collectDesignProfileCensus } from "../lib/design-profile-census.js";

describe("AZ16 live profile census", () => {
	test("counts semantic consumers separately from raw fields and foreign subjects", () => {
		const census = collectDesignProfileCensus([
			{
				path: "framework/example/src/Copy.tsx",
				content:
					'const view = <><p className="type-copy motion-enter border-width-thin" /><div data-token-subject="foreign"><p className="text-[18px] border-2" /></div></>;',
			},
		]);
		expect(census.profiles.typography.copy).toBe(1);
		expect(census.profiles.motion.enter).toBe(1);
		expect(census.profiles.border.thin).toBe(1);
		expect(census.foreignByFamily.typography).toBe(1);
		expect(census.foreignByFamily.border).toBe(1);
		expect(census.rawByFamily["font-size"]).toBe(0);
	});
});
