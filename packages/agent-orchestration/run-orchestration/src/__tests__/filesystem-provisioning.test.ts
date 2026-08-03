/**
 * AU21 §9 Increment 8, Wave F2 (credentials/filesystems provisioning split) —
 * historical RED-phase note kept for context: `mountFilesystemsForAgent`
 * originally moved core-side reads behind the ONE seam call
 * `CoreApiPort.filesystems.listFilesystemsByAgent(agentId)`.
 *
 * AU21 §9 Increment 12 follow-up (F2 gap closure) — RED phase, current pass.
 *
 * Decision H3 already established the pattern this fix extends: core bakes
 * everything a session needs into the request AT EMIT TIME, keyed off the
 * resolved agentId, so run-orchestration never reads core-api back at
 * provisioning time. F2's seam call above was the one genuine gap H3's later,
 * more complete principle should have superseded but never revisited — there
 * is no principled difference between "read the task's context at launch"
 * (already fixed by H3) and "read the agent's filesystem list at launch"
 * (this fix).
 *
 * `mountFilesystemsForAgent` now consumes the baked `injectedFilesystems`
 * list directly (every per-kind resolver bakes it at emit time via
 * `@hyperidle/filesystems`'s new `resolveInjectedFilesystemsForAgent`, one
 * layer up the call stack) — it no longer takes a `filesystems` seam reader
 * or an `agentId` to resolve one with. Every test below currently fails: the
 * live implementation still requires `{filesystems, agentId, sandboxPath,
 * mounter}` and reads `filesystems.listFilesystemsByAgent(agentId)`
 * internally — calling it with the NEW `{injectedFilesystems, sandboxPath,
 * mounter}` shape leaves `filesystems` `undefined`, so the live code throws
 * `TypeError: Cannot read properties of undefined (reading
 * 'listFilesystemsByAgent')` before ever reaching the mount loop. RED for the
 * right reason: the function has not been migrated to the baked-list API
 * yet, not a typo.
 */

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import type { EventBus, Filesystem, FilesystemMounter } from "@hyperidle/shared";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
// biome-ignore lint/correctness/noUnresolvedImports: RED phase — relocated module does not exist yet in this pass.
import { startWatcher } from "../file-watcher.js";
import {
	type FilesystemForProvisioning,
	mountFilesystemsForAgent,
} from "../filesystem-provisioning.js";

let sandboxPath: string;
beforeEach(() => {
	sandboxPath = fs.mkdtempSync(path.join(os.tmpdir(), "au21-inc12-fsprov-"));
});
afterEach(() => {
	fs.rmSync(sandboxPath, { recursive: true, force: true });
	vi.restoreAllMocks();
});

// ── mountFilesystemsForAgent — consumes the BAKED list, zero seam reader ────

describe("mountFilesystemsForAgent consumes the baked injectedFilesystems list", () => {
	function buildFilesystemRecord(
		overrides: Partial<FilesystemForProvisioning> = {},
	): FilesystemForProvisioning {
		return {
			id: "fs-inc12-1",
			teamId: "team-inc12-1",
			source: "local",
			kind: "doc_set",
			connectionId: null,
			resourceRef: { kind: "doc_set", folder: "/repo" },
			writeback: "git",
			state: "attached",
			createdAt: "2026-08-02T00:00:00.000Z",
			...overrides,
		};
	}

	test("mounts every filesystem in the baked injectedFilesystems list — zero reader/seam call", async () => {
		const bakedRow = buildFilesystemRecord();
		const mounted: Array<{ filesystem: Filesystem }> = [];
		const mounter: FilesystemMounter = {
			mount: async (input) => {
				mounted.push({ filesystem: input.filesystem });
				return { success: true, sandboxPath: input.sandboxPath };
			},
			captureBack: async () => ({ success: true, captured: true }),
		};

		const result = await mountFilesystemsForAgent({
			injectedFilesystems: [bakedRow],
			sandboxPath,
			mounter,
		});

		expect(result).toHaveLength(1);
		expect(result[0]?.id).toBe("fs-inc12-1");
		expect(mounted).toHaveLength(1);
		expect(mounted[0]?.filesystem.resourceRef).toEqual({ kind: "doc_set", folder: "/repo" });
	});

	test("an agent with NO injected filesystems mounts nothing (no throw) — unchanged from today's behavior", async () => {
		const mounter: FilesystemMounter = {
			mount: vi.fn(),
			captureBack: vi.fn(),
		} as unknown as FilesystemMounter;

		const result = await mountFilesystemsForAgent({
			injectedFilesystems: [],
			sandboxPath,
			mounter,
		});

		expect(result).toHaveLength(0);
		expect(mounter.mount).not.toHaveBeenCalled();
	});

	test("a failed mount is excluded from the result (degrade-to-today), not thrown", async () => {
		const bakedRow = buildFilesystemRecord({ id: "fs-inc12-fail" });
		const mounter: FilesystemMounter = {
			mount: async () => ({ success: false, sandboxPath, error: "mount failed" }),
			captureBack: async () => ({ success: true, captured: true }),
		};

		const result = await mountFilesystemsForAgent({
			injectedFilesystems: [bakedRow],
			sandboxPath,
			mounter,
		});

		expect(result).toHaveLength(0);
	});
});

// ── startWatcher — pure relocation, zero behavior change (untouched by this fix) ─

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
			sessionId: "session-inc12-watch-1",
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
