import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import type { FilesystemRow, WriteExecutor } from "@hyperidle/db";
import { updateFilesystemState } from "./filesystem-registry.js";

/** Reachability lifecycle.
 *  - attached: freshly registered (no check yet).
 *  - reachable: connection resolves.
 *  - needs_attention: unresolvable / unauthenticated connection.
 *
 * Declared here — next to resolveFilesystemState which returns it — not as a
 * named export in @hyperidle/domain-model (AU44 b2 dissolution). */
export type FilesystemState = "attached" | "reachable" | "needs_attention";

import type { FilesystemsGitRunnerFactory, FilesystemTokenResolver } from "./ports.js";

interface ProbeResult {
	state: FilesystemState;
	reason?: string;
}

function probeLocalPath(targetPath: string): Promise<ProbeResult> {
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

async function probeGitRemote(
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

function parseUrlHost(url: string): string | null {
	try {
		const parsed = new URL(url);
		return `${parsed.protocol}//${parsed.host}`;
	} catch {
		return null;
	}
}

export async function resolveFilesystemState(
	row: FilesystemRow,
	deps: { authResolver: FilesystemTokenResolver; gitRunnerFactory: FilesystemsGitRunnerFactory },
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

	return "needs_attention";
}

function extractLocalPath(row: FilesystemRow): string | null {
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

function repoToUrl(repo: string): string {
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

function withTimeout(p: Promise<ProbeResult>, timeoutMs: number): Promise<ProbeResult> {
	return Promise.race([
		p,
		new Promise<ProbeResult>((resolve) =>
			setTimeout(() => resolve({ state: "needs_attention", reason: "probe timeout" }), timeoutMs),
		),
	]);
}

/**
 * Probe a filesystem's reachability and persist any state transition atomically.
 * Folds `resolveFilesystemState` + `updateFilesystemState` + the route's
 * `checkAndPersistState` helper into one service method.
 *
 * Returns the updated row (or the original if state unchanged).
 */
export async function refreshFilesystemState(
	exec: WriteExecutor,
	row: FilesystemRow,
	deps: { authResolver: FilesystemTokenResolver; gitRunnerFactory: FilesystemsGitRunnerFactory },
	opts?: { timeoutMs?: number },
): Promise<FilesystemRow> {
	const newState = await resolveFilesystemState(row, deps, opts);
	if (newState !== row.state) {
		await updateFilesystemState(exec, row.id, newState);
		return { ...row, state: newState };
	}
	return row;
}
