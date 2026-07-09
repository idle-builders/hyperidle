import * as os from "node:os";
import * as path from "node:path";
import { factorySettings, type HyperIdleDb } from "@hyperidle/db";
import { eq } from "drizzle-orm";

/** Typed shape loaded from `factory_settings` rows with the `git_export.*` prefix. */
export interface GitExportConfig {
	enabled: boolean;
	repoPath: string;
	remoteUrl: string | null;
	branch: string;
	authorName: string;
	authorEmail: string;
	debounceMs: number;
}

export const GIT_EXPORT_CONFIG_DEFAULTS = {
	branch: "main",
	authorName: "HyperIdle Export",
	authorEmail: "export@hyperidle.local",
	debounceMs: 2000,
} as const;

const PREFIX = "git_export.";

const KEYS = {
	enabled: `${PREFIX}enabled`,
	repoPath: `${PREFIX}repo_path`,
	remoteUrl: `${PREFIX}remote_url`,
	branch: `${PREFIX}branch`,
	authorName: `${PREFIX}author_name`,
	authorEmail: `${PREFIX}author_email`,
	debounceMs: `${PREFIX}debounce_ms`,
	lastCommitAt: `${PREFIX}last_commit_at`,
	lastCommitSha: `${PREFIX}last_commit_sha`,
	lastPushAt: `${PREFIX}last_push_at`,
	allowFileRemote: `${PREFIX}allow_file_remote`,
	repoRoot: `${PREFIX}repo_root`,
} as const;

async function readAllSettings(db: HyperIdleDb): Promise<Map<string, string>> {
	const rows = await db.select().from(factorySettings);
	const map = new Map<string, string>();
	for (const r of rows) {
		if (r.key.startsWith(PREFIX)) map.set(r.key, r.value);
	}
	return map;
}

function parseDebounce(raw: string | undefined): number {
	if (raw === undefined) return GIT_EXPORT_CONFIG_DEFAULTS.debounceMs;
	const n = Number(raw);
	if (!Number.isFinite(n) || n < 0) return GIT_EXPORT_CONFIG_DEFAULTS.debounceMs;
	return Math.floor(n);
}

function buildConfig(kv: Map<string, string>): GitExportConfig {
	const remoteUrl = kv.get(KEYS.remoteUrl);
	return {
		enabled: kv.get(KEYS.enabled) === "true",
		repoPath: kv.get(KEYS.repoPath) ?? "",
		remoteUrl: remoteUrl && remoteUrl.length > 0 ? remoteUrl : null,
		branch: kv.get(KEYS.branch) ?? GIT_EXPORT_CONFIG_DEFAULTS.branch,
		authorName: kv.get(KEYS.authorName) ?? GIT_EXPORT_CONFIG_DEFAULTS.authorName,
		authorEmail: kv.get(KEYS.authorEmail) ?? GIT_EXPORT_CONFIG_DEFAULTS.authorEmail,
		debounceMs: parseDebounce(kv.get(KEYS.debounceMs)),
	};
}

/**
 * Read the typed config from `factory_settings`.
 *
 * With `{ includeDisabled: true }` (default) it always returns the shape —
 * used by GET /config / /status so operators can see + edit a disabled
 * config. Without it, returns `null` when either `enabled` is false or
 * `repoPath` is empty — the orchestrator short-circuits to
 * `{status:"disabled"}` in that case.
 */
export async function readGitExportConfig(db: HyperIdleDb): Promise<GitExportConfig> {
	return buildConfig(await readAllSettings(db));
}

export async function loadGitExportConfig(db: HyperIdleDb): Promise<GitExportConfig | null> {
	const cfg = buildConfig(await readAllSettings(db));
	if (!cfg.enabled) return null;
	if (cfg.repoPath.length === 0) return null;
	// Defense-in-depth: if somebody seeded `repo_path` directly (bypassing
	// PATCH /config's sanitizer), re-validate at load time. Reject rather
	// than silently letting the orchestrator write outside the allow-list.
	const check = sanitizeRepoPath(cfg.repoPath, await readRepoAllowRoots(db));
	if (!check.ok) return null;
	if (cfg.remoteUrl !== null) {
		const opts = { allowFileRemote: await readAllowFileRemote(db) };
		const remoteCheck = sanitizeRemoteUrl(cfg.remoteUrl, opts);
		if (!remoteCheck.ok) {
			// Treat an invalid stored remote as "no remote" — commit only.
			return { ...cfg, remoteUrl: null };
		}
	}
	return cfg;
}

export interface GitExportConfigPatch {
	enabled?: boolean;
	repoPath?: string;
	remoteUrl?: string | null;
	branch?: string;
	authorName?: string;
	authorEmail?: string;
	debounceMs?: number;
}

async function upsert(db: HyperIdleDb, key: string, value: string, now: string): Promise<void> {
	await db
		.insert(factorySettings)
		.values({ key, value, updatedAt: now })
		.onConflictDoUpdate({
			target: factorySettings.key,
			set: { value, updatedAt: now },
		});
}

/**
 * Write a partial patch back to `factory_settings`. Unknown fields are
 * ignored. `null` on `remoteUrl` clears the row (treated as unset).
 *
 * All upserts share a single `updatedAt` timestamp so one logical patch
 * has one timestamp across rows.
 */
export async function updateGitExportConfig(
	db: HyperIdleDb,
	patch: GitExportConfigPatch,
): Promise<GitExportConfig> {
	const now = new Date().toISOString();
	if (patch.enabled !== undefined)
		await upsert(db, KEYS.enabled, patch.enabled ? "true" : "false", now);
	if (patch.repoPath !== undefined) await upsert(db, KEYS.repoPath, patch.repoPath, now);
	if (patch.branch !== undefined) await upsert(db, KEYS.branch, patch.branch, now);
	if (patch.authorName !== undefined) await upsert(db, KEYS.authorName, patch.authorName, now);
	if (patch.authorEmail !== undefined) await upsert(db, KEYS.authorEmail, patch.authorEmail, now);
	if (patch.debounceMs !== undefined)
		await upsert(db, KEYS.debounceMs, String(patch.debounceMs), now);
	if (patch.remoteUrl !== undefined) {
		if (patch.remoteUrl === null || patch.remoteUrl.length === 0) {
			await db.delete(factorySettings).where(eq(factorySettings.key, KEYS.remoteUrl));
		} else {
			await upsert(db, KEYS.remoteUrl, patch.remoteUrl, now);
		}
	}
	return readGitExportConfig(db);
}

/** Persist the commit stamps after a successful local commit. */
export async function writeLastCommit(db: HyperIdleDb, sha: string, at: Date): Promise<void> {
	const now = new Date().toISOString();
	await upsert(db, KEYS.lastCommitAt, at.toISOString(), now);
	await upsert(db, KEYS.lastCommitSha, sha, now);
}

/** Persist the push stamp after a successful remote push. */
export async function writeLastPush(db: HyperIdleDb, at: Date): Promise<void> {
	const now = new Date().toISOString();
	await upsert(db, KEYS.lastPushAt, at.toISOString(), now);
}

export interface LastExportMeta {
	lastCommitAt: string | null;
	lastCommitSha: string | null;
	lastPushAt: string | null;
}

export async function getLastExportMeta(db: HyperIdleDb): Promise<LastExportMeta> {
	const rows = await db.select().from(factorySettings);
	let lastCommitAt: string | null = null;
	let lastCommitSha: string | null = null;
	let lastPushAt: string | null = null;
	for (const r of rows) {
		if (r.key === KEYS.lastCommitAt) lastCommitAt = r.value;
		else if (r.key === KEYS.lastCommitSha) lastCommitSha = r.value;
		else if (r.key === KEYS.lastPushAt) lastPushAt = r.value;
	}
	return { lastCommitAt, lastCommitSha, lastPushAt };
}

// ---------------------------------------------------------------------------
// Sanitizers (exported for routes + orchestrator defense-in-depth)
// ---------------------------------------------------------------------------

/**
 * System directory prefixes that the exporter must never write into, even
 * when the path is nominally absolute. The orchestrator runs as the server
 * process, so any write here is a privilege escalation signal.
 */
const DENIED_ROOT_PREFIXES: readonly string[] = [
	"/etc",
	"/root",
	"/sys",
	"/proc",
	"/dev",
	"/boot",
	"/bin",
	"/sbin",
	"/usr",
	"/lib",
	"/lib64",
	"/var/run",
	"/var/lib",
	"/var/log",
];

async function readAllowFileRemote(db: HyperIdleDb): Promise<boolean> {
	const [row] = await db
		.select()
		.from(factorySettings)
		.where(eq(factorySettings.key, KEYS.allowFileRemote))
		.limit(1);
	return row?.value === "true";
}

async function readRepoAllowRoots(db: HyperIdleDb): Promise<readonly string[]> {
	const [row] = await db
		.select()
		.from(factorySettings)
		.where(eq(factorySettings.key, KEYS.repoRoot))
		.limit(1);
	if (!row || row.value.length === 0) return [];
	return row.value
		.split(":")
		.map((s) => s.trim())
		.filter((s) => s.startsWith("/"));
}

/**
 * Validate a candidate `repoPath` for safe filesystem usage.
 *
 * Rejects:
 *  - empty / non-absolute
 *  - any segment equal to `..`
 *  - paths under known-sensitive system prefixes (`/etc`, `/root`, `/proc`, etc.)
 *  - NUL bytes
 *  - paths containing `.git` as an intermediate segment unless trailing (defensive)
 *
 * When `allowRoots` is non-empty, the resolved repoPath MUST be under one
 * of the entries. When empty, `$HOME` (or `/tmp` / `/var/tmp` / `/workspace`
 * for test + dev hosts) is the default allow-list root.
 *
 * @lore The allow-list covers the concrete threat from the security
 * review: an operator whose API key leaks cannot point the export at
 * `/etc` or `/root`. Tests + dev runs that live under `/tmp` or
 * `/workspace` (integration test dir) stay green with no extra config.
 */
export function sanitizeRepoPath(
	input: string,
	allowRoots: readonly string[] = [],
): { ok: true } | { ok: false; reason: string } {
	if (typeof input !== "string" || input.length === 0) {
		return { ok: false, reason: "repoPath must be a non-empty string" };
	}
	if (input.includes("\0")) {
		return { ok: false, reason: "repoPath must not contain NUL bytes" };
	}
	if (!input.startsWith("/")) {
		return { ok: false, reason: "repoPath must be an absolute path" };
	}
	for (const seg of input.split("/")) {
		if (seg === "..") {
			return { ok: false, reason: "repoPath must not contain '..' segments" };
		}
	}
	const resolved = path.resolve(input);
	for (const prefix of DENIED_ROOT_PREFIXES) {
		if (resolved === prefix || resolved.startsWith(`${prefix}/`)) {
			return { ok: false, reason: `repoPath must not be under ${prefix}` };
		}
	}
	const roots = allowRoots.length > 0 ? allowRoots : defaultAllowRoots();
	const inRoot = roots.some((r) => resolved === r || resolved.startsWith(`${r}/`));
	if (!inRoot) {
		return {
			ok: false,
			reason: `repoPath must be under one of: ${roots.join(", ")}`,
		};
	}
	return { ok: true };
}

function defaultAllowRoots(): readonly string[] {
	const home = os.homedir();
	const roots: string[] = [];
	if (home?.startsWith("/")) roots.push(home);
	roots.push("/tmp", "/var/tmp", "/workspace");
	// @lore On macOS, `os.tmpdir()` returns `/var/folders/…` which is NOT
	// under `/tmp` or `/var/tmp`. Tests (and dev scripts) create repos there
	// via `fs.mkdtempSync(os.tmpdir())`, so we must include it explicitly.
	const sysTmp = os.tmpdir();
	if (sysTmp.startsWith("/") && !roots.includes(sysTmp)) {
		roots.push(sysTmp);
	}
	return roots;
}

/**
 * Validate a single filesystem path segment for inclusion in an exported
 * rel-path. Returns the safe segment on success, null on rejection.
 *
 * Rejects: empty, `..`, `.`, leading `.`, any `/` or `\\`, NUL bytes.
 */
export function sanitizePathSegment(input: string): string | null {
	if (typeof input !== "string") return null;
	if (input.length === 0) return null;
	if (input === "." || input === "..") return null;
	if (input.startsWith(".")) return null;
	if (input.includes("/") || input.includes("\\")) return null;
	if (input.includes("\0")) return null;
	// Windows reserved names — even on posix these make sense to block.
	const upper = input.toUpperCase();
	if (["CON", "PRN", "AUX", "NUL"].includes(upper)) return null;
	if (/^(COM|LPT)[1-9]$/.test(upper)) return null;
	return input;
}

export interface SanitizeRemoteUrlOptions {
	/** Allow `file://` remotes — only for tests. Default false. */
	readonly allowFileRemote?: boolean;
}

/**
 * Allow-list of git remote URL shapes. Reject every URL with userinfo
 * (embedded credentials), `ext::` (executes arbitrary shell), and
 * unknown schemes. SCP-style (`user@host:path`) is accepted when the
 * user portion is not of the `user:password` form.
 */
export function sanitizeRemoteUrl(
	input: string,
	opts: SanitizeRemoteUrlOptions = {},
): { ok: true; sanitized: string } | { ok: false; reason: string } {
	if (typeof input !== "string" || input.length === 0) {
		return { ok: false, reason: "remoteUrl must be a non-empty string" };
	}
	if (input.startsWith("-")) {
		return { ok: false, reason: "remoteUrl must not begin with '-'" };
	}
	if (input.includes("\0") || /[\r\n]/.test(input)) {
		return { ok: false, reason: "remoteUrl must not contain control characters" };
	}
	if (/^ext::/i.test(input)) {
		return { ok: false, reason: "remoteUrl scheme 'ext::' is not permitted" };
	}
	// URL-shaped: parse with URL so we can strip userinfo.
	if (/^(https?|ssh|git|file):\/\//i.test(input)) {
		const scheme = input.slice(0, input.indexOf(":")).toLowerCase();
		if (scheme === "file" && !opts.allowFileRemote) {
			return { ok: false, reason: "file:// remotes are disabled" };
		}
		let url: URL;
		try {
			url = new URL(input);
		} catch {
			return { ok: false, reason: "remoteUrl is not a valid URL" };
		}
		if (url.username.length > 0 || url.password.length > 0) {
			return { ok: false, reason: "remoteUrl must not contain userinfo" };
		}
		return { ok: true, sanitized: input };
	}
	// SCP-style: user@host:path (no colon in user portion)
	const scp = /^([A-Za-z0-9._-]+)@([A-Za-z0-9.-]+):([^\s]+)$/;
	const m = scp.exec(input);
	if (m) {
		// m[1] is the first capture group — always defined when regex matches.
		const user = m[1];
		if (user !== undefined && user.includes(":")) {
			return { ok: false, reason: "remoteUrl must not contain userinfo password" };
		}
		return { ok: true, sanitized: input };
	}
	return {
		ok: false,
		reason: "remoteUrl must be https://, ssh://, git://, or user@host:path",
	};
}

/**
 * Strip `user:password@` or `user@` from URL-shaped remotes before
 * returning them to API callers. SCP-style values are returned as-is
 * (their "user" half is a login name, not a secret).
 */
export function redactRemoteUrl(input: string | null): string | null {
	if (input === null) return null;
	if (/^(https?|ssh|git|file):\/\//i.test(input)) {
		try {
			const url = new URL(input);
			url.username = "";
			url.password = "";
			return url.toString();
		} catch {
			return input;
		}
	}
	return input;
}

/**
 * Validate a git branch name. Rejects leading `-` (git option injection),
 * control chars, spaces, double-dots, and anything outside a conservative
 * charset that matches the git-check-ref-format intersection we care about.
 */
export function sanitizeBranch(input: string): { ok: true } | { ok: false; reason: string } {
	if (typeof input !== "string" || input.length === 0) {
		return { ok: false, reason: "branch must be a non-empty string" };
	}
	if (input.length > 200) return { ok: false, reason: "branch must be <= 200 chars" };
	if (input.startsWith("-")) return { ok: false, reason: "branch must not start with '-'" };
	if (input.includes("..")) return { ok: false, reason: "branch must not contain '..'" };
	if (!/^[A-Za-z0-9._/-]+$/.test(input)) {
		return { ok: false, reason: "branch must match [A-Za-z0-9._/-]+" };
	}
	return { ok: true };
}

/**
 * Validate an author name or email for safe inclusion in git commit args.
 * Rejects anything with `<`, `>`, CR, LF, or NUL.
 */
export function sanitizeAuthorName(input: string): { ok: true } | { ok: false; reason: string } {
	if (typeof input !== "string" || input.length === 0) {
		return { ok: false, reason: "authorName must be a non-empty string" };
	}
	if (input.length > 100) return { ok: false, reason: "authorName must be <= 100 chars" };
	if (/[<>\n\r\0]/.test(input)) {
		return { ok: false, reason: "authorName must not contain <, >, or control chars" };
	}
	return { ok: true };
}

export function sanitizeAuthorEmail(input: string): { ok: true } | { ok: false; reason: string } {
	if (typeof input !== "string" || input.length === 0) {
		return { ok: false, reason: "authorEmail must be a non-empty string" };
	}
	if (input.length > 254) return { ok: false, reason: "authorEmail must be <= 254 chars" };
	if (!/^[^\s<>@]+@[^\s<>@]+\.[^\s<>@]+$/.test(input)) {
		return { ok: false, reason: "authorEmail must be a valid email" };
	}
	return { ok: true };
}
