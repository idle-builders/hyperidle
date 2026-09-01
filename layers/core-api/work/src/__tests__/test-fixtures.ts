/**
 * Local fixture extension for layers/core-api/work integration tests.
 *
 * Extends `@hyperidle/db/test-fixtures` (which provides the pooled `{ db }`
 * fixture with per-test TRUNCATE) with an `eventBus` fixture.
 *
 * The `work` package's tests cannot import from `layers/core-api/src/__testing__/`
 * (a different package) and `@hyperidle/db/test-fixtures` does not provide an
 * EventBus. This file bridges the gap so tests that call `cascadeTaskKill` or
 * `transitionTask` receive a proper fixture-injected EventBus rather than
 * constructing one directly inside the test body.
 *
 * @lore BB1: EventBus is a plain in-memory emitter with no DB connection or
 * pooled resource — it holds no state across tests. A fresh instance per test
 * is sufficient for these pure-service assertions. If a future test needs to
 * observe events fired elsewhere (e.g., inside `app`), it must use the
 * layer's full `{ db, app, eventBus }` fixture from
 * `layers/core-api/src/__testing__/test-fixtures.ts` (not reachable from this
 * package).
 */

import { type DbFixtures, test as dbTest } from "@hyperidle/db/test-fixtures";
import { EventBus } from "@hyperidle/event-bus";

export interface WorkIntegrationFixtures extends DbFixtures {
	eventBus: EventBus;
}

export const test = dbTest.extend<Pick<WorkIntegrationFixtures, "eventBus">>({
	// biome-ignore lint/correctness/noEmptyPattern: vitest fixture API requires the destructure parameter even when unused
	eventBus: async ({}, use) => {
		await use(new EventBus());
	},
});

/**
 * @lore BB1: the vitest globals come straight from `vitest`, NOT re-exported
 * from `@hyperidle/db/test-fixtures`. Re-exporting them here would launder the
 * database package's testing surface through `work` — a governance violation
 * (`no-laundered-re-exports`), and a real one: it makes `work` look like the
 * owner of symbols it merely passes along. Only `test` is re-exported, because
 * only `test` is genuinely extended here.
 */
export { afterAll, afterEach, beforeAll, beforeEach, describe, expect, vi } from "vitest";
