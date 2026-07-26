# AU20 feasibility amendment — mock inventory evidence regeneration

`npm run mock-inventory:check` exits 1 with exactly three added and four removed
literal-id rows. Every row points to the two already-accepted AU20 product files;
no new mock family or generator defect is indicated. The existing generator writes
exactly `inventory.json`, `inventory.md`, and `queue.md`; `follow-ups.md` and
`test-coverage-gap.md` are authored evidence and remain frozen.

**Verdict: GO.** Pin exact drift and hashes, run the existing generator twice, and
commit only deterministic generated evidence plus pipeline receipts.
