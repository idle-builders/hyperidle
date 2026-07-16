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
 * RETIRED. `@hyperidle/context-assembly` is now the real, fully-migrated
 * Service (all five ports real — see its own `index.ts` top `@lore`), wired
 * into the live app at the actual composition root,
 * `packages/server/src/services/context-assembly-bindings.ts` — not this
 * Layer barrel, which (like every other AU19 Service's real wiring so far)
 * has zero real consumers; `packages/server` remains the practical
 * composition root through Increment 5 (it is not itself a nested
 * `packages/<layer>/<service>/` package the composition-boundary-guard
 * scans, so it is the one place allowed to name every Service together).
 * This barrel intentionally exports nothing until a future Increment gives
 * the `agent-orchestration` Layer package itself a real consumer.
 */
export {};
