# toon-codec — destroyer verdict (framework)

## Where does this package go?
**Verdict: DISSOLVE → `run-orchestration` (inline); decoder half DELETED outright**

This "codec" encodes and never decodes. Production reach, measured:

- `encodeTyped` — exactly ONE production caller in the whole repo:
  `layers/agent-orchestration/run-orchestration/src/context.ts:142` (`buildSessionContextToon`),
  which writes `context/session.toon` into an agent sandbox. The agent reads that file as prompt
  text; the LLM is the decoder.
- `decode`, `decodeTyped`, `ToonParseError` — `rg -a` across `layers framework applications tools`
  finds ZERO references outside `framework/toon-codec/src` itself. Only the package's own test file
  exercises them. Nothing machine-parses a `.toon` file back, anywhere: not writeback, not the
  harness, not eval. The decoder — the majority of the file, ~170 of ~285 lines, including the
  whole nested-keypath parser and its error class — is TEST-ONLY, i.e. dead.

A codec used in one direction is not a codec; it is a serializer with a dead twin. The live half
(`encode` + `flattenToLines`, ~55 lines) moves into `context.ts` next to its only caller, and the
package dies.

**Does it merge with `presentation-format`?** No. Measured `presentation-format` consumers are
core-ui pages/components, design-system, and core-api routes — human-facing display formatting.
TOON is an LLM prompt-file format with one consumer in run-orchestration. Grafting a one-consumer
agent format onto a UI formatting package manufactures a fake shared audience. Dissolve into the
consumer instead.

## Consumers (measured, not assumed)
| Consumer | What it imports | Could it own this? |
|---|---|---|
| `layers/agent-orchestration/run-orchestration/src/context.ts` | `encodeTyped` only | Yes — sole consumer; ~55 lines move in |

## If written today, from scratch
A private `encodeToon(obj): string` function inside `run-orchestration/src/context.ts` (or a
sibling file in that package). No decoder until the day something actually reads TOON back — that
day has not come since the format was invented.

## Kill summary
| Verdict | Count |
|---|---|
| DELETE | 3 |
| MERGE | 1 |
| SIMPLIFY | 0 |
| KEEP | 1 |
Surface: 5 exports → 1 private function (80% cut; package deleted)

## Feature-level kills
- **TOON parsing as a capability**: dies entirely. Round-trip fidelity stops being a maintained
  promise; the format's only contract becomes "readable by an LLM". Acceptable because no code has
  ever consumed the parse side in production.
- **The package's test file**: the decode/round-trip tests die with the decoder. Encoder behavior
  (undefined-skipping, multiline `|` blocks, empty-string vs null) gets pinned where the output is
  produced — a context.ts test asserting the written `session.toon` content, which is the only
  contract that matters.

## Full export audit
| # | Export | Kind | Reach | Verdict | Reason |
|---|---|---|---|---|---|
| 1 | `encodeTyped` | function | INTERNAL (one caller: `context.ts:142`, reached via session provisioning) | MERGE | Pure passthrough — its own comment admits "no cast needed". The generic wrapper exists to contain a cast that does not exist. Fold into `encode`. |
| 2 | `decodeTyped` | function | TEST-ONLY | DELETE | Zero production callers; a typed wrapper over a dead decoder, whose doc admits it validates nothing. |
| 3 | `encode` | function | INTERNAL (only via `encodeTyped`) | KEEP | The one live behavior: writes `session.toon` agent context. Survives as a private function inside `run-orchestration`; the package around it dies. |
| 4 | `decode` | function | TEST-ONLY | DELETE | Zero production callers anywhere in the repo. ~120 lines of parser + keypath reconstruction serving only its own test file. Write-only format — the LLM is the decoder. |
| 5 | `ToonParseError` | class | TEST-ONLY | DELETE | Only thrown by `decode`; dies with it. |

## Holes this leaves
- If a future feature needs to machine-read `session.toon`, the parser must be rewritten (~120
  lines) or the data re-emitted as JSON alongside. Priced: the context bundle that feeds `encode`
  is already structured data in the DB — anything wanting it back should read the source, not
  re-parse a prompt file.
- `encodeTyped`'s `@lore TOON-boundary` comment about cast containment becomes moot and must not be
  carried over — it documents a problem the code no longer has.
