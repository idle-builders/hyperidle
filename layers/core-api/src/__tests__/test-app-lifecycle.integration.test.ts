import { acquireTestDbLease } from "@hyperidle/db/test-fixtures";
import { EventBus } from "@hyperidle/event-bus";
import { expect, test } from "vitest";
import { createTestApp } from "../__testing__/test-utils.js";
import { disposeApp } from "../app.js";

test("a fixture-owned test app boots and disposes cleanly without orchestration", async () => {
	const lease = await acquireTestDbLease();
	const eventBus = new EventBus();
	const app = await createTestApp({ db: lease.db, eventBus });
	disposeApp(app);

	const release = lease.release();
	let released = false;
	void release.then(() => {
		released = true;
	});
	await release;
	expect(released).toBe(true);
});
