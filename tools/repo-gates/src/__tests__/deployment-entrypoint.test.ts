import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

describe("production image entrypoint", () => {
	it("launches an entrypoint that exists in the build context", () => {
		const repositoryRoot = resolve(import.meta.dirname, "../../../../");
		const dockerfile = readFileSync(resolve(repositoryRoot, "Dockerfile.deploy"), "utf8");
		const command = dockerfile.match(/^CMD \["node", "--import", "tsx", "([^"]+)"\]$/m);

		expect(command?.[1]).toBe("applications/remote-server/src/index.ts");
		expect(existsSync(resolve(repositoryRoot, command?.[1] ?? "missing"))).toBe(true);
	});
});
