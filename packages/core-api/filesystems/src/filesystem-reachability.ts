// AO1 — Filesystem reachability: real fs + git probes.
// Source of truth: plans/AO1/architecture.md §v2 (Reachability rework v2).
//
// @lore AU20 R-filesystems: NoopAuthResolver and ServiceConnectionResolverAdapter
// DELETED. Callers (routes/filesystems.ts, tests) build their own adapter objects
// — the FilesystemAuthResolver interface from @hyperidle/shared is structural, so
// no class is required. probeLocalPath / probeGitRemote / repoToUrl / ProbeResult
// are internal: consumed by the probe-internals.test.ts via direct module import
// (allowed for intra-package tests) but NOT part of the barrel API.

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import type { FilesystemAuthResolver, FilesystemState } from "@hyperidle/shared";
import type { FilesystemsGitRunnerFactory } from "./ports.js";

// ─── Probe result type (internal) ────────────────────────────────────────────

interface ProbeResult {
	state: FilesystemState;
	reason?: string;
}

// ─── LocalReachabilityProbe (internal) ───────────────────────────────────────

/**
 * Real filesystem reachability: checks that `targetPath` exists and is readable.
 *
 * @lore AO1 v2: Used for bare-local code repos (connectionId null, resourceRef.repo
 * is a local path) and doc_set folders (connectionId null, resourceRef.folder).
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

// ─── GitReachabilityProbe (internal) ─────────────────────────────────────────

/**
 * Real git reachability: `git ls-remote --quiet -- <url>` with optional
 * token injection via GIT_CONFIG_COUNT/KEY_n/VALUE_n.
 *
 * @lore AO1 v2: Non-zero exit is DATA, not an exception.
 * @lore AO1 v2: Token injected via GIT_CONFIG_KEY_0 =
 * "http.<host>/.extraHeader", GIT_CONFIG_VALUE_0 = "Authorization: Basic <b64>".
 */
export async function probeGitRemote(
	url: string,
	token: string | null | undefined,
	gitRunnerFactory: FilesystemsGitRunnerFactory,
): Promise<ProbeResult> {
	const scratchCwd = os.tmpdir();
	const runner = gitRunnerFactory(scratchCwd);

	let tokenConfig: { key: string; value: string } | undefined;
	if (token) {
		const parsed = parseUrlHost(url);
		const headerKey = parsed ? `http.${parsed}/.extraHeader` : "http./.extraHeader";
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
 * @lore AO1 v2: The LIST route MUST use stored state (not call this) — one
 * ls-remote per list row would make team-list latency-bound on the forge.
 * Only GET /:id and POST register trigger a live probe.
 *
 * @lore AO1 v2: "surface, never silent" — an unresolvable connection MUST
 * surface as needs_attention, never silently pass.
 */
export async function resolveFilesystemState(
	row: FilesystemReachabilityInput,
	deps: { authResolver: FilesystemAuthResolver; gitRunnerFactory: FilesystemsGitRunnerFactory },
	opts?: { timeoutMs?: number },
): Promise<FilesystemState> {
	if (row.writeback === "none") {
		return "reachable";
	}

	if (row.connectionId == null) {
		const localPath = extractLocalPath(row);
		if (localPath == null) {
			return "needs_attention";
		}
		const result = await withTimeout(probeLocalPath(localPath), opts?.timeoutMs ?? 5_000);
		return result.state;
	}

	if (row.kind === "code") {
		const resourceRef = parseResourceRef(row.resourceRef);
		const repo = resourceRef?.kind === "code" ? resourceRef.repo : null;

		if (repo == null) {
			return "needs_attention";
		}

		const url = repoToUrl(repo);
		const rawToken = await deps.authResolver.resolveToken(row.connectionId);

		const result = await withTimeout(
			probeGitRemote(url, rawToken, deps.gitRunnerFactory),
			opts?.timeoutMs ?? 30_000,
		);
		return result.state;
	}

	// doc_set + connectionId: GDrive/Dropbox/S3 probes are DEFERRED.
	return "needs_attention";
}

// ─── Helpers (internal) ───────────────────────────────────────────────────────

/** Extract a local filesystem path from a filesystem row for the probe. */
function extractLocalPath(row: FilesystemReachabilityInput): string | null {
	const ref = parseResourceRef(row.resourceRef);
	if (ref == null) return null;
	if (ref.kind === "code") {
		const repo = ref.repo;
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
 * @lore AO1 v2: M1 fix — "owner/repo" short form now correctly maps to
 * https://github.com/<owner>/<repo>.git instead of a file:// path.
 */
export function repoToUrl(repo: string): string {
	if (/^(https?|git@|file:|ssh:|git:)/.test(repo)) return repo;
	if (/^[^/]+\/[^/]+$/.test(repo)) {
		return `https://github.com/${repo}.git`;
	}
	if (path.isAbsolute(repo)) return `file://${repo}`;
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
