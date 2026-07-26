# AU20 run-orchestration async disposal provenance re-review

Date: 2026-07-24
Reviewer: fresh independent pipeline reviewer
Increment: `run-orchestration-async-disposal`
Finding: F2

## Corrected provenance

The prior review's sole blocker is closed.

Completed F5 history now reads
`591f2051482581c29f082544ac36efb0f09df1d6:packages/core-api/src/server-factory.ts`
from Git and hashes those immutable committed bytes. The resulting SHA-256 is
`b8a7c5a0fc159d8e5496a7f8c98537e1387c9df16a1ba1d2e88228b18b4382ca`,
which exactly matches the accepted F5 review and commit receipt. It no longer
compares F5 history to F2's live working-tree file.

F2 independently binds the current seven-path candidate:

| Path | SHA-256 |
|---|---|
| `packages/core-api/src/server-factory.ts` | `34332d65afb258b47de22e77452f30b29514fa23afcf70ab0b4555d43587fbb1` |
| `packages/remote-server/src/index.ts` | `5268bfa5fbb6ce88c782e7b4658b11c1b6ab57c26a7b73b01006a113ac2517a3` |
| `packages/desktop/src/boot-server.ts` | `5083a235f4b90fe1f609939435fb6e8b887568b6ac924337d5dbe718e7bba2f7` |
| `packages/desktop/src/main.ts` | `97aedbfc49137f79ab4d9d505b4b37c6bfef9646a7d49ecfd698e130172e0118` |
| `packages/web/scripts/ah1-test-server.ts` | `14e14a9a08a4642c7ea6aa19da0b0aa230389036e1b7b3474e3800be052d317e` |
| `packages/web/scripts/ah5-test-server.ts` | `bf47c33bc75275b3c3c83a27e5f6f7c6356a101c072933d283c76be4266d6ff4` |
| `packages/web/scripts/ah6-test-server.ts` | `68699ebe2f01b50e232c4308a7878127bab3d5ab3286aa72fcead8e710f97169` |

Accepted evidence remains byte-identical:

- RED test: `f136b0f3b544070a92dd9cc63a9c281de468009b296bcd9dd0d76e6d1b3e94f3`
- RED proof: `56256c3bf8e74894df90115ca873f671c87c212ae3424debd7b0383fa330987b`
- RED review: `a2634e280fe73c730d80b0c19e93871eee2ba883dafc9380c18bd1f12bab64fc`
- strict product review: `ca703b9a4dbea151cf1fd19eea71b5210c3bb2269b0246cc21fda2e48f7ee88b`

No product, test, or census file changed since the strict product acceptance.

## Commands observed

- Corrective map generator, first run → exit 0.
- Corrective map generator, second run → exit 0.
- Map SHA before/after both runs:
  `d9463c77913c52a5484ab1ea2211d61bebec2ae611e4f512ac71ad5e5edecf99`;
  byte-identical determinism confirmed.
- `node .pipeline/work/AU20/probes/validate-corrective-change-map.mjs --require-review`
  → exit 0; authorized stage `review-async-runtime-disposal`, all write/code/
  product/commit locks remain closed.
- Focused F2 service integration → exit 0; 5/5 tests pass.
- `npx tsx scripts/surface-census.ts --json` → exit 0; 23 services,
  231 methods, 181 types, 412 total.
- `git diff --check` → exit 0.

No findings remain.

VERDICT: accept
