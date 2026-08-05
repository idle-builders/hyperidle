import { Hono } from "hono";
const mk = () => {
  const coreApp = new Hono(); coreApp.get("/bets", (c) => c.json({ from: "core" }));
  const orchApp = new Hono(); orchApp.get("/agent-orchestration/sessions", (c) => c.json({ from: "orch" }));
  return { coreApp, orchApp };
};
async function variant(name: string, build: () => Hono) {
  const root = build();
  const out: string[] = [];
  for (const p of ["/api/bets", "/api/agent-orchestration/sessions", "/api/nope", "/other"]) {
    const res = await root.fetch(new Request(`http://x${p}`));
    const t = await res.text();
    out.push(`${p} -> ${res.status} ${t.slice(0, 40)}`);
  }
  console.log(`\n[${name}]\n  ` + out.join("\n  "));
}

// A: notFound on the api sub-router (what app.ts does today, but with 2 mounted apps)
await variant("A: api.notFound + root.notFound", () => {
  const { coreApp, orchApp } = mk();
  const root = new Hono(); const api = new Hono();
  api.route("/", coreApp); api.route("/", orchApp);
  api.notFound((c) => c.json({ nf: "api" }, 404));
  root.route("/api", api);
  root.notFound((c) => c.json({ nf: "root" }, 404));
  return root;
});

// B: notFound only on root
await variant("B: root.notFound only", () => {
  const { coreApp, orchApp } = mk();
  const root = new Hono(); const api = new Hono();
  api.route("/", coreApp); api.route("/", orchApp);
  root.route("/api", api);
  root.notFound((c) => c.json({ nf: "root", path: c.req.path }, 404));
  return root;
});

// C: sub-apps mounted, notFound set on each sub-app too
await variant("C: subapp.notFound set", () => {
  const { coreApp, orchApp } = mk();
  coreApp.notFound((c) => c.json({ nf: "core" }, 404));
  orchApp.notFound((c) => c.json({ nf: "orch" }, 404));
  const root = new Hono(); const api = new Hono();
  api.route("/", coreApp); api.route("/", orchApp);
  root.route("/api", api);
  root.notFound((c) => c.json({ nf: "root" }, 404));
  return root;
});
