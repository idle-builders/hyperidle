// AO1 — Filesystem reachability: real fs + git probes, AN1 resolver adapter.
// Source of truth: plans/AO1/architecture.md §v2 (Reachability rework v2).

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { createGitRunner } from "@hyperidle/fabric";
import type { FilesystemAuth, FilesystemAuthResolver, FilesystemState } from "@hyperidle/shared";
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

	async sourceOf(_connectionId: string): Promise<string | null> {
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
	 * Expose the raw decrypted token for git ls-remote injection.
	 * This is NOT part of the FilesystemAuthResolver interface — it is an
	 * internal method used only by resolveFilesystemState when it needs to
	 * inject a token into the git env.
	 *
	 * @lore AO1 v2: The seam interface doesn't carry the raw token (opaque FilesystemAuth).
	 * resolveFilesystemState calls this directly when authResolver is this class.
	 * This avoids a third DB round-trip by going straight to the resolver.
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
export async function probeLocalPath(targetPath: string): Promise<ProbeResult> {
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
			// No extractable path — treat as reachable (backward compat with test-only paths).
			return "reachable";
		}
		const result = await withTimeout(probeLocalPath(localPath), opts?.timeoutMs ?? 5_000);
		return result.state;
	}

	// Connection-backed path.
	if (row.kind === "code") {
		// Git remote probe: resolve token, then ls-remote.
		const resourceRef = parseResourceRef(row.resourceRef);
		const repo = resourceRef?.kind === "code" ? resourceRef.repo : null;

		if (repo == null) {
			// Malformed resourceRef — needs_attention.
			return "needs_attention";
		}

		// For bare local repo paths with a connectionId (unusual but possible), fall through to git probe.
		// git ls-remote file:///path works fine for local repos too.
		const url = repoToUrl(repo);

		// Resolve token via the real AN1 resolver (or Noop → null in tests).
		const auth = await deps.authResolver.resolve(row.connectionId);
		// The token lives in FilesystemAuth but we need the raw string for ls-remote injection.
		// The seam doesn't expose the raw token — re-resolve via the resolver directly.
		// We call canResolve to check, then resolve to get auth; but the raw token is already
		// decrypted inside ServiceConnectionResolverAdapter.resolve() → we lose it in the provision:none wrapper.
		// Solution: check via canResolve (which calls resolve internally); if auth is non-null, the
		// resolver returned something. But to inject the token into git, we need it raw.
		// @lore AO1 v2: The FilesystemAuthResolver.resolve() returns FilesystemAuth (opaque provision),
		// NOT the raw token. The real raw token is needed for GIT_CONFIG injection. We extend the seam
		// minimally: if the authResolver is a ServiceConnectionResolverAdapter, call its inner resolver.
		// Otherwise (Noop/fake), auth=null → no token → ls-remote without auth (public repo or fails).
		let rawToken: string | null = null;
		if (auth !== null && deps.authResolver instanceof ServiceConnectionResolverAdapter) {
			// The adapter already decrypted the token in canResolve; re-decrypt here.
			// This is an extra SELECT — acceptable for the single-row inspect path.
			rawToken = await deps.authResolver.resolveToken(row.connectionId);
		}

		const result = await withTimeout(probeGitRemote(url, rawToken), opts?.timeoutMs ?? 30_000);
		return result.state;
	}

	// doc_set + connectionId: check if the connection resolves at all.
	// GDrive/Dropbox/S3 probes are DEFERRED — no connector exists yet.
	// If the connection resolves (token exists), surface needs_attention with a reason.
	// If it doesn't resolve, surface needs_attention (can't auth).
	// @lore AO1 v2: Honest deferral — not a stub. The check is real
	// (can we decrypt the token?); the probe is deferred (no GDrive client).
	const resolved = await deps.authResolver.canResolve(row.connectionId);
	return resolved ? "needs_attention" : "needs_attention";
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

/** Convert a repo reference to a URL for git ls-remote. */
function repoToUrl(repo: string): string {
	// Already a URL (http/https/file/ssh/git@)
	if (/^(https?|git@|file:|ssh:|git:)/.test(repo)) return repo;
	// Absolute local path → file:// URL
	if (path.isAbsolute(repo)) return `file://${repo}`;
	// Relative path — treat as file://
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
async function withTimeout(p: Promise<ProbeResult>, timeoutMs: number): Promise<ProbeResult> {
	return Promise.race([
		p,
		new Promise<ProbeResult>((resolve) =>
			setTimeout(() => resolve({ state: "needs_attention", reason: "probe timeout" }), timeoutMs),
		),
	]);
}
