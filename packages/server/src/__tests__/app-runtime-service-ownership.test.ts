import { describe, expect, test } from "vitest";

describe("app-runtime service ownership", () => {
	test("former Fabric runtime responsibilities live under server app-runtime", async () => {
		const bootstrap = await import("../app-runtime/bootstrap.js");
		const context = await import("../app-runtime/context-assembly.js");
		const fts = await import("../app-runtime/fts.js");
		const routines = await import("../app-runtime/services/builtin-routines.js");
		const lifecycle = await import("../app-runtime/services/lifecycle-propagation.js");
		const notifications = await import("../app-runtime/services/notifications/dispatcher.js");
		const taskDispatcher = await import("../app-runtime/services/task-dispatcher.js");
		const relevance = await import("../app-runtime/services/relevance-service.js");
		const redact = await import("../app-runtime/services/notifications/redact.js");

		expect(bootstrap.bootstrapAppRuntime).toEqual(expect.any(Function));
		expect(context.assembleContext).toEqual(expect.any(Function));
		expect(fts.setupFts).toEqual(expect.any(Function));
		expect(routines.provisionTeamRoutines).toEqual(expect.any(Function));
		expect(routines.runBuiltinRoutine).toEqual(expect.any(Function));
		expect(lifecycle.registerLifecyclePropagation).toEqual(expect.any(Function));
		expect(notifications.registerNotificationDispatcher).toEqual(expect.any(Function));
		expect(taskDispatcher.registerTaskDispatcher).toEqual(expect.any(Function));
		expect(relevance.createRelevanceService).toEqual(expect.any(Function));
		expect(redact.scrubErrorMessage).toEqual(expect.any(Function));
	});
});
