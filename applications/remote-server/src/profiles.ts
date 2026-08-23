/**
 * Deployment profile resolution for the `remote-server` application.
 *
 * Moved here from the deleted `@hyperidle/host-process` package (AU44-b6).
 * Only the three fields remote-server needs are kept: `profile`, `dbDriver`,
 * `dbUrlDefault`. The `requiresDockerCompose` and `ports` fields are dropped
 * because no caller in this package reads them.
 */

export type DeploymentProfile = "laptop" | "vps" | "cloud";
export type DbDriver = "pglite" | "postgres";

interface ProfileDefaults {
	readonly profile: DeploymentProfile;
	readonly dbDriver: DbDriver;
	readonly dbUrlDefault: string;
}

const DEFAULTS: Record<DeploymentProfile, ProfileDefaults> = {
	laptop: { profile: "laptop", dbDriver: "pglite", dbUrlDefault: "./hyperidle-pg" },
	vps: {
		profile: "vps",
		dbDriver: "postgres",
		dbUrlDefault: "postgres://hyperidle:hyperidle@postgres:5432/hyperidle",
	},
	cloud: { profile: "cloud", dbDriver: "postgres", dbUrlDefault: "" },
};

const VALID: ReadonlySet<string> = new Set(["laptop", "vps", "cloud"]);

export function resolveProfile(
	env: NodeJS.ProcessEnv | Record<string, string | undefined> = {},
): ProfileDefaults {
	const raw = env.HYPERIDLE_PROFILE ?? "laptop";
	if (!VALID.has(raw))
		throw new Error(`Invalid profile: "${raw}". Must be one of: laptop, vps, cloud.`);
	return DEFAULTS[raw as DeploymentProfile] as ProfileDefaults;
}
