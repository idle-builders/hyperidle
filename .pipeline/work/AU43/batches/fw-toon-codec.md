# Delete batch — `fw-toon-codec`

3 convicted rows. Delete every one, or record it as a survivor with a reason.

| # | Symbol | Reach | Why it was convicted |
|---|---|---|---|
| 1 | `decodeTyped` | function · TEST-ONLY | Zero production callers; a typed wrapper over a dead decoder, whose doc admits it validates nothing. |
| 2 | `decode` | function · TEST-ONLY | Zero production callers anywhere in the repo. ~120 lines of parser + keypath reconstruction serving only its own test file. Write-only format — the LLM is the decoder. |
| 3 | `ToonParseError` | class · TEST-ONLY | Only thrown by decode; dies with it. |
