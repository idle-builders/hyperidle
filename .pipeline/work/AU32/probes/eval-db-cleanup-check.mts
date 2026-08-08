/**
 * AU32 review D2 — proves createEvalDb()'s wrapped close() removes its per-boot mkdtemp dir.
 * Re-run: `npx tsx .pipeline/work/AU32/probes/eval-db-cleanup-check.mts` from the repo root.
 */
import { createEvalDb } from "../../../../tools/eval/src/runner.js";
import { readdirSync } from "node:fs";
import { tmpdir } from "node:os";

const before = readdirSync(tmpdir()).filter((f) => f.startsWith("eval-db-"));
console.log("before:", before);

const { close } = await createEvalDb();
const during = readdirSync(tmpdir()).filter((f) => f.startsWith("eval-db-"));
console.log("during:", during);

await close();
const after = readdirSync(tmpdir()).filter((f) => f.startsWith("eval-db-"));
console.log("after:", after);
