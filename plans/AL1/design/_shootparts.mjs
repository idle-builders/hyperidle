import { chromium } from "playwright";
const shots = [
  ["Review/Outcome Summary", "Finance Close", "parts/outcome-finance.png"],
  ["Review/Outcome Summary", "Support Sweep", "parts/outcome-support.png"],
  ["Review/Field Change-Set", "Populated", "parts/field-changeset.png"],
  ["Review/Action Operation", "Populated", "parts/action-operation.png"],
  ["Review/Rendered In Context", "Populated", "parts/rendered-in-context.png"],
  ["Review/Metrics Moved", "Populated", "parts/metrics-moved.png"],
  ["Review/Visual Diff", "Populated", "parts/visual-diff.png"],
  ["Review/Code Diff", "Populated", "parts/code-diff.png"],
  ["Review/Batch", "Populated", "parts/batch.png"],
];
const base = "http://localhost:8098/#";
const dir = new URL(".", import.meta.url).pathname;
const widen = `div[style*="max-width: 1024px"]{max-width:1320px !important;}`;
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1380, height: 1200 }, deviceScaleFactor: 2 });
const errs = [];
p.on("pageerror", e => errs.push(String(e).slice(0,160)));
p.on("console", m => { if (m.type()==="error" && !/unique .key. prop/.test(m.text())) errs.push("c:"+m.text().slice(0,140)); });
for (const [title, section, out] of shots) {
  errs.length = 0;
  await p.goto(base + encodeURIComponent(title), { waitUntil: "networkidle" });
  await p.addStyleTag({ content: widen });
  await p.waitForTimeout(700);
  const sec = p.locator(".demo-section", { has: p.locator(".demo-section-title", { hasText: new RegExp("^"+section+"$") }) }).first();
  try {
    await sec.scrollIntoViewIfNeeded();
    await sec.screenshot({ path: dir + out });
    const bb = await sec.boundingBox();
    console.log(`OK  ${out.padEnd(34)} ${bb?Math.round(bb.width)+"x"+Math.round(bb.height):"?"}  err=${errs.length}`);
  } catch(e) { console.log(`FAIL ${out}  ${String(e).slice(0,90)}`); }
  if (errs.length) console.log("   ⚠ "+errs.slice(0,2).join(" | ").slice(0,220));
}
await b.close();
