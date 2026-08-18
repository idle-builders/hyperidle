import { describe, expect, it } from "vitest";
import { PROFILE_DEFAULTS, resolveProfile } from "../profiles.js";

describe("H4 AC1/AC4: Deployment profile resolution", () => {
	it("exposes defaults for all three profiles", () => {
		expect(PROFILE_DEFAULTS.laptop).toMatchObject({
			profile: "laptop",
			dbDriver: "pglite",
			requiresDockerCompose: false,
		});
		expect(PROFILE_DEFAULTS.vps).toMatchObject({
			profile: "vps",
			dbDriver: "postgres",
			requiresDockerCompose: true,
		});
		expect(PROFILE_DEFAULTS.cloud).toMatchObject({
			profile: "cloud",
			dbDriver: "postgres",
			requiresDockerCompose: false,
		});
	});

	it("each profile has server and web port defaults", () => {
		for (const p of ["laptop", "vps", "cloud"] as const) {
			expect(PROFILE_DEFAULTS[p].ports.server).toBe(3001);
			expect(PROFILE_DEFAULTS[p].ports.web).toBe(5173);
		}
	});

	it("defaults to laptop when nothing provided", () => {
		const r = resolveProfile({ env: {} });
		expect(r.profile).toBe("laptop");
	});

	it("honors explicit profile argument", () => {
		const r = resolveProfile({ profile: "vps", env: {} });
		expect(r.profile).toBe("vps");
	});

	it("honors HYPERIDLE_PROFILE env var", () => {
		const r = resolveProfile({ env: { HYPERIDLE_PROFILE: "cloud" } });
		expect(r.profile).toBe("cloud");
	});

	it("CLI argument wins over env var", () => {
		const r = resolveProfile({
			profile: "laptop",
			env: { HYPERIDLE_PROFILE: "cloud" },
		});
		expect(r.profile).toBe("laptop");
	});

	it("throws on invalid profile name", () => {
		expect(() => resolveProfile({ env: { HYPERIDLE_PROFILE: "bogus" } })).toThrow(
			/invalid profile/i,
		);
	});
});
