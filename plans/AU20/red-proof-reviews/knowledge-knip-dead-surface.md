# AU20 knowledge Knip dead-surface static-red review

VERDICT: accept

Reviewed
`.pipeline/work/AU20/red-proofs/knowledge-knip-dead-surface.json` at SHA-256
`4a940ba2ffe97e9696b64238c23539d4afc41a3e78af2bb206bc126d4a9a8e82`.

- Knip reproduces exactly two knowledge findings: the comment-only
  `knowledge-reader.ts` file and unused `PropagationLevel`.
- Repository-wide consumer searches are empty. Policy uses the canonical
  `@hyperidle/shared` `PropagationLevel`.
- `knowledge-reader.ts` has no imports or declarations; the retained knowledge
  read behavior lives in `knowledge-repository.ts`.
- Commit `0a4ba6df` changed `PropagationLevel` from a direct export to a private
  declaration plus re-export, which the implementation-site census does not
  count. This leaf removes the actual dead source and must not claim another
  metric reduction.
- Census therefore remains knowledge 17 methods / 12 types / 29 total and
  aggregate 23 services / 231 methods / 181 types / 412 total.
- Eval and notifications Knip findings remain frozen for their own later
  increments.

Write-code authorization is limited to:

1. delete `packages/core-api/knowledge/src/knowledge-reader.ts`;
2. remove the orphan lifecycle heading, lore, `PropagationLevel` declaration,
   and re-export from `packages/core-api/knowledge/src/types.ts`.
