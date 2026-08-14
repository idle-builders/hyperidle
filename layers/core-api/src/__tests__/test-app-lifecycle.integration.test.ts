import { bootAgentOrchestration } from "@hyperidle/agent-orchestration";
import { acquireTestDbLease } from "@hyperidle/db/test-fixtures";
import { EventBus } from "@hyperidle/event-bus";
import { expect, test, vi } from "vitest";
import { createTestApp } from "../__testing__/test-utils.js";
import { disposeApp } from "../app.js";

function deferred(): { readonly promise: Promise<void>; readonly resolve: () => void } {
	let resolve: () => void = () => {};
	const promise = new Promise<void>((done) => {
		resolve = done;
	});
	return { promise, resolve };
}

test("a fixture-owned test app joins its lifecycle drain once before DB release", async () => {
	const lease = await acquireTestDbLease();
	const eventBus = new EventBus();
	const boot = await bootAgentOrchestration({ db: lease.db, eventBus });
	const allowJoin = deferred();
	const joinLifecycleDrain = boot.joinLifecycleDrain.bind(boot);
	let joinCalls = 0;
	vi.spyOn(boot, "joinLifecycleDrain").mockImplementation(() => {
		joinCalls += 1;
		return allowJoin.promise.then(joinLifecycleDrain);
	});
	const app = await createTestApp({ db: lease.db, eventBus, agentOrchestrationBoot: boot });
	disposeApp(app);

	const release = lease.release();
	let released = false;
	void release.then(() => {
		released = true;
	});
	await Promise.resolve();
	expect(released).toBe(false);
	expect(joinCalls).toBe(1);
	expect(lease.release()).toBe(release);

	allowJoin.resolve();
	await release;
	expect(joinCalls).toBe(1);
});
