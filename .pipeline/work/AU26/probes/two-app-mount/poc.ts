import { Hono } from "hono";

// Layer A app (core-api)
const coreApp = new Hono();
coreApp.get("/bets", (c) => c.json({ from: "core" }));
coreApp.get("/health", (c) => c.json({ from: "core-health" }));

// Layer B app (agent-orchestration)
const orchApp = new Hono();
orchApp.get("/agent-orchestration/sessions", (c) => c.json({ from: "orch" }));
orchApp.get("/sessions/:id", (c) => c.json({ from: "orch-session", id: c.req.param("id") }));

// Application: one root, one /api router, BOTH apps mounted at the same prefix
const root = new Hono();
const api = new Hono();
let mwHits = 0;
api.use("*", async (c, next) => { mwHits++; await next(); });
api.route("/", coreApp);
api.route("/", orchApp);
api.notFound((c) => c.json({ nf: true }, 404));
root.route("/api", api);

const check = async (path: string) => {
  const res = await root.fetch(new Request(`http://x${path}`));
  return { status: res.status, body: await res.json() };
};

console.log("core   ", JSON.stringify(await check("/api/bets")));
console.log("orch   ", JSON.stringify(await check("/api/agent-orchestration/sessions")));
console.log("orchP  ", JSON.stringify(await check("/api/sessions/abc")));
console.log("404    ", JSON.stringify(await check("/api/nope")));
console.log("mwHits ", mwHits, "(expect 4 — one shared middleware pass per request)");
