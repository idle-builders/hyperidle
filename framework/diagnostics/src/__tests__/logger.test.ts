import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createLogger } from "../logger.js";

describe("createLogger", () => {
	beforeEach(() => {
		vi.spyOn(console, "log").mockImplementation(() => {});
		vi.spyOn(console, "warn").mockImplementation(() => {});
		vi.spyOn(console, "error").mockImplementation(() => {});
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	it("logs info messages with package prefix", () => {
		const log = createLogger({ pkg: "test" });
		log.info("hello");

		expect(console.log).toHaveBeenCalledOnce();
		const output = vi.mocked(console.log).mock.calls[0]?.[0] as string;
		expect(output).toContain("[test]");
		expect(output).toContain("INFO");
		expect(output).toContain("hello");
	});

	it("routes error level to console.error", () => {
		const log = createLogger({ pkg: "test" });
		log.error("fail");

		expect(console.error).toHaveBeenCalledOnce();
		expect(console.log).not.toHaveBeenCalled();
	});

	it("routes warn level to console.warn", () => {
		const log = createLogger({ pkg: "test" });
		log.warn("caution");

		expect(console.warn).toHaveBeenCalledOnce();
	});

	it("respects minLevel filtering", () => {
		const log = createLogger({ pkg: "test", minLevel: "warn" });
		log.debug("hidden");
		log.info("hidden");
		log.warn("shown");

		expect(console.log).not.toHaveBeenCalled();
		expect(console.warn).toHaveBeenCalledOnce();
	});

	it("includes extra fields in output", () => {
		const log = createLogger({ pkg: "test" });
		log.info("request", { method: "GET", path: "/health" });

		const output = vi.mocked(console.log).mock.calls[0]?.[0] as string;
		expect(output).toContain("GET");
		expect(output).toContain("/health");
	});
});
