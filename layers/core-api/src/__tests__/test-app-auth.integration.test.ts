import { EventBus } from "@hyperidle/event-bus";
import {
	createServiceTestApp,
	expect,
	test,
	vi,
	withoutServiceTestAuth,
} from "../__testing__/test-fixtures.js";
import { disposeApp } from "../app.js";

test("the service app fixture authenticates ordinary requests without ambient env state", async ({
	app,
}) => {
	vi.stubEnv("HYPERIDLE_API_KEY", "changed-after-app-construction");

	const response = await app.request("/api/reviews/not-present");

	expect(response.status).toBe(404);
});

test("the service app fixture keeps intentional missing-auth requests raw", async ({
	requestWithoutAuth,
}) => {
	const response = await requestWithoutAuth("/api/reviews/not-present");

	expect(response.status).toBe(401);
});

test("each service app owns a distinct API key", async ({ db }) => {
	const first = await createServiceTestApp(db, new EventBus());
	const second = await createServiceTestApp(db, new EventBus());
	try {
		expect(first.authApiKey).not.toBe(second.authApiKey);
		vi.stubEnv("HYPERIDLE_API_KEY", "changed-after-both-apps-were-built");
		const requestWithKey = (app: typeof first.app, key: string) =>
			withoutServiceTestAuth((request) => app.fetch(request))(
				new Request("http://service.test/api/reviews/not-present", {
					headers: { "X-API-Key": key },
				}),
			);

		expect((await requestWithKey(first.app, first.authApiKey)).status).toBe(404);
		expect((await requestWithKey(second.app, first.authApiKey)).status).toBe(401);
	} finally {
		disposeApp(first.app);
		disposeApp(second.app);
	}
});
