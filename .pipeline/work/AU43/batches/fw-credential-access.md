# Delete batch — `fw-credential-access`

1 convicted rows. Delete every one, or record it as a survivor with a reason.

| # | Symbol | Reach | Why it was convicted |
|---|---|---|---|
| 1 | `UnsupportedAgentProviderError` | class · TEST-ONLY (AH2-resolve-agent-model.integration.test.ts:131 is the only reference; no production catch or instanceof anywhere) | An error subclass nobody catches is a plain Error with a costume. Throw Error with the same message; retag the test to assert the message. |
