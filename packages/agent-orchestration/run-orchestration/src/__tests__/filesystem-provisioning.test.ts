/**
 * AU21 §9 Increment 8, Wave F2 (credentials/filesystems provisioning split) — RED phase.
 *
 * Decision F2 / edge-disposition.md `filesystems.{listFilesystems, startWatcher}`
 * row: the sandbox mount + writeback-watcher OPERATION relocates into
 * `agent-orchestration`, reading the filesystem RECORD via `CoreApiPort`
 * (`filesystems.listFilesystemsByAgent`, one seam call — see
 * `core-api-port-increment8-connections-filesystems.integration.test.ts`).
 *
 * Two distinct pieces move, for two distinct reasons:
 *
 *  1. The mount operation (today `provisioner.ts`'s private, non-exported
 *     `mountFilesystemsForAgent`, `:767`) already lives in `agent-orchestration`
 *     — only its DB-reading PREAMBLE is wrong-side-of-the-seam: it calls the
 *     composition-bundle ports `listFilesystemIdsByAgent(db, agentId)` +
 *     `listFilesystemsByIds(db, ids)` (a two-step dance core-api's
 *     `run-orchestration-composition.ts` implements by calling
 *     `@hyperidle/filesystems`'s `listFilesystems` directly with a raw `db`
 *     handle — the hidden composition-bundle edge `edge-disposition.md`
 *     flags). This test targets the RELOCATED, exported entry point (this
 *     package's own `filesystem-provisioning.ts`, not yet created) whose
 *     signature takes `{filesystems: CoreApiPort["filesystems"], agentId,
 *     sandboxPath, mounter}` — no `db` parameter — collapsing the two-step
 *     port dance into the ONE seam call the backing route already supports.
 *
 *  2. `startWatcher` (`packages/core-api/filesystems/src/file-watcher.ts`) has
 *     ZERO database coupling — it only touches `fs`/`EventBus`, given a
 *     `sandboxPath`/`sessionId`/`manifestPath` directly. It was only ever
 *     called at session-launch time (`context.ts:1029`, via the composition-
 *     bundle's pass-through `filesystems: { startWatcher }` binding) — there
 *     is no "record" for it to read via the seam, so it moves WHOLESALE, not
 *     behind a new CoreApiPort method (an agent-orchestration package may not
 *     import a core-api Service directly per Mechanism B / composition-
 *     boundary-guard, which is exactly the edge this wave closes — so the
 *     function body itself relocates here, unchanged).
 *
 * Neither `../filesystem-provisioning.js` nor a local `../file-watcher.js`
 * exists in this package yet — every test below fails at IMPORT-RESOLUTION
 * time. RED for the right reason: the operation has not moved yet.
 */

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import type { Filesystem, FilesystemMounter } from "@hyperidle/shared";
import { EventBus } from "@hyperidle/shared";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
// biome-ignore lint/correctness/noUnresolvedImports: RED phase — relocated module does not exist yet in this pass.
import { mountFilesystemsForAgent } from "../filesystem-provisioning.js";
// biome-ignore lint/correctness/noUnresolvedImports: RED phase — relocated module does not exist yet in this pass.
import { startWatcher } from "../file-watcher.js";

let sandboxPath: string;
beforeEach(() => {
	sandboxPath = fs.mkdtempSync(path.join(os.tmpdir(), "au21-inc8-fsprov-"));
});
afterEach(() => {
	fs.rmSync(sandboxPath, { recursive: true, force: true });
	vi.restoreAllMocks();
});

// ── mountFilesystemsForAgent — relocated, seam-shaped (no db) ────────────────

describe("mountFilesystemsForAgent (relocated to agent-orchestration, one seam call)", () => {
	function buildFilesystemsSeam(
		rows: Filesystem[],
	): Parameters<typeof mountFilesystemsForAgent>[0]["filesystems"] {
		return {
			listFilesystemsByAgent: async (_agentId: string) => rows,
		};
	}

	function buildFilesystem(overrides: Partial<Filesystem> = {}): Filesystem {
		return {
			id: "fs-inc8-1",
			teamId: "team-inc8-1",
			source: "local",
			kind: "code",
			connectionId: null,
			resourceRef: { kind: "code", path: "/repo" },
			writeback: "git",
			state: "attached",
			createdAt: "2026-07-30T00:00:00.000Z",
			...overrides,
		};
	}

	test("mounts every filesystem the ONE seam call returns for the agent", async () => {
		const fsRow = buildFilesystem();
		const mounted: Array<{ filesystem: Filesystem }> = [];
		const mounter: FilesystemMounter = {
			mount: async (input) => {
				mounted.push({ filesystem: input.filesystem });
				return { success: true, sandboxPath: input.sandboxPath };
			},
			captureBack: async () => ({ success: true, captured: true }),
		};

		const result = await mountFilesystemsForAgent({
			filesystems: buildFilesystemsSeam([fsRow]),
			agentId: "agent-inc8-fs-1",
			sandboxPath,
			mounter,
		});

		expect(result).toHaveLength(1);
		expect(result[0]?.id).toBe("fs-inc8-1");
		expect(mounted).toHaveLength(1);
		expect(mounted[0]?.filesystem.resourceRef).toEqual({ kind: "code", path: "/repo" });
	});

	test("an agent with no injected filesystems mounts nothing (no throw)", async () => {
		const mounter: FilesystemMounter = {
			mount: vi.fn(),
			captureBack: vi.fn(),
		} as unknown as FilesystemMounter;

		const result = await mountFilesystemsForAgent({
			filesystems: buildFilesystemsSeam([]),
			agentId: "agent-inc8-fs-none",
			sandboxPath,
			mounter,
		});

		expect(result).toHaveLength(0);
		expect(mounter.mount).not.toHaveBeenCalled();
	});

	test("a failed mount is excluded from the result (degrade-to-today), not thrown", async () => {
		const fsRow = buildFilesystem({ id: "fs-inc8-fail" });
		const mounter: FilesystemMounter = {
			mount: async () => ({ success: false, sandboxPath, error: "mount failed" }),
			captureBack: async () => ({ success: true, captured: true }),
		};

		const result = await mountFilesystemsForAgent({
			filesystems: buildFilesystemsSeam([fsRow]),
			agentId: "agent-inc8-fs-fail",
			sandboxPath,
			mounter,
		});

		expect(result).toHaveLength(0);
	});
});

// ── startWatcher — pure relocation, zero behavior change ─────────────────────

describe("startWatcher (relocated wholesale — zero DB coupling, no CoreApiPort call)", () => {
	// Mirrors `filesystems-completeness-contract.integration.test.ts`'s
	// accepted timing (Darwin's recursive FSEvents watcher may not be ready
	// until the next turn) — same real-fs.watch precedent, not reinvented.
	test("watches knowledge/ and work/ dirs and emits sandbox_writeback_changes_detected on change", async () => {
		fs.mkdirSync(path.join(sandboxPath, "knowledge"), { recursive: true });
		const events: unknown[] = [];
		const eventBus = { emit: (event: unknown) => void events.push(event) } as EventBus;

		const watcher = startWatcher({
			sandboxPath,
			sessionId: "session-inc8-watch-1",
			manifestPath: path.join(sandboxPath, "manifest.json"),
			eventBus,
			debounceMs: 40,
			onError: vi.fn(),
		});

		await new Promise((resolve) => setTimeout(resolve, 75));
		fs.writeFileSync(path.join(sandboxPath, "knowledge", "note.md"), "hello");
		await new Promise((resolve) => setTimeout(resolve, 400));
		watcher.stop();

		expect(events.length).toBeGreaterThan(0);
	});
});
