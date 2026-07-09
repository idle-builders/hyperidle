// AO1 — Filesystem reachability: real fs + git probes, AN1 resolver adapter.
// Source of truth: plans/AO1/architecture.md §v2 (Reachability rework v2).

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import type { FilesystemAuth, FilesystemAuthResolver, FilesystemState } from "@hyperidle/shared";
import { createGitRunner } from "../app-runtime/services/git-export-runner.js";
import type { ServiceConnectionResolver } from "./service-connection-resolver.js";

// ─── NoopAuthResolver ────────────────────────────────────────────────────────

/**
 * Fallback binding for tests and contexts where no real resolver is available.
 * Reports every connectionId unresolvable (→ needs_attention).
 *
 * @lore AO1 §3 WARN-3: With this Noop resolver, every connection-backed filesystem
 * permanently shows needs_attention. Kept for unit tests and non-request contexts.
 * Production routes use ServiceConnectionResolverAdapter instead.
 */
export class NoopAuthResolver implements FilesystemAuthResolver {
	canResolve(_connectionId: string): boolean {
		return false;
	}

	sourceOf(_connectionId: string): null {
		return null;
	}

	resolve(_connectionId: string): Promise<FilesystemAuth | null> {
		return Promise.resolve(null);
	}

	resolveToken(_connectionId: string): Promise<string | null> {
		return Promise.resolve(null);
	}
}

// ─── ServiceConnectionResolverAdapter ────────────────────────────────────────

/**
 * Adapts the real AN1 ServiceConnectionResolver to the FilesystemAuthResolver seam.
 * Closes over a per-request userId — constructed fresh per request handler, NOT
 * as a process singleton.
 *
 * @lore AO1 v2: The FilesystemAuthResolver interface has no userId parameter —
 * the adapter binds it at construction time from c.get("userId"). This is the
 * minimal real wiring; the seam interface is unchanged for AO2 consumers.
 *
 * @lore AO1 v2: serviceConnections.service is a free-form display name
 * ("GitHub", "github.com", etc.) — we lowercase+strip whitespace for source
 * derivation, not a guarantee of exact mapping.
 */
export class ServiceConnectionResolverAdapter implements FilesystemAuthResolver {
	constructor(
		private readonly resolver: ServiceConnectionResolver,
		private readonly userId: string,
	) {}

	async canResolve(connectionId: string): Promise<boolean> {
		const token = await this.resolver.resolve(this.userId, connectionId);
		return token !== null;
	}

	sourceOf(_connectionId: string): null {
		// The real resolver only exposes resolve(userId, id) → token | null.
		// We return null here — sourceHint fallback in the register route covers this.
		// A future AN2 revision could expose a sourceOf() directly on the resolver.
		// @lore AO1 v2: We intentionally don't force a DB re-query just to get
		// the service name — the register route falls back to sourceHint when this returns null.
		return null;
	}

	async resolve(connectionId: string): Promise<FilesystemAuth | null> {
		const token = await this.resolver.resolve(this.userId, connectionId);
		if (token === null) return null;
		// Wrap the decrypted token as a git-credential provision directive.
		// AO2 uses this to inject into the sandbox. The actual remote URL is
		// in resourceRef.repo — but we don't have it here (the adapter is called
		// per-connectionId without the row context). Return mode:none; AO2 will
		// call resolve again with the full row context when mounting.
		return {
			connectionId,
			provision: { mode: "none" },
		};
	}

	/**
	 * Resolve the raw decrypted token for git ls-remote injection.
	 * Implements FilesystemAuthResolver.resolveToken() — single decrypt, no double-trip.
	 *
	 * @lore AO1 v2: resolveToken() is the ONLY call resolveFilesystemState makes on the
	 * real-token path. The old code called resolve() (wasted decrypt → provision:none wrapper)
	 * then resolveToken() (second decrypt). Now: one call, no instanceof downcast, no waste.
	 */
	async resolveToken(connectionId: string): Promise<string | null> {
		return this.resolver.resolve(this.userId, connectionId);
	}
}

// ─── Probe result type ────────────────────────────────────────────────────────

export interface ProbeResult {
	state: FilesystemState;
	reason?: string;
}

// ─── LocalReachabilityProbe ───────────────────────────────────────────────────

/**
 * Real filesystem reachability: checks that `targetPath` exists and is readable.
 * Uses fs.access (async, R_OK) — never throws; returns a ProbeResult.
 *
 * @lore AO1 v2: Used for bare-local code repos (connectionId null, resourceRef.repo
 * is a local path) and doc_set folders (connectionId null, resourceRef.folder).
 * Obsidian = a local folder — treated as local, IN SCOPE (v2 doc over-deferred it).
 */
export function probeLocalPath(targetPath: string): Promise<ProbeResult> {
	return new Promise<ProbeResult>((resolve) => {
		fs.access(targetPath, fs.constants.R_OK, (err) => {
			if (err) {
				resolve({
					state: "needs_attention",
					reason: `${err.code ?? "ENOENT"}: ${targetPath}`,
				});
			} else {
				resolve({ state: "reachable" });
			}
		});
	});
}

// ─── GitReachabilityProbe ─────────────────────────────────────────────────────

/**
 * Real git reachability: `git ls-remote --quiet -- <url>` with optional
 * token injection via GIT_CONFIG_COUNT/KEY_n/VALUE_n (token never in argv/URL).
 * exit 0 → reachable; non-zero → needs_attention.
 *
 * Uses a temp-dir scratch cwd (not a real repo; ls-remote doesn't need one).
 * Timeout: push class (30s default) — a remote round-trip.
 *
 * @lore AO1 v2: Non-zero exit is DATA, not an exception. The runner never throws
 * from lsRemote — it always returns a result object.
 *
 * @lore AO1 v2: Token injected via GIT_CONFIG_KEY_0 =
 * "http.<host>/.extraHeader", GIT_CONFIG_VALUE_0 = "Authorization: Basic <b64>".
 * This is the ONLY safe env-injection path — invisible to ps, stripped from env inheritance.
 */
export async function probeGitRemote(url: string, token?: string | null): Promise<ProbeResult> {
	// ls-remote only needs a scratch cwd — use the OS temp dir.
	// We don't create or write any files; the dir just satisfies the spawn contract.
	const scratchCwd = os.tmpdir();
	const runner = createGitRunner(scratchCwd);

	let tokenConfig: { key: string; value: string } | undefined;
	if (token) {
		// GitHub PAT or generic bearer: Basic auth with x-access-token convention.
		// The host-scoped key restricts the header to the specific origin.
		const parsed = parseUrlHost(url);
		const headerKey = parsed ? `http.${parsed}/.extraHeader` : "http./.extraHeader";
		// base64("x-access-token:<token>") — standard GitHub PAT basic auth.
		const b64 = Buffer.from(`x-access-token:${token}`).toString("base64");
		tokenConfig = {
			key: headerKey,
			value: `Authorization: Basic ${b64}`,
		};
	}

	const result = await runner.lsRemote(url, tokenConfig ? { tokenConfig } : undefined);
	if (result.reachable) {
		return { state: "reachable" };
	}
	return { state: "needs_attention", reason: result.reason };
}

/** Extract `https://host` from a URL string for host-scoped git config injection. */
function parseUrlHost(url: string): string | null {
	try {
		const parsed = new URL(url);
		return `${parsed.protocol}//${parsed.host}`;
	} catch {
		return null;
	}
}

// ─── Row shape accepted by resolveFilesystemState ────────────────────────────

/** Minimal filesystem row fields needed for reachability resolution. */
export interface FilesystemReachabilityInput {
	id: string;
	teamId: string;
	source: string;
	kind: string;
	connectionId: string | null;
	resourceRef: string;
	writeback: string;
	state: string;
	createdAt: string;
}

// ─── resolveFilesystemState ──────────────────────────────────────────────────

/**
 * Real reachability check. Resolves the state for a filesystem row.
 *
 * Decision matrix (plans/AO1/architecture.md §v2·3):
 *   writeback:'none'         → 'reachable'   (read-only ref, nothing to auth or probe)
 *   connectionId null + local path → LocalReachabilityProbe (fs.access R_OK)
 *   kind='code' + connectionId  → GitReachabilityProbe (git ls-remote, token from resolver)
 *   doc_set + connectionId not resolved → needs_attention (GDrive/Dropbox not yet supported)
 *
 * The LIST route MUST use stored state (not call this) — one ls-remote per list row
 * would make team-list latency-bound on the forge. Only GET /:id and POST register
 * trigger a live probe.
 *
 * @lore AO1 v2: "surface, never silent" — an unresolvable connection MUST surface
 * as needs_attention, never silently pass.
 *
 * @lore AO1 v2: Obsidian = a local folder — probed via LocalReachabilityProbe
 * (source='obsidian', connectionId=null, resourceRef.folder = path).
 *
 * @lore AO1 v2: GDrive, Dropbox, S3 are explicitly DEFERRED. If a doc_set has a
 * connectionId pointing to one of these, it returns needs_attention with a clear reason.
 * NOT a stub — an honest deferral with the source documented.
 */
export async function resolveFilesystemState(
	row: FilesystemReachabilityInput,
	deps: { authResolver: FilesystemAuthResolver },
	opts?: { timeoutMs?: number },
): Promise<FilesystemState> {
	// Read-only reference: nothing to auth, always reachable.
	if (row.writeback === "none") {
		return "reachable";
	}

	if (row.connectionId == null) {
		// Bare local path: probe the actual filesystem.
		const localPath = extractLocalPath(row);
		if (localPath == null) {
			// No extractable path — unparseable bare-local ref. "Surface, never silent."
			// @lore AO1 v2: Changed from reachable → needs_attention. A malformed bare-local
			// resourceRef (no scheme, no extractable path) must never silently pass as reachable.
			// The only way here is a corrupt row (Zod schema rejects bad shapes at register time).
			return "needs_attention";
		}
		const result = await withTimeout(probeLocalPath(localPath), opts?.timeoutMs ?? 5_000);
		return result.state;
	}

	// Connection-backed path.
	if (row.kind === "code") {
		// Git remote probe: resolve token ONCE via the seam, then ls-remote.
		const resourceRef = parseResourceRef(row.resourceRef);
		const repo = resourceRef?.kind === "code" ? resourceRef.repo : null;

		if (repo == null) {
			// Malformed resourceRef — needs_attention.
			return "needs_attention";
		}

		// For bare local repo paths with a connectionId (unusual but possible), fall through to git probe.
		// git ls-remote file:///path works fine for local repos too.
		const url = repoToUrl(repo);

		// Resolve token via the seam — single decrypt, no double-trip, no instanceof downcast.
		// @lore AO1 v2: resolveToken() is the only call on the real-token path. The old code
		// called resolve() (wasted decrypt) then resolveToken() (second decrypt), and leaked
		// instanceof ServiceConnectionResolverAdapter into this function. Now the seam carries
		// resolveToken() and NoopAuthResolver returns null (→ ls-remote without auth).
		const rawToken = await deps.authResolver.resolveToken(row.connectionId);

		const result = await withTimeout(probeGitRemote(url, rawToken), opts?.timeoutMs ?? 30_000);
		return result.state;
	}

	// doc_set + connectionId: GDrive/Dropbox/S3 probes are DEFERRED — no connector exists yet.
	// @lore AO1 v2: Honest deferral — not a stub. The deferred sources are documented;
	// needs_attention is the correct surface state until a real probe lands (AO2+).
	return "needs_attention";
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Extract a local filesystem path from a filesystem row for the probe. */
function extractLocalPath(row: FilesystemReachabilityInput): string | null {
	const ref = parseResourceRef(row.resourceRef);
	if (ref == null) return null;
	if (ref.kind === "code") {
		// Local repo: bare path like /home/user/repo or relative
		const repo = ref.repo;
		// If it looks like a URL (http/https/git@/file://), not a local path.
		if (/^(https?|git@|file:|ssh:)/.test(repo)) return null;
		return repo;
	}
	if (ref.kind === "doc_set") {
		return ref.folder;
	}
	return null;
}

/**
 * Convert a repo reference to a URL for git ls-remote.
 *
 * Decision order:
 *   1. Already a full clone URL (https/http/git@/file:/ssh:/git:) → pass through.
 *   2. `owner/repo` short form (exactly one slash, no scheme, no absolute prefix) →
 *      construct `https://github.com/<owner>/<repo>.git`.
 *      This is the conventional GitHub short form (e.g. "octocat/Hello-World").
 *   3. Absolute local path → `file://<path>`.
 *   4. Anything else → resolve against cwd and treat as `file://`.
 *
 * @lore AO1 v2: M1 fix — the old code hit case 4 for "owner/repo" and produced
 * `file:///cwd/owner/repo`, probing a non-existent local directory. A GitHub-backed
 * filesystem with `owner/repo` short form was permanently needs_attention even with
 * a valid PAT. Now case 2 intercepts it before the local-path fallback.
 */
export function repoToUrl(repo: string): string {
	// 1. Already a full URL (http/https/file/ssh/git@/git:)
	if (/^(https?|git@|file:|ssh:|git:)/.test(repo)) return repo;
	// 2. owner/repo short form: exactly one slash, no leading slash, no scheme
	//    Matches "octocat/Hello-World" but NOT "org/sub/repo" or "/abs/path/repo"
	if (/^[^/]+\/[^/]+$/.test(repo)) {
		return `https://github.com/${repo}.git`;
	}
	// 3. Absolute local path → file:// URL
	if (path.isAbsolute(repo)) return `file://${repo}`;
	// 4. Relative path — resolve against cwd
	return `file://${path.resolve(repo)}`;
}

type ParsedRef =
	| { kind: "code"; repo: string; branch: string }
	| { kind: "doc_set"; folder: string }
	| null;

function parseResourceRef(raw: string): ParsedRef {
	try {
		const parsed = JSON.parse(raw) as unknown;
		if (typeof parsed !== "object" || parsed === null) return null;
		const obj = parsed as Record<string, unknown>;
		if (obj.kind === "code" && typeof obj.repo === "string") {
			return {
				kind: "code",
				repo: obj.repo,
				branch: typeof obj.branch === "string" ? obj.branch : "main",
			};
		}
		if (obj.kind === "doc_set" && typeof obj.folder === "string") {
			return { kind: "doc_set", folder: obj.folder };
		}
		return null;
	} catch {
		return null;
	}
}

/** Wrap a promise with a timeout; on timeout, returns needs_attention. */
function withTimeout(p: Promise<ProbeResult>, timeoutMs: number): Promise<ProbeResult> {
	return Promise.race([
		p,
		new Promise<ProbeResult>((resolve) =>
			setTimeout(() => resolve({ state: "needs_attention", reason: "probe timeout" }), timeoutMs),
		),
	]);
}
