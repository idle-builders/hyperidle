import { Hono } from "hono";
const core = new Hono();
core.get("/bets", (c) => c.json({ from: "core", user: c.get("userId" as never) ?? null }));
core.get("/boom", () => { throw new Error("core boom"); });
const orch = new Hono();
orch.get("/ao/sessions", (c) => c.json({ from: "orch", user: c.get("userId" as never) ?? null }));
orch.get("/ao/boom", () => { throw new Error("orch boom"); });

const root = new Hono();
const api = new Hono();
let hits = 0;
api.use("*", async (c, next) => { hits++; c.set("userId" as never, "u-1" as never); await next(); });
api.onError((err, c) => c.json({ handled: "api", msg: err.message }, 500));
api.route("/", core);
api.route("/", orch);
root.route("/api", api);
root.onError((err, c) => c.json({ handled: "root", msg: err.message }, 500));

for (const p of ["/api/bets", "/api/ao/sessions", "/api/boom", "/api/ao/boom"]) {
  const r = await root.fetch(new Request(`http://x${p}`));
  console.log(p, r.status, (await r.text()).slice(0, 60));
}
console.log("middleware hits:", hits, "(expect 4)");
