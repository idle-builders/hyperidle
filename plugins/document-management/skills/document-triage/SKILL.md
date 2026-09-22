# Document Triage

Use this skill when you need to review proposed documents and decide, one by one, whether each is ready to stand as the team's active record or should be archived instead.

## When to use

- Scheduled weekly sweep (Sundays at 4am, after the decay sweep)
- When there is a backlog of proposed documents waiting for a decision
- When you want to clear the triage queue manually

## What this skill does

1. Find every proposed document: `search_documents({ status: "proposed", inTree: true })`.
2. Read each one in full: `open_document({ id })`.
3. Decide, using judgement: promote it with `edit_document({ id, status: "active", version })` if it is a genuinely useful, well-formed record the team should rely on; archive it with `edit_document({ id, status: "archived", version })` if it is a duplicate, stale, or too thin to stand on its own.
4. Write a one-line reason for each decision in the run's summary — this is the whole audit trail, since nothing else records why a document was promoted or archived.

## Guidance

There is no repetition-count or scoring tool any more — the decision is yours, made by reading the document. Judge each one on its own: is it accurate, is it specific enough to be useful to someone who was not in the room, does it duplicate something already active? When in doubt, archive rather than promote — a document can always be re-proposed with more support. Keep the per-document reason short (one line) but never skip it.
