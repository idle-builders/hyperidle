/**
 * `mountFilesystemsForAgent` reads injected filesystems live at spawn: asks
 * the reader port for this agent, mounts every row it returns, excludes a
 * failed mount rather than throwing, and mounts nothing when the port or its
 * rows are absent.
 */

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import {
	type FilesystemForProvisioning,
	type FilesystemMounterPort,
	type InjectedFilesystemsReaderPort,
	mountFilesystemsForAgent,
} from "../filesystem-provisioning.js";
// Filesystem is a local type in mounter.ts, not imported from domain-model.
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

/** The reader port, recording which agent the mount step asked about and every state it marked. */
function reader(
	rows: readonly FilesystemForProvisioning[],
	asked: string[] = [],
	marked: Array<[string, string]> = [],
): InjectedFilesystemsReaderPort {
	return {
		listInjectedForProvisioning: async (agentId: string) => {
			asked.push(agentId);
			return rows;
		},
		markState: async (id, state) => {
			marked.push([id, state]);
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
		};

		const result = await mountFilesystemsForAgent({
			agentId: "agent-inc12-fail",
			filesystems: reader([bakedRow]),
			sandboxPath,
			mounter,
		});

		expect(result).toHaveLength(0);
	});

	test.each([
		{ mounts: true, was: "attached", marked: [["fs-mark", "reachable"]] },
		{ mounts: false, was: "attached", marked: [["fs-mark", "needs_attention"]] },
		{ mounts: true, was: "reachable", marked: [] },
	])("a folder that mounts: $mounts, marked $marked from $was", async ({ mounts, was, marked }) => {
		const row = buildFilesystemRecord({ id: "fs-mark", state: was });
		const states: Array<[string, string]> = [];
		const mounter: FilesystemMounterPort = {
			mount: async () => (mounts ? { success: true } : { success: false, error: "no such folder" }),
		};

		await mountFilesystemsForAgent({
			agentId: "agent-mark",
			filesystems: reader([row], [], states),
			sandboxPath,
			mounter,
		});

		expect(states).toEqual(marked);
	});
});
