/**
 * @lore `checkFilesystem`: "is this filesystem usable right now, and if
 * not, what should the person do about it." Used by three callers: the
 * `POST /:id/check` route, registration (`POST /`), and placement-failure
 * reason phrasing — the SAME logic decides all three, so a filesystem
 * never gets a different verdict depending on who asked.
 *
 * The remote is reached FIRST; `gh` is asked only when that answer says it is
 * needed (a token connection, or the remote itself asked for a login) — a
 * public github.com repository therefore needs no `gh` at all.
 */
import * as fs from "node:fs";
import * as os from "node:os";
import { gitCredentialEnv } from "./git-credential-env.js";
import type { Filesystem } from "./mounter.js";
import { isLocalRepoPath, normalizeLocalPath } from "./mounter.js";
import type { MountingGitRunnerFactory, RcloneRunner } from "./mounter-ports.js";

export type GhAuthState = "logged_in" | "logged_out" | "not_installed";

export interface FilesystemCheckDeps {
	/** The PAT resolved as the connection's owner, or null. Never re-resolved here. */
	readonly credential: string | null;
	readonly gitRunnerFactory: MountingGitRunnerFactory;
	readonly ghAuthStatus: (token: string | null) => Promise<GhAuthState>;
	/** Required — Check must never silently skip the drive branch. */
	readonly rclone: RcloneRunner;
}

export interface FilesystemCheckResult {
	readonly ok: boolean;
	/** What to fix, plain words. Null when ok. */
	readonly reason: string | null;
}

const REASON_CONNECTION_UNRESOLVED =
	"the GitHub token connection for this filesystem is missing or cannot be decrypted";
const REASON_GH_NOT_INSTALLED_FOR_CONNECTION =
	"Install the GitHub CLI (gh): HyperIdle hands your GitHub token to git through it";
const REASON_TOKEN_REJECTED = "The GitHub token was rejected. Replace it in Settings → Connections";
const REASON_LOGIN_NEEDED_NO_GH =
	"This repository needs a GitHub login. Install the GitHub CLI (gh) and run `gh auth login`, or add a GitHub token connection";
const REASON_LOGIN_NEEDED_LOGGED_OUT =
	"This repository needs a GitHub login. Run `gh auth login`, or add a GitHub token connection";
const REASON_NO_ACCESS = "Your GitHub login has no access to this repository, or it does not exist";

function ok(): FilesystemCheckResult {
	return { ok: true, reason: null };
}
function notOk(reason: string): FilesystemCheckResult {
	return { ok: false, reason };
}

export type DriveFailureCode =
	| "not_installed"
	| "remote_missing"
	| "directory_not_found"
	| "not_a_folder"
	| "failed";

/**
 * The one phrasing for every way a Drive filesystem can be unusable — shared
 * by `checkFilesystem` and (once it places one) the adapter, so a person
 * never sees two different sentences about the same failure.
 */
export function driveReason(
	code: DriveFailureCode,
	ref: { readonly remote: string; readonly path: string },
	detail?: string,
): string {
	switch (code) {
		case "not_installed":
			return "Install rclone, then run `rclone config` to add your Google Drive remote — HyperIdle copies Drive folders through it";
		case "remote_missing":
			return `No rclone remote named \`${ref.remote}\`. Run \`rclone config\` to add one. Google makes you create your own OAuth client the first time; rclone's Google Drive setup walks you through it`;
		case "directory_not_found":
			return `Folder \`${ref.path}\` is not in the \`${ref.remote}\` Drive remote`;
		case "not_a_folder":
			return `\`${ref.remote}:${ref.path}\` is a file, not a folder`;
		case "failed":
			return `rclone could not reach \`${ref.remote}:${ref.path}\`: ${detail}. If your Drive login expired, run \`rclone config reconnect ${ref.remote}:\``;
	}
}

async function checkDrive(
	ref: { readonly remote: string; readonly path: string },
	deps: FilesystemCheckDeps,
): Promise<FilesystemCheckResult> {
	const remotes = await deps.rclone.listRemotes();
	if (!remotes.ok) {
		return notOk(
			remotes.code === "not_installed"
				? driveReason("not_installed", ref)
				: driveReason("failed", ref, remotes.reason),
		);
	}
	if (!remotes.value.includes(ref.remote)) return notOk(driveReason("remote_missing", ref));

	const stat = await deps.rclone.statPath(ref.remote, ref.path);
	if (!stat.ok) {
		return notOk(
			stat.code === "directory_not_found"
				? driveReason("directory_not_found", ref)
				: driveReason("failed", ref, stat.reason),
		);
	}
	return stat.value.isDir ? ok() : notOk(driveReason("not_a_folder", ref));
}

async function checkFolder(folder: string): Promise<FilesystemCheckResult> {
	try {
		return fs.statSync(folder).isDirectory() ? ok() : notOk(`'${folder}' is not a folder`);
	} catch {
		return notOk(`folder does not exist: '${folder}'`);
	}
}

async function checkLocalRepo(
	repo: string,
	branch: string,
	deps: FilesystemCheckDeps,
): Promise<FilesystemCheckResult> {
	const repoPath = normalizeLocalPath(repo);
	const runner = deps.gitRunnerFactory(repoPath);
	const insideWorkTree = await runner.revParseIsInsideWorkTree();
	if (!insideWorkTree) return notOk(`'${repo}' is not a git repository`);
	const resolved = await runner.verifyCommit(branch);
	return resolved ? ok() : notOk(`branch '${branch}' not found in '${repo}'`);
}

async function checkRemoteRepo(
	filesystem: Filesystem,
	url: string,
	branch: string,
	deps: FilesystemCheckDeps,
): Promise<FilesystemCheckResult> {
	// gitCredentialEnv returns {} for anything but a `https://github.com/` URL —
	// reused here (rather than a second regex) so Check and mounting can never
	// disagree about which URLs are "github.com" ones.
	const isGithubHttps = Object.keys(gitCredentialEnv(url, null)).length > 0;

	if (filesystem.connectionId != null) {
		if (deps.credential == null) return notOk(REASON_CONNECTION_UNRESOLVED);
		const status = await deps.ghAuthStatus(deps.credential);
		if (status === "not_installed") return notOk(REASON_GH_NOT_INSTALLED_FOR_CONNECTION);
		if (status === "logged_out") return notOk(REASON_TOKEN_REJECTED);
	}

	const env = isGithubHttps ? gitCredentialEnv(url, deps.credential) : {};
	const runner = deps.gitRunnerFactory(os.tmpdir());
	const result = await runner.lsRemote(url, { env, branch });

	if (result.found) return ok();
	if (result.reason === "git is not installed") return notOk("Install git");
	if (result.branchMissing) return notOk(`branch '${branch}' not found`);

	if (result.authRequested && filesystem.connectionId == null && isGithubHttps) {
		const status = await deps.ghAuthStatus(null);
		if (status === "not_installed") return notOk(REASON_LOGIN_NEEDED_NO_GH);
		if (status === "logged_out") return notOk(REASON_LOGIN_NEEDED_LOGGED_OUT);
		return notOk(REASON_NO_ACCESS);
	}

	return notOk(result.reason ?? "the remote could not be reached");
}

export async function checkFilesystem(
	filesystem: Filesystem,
	deps: FilesystemCheckDeps,
): Promise<FilesystemCheckResult> {
	const ref = filesystem.resourceRef;
	if (ref.kind === "drive") return checkDrive(ref, deps);
	if (ref.kind === "doc_set") return checkFolder(ref.folder);
	if (isLocalRepoPath(ref)) return checkLocalRepo(ref.repo, ref.branch, deps);
	return checkRemoteRepo(filesystem, ref.repo, ref.branch, deps);
}
