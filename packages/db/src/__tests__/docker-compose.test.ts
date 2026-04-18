import * as fs from "node:fs";
import * as path from "node:path";
import { describe, expect, it } from "vitest";
import { parse as parseYaml } from "yaml";

/**
 * H4 AC2: docker-compose.yml exists at repo root and has the expected shape.
 * We cannot run `docker compose up` in the sandbox, but we prove the file
 * parses and wires the three required services correctly.
 */
describe("H4 AC2: docker-compose.yml shape", () => {
	const repoRoot = path.resolve(__dirname, "..", "..", "..", "..");
	const composePath = path.join(repoRoot, "docker-compose.yml");

	it("docker-compose.yml exists at repo root", () => {
		expect(fs.existsSync(composePath)).toBe(true);
	});

	it("parses as valid YAML", () => {
		const raw = fs.readFileSync(composePath, "utf-8");
		expect(() => parseYaml(raw)).not.toThrow();
	});

	it("defines the three required services: postgres, server, web", () => {
		const compose = parseYaml(fs.readFileSync(composePath, "utf-8")) as {
			services: Record<string, unknown>;
		};
		expect(compose.services).toBeDefined();
		expect(Object.keys(compose.services)).toEqual(
			expect.arrayContaining(["postgres", "server", "web"]),
		);
	});

	it("postgres service has a healthcheck", () => {
		const compose = parseYaml(fs.readFileSync(composePath, "utf-8")) as {
			services: { postgres: { healthcheck?: unknown } };
		};
		expect(compose.services.postgres.healthcheck).toBeDefined();
	});

	it("postgres uses a named volume for persistence", () => {
		const compose = parseYaml(fs.readFileSync(composePath, "utf-8")) as {
			services: { postgres: { volumes?: unknown[] } };
			volumes?: Record<string, unknown>;
		};
		expect(compose.services.postgres.volumes).toBeDefined();
		expect(compose.volumes).toBeDefined();
	});

	it("server depends on postgres with healthy condition", () => {
		const compose = parseYaml(fs.readFileSync(composePath, "utf-8")) as {
			services: {
				server: {
					depends_on?: Record<string, { condition?: string }> | string[];
				};
			};
		};
		const deps = compose.services.server.depends_on;
		expect(deps).toBeDefined();
		if (Array.isArray(deps)) {
			expect(deps).toContain("postgres");
		} else if (deps) {
			expect(deps.postgres?.condition).toBe("service_healthy");
		}
	});

	it("server wires DATABASE_URL env", () => {
		const raw = fs.readFileSync(composePath, "utf-8");
		expect(raw).toMatch(/DATABASE_URL/);
	});

	it("exposes server port 3001 and web port 5173", () => {
		const compose = parseYaml(fs.readFileSync(composePath, "utf-8")) as {
			services: {
				server: { ports?: Array<string | number> };
				web: { ports?: Array<string | number> };
			};
		};
		const serverPorts = (compose.services.server.ports ?? []).map(String).join(",");
		const webPorts = (compose.services.web.ports ?? []).map(String).join(",");
		expect(serverPorts).toMatch(/3001/);
		expect(webPorts).toMatch(/5173/);
	});
});
