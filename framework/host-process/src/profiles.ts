/**
 * @lore AU29: moved verbatim from `framework/db/src/profiles.ts`. This module
 * resolves a deployment profile from a string/env var — no SQL, no schema, no
 * connection — so it never belonged to the database package's surface (the
 * `db:util` ANOMALY `tools/governance/architecture.json` flagged since AU28).
 *
 * Only `resolveProfile` and `DeploymentProfile` are barrel-exported from
 * `@hyperidle/host-process` — the only symbols named outside this module
 * (`applications/remote-server/src/create-server.ts`, `tools/setup/src/setup-cli.ts`).
 * `PROFILE_DEFAULTS`, `ProfileDefaults`, `DbDriver`, and `ResolveOptions` stay module-level exports, reachable only by a relative
 * import within this package — their only consumers are this module's own
 * unit test and nothing else (repo-grep verified at architecture time).
 */
export type DeploymentProfile = "laptop" | "vps" | "cloud";

export type DbDriver = "pglite" | "postgres";
export interface ProfileDefaults {
	readonly profile: DeploymentProfile;
	readonly dbDriver: DbDriver;
	readonly dbUrlDefault: string;
	readonly requiresDockerCompose: boolean;
	readonly ports: { readonly server: number; readonly web: number };
}

const DEFAULT_PORTS = { server: 3001, web: 5173 } as const;

export const PROFILE_DEFAULTS: Record<DeploymentProfile, ProfileDefaults> = {
	laptop: {
		profile: "laptop",
		dbDriver: "pglite",
		dbUrlDefault: "./hyperidle-pg",
		requiresDockerCompose: false,
		ports: DEFAULT_PORTS,
	},
	vps: {
		profile: "vps",
		dbDriver: "postgres",
		dbUrlDefault: "postgres://hyperidle:hyperidle@postgres:5432/hyperidle",
		requiresDockerCompose: true,
		ports: DEFAULT_PORTS,
	},
	cloud: {
		profile: "cloud",
		dbDriver: "postgres",
		dbUrlDefault: "",
		requiresDockerCompose: false,
		ports: DEFAULT_PORTS,
	},
};

const VALID: ReadonlySet<DeploymentProfile> = new Set(["laptop", "vps", "cloud"]);

function isProfile(v: unknown): v is DeploymentProfile {
	return typeof v === "string" && VALID.has(v as DeploymentProfile);
}

export interface ResolveOptions {
	readonly profile?: string | undefined;
	readonly env?: NodeJS.ProcessEnv | Record<string, string | undefined>;
}

/**
 * Resolve the effective deployment profile.
 * Order: explicit argument > HYPERIDLE_PROFILE env var > laptop default.
 * Throws on invalid value.
 */
export function resolveProfile(options: ResolveOptions = {}): ProfileDefaults {
	const env = options.env ?? {};
	const raw = options.profile ?? env.HYPERIDLE_PROFILE ?? "laptop";
	if (!isProfile(raw)) {
		throw new Error(`Invalid profile: "${raw}". Must be one of: laptop, vps, cloud.`);
	}
	return PROFILE_DEFAULTS[raw];
}
