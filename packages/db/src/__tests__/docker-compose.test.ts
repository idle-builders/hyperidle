import * as fs from "node:fs";
import * as path from "node:path";
import { describe, expect, it } from "vitest";
import { parse as parseYaml } from "yaml";

/**
 * H4 AC2: docker-compose.yml at repo root parses and wires the three
 * required services correctly. We cannot run `docker compose up` in the
 * sandbox, but we can pin its shape against regressions.
 */
describe("H4 AC2: docker-compose.yml shape", () => {
	const repoRoot = path.resolve(__dirname, "..", "..", "..", "..");
	const composePath = path.join(repoRoot, "docker-compose.yml");

	it("parses as valid YAML with the three required services", () => {
		const raw = fs.readFileSync(composePath, "utf-8");
		const compose = parseYaml(raw) as {
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
				server: Record<string, unknown>;
			};
		};
		const deps = compose.services.server.depends_on as
			| Record<string, { condition?: string }>
			| string[]
			| undefined;
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

	// Security hardening (H4 review): every published port must bind to
	// loopback. A VPS operator who `docker compose up -d` should NEVER
	// silently publish Postgres or the dev Vite server on 0.0.0.0.
	it("binds every published port to 127.0.0.1 (no 0.0.0.0 host publish)", () => {
		const compose = parseYaml(fs.readFileSync(composePath, "utf-8")) as {
			services: Record<string, { ports?: Array<string | number> }>;
		};
		for (const [name, service] of Object.entries(compose.services)) {
			for (const port of service.ports ?? []) {
				const s = String(port);
				expect(s, `${name} port '${s}' must be bound to 127.0.0.1`).toMatch(/^127\.0\.0\.1:/);
			}
		}
	});

	it("interpolates DATABASE_URL from POSTGRES_USER/PASSWORD/DB env vars", () => {
		const raw = fs.readFileSync(composePath, "utf-8");
		// The server DATABASE_URL must derive from POSTGRES_* so setting
		// POSTGRES_PASSWORD in .env actually takes effect. Hard-coded
		// `hyperidle:hyperidle` defaults were the H4 review footgun.
		expect(raw).toMatch(/DATABASE_URL:\s*\$\{DATABASE_URL:-[^}]*\$\{POSTGRES_USER[^}]*\}/);
		expect(raw).toMatch(/\$\{POSTGRES_PASSWORD/);
		expect(raw).toMatch(/\$\{POSTGRES_DB/);
	});

	it("PG_POOL_SIZE env var is threaded to the server", () => {
		const compose = parseYaml(fs.readFileSync(composePath, "utf-8")) as {
			services: { server: { environment?: Record<string, unknown> } };
		};
		const env = compose.services.server.environment ?? {};
		// The compose file must declare PG_POOL_SIZE so operators can
		// override it. The *code* that actually honors it is exercised in
		// pg-connection.test.ts.
		expect(Object.keys(env)).toContain("PG_POOL_SIZE");
	});

	it("fails loudly if POSTGRES_PASSWORD is unset (compose :? syntax)", () => {
		const raw = fs.readFileSync(composePath, "utf-8");
		// The `${POSTGRES_PASSWORD:?…}` syntax makes `docker compose up`
		// abort with a clear error if the var is missing, rather than
		// silently falling back to a weak default.
		expect(raw).toMatch(/\$\{POSTGRES_PASSWORD:\?/);
	});
});
