# AB1 Approved Design — Agent Profile Page (Variant B)

**Selected:** Variant B — Priority-Weighted Sections with Health Banner

## Page Route

`/agents/:agentId`

Registered in the AppShell route tree, not nested under `/work/`. Strategy and personal agents have no team — a team-scoped route would be incorrect for them.

## Visual Specification

### Breadcrumb

Team agents: `<- {Team Name}` linking to `/work/team/{teamId}`
Strategy/personal agents: `<- Agents` linking to `/settings?section=agents` (the SettingsAgents page, which is the closest list view)

Uses `btn btn-ghost btn-xs` matching WorkTeam breadcrumb pattern.

### Health Banner (conditional)

Renders only when one or more health signals are degraded. Absent from DOM when all green.

```
div.rounded-[var(--r-subtle)] bg-[rgba(200,60,30,0.04)] p-[12px] mb-[12px]
  ul.flex.flex-col.gap-[3px]
    li.text-[13px].text-[var(--text-primary)]
      "High failure rate: 8 of 10 sessions failed in the last 7 days"
    li.text-[13px].text-[var(--text-primary)]
      "Harness type 'foo' not found in available adapters"
```

Trigger conditions:
1. `failureRate7d > 0.5` — "High failure rate: {failed} of {total} sessions failed in the last 7 days"
2. `lastSessionState === "crashed"` — "Last session crashed: {outcome notes, truncated to 120 chars}"
3. `harnessType !== null && !adapterPool.has(harnessType)` — "Harness type '{type}' not found in available adapters"
4. `modelTierPreference !== null && !modelGateway.has(modelTierPreference)` — "Model tier '{tier}' has no configured provider"

### Header

```
section[aria-label="Agent header"]
  div.mb-1
    Link btn-ghost btn-xs  (breadcrumb)

  div.flex.items-center.gap-[12px].flex-wrap
    Avatar(initials={name.slice(0,2)}, size="md", agent)
    h1.text-sm.font-heading.font-semibold.uppercase.tracking-wider  {name}
    Tag(label={categoryLabel})          // "Team" | "Strategy" | "Personal"
    StatusChip(status={agentStatus})     // "healthy" for active/idle, "error" for error state

  div.mt-1.text-xs.text-[var(--text-tertiary)]
    span  {roleLabel} (from catalog, e.g. "Builder — Engineer. Implements features, writes code.")
    span.ml-3  "Created {relative date}"

  // Active session link (when status is active)
  div.mt-[6px].text-[13px]  (only if activeSession)
    "Running: " Link to /work/bet/{betId}/task/{taskId}  {taskTitle}

  div.mt-[6px]
    Link.btn.btn-ghost.btn-xs to="/settings?section=agents"  "Edit in Settings"
```

### Section 1 — Identity & Configuration (merged)

```
section[aria-label="Configuration"]
  h2.text-xs.font-heading.font-semibold.uppercase.tracking-wider.text-[var(--text-tertiary)].mb-2
    "Configuration"

  div.grid.grid-cols-2.gap-x-[24px].gap-y-[6px]  (collapses to grid-cols-1 on mobile)
    KeyValue label="Role"           value={role}
    KeyValue label="Harness"        value={harnessType ?? "Any"}
    KeyValue label="Category"       value={categoryLabel}
    KeyValue label="Model tier"     value={modelTierPreference ?? "Default"}
    KeyValue label="Team"           value={teamName ?? "—"}
    KeyValue label="Max sessions"   value={maxConcurrentSessions}
    KeyValue label="Created"        value={createdAt formatted}
    KeyValue label="MCP"            value={mcpSupport ? "Enabled" : "Not supported"}

  // Soul prompt disclosure
  div.collapse.collapse-arrow.bg-[var(--surface-container)].rounded-[var(--r-subtle)].mt-[12px]
    input[type="checkbox"]
    div.collapse-title.text-[12px].font-medium.text-[var(--text-secondary)]
      "Soul prompt"
    div.collapse-content.text-[13px].text-[var(--text-primary)].font-mono.whitespace-pre-wrap
      {soulPrompt ?? "Not set"}
```

### Section 2 — Harness Capabilities

```
section[aria-label="Harness capabilities"]
  h2  "Harness Capabilities"

  div.flex.flex-wrap.gap-[6px]
    // For each capability: green-tinted badge if true, ghost badge if false
    badge.badge-sm  {preCompactionTrigger ? "Pre-compaction" : "No pre-compaction"}
    badge.badge-sm  {subAgents ? "Sub-agents" : "No sub-agents"}
    badge.badge-sm  {mcpSupport ? "MCP" : "No MCP"}
    // Model providers: one badge each
    badge.badge-sm  "anthropic"
    badge.badge-sm  "openrouter"

  Styling:
    Supported: bg-[rgba(22,118,79,0.08)] text-[var(--accent-primary)] (green tint)
    Unsupported: badge-ghost text-[var(--text-tertiary)]
```

### Section 3 — Skills

```
section[aria-label="Skills"]
  h2  "Skills"

  // Empty state when no skills
  if (skills.length === 0):
    EmptyState title="No skills" description="No skill tools are available for this role."

  else:
    table.table.table-xs
      thead
        tr
          th  "Skill"
          th  "Access"
          th  "Uses"
          th  "Success rate"
          th  "Last used"
      tbody
        // For each skill from toolsForRole(role):
        tr
          td.text-[13px].font-mono  {skill.name}
          td  badge.badge-sm  {"Granted" if in userSkills, "Available" if not yet used}
          td.tabular-nums  {successCount + failureCount}
          td.tabular-nums  {successRate}%
          td.text-[var(--text-tertiary)]  {relativeTime(lastUsedAt)}
```

### Section 4 — Recent Activity

```
section[aria-label="Recent activity"]
  h2  "Recent Activity"

  if (sessions.length === 0):
    EmptyState title="No sessions" description="This agent has not run any sessions."

  else:
    table.table.table-xs
      thead
        tr
          th  "Task"
          th  "Outcome"
          th  "Cost"
          th  "When"
      tbody
        // Last 10 sessions, newest first:
        tr
          td  Link to task  {taskTitle}
          td  StatusChip(verdictDecisionToStatus(outcome))
          td.tabular-nums  formatMoney(cost)
          td.text-[var(--text-tertiary)]  relativeTime(endedAt)
```

### Section 5 — Performance

```
section[aria-label="Performance"]
  h2  "Performance"

  div.flex.flex-wrap.gap-[24px]
    KeyValue label="Sessions" value={totalSessions}
    KeyValue label="Success rate" value={successRate + "%"}
    KeyValue label="Avg cost" value={formatMoney(avgCost)}
    KeyValue label="Total cost" value={formatMoney(totalCost)}
```

## Data Requirements

The page needs a single API call that returns all data. The endpoint joins:
- `users` row (identity + config)
- `sessions` WHERE agentId = :id, ORDER BY startedAt DESC, LIMIT 10 (activity)
- `sessions` aggregate WHERE agentId = :id (performance: count, success count)
- `sessions` aggregate WHERE agentId = :id AND startedAt > 7 days ago (health: failure rate trend)
- `userSkills` WHERE userId = :id (skills with usage stats)
- `tasks` joined to sessions for task titles (activity table)
- Harness capabilities from adapter pool (server-side resolution)

See architecture.md for the full API shape.

## AC Coverage

| AC | How |
|---|---|
| AC1: accessible from team page, sidebar, org chart | Route `/agents/:agentId`. AgentCard in WorkTeam links here. |
| AC2: complete operational picture | All five data groups in visible sections. One scrollable page. |
| AC3: current status with session link | StatusChip in header + "Running: {task}" link when active. |
| AC4: health signals with warnings | Conditional banner + health triggers. Banner absent when healthy. |
| AC5: harness capabilities shown | Badge row in Harness Capabilities section. |
| AC6: link to Settings for editing | "Edit in Settings" button in header. |
