# AU20 lane/AH diagnosis

76/76 identities disposed; 72 were formerly unresolved; 0 unresolved. `lane-ah.json`
contains one explicit object per immutable full map ID; selectors are not used as
identity substitutes.

## Counts

| Register | Identities | Result |
|---|---:|---|
| BR-LANE | 70 | 46 focused green; 16 stale/fixture failures except one real focus regression; 7 specialized specs wrongly collected by default; 1 AH1 unrun covered by the same stale setup |
| BR-AH1 | 2 | stale route/settings navigation; credential behavior remains load-bearing |
| BR-AH5 | 1 | named prerequisite absent |
| BR-AH6 | 3 | production regression after accepted message, before terminal assistant output |

The JSON contains exhaustive selectors over the immutable identity source. Together they select exactly 76 identities; rules are mutually exclusive.

## Findings

Default `chromium` collects AH1/AH5/AH6 specs although its own contract says it has no API server. That creates deterministic 502/missing-composer failures and consumes the five-minute global budget, leaving 63 identities unrun. Named-config A/B proves collection is the first boundary: specialized configs boot their required servers and advance past that boundary. Fix collection, never increase timeout to hide it.

The bounded 9-file default probe completed in 61.2s: 50 expected, 24 unexpected across the whole files. Among the 62 BR-LANE identities in those files, 46 pass and 16 fail/time out. Current painted output and source identify retired selectors/routes (`/work/portfolio`, `product-active-bets`, `bet-task-row`, `coc-context-chips`, broad `/assistant/i`, `conversations-empty`, `thread-shell`). Those tests need contract-backed correction. `L14:304` is the exception: the product explicitly offers Unblock-to-composer but focus remains inactive, so retain that red and repair `WorkBet.handleAction`.

AH1 reaches the real server and completes setup, then waits for retired `/work/portfolio`; the next case waits for removed `sidebar-avatar-btn`. Current code, spec, and AH1 config are unchanged across `ca6a6b71^..HEAD`, so this is not an AU20 service rewrite boundary. Update only navigation/settings entry after independently proving credential persistence.

AH5 cannot be adjudicated without `OPENROUTER_API_KEY`; current environment lacks it. This is a named prerequisite, not an excuse to skip: preflight must fail by name, and a credential-present run must execute.

AH6 is an AU20 production regression. Under the correct named lane, message submission succeeds and Thinking paints, but S1 gets no AI message, S2 gets no tool result, and S3 cannot clear. The first boundary is durable intent/request/dispatch after HTTP acceptance. Keep cassette and UI assertions unchanged; write an integration red proof over intent → request → terminal assistant message, then repair `bootAgentLayer/wake` / `runAssistantTurn` handoff or terminal error projection.

## Commands and artifacts

- Focused default: command recorded in `lane-ah.json`; JSON reporter `/tmp/au20-lane-focused.json`.
- AH1: named config with `CI=1`, trace on; 2 failed, 1 did not run due 120s global timeout.
- AH6: named config with `CI=1`, trace on; S1/S2 failed, remaining cases did not run due 120s global timeout.
- Traces/screenshots: `packages/web/test-results/`.
- Source A/B: `git diff --quiet ca6a6b71^..HEAD` returned 0 for AH1 and AH6 web source/spec/config sets.
