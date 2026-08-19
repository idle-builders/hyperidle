/**
 * AU21 §9 Increment 8, Wave F2 — historical: `mountFilesystemsForAgent`
 * originally moved core-side reads behind the ONE seam call
 * `CoreApiPort.filesystems.listFilesystemsByAgent(agentId)`. AU21 §9 Increment
 * 12 then replaced that with an EMIT-TIME bake: the list was frozen onto the
 * request, and this function consumed it.
 *
 * AU26 F2 (founder ruling): both tables are agent-orchestration's own now, so
 * the bake is deleted and the function reads the record LIVE at spawn through
 * `deps.filesystems` — an injected `InjectedFilesystemsReaderPort` (Mechanism
 * C), not a seam and not a frozen list.
 *
 * These cases pin the mount loop itself, which did not change: the port is
 * asked once for the agent, every row it returns is mounted, a failed mount is
 * excluded rather than thrown, and an absent port mounts nothing. The
 * end-to-end staleness proof lives in
 * `filesystems-added-after-emit.integration.test.ts`.
 */

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import type { EventBus } from "@hyperidle/event-bus";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
// biome-ignore lint/correctness/noUnresolvedImports: RED phase — relocated module does not exist yet in this pass.
import { startWatcher } from "../file-watcher.js";
import {
	type FilesystemForProvisioning,
	type FilesystemMounterPort,
	type InjectedFilesystemsReaderPort,
	mountFilesystemsForAgent,
} from "../filesystem-provisioning.js";
// Filesystem is a local type in mounter.ts (AU44 b2: dissolved from domain-model).
import type { Filesystem } from "../mounter.js";

let sandboxPath: string;
beforeEach(() => {
	sandboxPath = fs.mkdtempSync(path.join(os.tmpdir(), "au21-inc12-fsprov-"));
});
afterEach(() => {
	fs.rmSync(sandboxPath, { recursive: true, force: true });
	vi.restoreAllMocks();
});

// ── mountFilesystemsForAgent — reads the record LIVE, zero baked list ──────

/** The reader port, recording which agent the mount step asked about. */
function reader(
	rows: readonly FilesystemForProvisioning[],
	asked: string[] = [],
): InjectedFilesystemsReaderPort {
	return {
		listInjectedForProvisioning: async (agentId: string) => {
			asked.push(agentId);
			return rows;
		},
	};
}

describe("mountFilesystemsForAgent reads the injected filesystems live at spawn", () => {
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

	test("mounts every filesystem the reader returns for THIS agent", async () => {
		const row = buildFilesystemRecord();
		const asked: string[] = [];
		const mounted: Array<{ filesystem: Filesystem }> = [];
		const mounter: FilesystemMounterPort = {
			mount: async (input) => {
				mounted.push({ filesystem: input.filesystem });
				return { success: true };
			},
			captureBack: async () => ({ success: true, captured: true }),
		};

		const result = await mountFilesystemsForAgent({
			agentId: "agent-inc12-1",
			filesystems: reader([row], asked),
			sandboxPath,
			mounter,
		});

		expect(asked).toEqual(["agent-inc12-1"]);
		expect(result).toHaveLength(1);
		expect(result[0]?.id).toBe("fs-inc12-1");
		expect(mounted).toHaveLength(1);
		expect(mounted[0]?.filesystem.resourceRef).toEqual({ kind: "doc_set", folder: "/repo" });
	});

	test("an agent with NO injected filesystems mounts nothing (no throw) — unchanged from today's behavior", async () => {
		const mounter: FilesystemMounterPort = {
			mount: vi.fn(),
			captureBack: vi.fn(),
		} as unknown as FilesystemMounterPort;

		const result = await mountFilesystemsForAgent({
			agentId: "agent-inc12-empty",
			filesystems: reader([]),
			sandboxPath,
			mounter,
		});

		expect(result).toHaveLength(0);
		expect(mounter.mount).not.toHaveBeenCalled();
	});

	test("an unwired reader port mounts nothing — the same graceful no-op an absent mounter gives", async () => {
		const mounter: FilesystemMounterPort = {
			mount: vi.fn(),
			captureBack: vi.fn(),
		} as unknown as FilesystemMounterPort;

		const result = await mountFilesystemsForAgent({
			agentId: "agent-inc12-unwired",
			sandboxPath,
			mounter,
		});

		expect(result).toHaveLength(0);
		expect(mounter.mount).not.toHaveBeenCalled();
	});

	test("a failed mount is excluded from the result (degrade-to-today), not thrown", async () => {
		const bakedRow = buildFilesystemRecord({ id: "fs-inc12-fail" });
		const mounter: FilesystemMounterPort = {
			mount: async () => ({ success: false, error: "mount failed" }),
			captureBack: async () => ({ success: true, captured: true }),
		};

		const result = await mountFilesystemsForAgent({
			agentId: "agent-inc12-fail",
			filesystems: reader([bakedRow]),
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
