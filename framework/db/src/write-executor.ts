import type { HyperIdleDb } from "./connection.js";

export type WriteExecutor = HyperIdleDb | Parameters<Parameters<HyperIdleDb["transaction"]>[0]>[0];
