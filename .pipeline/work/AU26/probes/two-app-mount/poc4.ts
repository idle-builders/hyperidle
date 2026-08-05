/**
 * P5 — the routing shape §D-H #16 INVENTS: the SAME path prefix split across the
 * two mounted apps BY METHOD and BY SUB-PATH.
 *
 * `POST /api/sessions` must stay on core; `GET /api/sessions`,
 * `GET /api/sessions/starts/:startId`, `GET /api/sessions/:id/activity` and
 * `PATCH /api/sessions/:id` must land on orchestration. poc.ts only proved
 * DISJOINT prefixes route; this proves an INTERLEAVED one does.
 */
import { Hono } from "hono";

const core = new Hono();
core.post("/sessions", (c) => c.json({ app: "core", route: "POST /sessions" }));

const orch = new Hono();
orch.get("/sessions", (c) => c.json({ app: "orch", route: "GET /sessions" }));
orch.get("/sessions/starts/:startId", (c) =>
	c.json({ app: "orch", route: "GET /sessions/starts/:startId", id: c.req.param("startId") }),
);
orch.get("/sessions/:id/activity", (c) =>
	c.json({ app: "orch", route: "GET /sessions/:id/activity", id: c.req.param("id") }),
);
orch.patch("/sessions/:id", (c) =>
	c.json({ app: "orch", route: "PATCH /sessions/:id", id: c.req.param("id") }),
);

const api = new Hono();
let middlewareHits = 0;
api.use("*", async (c, next) => {
	middlewareHits++;
	c.set("userId" as never, "u-1" as never);
	await next();
});
api.route("/", core);
api.route("/", orch);

const root = new Hono();
root.route("/api", api);
root.notFound((c) =>
	c.req.path.startsWith("/api")
		? c.json({ error: "Not found", code: "NOT_FOUND" }, 404)
		: c.text("404 Not Found", 404),
);

const cases: ReadonlyArray<readonly [string, string]> = [
	["POST", "/api/sessions"],
	["GET", "/api/sessions"],
	["GET", "/api/sessions/starts/es-1"],
	["GET", "/api/sessions/s-1/activity"],
	["PATCH", "/api/sessions/s-1"],
	["DELETE", "/api/sessions/s-1"],
	["GET", "/api/sessions/s-1"],
];

for (const [method, path] of cases) {
	const res = await root.fetch(new Request(`http://x${path}`, { method }));
	const ct = res.headers.get("content-type") ?? "";
	console.log(
		`${method.padEnd(6)} ${path.padEnd(30)} -> ${res.status} ${ct.split(";")[0]}  ${await res.text()}`,
	);
}
console.log(`middleware hits: ${middlewareHits} (expected ${cases.length})`);
