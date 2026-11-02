/** Where the agent programs a page lists actually run. */
import { afterEach, expect, test, vi } from "vitest";
import { programsAt } from "./api";

afterEach(() => vi.unstubAllGlobals());

test.each([
	["127.0.0.1", "on this computer"],
	["localhost", "on this computer"],
	["beta.hyperidle.com", "on the team's server"],
])("a page served from %s lists the agent programs %s", (hostname, words) => {
	vi.stubGlobal("location", { hostname });
	expect(programsAt()).toBe(words);
});
