import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { resolveFilesystemState } from "../index.js";
import type { FilesystemsGitRunnerFactory } from "../ports.js";

const root = fs.mkdtempSync(path.join(os.tmpdir(), "au20-reachability-"));
afterAll(() => fs.rmSync(root, { recursive: true, force: true }));

function row(resourceRef: unknown, connectionId: string | null = null) {
	return {
		id: "fs",
		teamId: "team",
		source: "local",
		kind: "code",
		connectionId,
		resourceRef: JSON.stringify(resourceRef),
		state: "attached",
		attentionReason: null,
		createdAt: "now",
	};
}

const authResolver = {
	canResolve: async () => true,
	sourceOf: () => "github",
	resolve: async () => null,
	resolveToken: async () => null,
};

describe("resolveFilesystemState public reachability contract", () => {
	it("distinguishes readable and missing local paths", async () => {
		const unused = (() => null as never) as FilesystemsGitRunnerFactory;
		expect(
			await resolveFilesystemState(row({ kind: "code", repo: root }), {
				authResolver,
				gitRunnerFactory: unused,
			}),
		).toBe("reachable");
		expect(
			await resolveFilesystemState(row({ kind: "code", repo: path.join(root, "missing") }), {
				authResolver,
				gitRunnerFactory: unused,
			}),
		).toBe("needs_attention");
	});

	it("normalizes owner/repo and forwards remote probe outcome", async () => {
		let observed = "";
		const factory = (() => ({
			lsRemote: async (url: string) => {
				observed = url;
				return { reachable: true };
			},
		})) as unknown as FilesystemsGitRunnerFactory;
		expect(
			await resolveFilesystemState(row({ kind: "code", repo: "owner/repo" }, "connection"), {
				authResolver,
				gitRunnerFactory: factory,
			}),
		).toBe("reachable");
		expect(observed).toBe("https://github.com/owner/repo.git");
	});
});
