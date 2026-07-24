/**
 * @hyperidle/agent-orchestration — Layer composition barrel.
 *
 * @lore AU19 Increment 0: this barrel originally carried `wiredAssemble` — a
 * minimal `context-assembly` proof-of-mechanism wiring the `knowledge` port
 * to the real `@hyperidle/knowledge` Service and the other four ports
 * (`work`/`users`/`routine`/`filesystems`) to explicit transitional stubs,
 * proving Mechanism C end-to-end for one real edge. It was never swapped
 * into the live app — `packages/server` kept its in-process context-assembly
 * for production while the proof stayed self-contained.
 *
 * @lore AU19 Increment 3 (context-assembly finalize): `wiredAssemble`
 * RETIRED. `@hyperidle/run-orchestration` is the current owner of context assembly.
 * The live server reaches that owner through its runtime composition.
 * This barrel intentionally exports nothing until a future Increment gives
 * the `agent-orchestration` Layer package itself a real consumer.
 */
export {};
