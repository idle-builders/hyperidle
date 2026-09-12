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
 * These cases pin the mount loop itself: the port is asked once for the
 * agent, every row it returns is mounted, and an absent port mounts nothing.
 * The end-to-end staleness proof lives in
 * `filesystems-added-after-emit.integration.test.ts`.
 *
 * @lore BA5 §4.2/§13 (L3 scope): a failed mount now THROWS instead of being
 * excluded from the result — see `filesystem-provisioning.ts`'s own
 * top-of-file `@lore`.
 */

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import type { EventBus } from "@hyperidle/event-bus";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
// biome-ignore lint/correctness/noUnresolvedImports: RED phase — relocated module does not exist yet in this pass.
import { startWatcher } from "../file-watcher.js";
import {
	computeFolderNames,
	type FilesystemForProvisioning,
	type FilesystemMounterPort,
	FilesystemMountFailure,
	type InjectedFilesystemsReaderPort,
	mountFilesystemsForAgent,
} from "../filesystem-provisioning.js";
// Filesystem is a local type in mounter.ts (AU44 b2: dissolved from domain-model).
import type { Filesystem, MountedFilesystem } from "../mounter.js";

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
				return {
					ok: true,
					mounted: {
						filesystem: input.filesystem,
						folder: path.join(input.workspacePath, input.folderName),
						trustedPath: "/repo",
						agentEnv: {},
						adopted: false,
					},
				};
			},
			unmount: async () => undefined,
		};

		const result = await mountFilesystemsForAgent({
			agentId: "agent-inc12-1",
			sessionId: "session-inc12-1",
			filesystems: reader([row], asked),
			workspacePath: sandboxPath,
			mounter,
		});

		expect(asked).toEqual(["agent-inc12-1"]);
		expect(result).toHaveLength(1);
		expect(result[0]?.filesystem.id).toBe("fs-inc12-1");
		expect(mounted).toHaveLength(1);
		expect(mounted[0]?.filesystem.resourceRef).toEqual({ kind: "doc_set", folder: "/repo" });
	});

	test("an agent with NO injected filesystems mounts nothing (no throw) — unchanged from today's behavior", async () => {
		const mounter: FilesystemMounterPort = {
			mount: vi.fn(),
			unmount: vi.fn(),
		} as unknown as FilesystemMounterPort;

		const result = await mountFilesystemsForAgent({
			agentId: "agent-inc12-empty",
			sessionId: "session-inc12-empty",
			filesystems: reader([]),
			workspacePath: sandboxPath,
			mounter,
		});

		expect(result).toHaveLength(0);
		expect(mounter.mount).not.toHaveBeenCalled();
	});

	test("an unwired reader port mounts nothing — the same graceful no-op an absent mounter gives", async () => {
		const mounter: FilesystemMounterPort = {
			mount: vi.fn(),
			unmount: vi.fn(),
		} as unknown as FilesystemMounterPort;

		const result = await mountFilesystemsForAgent({
			agentId: "agent-inc12-unwired",
			sessionId: "session-inc12-unwired",
			workspacePath: sandboxPath,
			mounter,
		});

		expect(result).toHaveLength(0);
		expect(mounter.mount).not.toHaveBeenCalled();
	});

	test("BA5 §2.4/§13 (L4): a connection-backed filesystem's credential is resolved through the port and handed to the mounter", async () => {
		const withConnection = buildFilesystemRecord({ id: "fs-cred-1", connectionId: "conn-1" });
		const resolvedFor: string[] = [];
		const mounted: Array<{ credential: string | null }> = [];
		const mounter: FilesystemMounterPort = {
			mount: async (input) => {
				mounted.push({ credential: input.credential });
				return {
					ok: true,
					mounted: {
						filesystem: input.filesystem,
						folder: path.join(input.workspacePath, input.folderName),
						trustedPath: "/repo",
						agentEnv: {},
						adopted: false,
					},
				};
			},
			unmount: async () => undefined,
		};

		const result = await mountFilesystemsForAgent({
			agentId: "agent-cred-1",
			sessionId: "session-cred-1",
			filesystems: {
				listInjectedForProvisioning: async () => [withConnection],
				resolveCredential: async (connectionId: string) => {
					resolvedFor.push(connectionId);
					return "pat-value-1";
				},
			},
			workspacePath: sandboxPath,
			mounter,
		});

		expect(resolvedFor).toEqual(["conn-1"]);
		expect(mounted).toEqual([{ credential: "pat-value-1" }]);
		expect(result[0]?.filesystem.id).toBe("fs-cred-1");
	});

	test("a filesystem with no connectionId never calls resolveCredential — mounted with credential:null", async () => {
		const noConnection = buildFilesystemRecord({ id: "fs-no-cred", connectionId: null });
		const resolveCredential = vi.fn(async () => "should-not-be-used");
		const mounted: Array<{ credential: string | null }> = [];
		const mounter: FilesystemMounterPort = {
			mount: async (input) => {
				mounted.push({ credential: input.credential });
				return {
					ok: true,
					mounted: {
						filesystem: input.filesystem,
						folder: path.join(input.workspacePath, input.folderName),
						trustedPath: "/repo",
						agentEnv: {},
						adopted: false,
					},
				};
			},
			unmount: async () => undefined,
		};

		await mountFilesystemsForAgent({
			agentId: "agent-no-cred",
			sessionId: "session-no-cred",
			filesystems: {
				listInjectedForProvisioning: async () => [noConnection],
				resolveCredential,
			},
			workspacePath: sandboxPath,
			mounter,
		});

		expect(resolveCredential).not.toHaveBeenCalled();
		expect(mounted).toEqual([{ credential: null }]);
	});

	test("a connection-backed filesystem with no resolveCredential on the port mounts with credential:null (graceful degrade)", async () => {
		const withConnection = buildFilesystemRecord({ id: "fs-cred-nodep", connectionId: "conn-2" });
		const mounted: Array<{ credential: string | null }> = [];
		const mounter: FilesystemMounterPort = {
			mount: async (input) => {
				mounted.push({ credential: input.credential });
				return {
					ok: true,
					mounted: {
						filesystem: input.filesystem,
						folder: path.join(input.workspacePath, input.folderName),
						trustedPath: "/repo",
						agentEnv: {},
						adopted: false,
					},
				};
			},
			unmount: async () => undefined,
		};

		await mountFilesystemsForAgent({
			agentId: "agent-cred-nodep",
			sessionId: "session-cred-nodep",
			filesystems: reader([withConnection]),
			workspacePath: sandboxPath,
			mounter,
		});

		expect(mounted).toEqual([{ credential: null }]);
	});

	test("a failed mount THROWS instead of being excluded from the result (BA5 §4.2/§13)", async () => {
		const bakedRow = buildFilesystemRecord({ id: "fs-inc12-fail" });
		const mounter: FilesystemMounterPort = {
			mount: async () => ({ ok: false, reason: "mount failed" }),
			unmount: async () => undefined,
		};

		await expect(
			mountFilesystemsForAgent({
				agentId: "agent-inc12-fail",
				sessionId: "session-inc12-fail",
				filesystems: reader([bakedRow]),
				workspacePath: sandboxPath,
				mounter,
			}),
		).rejects.toThrow("mount failed");
	});

	test("a failed mount throws FilesystemMountFailure carrying what admitSession's Phase 4.5 needs to run the hold (BA5 §4.2/§13, L5)", async () => {
		const okRow = buildFilesystemRecord({ id: "fs-hold-ok", connectionId: "conn-hold" });
		const failingRow = buildFilesystemRecord({ id: "fs-hold-fail" });
		const okMounted: MountedFilesystem = {
			filesystem: okRow as unknown as Filesystem,
			folder: path.join(sandboxPath, "ok"),
			trustedPath: "/ok",
			agentEnv: {},
			adopted: false,
		};
		const mounter: FilesystemMounterPort = {
			mount: async (input) =>
				input.filesystem.id === "fs-hold-ok"
					? { ok: true, mounted: okMounted }
					: { ok: false, reason: "repo path does not exist" },
			unmount: async () => undefined,
		};

		let caught: unknown;
		try {
			await mountFilesystemsForAgent({
				agentId: "agent-hold",
				sessionId: "session-hold",
				filesystems: {
					listInjectedForProvisioning: async () => [okRow, failingRow],
					resolveCredential: async () => "pat-hold-1",
				},
				workspacePath: sandboxPath,
				mounter,
			});
		} catch (err) {
			caught = err;
		}

		expect(caught).toBeInstanceOf(FilesystemMountFailure);
		const failure = caught as FilesystemMountFailure;
		expect(failure.filesystemId).toBe("fs-hold-fail");
		expect(failure.reason).toBe("repo path does not exist");
		expect(failure.credential).toBeNull(); // fs-hold-fail has no connectionId
		expect(failure.filesystem.id).toBe("fs-hold-fail");
		// Everything mounted BEFORE the failing one — so the caller can unmount
		// exactly what THIS admission placed, never anything from a resume.
		expect(failure.mounted).toEqual([okMounted]);
	});
});

describe("computeFolderNames (BA5 §5.3)", () => {
	function buildFs(id: string, resourceRef: Filesystem["resourceRef"]): Filesystem {
		return {
			id,
			teamId: "team-1",
			source: "local",
			kind: resourceRef.kind,
			connectionId: null,
			resourceRef,
			state: "attached",
			createdAt: "2026-09-01T00:00:00.000Z",
		};
	}

	test("names a git filesystem by its repo basename, without .git", () => {
		const names = computeFolderNames([
			buildFs("f1", { kind: "code", repo: "https://github.com/a/repo.git", branch: "main" }),
		]);
		expect(names.get("f1")).toBe("repo");
	});

	test("names a folder filesystem by its own basename", () => {
		const names = computeFolderNames([
			buildFs("f1", { kind: "doc_set", folder: "/home/me/notes" }),
		]);
		expect(names.get("f1")).toBe("notes");
	});

	test("disambiguates two filesystems that would otherwise collide, with the filesystem id's first 8 chars", () => {
		const a = buildFs("fs-aaaaaaaa-1111", { kind: "doc_set", folder: "/a/notes" });
		const b = buildFs("fs-bbbbbbbb-2222", { kind: "doc_set", folder: "/b/notes" });
		const names = computeFolderNames([a, b]);
		expect(names.get("fs-aaaaaaaa-1111")).toBe(`notes-${"fs-aaaaaaaa-1111".slice(0, 8)}`);
		expect(names.get("fs-bbbbbbbb-2222")).toBe(`notes-${"fs-bbbbbbbb-2222".slice(0, 8)}`);
	});

	test("disambiguates a name that collides with a scaffolding path", () => {
		const names = computeFolderNames([
			buildFs("fs-work-1234", { kind: "doc_set", folder: "/repo/work" }),
		]);
		expect(names.get("fs-work-1234")).toBe(`work-${"fs-work-1234".slice(0, 8)}`);
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
