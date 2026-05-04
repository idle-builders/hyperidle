## 10. Where derivation attaches in the pipeline

The L2 spec is explicit: derivation runs "during ingestion" — the moment a markdown body lands in HyperIdle. There are two ingestion paths today and Blocks attach to both:

- **File watcher writeback** (`packages/fabric/src/writeback.ts` / `file-watcher.ts`). When an agent edits a markdown file in the materialised workspace, the watcher debounces, reads the body, and writes back to the canonical store. Block derivation is a *read-side* concern — the watcher does not need to derive on write. Derivation runs when a UI surface (or its API) asks for the body. Storing a `body_sha` alongside the body lets the renderer key the cache.
- **Knowledge view direct edit.** When a human edits a body in the Knowledge view, the API writes to the canonical store and bumps the body's `version` (and `body_sha`). The same read-side derivation applies. Cache invalidation is automatic by `body_sha` mismatch.

**Two-process derivation.** Both client and server may derive Blocks from the same body — the server when responding to an API request without a fresh-enough cache, the client when re-rendering on focus or after an optimistic edit. They MUST share the same derivation function (or one is the source of truth and the other proxies). Concretely: `deriveBlocks` lives in `packages/shared` and is imported by both the server and the web bundle. Both processes use byte-identical code paths and the same `parser_version` constant. The cache is a pure optimisation that never gates correctness — if the cache is empty, both processes can re-derive locally and reach identical Block lists with identical ids.

The contract concern is **parser-version negotiation across processes** — when a deployment ships a new `parser_version`, in-flight clients on the old version may still produce ids that disagree with the server's freshly-derived ids. The version tag in the BlockId algorithm (§8.4, `blk:v1`) covers content-shape changes; the `parser_version` cache key covers parser-implementation changes. Both bump together when the derivation function changes.

**Architect call** during the L2 design pass: cache *placement* (in memory per-process, a derived `block_cache` table keyed by `(body_sha, parser_version)`, or only in the renderer's React Query cache). The *existence* of derivation in two places is fixed by the architecture; it is not a placement choice.

---
