/**
 * AO2 — GitRunner new verbs: argv-shape assertions via FakeGitRunner ONLY.
 *
 * N1 (plan §6): argv-shape assertions live ONLY in this file (Fake); the REAL
 * runner's worktreeAdd/worktreeRemove/clone/bundle are exercised in
 * git-export-runner.integration.test.ts. A Fake-only green must NEVER masquerade
 * as a real round-trip (mock-validation-trap).
 */

import { describe, expect, it } from "vitest";
import { createFakeGitRunner, type FakeGitRunner } from "../git-export-runner.js";

describe("FakeGitRunner records filesystem git operation argv", () => {
	it("clone records args and resolves", async () => {
		const fake: FakeGitRunner = createFakeGitRunner();
		await fake.clone("https://github.com/org/repo.git", "main");
		expect(fake.calls.at(-1)).toMatchObject({
			method: "clone",
			args: ["https://github.com/org/repo.git", "main"],
		});
	});

	it("clone with depth records the depth option", async () => {
		const fake: FakeGitRunner = createFakeGitRunner();
		await fake.clone("https://github.com/org/repo.git", "main", { depth: 1 });
		expect(fake.calls.at(-1)).toMatchObject({
			method: "clone",
			args: ["https://github.com/org/repo.git", "main"],
			opts: { depth: 1 },
		});
	});

	it("bundle records args and resolves", async () => {
		const fake: FakeGitRunner = createFakeGitRunner();
		await fake.bundle("/tmp/out.bundle", "refs/heads/main");
		expect(fake.calls.at(-1)).toMatchObject({
			method: "bundle",
			args: ["/tmp/out.bundle", "refs/heads/main"],
		});
	});

	it("worktreeAdd records args and resolves", async () => {
		const fake: FakeGitRunner = createFakeGitRunner();
		await fake.worktreeAdd("/tmp/wt", "agent/sess-123");
		expect(fake.calls.at(-1)).toMatchObject({
			method: "worktreeAdd",
			args: ["/tmp/wt", "agent/sess-123"],
		});
	});

	it("worktreeAdd with createBranch records the option", async () => {
		const fake: FakeGitRunner = createFakeGitRunner();
		await fake.worktreeAdd("/tmp/wt", "agent/sess-123", { createBranch: true });
		expect(fake.calls.at(-1)).toMatchObject({
			method: "worktreeAdd",
			args: ["/tmp/wt", "agent/sess-123"],
			opts: { createBranch: true },
		});
	});

	it("worktreeRemove records args and resolves", async () => {
		const fake: FakeGitRunner = createFakeGitRunner();
		await fake.worktreeRemove("/tmp/wt");
		expect(fake.calls.at(-1)).toMatchObject({
			method: "worktreeRemove",
			args: ["/tmp/wt"],
		});
	});

	it("worktreeRemove with force records the option", async () => {
		const fake: FakeGitRunner = createFakeGitRunner();
		await fake.worktreeRemove("/tmp/wt", { force: true });
		expect(fake.calls.at(-1)).toMatchObject({
			method: "worktreeRemove",
			args: ["/tmp/wt"],
			opts: { force: true },
		});
	});

	it("fetch records args and resolves", async () => {
		const fake: FakeGitRunner = createFakeGitRunner();
		await fake.fetch("origin", "main");
		expect(fake.calls.at(-1)).toMatchObject({
			method: "fetch",
			args: ["origin", "main"],
		});
	});

	it("checkout records args and resolves", async () => {
		const fake: FakeGitRunner = createFakeGitRunner();
		await fake.checkout("main");
		expect(fake.calls.at(-1)).toMatchObject({
			method: "checkout",
			args: ["main"],
		});
	});

	it("existing verbs still work — init", async () => {
		const fake: FakeGitRunner = createFakeGitRunner();
		await fake.init("main");
		expect(fake.calls.at(-1)).toMatchObject({ method: "init" });
	});

	it("calls accumulate across invocations", async () => {
		const fake: FakeGitRunner = createFakeGitRunner();
		await fake.clone("https://github.com/org/repo.git", "main");
		await fake.bundle("/tmp/out.bundle", "refs/heads/main");
		await fake.worktreeAdd("/tmp/wt", "agent/sess");
		expect(fake.calls).toHaveLength(3);
	});
});
