/**
 * AO2 — Adapter 2: GitCloneAdapter.
 *
 * Remote code filesystem: mount via shallow `git clone`; capture via commit +
 * named-ref bundle. Push/PR = landing (AL7/AO3), NOT this adapter.
 *
 * Selection rule (W4·1): code fs + connectionId != null → this adapter.
 *
 * @lore AO2 §5 adapter-2: Shallow clone keeps the mount fast. Auth: ambient $HOME
 * for live-proof; auth.provision.mode honored when AN2 supplies it via tokenConfig.
 * The bundle is named-ref (shallow-safe, git ≥2.2) for AO3 portability.
 *
 * @lore AO2 §8 scaffolding-exclusion: Same approach as GitWorktreeAdapter —
 * write .git/info/exclude before context-assembly drops scaffolding into the dir.
 */

import * as fs from "node:fs";
import * as path from "node:path";
import type { MountResult } from "@hyperidle/shared";
import type { GitConfigInjection } from "@hyperidle/core-app";
import type {
	AdapterCaptureResult,
	CaptureContext,
	MountAdapter,
	MountContext,
} from "./mount-adapter.js";
import type { AdapterDeps } from "./mounter-registry.js";
import { SANDBOX_SCAFFOLDING_PATHS } from "./scaffolding-paths.js";

export class GitCloneAdapter implements MountAdapter {
	readonly id = "git-clone";

	constructor(private readonly deps: AdapterDeps) {}

	async mount(ctx: MountContext): Promise<MountResult> {
		const { filesystem, sandboxPath, auth } = ctx;

		if (filesystem.resourceRef.kind !== "code") {
			return {
				success: false,
				sandboxPath,
				error: `GitCloneAdapter: expected code resourceRef, got '${filesystem.resourceRef.kind}'`,
			};
		}

		const { repo, branch } = filesystem.resourceRef;

		// Resolve tokenConfig from auth if AN2 has provisioned held auth.
		const tokenConfig = resolveTokenConfig(auth);

		try {
			// cwd = sandboxPath (clone INTO the session directory).
			const runner = this.deps.gitRunnerFactory(sandboxPath);
			await runner.clone(repo, branch, { depth: 1, tokenConfig });

			// Write .git/info/exclude so scaffolding stays untracked.
			writeGitExclude(sandboxPath);

			return { success: true, sandboxPath };
		} catch (err) {
			return {
				success: false,
				sandboxPath,
				error: `GitCloneAdapter.mount failed: ${err instanceof Error ? err.message : String(err)}`,
			};
		}
	}

	async captureBack(ctx: CaptureContext): Promise<AdapterCaptureResult> {
		const { filesystem, sandboxPath, sessionId } = ctx;

		if (filesystem.resourceRef.kind !== "code") {
			return {
				success: false,
				captured: false,
				error: "GitCloneAdapter: expected code resourceRef",
			};
		}

		const { branch } = filesystem.resourceRef;
		const bundlePath = path.join(this.deps.capturesDir, `${sessionId}.bundle`);

		try {
			fs.mkdirSync(this.deps.capturesDir, { recursive: true });

			const runner = this.deps.gitRunnerFactory(sandboxPath);

			// Stage all authored changes (scaffolding excluded via .git/info/exclude).
			await runner.add([]);

			const clean = await runner.diffCached();
			if (clean) {
				return { success: true, captured: false };
			}

			const sha = await runner.commit(
				`agent capture (session ${sessionId})`,
				"HyperIdle Agent",
				"agent@hyperidle.local",
			);

			// Named-ref bundle for AO3. Shallow-safe (git ≥2.2).
			await runner.bundle(bundlePath, `refs/heads/${branch}`);

			return { success: true, captured: true, capturePath: bundlePath, commitSha: sha };
		} catch (err) {
			return {
				success: false,
				captured: false,
				error: `GitCloneAdapter.captureBack failed: ${err instanceof Error ? err.message : String(err)}`,
			};
		}
	}
}

/** Extract a GitConfigInjection from FilesystemAuth if present. */
function resolveTokenConfig(auth: MountContext["auth"]): GitConfigInjection | undefined {
	if (!auth) return undefined;
	const { provision } = auth;
	if (provision.mode === "git-credential") {
		// The remote URL is the key (git config extraHeader target).
		return { key: `http.${provision.remote}.extraHeader`, value: "" };
	}
	if (provision.mode === "env") {
		// env vars are injected via GH_TOKEN in buildGitEnv — no extra config needed.
		return undefined;
	}
	return undefined;
}

/** Write .git/info/exclude with SANDBOX_SCAFFOLDING_PATHS entries. */
function writeGitExclude(sandboxPath: string): void {
	const excludePath = path.join(sandboxPath, ".git", "info", "exclude");
	const excludeDir = path.dirname(excludePath);
	try {
		fs.mkdirSync(excludeDir, { recursive: true });
		const entries = SANDBOX_SCAFFOLDING_PATHS.map((p) => `/${p}`).join("\n");
		const content = `# AO2 scaffolding exclusion — auto-generated, do not edit.\n${entries}\n`;
		fs.writeFileSync(excludePath, content, "utf-8");
	} catch {
		// Non-fatal.
	}
}
