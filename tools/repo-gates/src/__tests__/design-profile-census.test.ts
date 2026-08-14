import { describe, expect, test } from "vitest";
import { collectDesignProfileCensus } from "../lib/design-profile-census.js";

describe("AZ16 live profile census", () => {
	test("counts semantic consumers separately from raw fields and foreign subjects", () => {
		const census = collectDesignProfileCensus([
			{
				path: "framework/example/src/Copy.tsx",
				content:
					'// type-data --motion-fast\nconst view = <><p className="type-copy motion-enter border-[var(--bw-thin)]" /><span className="type-avatar-initial type-avatar-initial--sm" /><div data-token-subject="foreign"><p className="text-[18px] border-2" /></div></>;',
			},
		]);
		expect(census.profiles.typography.copy).toBe(1);
		expect(census.profiles.motion.enter).toBe(1);
		expect(census.profiles.border.thin).toBe(1);
		expect(census.profiles.typography["avatar-initial"]).toBe(1);
		expect(census.profiles.typography.data).toBe(0);
		expect(census.foreignByFamily.typography).toBe(1);
		expect(census.foreignByFamily.border).toBe(1);
		expect(census.rawByFamily["font-size"]).toBe(0);
		expect(census.rawByFamily.duration).toBe(0);
		expect(census.invalidProfileSites).toEqual([]);
	});
});
