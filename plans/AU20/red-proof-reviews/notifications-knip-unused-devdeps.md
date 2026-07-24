# AU20 notifications unused dev-dependencies static-red review

VERDICT: accept

Reviewed
`.pipeline/work/AU20/red-proofs/notifications-knip-unused-devdeps.json` at
SHA-256
`fe33df8165f12fa0c0c7967ce12ebff2eb0b2d9205b3661d8b0d3c4a82e0c7c7`.

- Focused and full Knip reproduce exactly the unused `@types/smtp-server` and
  `smtp-server` findings.
- Repository source, import, dynamic-import, and require searches find no
  consumer. Runtime mail delivery uses retained `nodemailer`.
- The exact orphan lock graph consists of both workspace dev-dependency
  entries and the `@types/smtp-server`, `smtp-server`, and `ipv6-normalize`
  node blocks.
- `@types/node`, `@types/nodemailer`, `nodemailer`, and `punycode.js` have
  independent live parents and must remain.
- `bun.lock`, product source, the census tool, and the 23/231/181/412 census
  are frozen.

Write-code authorization is limited to
`packages/core-api/notifications/package.json` and `package-lock.json`, with no
whole-lock normalization or unrelated dependency change.
