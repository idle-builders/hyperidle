// @lore: WriteExecutor — HyperIdleDb and tx share the same query surface; plain union, no discrimination; callers join an existing transaction unchanged
import type { HyperIdleDb } from "./connection.js";

export type WriteExecutor = HyperIdleDb | Parameters<Parameters<HyperIdleDb["transaction"]>[0]>[0];
