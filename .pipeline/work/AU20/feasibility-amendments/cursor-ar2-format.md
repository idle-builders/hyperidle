# AU20 feasibility amendment — Cursor AR2 formatting

Focused Biome exits 1 with one deterministic replacement: collapse the two-element
`builtin`/`claude` fixture array to canonical single-line layout. No lint or semantic
finding is present.

**Verdict: GO.** Run installed Biome on the single test and prove semantic-token
identity plus formatter idempotency.
