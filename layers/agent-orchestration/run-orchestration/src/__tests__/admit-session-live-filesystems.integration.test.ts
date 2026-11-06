/**
 * `admitSession` Phase 4.5 mounts what `ProvisionSessionDeps.injectedFilesystems`
 * — an in-layer reader port the Application backs with `@hyperidle/filesystems`
 * — says LIVE at spawn time. `SessionLifecyclePorts` declares no `filesystems`
 * field at all, so there is no other seam Phase 4.5 could reach. The mount
 * loop itself (every row mounted, a failed mount excluded) is unit-tested in
 * `filesystem-provisioning.test.ts`; this proves only the `admitSession`-level
 * wiring — the port is asked for THIS agent and nothing about filesystems
 * rides the request.
 */

import { mkdtempSync, rmSync } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { type HyperIdleDb, users } from "@hyperidle/db";
import { expect, test } from "@hyperidle/db/test-fixtures";
import { EventBus } from "@hyperidle/event-bus";
import { afterEach, beforeEach, describe, vi } from "vitest";
import {
	buildNeverCalledPorts,
	type ProvisionSessionDeps,
	type ProvisionSessionParams,
	rejectingHarnessAdapter,
} from "../__testing__/test-fixtures.js";
import type { FilesystemMounterPort } from "../filesystem-provisioning.js";
// Filesystem is a local type in mounter.ts, not imported from domain-model.
import type { Filesystem } from "../mounter.js";
import { createProvisioner } from "../provisioner.js";

type InjectedFilesystem = Awaited<
	ReturnType<
		NonNullable<ProvisionSessionDeps["injectedFilesystems"]>["listInjectedForProvisioning"]
	>
>[number];

function buildDeps(
	db: HyperIdleDb,
	mounter: FilesystemMounterPort,
	injected: readonly InjectedFilesystem[] = [],
	asked: string[] = [],
): ProvisionSessionDeps {
	return {
		db,
		// The in-layer reader port. Production backs it with
		// `@hyperidle/filesystems`' `listInjectedFilesystemsForProvisioning`;
		// here it records which agent Phase 4.5 asked about.
		injectedFilesystems: {
			listInjectedForProvisioning: async (agentId: string) => {
				asked.push(agentId);
				return injected;
			},
			markState: async () => undefined,
		},
		eventBus: new EventBus(),
		adapterPool: {
			select: () => ({
				id: "fake-adapter",
				adapter: rejectingHarnessAdapter(),
				meta: {
					name: "Fake",
					type: undefined,
					modelProviders: [],
					maxConcurrent: 5,
				},
			}),
			release: () => undefined,
			describeSelectFailure: () => "test pool selected nothing",
		},
		// Phase 4.5 only runs mount when a mounter is present.
		mounter,
	};
}

describe("admitSession mounts what the live injection record says", () => {
	let spacesDir: string;
	beforeEach(() => {
		spacesDir = mkdtempSync(path.join(os.tmpdir(), "admit-session-fs-"));
		vi.stubEnv("HYPERIDLE_SPACES_DIR", spacesDir);
	});
	afterEach(() => {
		vi.unstubAllEnvs();
		rmSync(spacesDir, { recursive: true, force: true });
	});

	test("asks the in-layer reader for THIS agent and mounts what it returns", async ({ db }) => {
		const now = new Date().toISOString();
		await db.insert(users).values({
			id: "agent-baked-fs-1",
			kind: "ai",
			name: "Baked FS Agent",
			role: "builder",
			status: "active",
			createdAt: now,
		});

		const mountCalls: Filesystem[] = [];
		const mounter: FilesystemMounterPort = {
			mount: async (input) => {
				mountCalls.push(input.filesystem);
				return { success: true, sandboxPath: input.sandboxPath };
			},
		};

		const ports = buildNeverCalledPorts();
		const provisioner = createProvisioner(ports);

		const liveFilesystem: InjectedFilesystem = {
			id: "fs-baked-1",
			teamId: "team-baked-1",
			source: "local",
			kind: "doc_set",
			connectionId: null,
			resourceRef: { kind: "doc_set", folder: "/docs" },
			writeback: "file",
			state: "attached",
			createdAt: now,
		};

		const params: ProvisionSessionParams = {
			taskId: null,
			agentId: "agent-baked-fs-1",
			productId: "task-free",
			callingThreadId: "test-thread-fs",
			agentConfig: {
				kind: "ai",
				status: "active",
				role: "builder",
				teamId: null,
			},
		};

		const asked: string[] = [];
		const admitted = await provisioner.admit(
			buildDeps(db as HyperIdleDb, mounter, [liveFilesystem], asked),
			params,
		);

		// Nothing about filesystems rode the request; the port was asked instead.
		expect(asked).toEqual(["agent-baked-fs-1"]);
		expect(admitted.mountedFilesystems).toHaveLength(1);
		expect(admitted.mountedFilesystems[0]?.id).toBe("fs-baked-1");
		expect(mountCalls).toHaveLength(1);
		expect(mountCalls[0]?.resourceRef).toEqual({ kind: "doc_set", folder: "/docs" });
	});

	// The no-injected-filesystems/absent-port no-op cases are `mountFilesystemsForAgent`'s
	// own rule, proven directly in filesystem-provisioning.test.ts — not repeated here.
});
