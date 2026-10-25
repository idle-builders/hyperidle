---
name: security-audit
description: "Full penetration-style security review bench — going all in. Maps the attack surface, threat-models per surface (STRIDE + agent-layer), actively tests every vuln class, writes repros, and tracks coverage across runs so it knows which surfaces are current, stale, or never reviewed. Manual, founder-invoked, runs on Fable via the auditor agent."
argument-hint: "[surface path | 'all' | 'stale' | 'never']"
user-invocable: true
min_tool_calls: 20
---

# Security Audit

A full penetration-style security bench for HyperIdle's own codebase. Authorized, defensive hardening only — write repros that demonstrate flaws, never weaponized exploits, never destructive actions against shared infra.

Run as the **auditor** agent (Fable). This is not the per-PR `/review` security lens — that is fast and diff-scoped. This is deep, whole-surface, and **coverage-aware across runs**.

**Argument** (`$ARGUMENTS`): a surface path to scope to, or `all` (everything), `stale` (only surfaces changed since last review — the default cadence), or `never` (only never-reviewed surfaces). Default when empty: `stale` then `never`.

---

## Phase 0 — Coverage reconciliation (always first)

Read the ledger and compute the real state. Never start blind.

1. Read `.pipeline/audits/security/ledger.json` (create it from the seed shape below if absent).
2. `git rev-parse HEAD` → current commit.
3. For each surface in the ledger, classify:
   - **CURRENT** — `git diff --name-only <last_reviewed_commit> HEAD -- <surface paths>` is empty.
   - **STALE** — that diff is non-empty. Note the changed files — they get priority.
4. Enumerate the **live** attack surface (Phase 1) and diff against the ledger: any surface not in the ledger is **NEVER**. A ledger surface whose paths no longer exist is **REMOVED** — drop it, close its open findings, and say so.
5. Report the coverage line: `N current / M stale / K never (total T)`. Pick targets per `$ARGUMENTS`.

Do not proceed past a surface silently. If you scope to `stale`, say which `never` surfaces you are deferring.

---

## Phase 1 — Recon: map the attack surface

Enumerate, don't guess. For each, record the files so the ledger can hash them.

- **HTTP surface** — every Hono route: method, path, auth requirement, input shape. The actions (`POST /api/actions/<name>`, declared in `framework/domain-model/src/actions/`, run by `layers/core-api/*/src/*-actions.ts` and the actions router), the plumbing routes listed in `tools/governance/src/rules/actions-projected.ts` (`layers/core-api/src/routes/` — auth, health, first start `/api/start`, search, ws; `layers/agent-orchestration/src/routes/`), the MCP route (`layers/agent-execution/harness-registry/src/mcp/`), and the WebSocket topics (`layers/core-api/src/routes/ws.ts`, worker socket).
- **Web client** — `layers/core-ui/src/`: everything that renders text someone else wrote (messages, Markdown in `RichText.tsx` and the TipTap editor in `DocEditor.tsx`, review parts in `ReviewPart.tsx` — including the live page shown in an `iframe`, and its `sandbox` flags), and the API key in the page (`api.ts`).
- **Desktop bridge** — `applications/desktop/src/preload.ts` exposes `credentials.set` and `join` to the page; their handlers are in `applications/desktop/src/main.ts` (`backend:join`) and `safe-credentials.ts`.
- **Trust boundaries** — every point where external/user/agent input enters: request bodies, query params, headers, file uploads, webhook payloads, MCP tool args, knowledge ingested into agent context.
- **AuthN / AuthZ** — session issuance, identity resolution, and every authorization check (scoped to team/workspace vs "any valid session").
- **Agent-layer surface** — tool definitions the agent can call, the sandbox/workspace boundary, prompt assembly (where human text reaches agent context), knowledge store reads/writes.
- **Data layer** — Drizzle queries (raw SQL? interpolation?), migrations, FK/constraint coverage.
- **Secrets & crypto** — where secrets are read, logged, returned, or compared; token generation; hashing.
- **Outbound** — every fetch/URL the server makes from user-influenced input (SSRF surface).
- **Dependencies** — `npm audit`, lockfile review for the changed surface.

---

## Phase 2 — Threat model per surface

For each surface in scope, run **STRIDE** (Spoofing, Tampering, Repudiation, Information Disclosure, DoS, Elevation of Privilege) **plus the agent-layer threats** unique to this product:

- **Prompt injection** — human text → agent context without sanitization (unicode normalization, control/format-char stripping). Trace it end-to-end; this is the highest-value class here.
- **Tool misuse / confused deputy** — can an agent be steered to call a tool outside the requesting actor's authority?
- **Workspace / sandbox escape** — can agent-run code or paths reach another tenant's data or the host?
- **Knowledge poisoning** — can untrusted input persist into shared knowledge and influence later agents?
- **Cross-tenant / IDOR** — can actor A reach actor B's tasks, threads, documents, folders or services by ID? (Every team's knowledge is readable by everyone by design; check what is meant to be private — a person's own page, services, keys.)

---

## Phase 3 — Active testing (per vuln class)

Go all in. For each class, attempt it — don't just reason about it. Grep the whole codebase, not just changed files.

- **AuthZ / IDOR** — request another tenant's resource by ID; confirm scoping.
- **Injection** — SQLi (raw queries, interpolation), XSS (`dangerouslySetInnerHTML`, unescaped templates, `innerHTML`), command/`eval`/`Function(`/`child_process`/`exec(`, SSRF on outbound URLs, path traversal on path inputs.
- **Input validation** — every boundary has a schema; schemas actually constrain (not `z.any()`); reject malformed, oversized, type-confused input.
- **Rate limiting / DoS** — every POST/PUT/DELETE has per-identity limits; unbounded loops/lists; ReDoS; zip/payload bombs.
- **Secrets / crypto** — secrets never logged or returned; constant-time compares; tokens unguessable; no weak hashing.
- **Sessions / CSRF** — session fixation, predictable tokens, missing CSRF protection on state-changing routes.
- **Race conditions / TOCTOU** — create-or-update and balance/limit checks under concurrency.
- **Agent-layer** — actually craft an injection payload through a real input path and see if it reaches/steers an agent; attempt a cross-tenant tool call.
- **Supply chain** — known-vuln deps, suspicious postinstall, unpinned critical deps.

---

## Phase 4 — Prove it

For each candidate finding, produce **evidence**: a failing security test (preferred — hand it to the builder as a regression guard), a curl/Playwright repro, or a precise code trace from entry point to sink. No PoC, no finding — downgrade to OBSERVATION if you can't demonstrate it.

---

## Phase 5 — Report

Per finding: stable ID (`SEC-NNNN`), title, **severity** (Critical/High/Medium/Low with brief CVSS-style rationale), affected file/line/route, repro/evidence, impact, remediation. Write each to `.pipeline/audits/security/findings/SEC-NNNN.md` and summarize the set inline.

Open the report with the coverage line from Phase 0 and the verdict per surface.

---

## Phase 6 — Update the ledger

This is what makes the next run coverage-aware. For every surface you actually reviewed:

```jsonc
// .pipeline/audits/security/ledger.json
{
  "domain": "security",
  "updated_at": "<ISO date>",          // pass via the agent; do not invent a clock
  "surfaces": {
    "core-api/routes/auth": {
      "paths": ["layers/core-api/src/routes/auth.ts"],
      "last_reviewed_commit": "<HEAD sha at review>",
      "blob_hashes": { "layers/core-api/src/routes/auth.ts": "<git rev-parse HEAD:path>" },
      "depth": "full",                  // full | spot
      "verdict": "pass",               // pass | findings
      "open_findings": ["SEC-0007"],
      "reviewed_at": "<ISO date>"
    }
  }
}
```

Record `blob_hashes` via `git rev-parse HEAD:<path>` per file. Leave CURRENT surfaces untouched. Never mark a surface reviewed at a depth you didn't reach.

---

## Output

1. Coverage line (current/stale/never).
2. Per-surface verdict.
3. Findings, severity-sorted, each with evidence + remediation.
4. Updated ledger + `findings/SEC-*.md`.

Target: $ARGUMENTS
