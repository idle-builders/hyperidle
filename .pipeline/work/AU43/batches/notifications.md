# Delete batch — `notifications`

9 convicted rows. Delete every one, or record it as a survivor with a reason.

| # | Symbol | Reach | Why it was convicted |
|---|---|---|---|
| 1 | `getDailyDigest` | UI:GET /api/status/digest (zero clients) | Demo-only trigger, zero-client route — dead on its own terms at any team size. Digest-as-plugin if ever wanted. |
| 2 | `scrubErrorMessage` | INTERNAL (export TEST-ONLY) | Serves the retry/error paths of the platform being cut; fire-once send logs via observability. Preemptive-security reflex. |
| 3 | `priorityForSeverity` | INTERNAL (export TEST-ONLY) | ntfy priority mapping; ntfy dies — email is the one channel. |
| 4 | `classifySmtpRetriable` | INTERNAL (export TEST-ONLY) | Retry triage for a retry machine that dies; fire-once + inbox fallback needs no triage. |
| 5 | `isInSilenceWindow` | INTERNAL (silence + quiet-hours only) | Both consumers have no writer anywhere — re-confirmed. Dead regardless of user count. |
| 6 | `isSilenced` | BOOTSTRAP → policy-engine (service-bootstrap.ts:244) | silence config has no writer; constant-false in every install that has ever existed. Kill the policy-engine branch + PolicyDeps.silence + schema. Team-wide hush, if ever wanted, gets built from a real learning. |
| 7 | `NotificationChannel` |  | One hardcoded channel needs no union. |
| 8 | `Notification` |  | Adapter payload; compose the email from the DB row directly. |
| 9 | `NotificationAdapter` |  | Adapter abstraction over one channel is a wrapper; FakeAdapter tests die with it. |
