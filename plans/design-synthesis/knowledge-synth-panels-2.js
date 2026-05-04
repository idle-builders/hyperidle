/* knowledge-synth-panels-2.js — K5 · Factory scope, K6 · Merge modal, Critique, Delta. */

/* ═════════ PANEL K5 · Factory scope · The constitution ═════════ */
(function panelK5(){
  const slot = document.getElementById('k5-slot');
  if (!slot) return;

  const banner = `
    <div class="kb-factory-banner">
      <span class="ico">§</span>
      <div>
        <strong>Factory scope — amendable under review.</strong>
        &nbsp;These 12 items define how every agent operates. Changes here reshape the whole fleet — edits go through a 48h review window and require explicit sign-off.
      </div>
      <div class="spacer"></div>
      <button class="btn">Review log</button>
      <button class="btn">Propose amendment</button>
    </div>`;

  const rows = FACTORY_CONSTITUTION.map(c => `
    <div class="kb-constitution-row">
      <div class="cn-num">${c.number}</div>
      <div>
        <div class="cn-title">${c.title}</div>
        <div class="cn-preview">${c.preview}</div>
      </div>
      <div class="cn-version">v 1.2</div>
      <div class="cn-t">${c.time}</div>
    </div>`).join('');

  slot.innerHTML = `
    <div class="eyebrow">Deliverable 05 · Factory scope · The constitution</div>
    <h1>Some knowledge is the operating system.</h1>
    <p class="lede">
      The <strong>Factory</strong> scope holds a small number of items that describe <em>how the studio itself runs</em> — routing rules, cadence, domain ownership, values. They're read by every agent on every task. Changing one ripples everywhere. The UI treats them accordingly: serif titles, wider rows, permanent version pills, no inline edit.
    </p>

    <h3>Final mockup</h3>
    <div class="dlv-frame-scroll"><div class="dlv-frame shell-4">
      ${kbIconRail('know')}
      ${kbSubmenu({ scope: 'factory', activeTopic: 'principles', activeSub: null })}
      <main class="main" style="padding:24px 32px; overflow-y: auto;">

        <div class="kb-list-head" style="margin-bottom:18px;">
          <div>
            <h2><span class="scope-pre">Factory /</span>First principles</h2>
            <div class="kb-list-sub" style="margin-top:6px;">12 items · read by every agent on every task · v 1.2 · ratified Feb 04 2025</div>
          </div>
          <div class="kb-tabs">
            <button class="active">Constitution</button>
            <button>Amendments <span class="badge-n" style="background:var(--surface-3);color:var(--text-mid);">2</span></button>
          </div>
        </div>

        ${banner}

        ${rows}

        <div style="margin-top:24px;padding:14px 18px;background:var(--surface-1);border-radius:var(--r-box);box-shadow:inset 0 0 0 1px var(--surface-3);">
          <div style="font-family:var(--font-mono);font-size:10px;letter-spacing:0.12em;text-transform:uppercase;color:var(--text-lo);margin-bottom:10px;">Pending amendments · 2</div>
          <div style="display:flex;flex-direction:column;gap:8px;">
            <div style="display:flex;align-items:center;gap:12px;padding:10px 12px;background:var(--surface-2);border-radius:var(--r-btn);">
              <span style="font-family:'Playfair Display',Georgia,serif;font-size:14px;color:var(--text-hi);font-weight:600;flex:1;">§ 07 · Cross-product knowledge flows up, not sideways</span>
              <span class="wchip behind"><span class="dot"></span>IN REVIEW · 36h left</span>
              <span style="font-family:var(--font-mono);font-size:10px;color:var(--text-lo);">proposed by MA</span>
            </div>
            <div style="display:flex;align-items:center;gap:12px;padding:10px 12px;background:var(--surface-2);border-radius:var(--r-btn);">
              <span style="font-family:'Playfair Display',Georgia,serif;font-size:14px;color:var(--text-hi);font-weight:600;flex:1;">§ 03 · Domain ownership — add "Ayla: legal, finance"</span>
              <span class="wchip healthy"><span class="dot"></span>DRAFT</span>
              <span style="font-family:var(--font-mono);font-size:10px;color:var(--text-lo);">proposed by RN</span>
            </div>
          </div>
        </div>

        <div style="height:40px"></div>
      </main>
      <aside class="rail-c">
        <button class="rail-toggle">${KI.collapse}</button>
      </aside>
    </div></div>

    <div class="dlv-caption from">
      <span class="src">From A</span>
      <div class="txt">
        <strong>Suggested factory deserves visual weight</strong> but didn't land it. Synthesis adopts that intent with constraints — no new tokens, no new primitives — only <em>density and typographic emphasis</em> change: serif titles (using <code>Playfair Display</code>, our heading fallback), wider row heights, permanent version pills, numbered sections.
      </div>
    </div>
    <div class="dlv-caption keep">
      <span class="src">From B</span>
      <div class="txt">
        <strong>Same tokens, same chip system.</strong> The pending-amendments strip at the bottom uses regular <code>StatusChip</code>s (<code>review</code>, <code>inprogress</code>) — proving the amendment workflow is just a <code>Knowledge</code> item with <code>scope: 'factory'</code> and <code>status: 'provisional'</code> being promoted to <code>active</code>. No new data model; the review timer is a client-side <code>proposedAt + 48h</code> calc.
      </div>
    </div>
    <div class="dlv-caption new">
      <span class="src">New · agreed today</span>
      <div class="txt">
        <strong>No inline edit on Factory items.</strong> The E-key shortcut that works on Practice and Product items is intercepted in Factory scope: it opens a "Propose amendment" form that creates a new <code>Knowledge</code> item with <code>scope: 'factory'</code> and <code>replaces: originalId</code>. On approval, the original flips to <code>deprecated</code> and the amendment flips to <code>active</code>. Version pills increment. <strong>This is the only scope-specific behavior</strong> — everything else stays identical to other scopes.
      </div>
    </div>
  `;
})();

/* ═════════ PANEL K6 · Merge modal ═════════ */
(function panelK6(){
  const slot = document.getElementById('k6-slot');
  if (!slot) return;

  const srcMeta = (src) => `
    <div class="mrg-col-meta">
      ${kindTag(src.kind)}
      ${statusChip(src.id === 'kb-a2' ? 'active' : src.id === 'kb-a4' ? 'stale' : 'stale')}
    </div>
    <div class="mrg-col-kv">
      <div class="l">Access</div><div class="v">${src.access} reads · 30d</div>
      <div class="l">Last edited</div><div class="v">${src.time}</div>
      <div class="l">Origin</div><div class="v">Agent KM</div>
      <div class="l">ID</div><div class="v" style="color:var(--text-lo);">${src.id}</div>
    </div>`;

  const preview = KB_MERGE_PREVIEW;

  slot.innerHTML = `
    <div class="eyebrow">Deliverable 06 · Merge modal</div>
    <h1>Two sources, one synthesis.</h1>
    <p class="lede">
      Selected when the curator accepts a merge suggestion. Three columns: <strong>Source A</strong>, <strong>Source B</strong>, <strong>Result</strong>. The result column is editable — title, body, metadata — with the two sources as the raw material. A warning strip surfaces anything the merge would break.
    </p>

    <h3>Final mockup</h3>
    <div class="dlv-frame-scroll"><div class="dlv-frame main-only" style="padding:48px 40px;background:rgba(8,10,14,0.4);">
      <div style="max-width:1100px;width:100%;margin:0 auto;">
        <div class="kb-merge">
          <div class="mrg-head">
            <div>
              <h2>Merge knowledge items</h2>
              <div class="sub">Proposed by facilitator-agent · 3 candidates → 1 result</div>
            </div>
            <button class="close">${KI.close}</button>
          </div>

          <div class="mrg-body">
            <div class="mrg-col">
              <div class="mrg-col-head">
                <span class="label">Source A · keep</span>
                <div style="flex:1"></div>
                <span style="font-family:var(--font-mono);font-size:10px;color:var(--text-lo);">Primary</span>
              </div>
              <div class="mrg-col-title">Never store refresh tokens in localStorage</div>
              ${srcMeta(KB_MERGE_SOURCES[0])}
              <div class="mrg-col-preview">
                XSS + long-lived credential = one compromised dependency breaks every user. Refresh tokens must live in httpOnly cookies with SameSite=Lax and a Secure flag. When a library requires access-token rotation, issue short-lived access tokens (15m) and rotate via the cookie-stored refresh token, never via client-readable storage…
              </div>
            </div>

            <div class="mrg-col">
              <div class="mrg-col-head">
                <span class="label">Source B · archive</span>
                <div style="flex:1"></div>
                <span style="font-family:var(--font-mono);font-size:10px;color:var(--chip-error-fg);">Stale 60d</span>
              </div>
              <div class="mrg-col-title">JWT rotation every 15 minutes — the outage</div>
              ${srcMeta(KB_MERGE_SOURCES[1])}
              <div class="mrg-col-preview">
                Aggressive 15-minute rotation saturated the refresh endpoint during cold-start (Feb 04 incident, 07:04–09:18 UTC). The refresh endpoint did a DB round-trip per rotation; at 8k active sessions with stale CDN caches, it pegged the primary. Reverted to 1h rotation after 4 days of degraded latency…
              </div>
            </div>

            <div class="mrg-col result">
              <div class="mrg-col-head">
                <span class="label">${KI.sparkle} Result · editable</span>
              </div>
              <div class="mrg-col-title editable">${preview.title}</div>
              <div class="mrg-col-meta">
                ${kindTag('pattern')}
                ${statusChip('active')}
                ${layerTag('L1')}
              </div>
              <div class="mrg-col-preview">
                <strong>When</strong> rotating session tokens: prefer opaque tokens over JWTs, store the refresh token in an httpOnly + Secure + SameSite=Lax cookie, and rotate on a <strong>1-hour cadence</strong>. Never store refresh credentials in localStorage — XSS breaks the whole session. Aggressive rotation (≤15 minutes) caused the Feb 04 outage; the refresh endpoint saturated under cold-start load…
              </div>
              <div class="mrg-col-kv" style="padding-top:6px;border-top:1px solid rgba(111,202,140,0.2);">
                <div class="l">Inherits from</div><div class="v" style="color:var(--chip-done-fg);">kb-a2 (primary), kb-a4, kb-a5</div>
                <div class="l">Preserves</div><div class="v">access history · incident refs</div>
                <div class="l">Author</div><div class="v">RN · facilitator-agent draft</div>
              </div>
            </div>
          </div>

          <div class="mrg-warn">
            <span class="ico">!</span>
            <div>
              <strong>7 incoming references</strong> to <code>kb-a4</code> and <code>kb-a5</code> will be rewritten to point at the merged item. Links from 3 agent conversations, 2 briefs, and 2 work threads. <a style="color:var(--chip-blocked-fg);text-decoration:underline;cursor:pointer;">Review references</a>.
            </div>
          </div>

          <div class="mrg-foot">
            <span class="hint">Merge creates a new item, archives the 2 sources with a redirect, and notifies agents that referenced them.</span>
            <button class="btn ghost">Cancel</button>
            <button class="btn ghost">Save as draft</button>
            <button class="btn primary">${KI.merge} Merge into new item</button>
          </div>
        </div>
      </div>
    </div></div>

    <div class="dlv-caption from">
      <span class="src">From A</span>
      <div class="txt">
        <strong>Three-column layout</strong> (Source A, Source B, Result), <strong>editable result column</strong>, <strong>warning strip</strong> for incoming-reference rewrites, <strong>diff-style badging</strong> on source columns (keep / archive), <strong>inherits-from + preserves metadata</strong> in the result column. This was A's most complete novel surface — keep it as-is.
      </div>
    </div>
    <div class="dlv-caption keep">
      <span class="src">From B</span>
      <div class="txt">
        <strong>No new primitives.</strong> Every chip is <code>StatusChip</code>, every tag is <code>Tag</code>. The three-column grid uses DaisyUI's grid utilities. The modal is a <code>&lt;dialog&gt;</code> element — the same pattern B already uses for confirm dialogs. Server-side the action is a single <code>mergeKnowledge(primaryId, [sourceIds], patch)</code> call; client-side it's an optimistic update like every other mutation.
      </div>
    </div>
    <div class="dlv-caption new">
      <span class="src">New · agreed today</span>
      <div class="txt">
        <strong>Reference rewriting.</strong> When a merge archives a source, any <code>[[kb-a4]]</code> references anywhere in the system (other items, conversations, work threads) rewrite to <code>[[merged-id]]</code>. This is why the warning strip counts 7 incoming references — they're scanned server-side before the merge runs. If any are in a Factory-scope item, the merge escalates to a 48h review window. <strong>A split modal</strong> (deliverable not drawn; inverse operation) uses the same 3-col shell with the middle column as the source and A/B as destinations.
      </div>
    </div>
  `;
})();

/* ═════════ PANEL · Critique ═════════ */
(function panelCrit(){
  const slot = document.getElementById('kb-crit-slot');
  if (!slot) return;

  const sevMap = {
    must:    { cls: 'red-dot', lbl: 'Must resolve' },
    build:   { cls: 'yel-dot', lbl: 'Resolve in build' },
    explore: { cls: 'grn-dot', lbl: 'Explore later' },
  };
  const item = (sev, title, body) => {
    const s = sevMap[sev];
    return `
    <div class="crit-item">
      <div class="crit-sev ${s.cls}">
        <span class="dot"></span>
        <span class="lbl">${s.lbl}</span>
      </div>
      <div class="crit-body">
        <div class="crit-title">${title}</div>
        <div class="crit-txt">${body}</div>
      </div>
    </div>`;
  };

  slot.innerHTML = `
    <div class="eyebrow">07 · Critique of this synthesis</div>
    <h1>Where this doc is wrong, or not yet right.</h1>
    <p class="lede">
      Self-critique before handoff. Three severities: <span class="crit-red">■ must resolve</span> blocks the build, <span class="crit-yel">■ resolve in build</span> is solvable during the build, <span class="crit-grn">■ explore later</span> is deferred to a later cycle. If you disagree with any of these, call it out before eng starts — some of these are genuinely uncertain calls that can go either way.
    </p>

    ${item('must', 'The attention-reason line is unowned — who computes it?',
      'Every Triage row has a "Why now" string. The reason is the signal. But the synthesis does not specify <em>who runs the scorer</em>: a scheduled server job? An agent that owns the knowledge-health loop? A client-side derivation from access timestamps? Each answer implies a different data shape and a different failure mode. The right call is probably: a <strong>server-side facilitator agent</strong> writes <code>attentionReason: string | null</code> into the item on every access event, client reads it raw. But this needs to be decided before build — a stubbed null on every row is worse than no Triage view at all.')}

    ${item('must', 'Factory-scope amendments bypass the merge modal entirely',
      'Deliverable 05 describes amendments as new items with <code>replaces: originalId</code>. Deliverable 06 is the merge modal. These two flows collide — what happens when someone tries to merge two active Factory items? The synthesis quietly assumes "you can\'t." But the modal doesn\'t know it\'s in Factory scope unless we pass scope through. Either: (a) the modal reads scope from the primary source and disables the confirm button with an explanation, or (b) merge-in-Factory is a separate flow. <strong>Recommend (a)</strong> — same surface, scope-aware guardrails.')}

    ${item('build', 'The kind variant on Tag is the only cross-app visual change',
      'Every other change in this synthesis is scoped to Knowledge. But kind-tinted tags require extending the shared <code>Tag</code> component in <code>packages/ui</code>. This is a 15-minute change, but it touches a primitive used by Work and Conversations. Mitigation: the variant is opt-in via <code>kind</code> prop — when unset, behavior is unchanged. Still, the PR should go through a visual-regression pass on every <code>Tag</code> usage before merging.')}

    ${item('build', 'Observation-log attribution requires a new "agent role" concept',
      'The detail page shows "facilitator · agent" next to observations. B has <code>agents</code> as a flat set — no roles. Introducing <code>Agent.role: \'facilitator\' | \'builder\' | \'researcher\' | ...</code> is a data-shape change. Options: (1) add the role enum and backfill existing agents, (2) render "agent" generically and let users learn the role contextually, (3) key role off the agent ID prefix (e.g. <code>facilitator-*</code>). <strong>Recommend (1)</strong> — it\'s a small change and the role is real, not cosmetic. But it does need a migration.')}

    ${item('build', 'The gap card\'s "agent reference count" is a new metric',
      '<code>topic.agentReferenceCount</code> isn\'t in B\'s data. To render the gap card on the API-shape topic, the server needs to count how many times agents referenced a topic string in the last N cycles — a text-analysis job, not a simple join. Build-time decision: ship gap cards without the counter first (just flag empty topics with a gap flag), add the counter in a follow-up when the job is ready.')}

    ${item('explore', 'Confidence is shown but never earned',
      'The detail hero shows a confidence bar at 0.82. Great if it\'s meaningful. But this synthesis doesn\'t specify how confidence is <em>computed</em> — a facilitator agent? A human rating? Accumulated from observation patterns? Rendering a bar with no concept behind it will make confidence feel decorative. Either ship it with a concrete source (access rate + recency + agent citations, scored 0–1) or hide it until the source exists. <strong>Prefer hiding</strong> until defined — dead UI is worse than missing UI.')}

    ${item('explore', 'Split modal is asserted, not drawn',
      'Deliverable 06 mentions "a split modal uses the same 3-col shell." True, probably. But split is non-trivial because the content has to be <em>partitioned</em>, not duplicated — and the partitioning logic is model-specific (pattern splits differently from a decision). Draw it next cycle, not this one.')}

    ${item('explore', 'Cross-scope merges are undefined',
      'Can you merge a Practice pattern with a Product brief? The synthesis says nothing. Probably no — the scopes mean different things — but the UI currently doesn\'t prevent it. Add a same-scope guard in the merge-picker, and revisit if a real use case emerges.')}

    ${item('explore', 'Observation logs could crowd the detail page',
      'On a heavily-accessed item, observations might accumulate to 50+. The current design puts them full-width in the body. Alternatives: collapse after 5 with "show all," move to a sidebar tab, or filter to "material" observations only. Test with real data before deciding.')}
  `;
})();

/* ═════════ PANEL · Implementation delta ═════════ */
(function panelDelta(){
  const slot = document.getElementById('kb-delta-slot');
  if (!slot) return;

  const rows = [
    {
      axis: '01 · Scope browser',
      files: [
        '<code>AppShell.tsx</code> — replace the single <code>NavItem label="All Items"</code> inside Knowledge <code>Submenu</code> with a new <code>&lt;KnowledgeSubmenu/&gt;</code> (scope selector + topic tree).',
        '<code>KnowledgeSubmenu.tsx</code> (NEW) — composes B\'s <code>Submenu</code>, <code>SearchField</code>, <code>NavItem</code>. Reads from <code>useKnowledgeScopes()</code>.',
      ],
      data: 'Adds <code>KnowledgeScope = \'practice\' | \'product\' | \'factory\'</code> to shared types. Every <code>Knowledge</code> item gains <code>scope</code> (default <code>practice</code>) and <code>topicId</code>.',
      tag: 'STRUCTURAL',
    },
    {
      axis: '02 · List structure',
      files: [
        '<code>KnowledgeList.tsx</code> — iterate grouped by <code>topic</code>; render <code>&lt;KnowledgeGroup/&gt;</code> wrappers around existing <code>&lt;KnowledgeRow/&gt;</code>s.',
        '<code>KnowledgeGroup.tsx</code> (NEW) — collapsible header + meta (count + stale count + layer).',
      ],
      data: 'No data change. Grouping happens client-side via <code>Object.groupBy(items, i => i.topicId)</code>.',
      tag: 'STRUCTURAL',
    },
    {
      axis: '03 · Kind-tinted tag variant',
      files: [
        '<code>Tag.tsx</code> (packages/ui) — accept <code>kind?: KnowledgeKind</code> prop. When set, apply kind-specific class + colored dot.',
        '<code>KnowledgeRow.tsx</code> — swap <code>&lt;Tag label={kind}/&gt;</code> for <code>&lt;Tag kind={kind}/&gt;</code>.',
        '<code>tokens.css</code> — add 8 kind-tint CSS variables (<code>--kind-pattern</code>, <code>--kind-anti-pattern</code>, etc.) matching the values in <code>knowledge-synth-styles.css</code>.',
      ],
      data: 'No data change. <code>KnowledgeKind</code> union already exists in <code>@hyperidle/shared</code>.',
      tag: 'BOTH',
    },
    {
      axis: '04 · Triage view',
      files: [
        '<code>KnowledgeList.tsx</code> — add a <code>view: \'curated\' | \'triage\'</code> state. Default to <code>triage</code> when <code>items.some(i =&gt; i.status === \'needs_human\')</code>.',
        '<code>KnowledgeTriage.tsx</code> (NEW) — renders rows with the reason line.',
        '<code>CurationCard.tsx</code> (NEW) — the facilitator-agent suggestion surface.',
        '<code>routes/knowledge/$topic.tsx</code> — tab-switcher UI.',
      ],
      data: '<code>Knowledge</code> gains <code>attentionReason?: string</code> and <code>attentionScore?: number</code>. <code>CurationSuggestion</code> is a new type: <code>{ id, kind: \'merge\' | \'split\' | \'capture_gap\', candidateIds, reason, proposedBy, createdAt }</code>.',
      tag: 'NEW',
    },
    {
      axis: '05 · Detail page',
      files: [
        '<code>KnowledgeDetail.tsx</code> — full rewrite. Uses <code>&lt;Hero/&gt;</code> + <code>&lt;ActionBar/&gt;</code> + <code>&lt;Body/&gt;</code> + <code>&lt;Sidebar/&gt;</code> composition. All children use existing primitives (<code>Tag</code>, <code>StatusChip</code>, <code>KeyValue</code>).',
        '<code>MarkdownBody.tsx</code> (NEW) — thin wrapper around <code>react-markdown</code>. Add dep if missing.',
        '<code>ObservationLog.tsx</code> (NEW) — renders <code>item.observations[]</code>.',
        '<code>EditHistory.tsx</code> (NEW) — renders <code>item.history[]</code>.',
      ],
      data: '<code>Knowledge</code> gains <code>observations: KnowledgeObservation[]</code>, <code>history: KnowledgeEdit[]</code>, <code>confidence?: number</code>, <code>related: KnowledgeRelation[]</code>, <code>linkedWorkIds: string[]</code>. All additive; existing items default to empty arrays.',
      tag: 'STRUCTURAL',
    },
    {
      axis: '05b · Detail edit mode',
      files: [
        '<code>KnowledgeDetail.tsx</code> — add <code>editing: boolean</code> state. <code>E</code> key toggles; <code>Esc</code> + <code>⌘⏎</code> commit.',
        '<code>KnowledgeEditor.tsx</code> (NEW) — markdown textarea with toolbar + autosave (debounced 3s).',
        '<code>ReferencePicker.tsx</code> (NEW) — <code>[[...]]</code> inline autocomplete.',
      ],
      data: 'No schema change. <code>updateKnowledge(id, patch)</code> action already exists.',
      tag: 'NEW',
    },
    {
      axis: '06 · Factory scope',
      files: [
        '<code>KnowledgeList.tsx</code> — when <code>scope === \'factory\'</code>, render <code>&lt;FactoryItem/&gt;</code> instead of <code>&lt;KnowledgeRow/&gt;</code>.',
        '<code>FactoryItem.tsx</code> (NEW) — wider row, serif title, version pill.',
        '<code>FactoryBanner.tsx</code> (NEW) — "Amendable under review" strip.',
        '<code>KnowledgeDetail.tsx</code> — intercept <code>E</code> in factory scope → open <code>ProposeAmendmentModal</code>.',
        '<code>ProposeAmendmentModal.tsx</code> (NEW) — creates a new item with <code>replaces: originalId</code>.',
      ],
      data: '<code>Knowledge</code> gains <code>replaces?: string</code> and <code>version?: string</code>. Factory items auto-flip status via the amendment workflow — no new state machine, just existing status transitions gated on scope.',
      tag: 'NEW',
    },
    {
      axis: '07 · Attention score',
      files: [
        '<code>KnowledgeRow.tsx</code> — render <code>attentionReason</code> under the title when <code>view === \'triage\'</code>.',
        '<em>(server)</em> <code>facilitator-agent/attention-scorer.ts</code> (NEW) — periodic job that writes <code>attentionReason</code> onto every item.',
      ],
      data: 'Covered by Axis 04. The field is a string; the computation lives server-side. Client never sees the score.',
      tag: 'NEW',
    },
    {
      axis: '+ Merge modal',
      files: [
        '<code>MergeKnowledgeModal.tsx</code> (NEW) — 3-col <code>&lt;dialog&gt;</code>, editable result column.',
        '<code>mergeKnowledge(primaryId, sourceIds, patch)</code> action (server + client) — archives sources, creates new item with <code>inheritsFrom: [sourceIds]</code>, rewrites <code>[[ref]]</code>s.',
        '<code>routes/knowledge/_actions.ts</code> — wire the action.',
      ],
      data: '<code>Knowledge</code> gains <code>inheritsFrom?: string[]</code> and <code>archivedInto?: string</code> (redirect target). Reference rewriting is a server-side text-replace pass, guarded by a dry-run first.',
      tag: 'NEW',
    },
  ];

  const tagColor = (t) => t === 'NEW' ? 'var(--chip-review-fg)'
                     : t === 'STRUCTURAL' ? 'var(--chip-inprogress-fg)'
                     : 'var(--chip-done-fg)';

  slot.innerHTML = `
    <div class="eyebrow">08 · Implementation delta</div>
    <h1>Every change, mapped to a file.</h1>
    <p class="lede">
      One row per axis from the comparison table. Each row names the specific files in <code>packages/web/src</code> that change, the data-shape impact on <code>@hyperidle/shared</code>, and a tag: <strong>STRUCTURAL</strong> (composition change only), <strong>BOTH</strong> (touches a shared primitive), or <strong>NEW</strong> (net new component or data).
    </p>

    <div style="display:flex;flex-direction:column;gap:12px;margin-top:20px;">
      ${rows.map(r => `
        <div style="background:var(--surface-1);border-radius:var(--r-box);padding:18px 22px;box-shadow:inset 0 0 0 1px var(--surface-3);">
          <div style="display:flex;align-items:baseline;gap:12px;margin-bottom:12px;">
            <h3 style="font-family:var(--font-heading);font-size:15px;font-weight:600;color:var(--text-hi);margin:0;letter-spacing:-0.005em;flex:1;">${r.axis}</h3>
            <span style="font-family:var(--font-mono);font-size:9px;letter-spacing:0.14em;color:${tagColor(r.tag)};font-weight:600;padding:3px 8px;border-radius:3px;background:var(--surface-2);box-shadow:inset 0 0 0 1px ${tagColor(r.tag)};">${r.tag}</span>
          </div>
          <div style="display:grid;grid-template-columns:90px 1fr;gap:10px 18px;font-size:12.5px;line-height:1.65;color:var(--text-mid);">
            <div style="font-family:var(--font-mono);font-size:10px;letter-spacing:0.12em;text-transform:uppercase;color:var(--text-lo);padding-top:2px;">Files</div>
            <ul style="margin:0;padding-left:18px;">
              ${r.files.map(f => `<li style="margin-bottom:5px;">${f}</li>`).join('')}
            </ul>
            <div style="font-family:var(--font-mono);font-size:10px;letter-spacing:0.12em;text-transform:uppercase;color:var(--text-lo);padding-top:2px;">Data</div>
            <div>${r.data}</div>
          </div>
        </div>`).join('')}
    </div>

    <div style="margin-top:32px;padding:18px 22px;background:var(--surface-2);border-radius:var(--r-box);">
      <div style="font-family:var(--font-heading);font-size:14px;font-weight:600;color:var(--text-hi);margin-bottom:8px;">Sequencing</div>
      <ol style="margin:0;padding-left:22px;font-size:13px;line-height:1.7;color:var(--text-mid);">
        <li><strong>Cycle 1 · plumbing.</strong> Axis 01 + 02 + 03 + 05. Ship grouped list + kind-tinted tags + rewritten detail page with observation logs. No Triage, no Factory, no Merge yet.</li>
        <li><strong>Cycle 2 · intelligence.</strong> Axis 04 + 07. Stand up the facilitator agent. Wire <code>attentionReason</code> onto items. Ship the Triage view + Curation cards.</li>
        <li><strong>Cycle 3 · power.</strong> Axis 06 + 05b + Merge. Factory scope + edit mode + merge modal + reference rewriting.</li>
      </ol>
    </div>

    <div style="margin-top:20px;padding:14px 22px;background:transparent;border-radius:var(--r-box);box-shadow:inset 0 0 0 1px var(--surface-3);font-size:12px;color:var(--text-lo);line-height:1.65;">
      <strong style="color:var(--text-mid);">Risk register.</strong> &nbsp;The <em>one</em> axis with real migration cost is 05 — adding <code>observations</code>, <code>history</code>, <code>confidence</code>, <code>related</code> to every existing item. Additive + default-to-empty, but requires a migration pass on the 150-ish items currently in the KB. Budget half a day. Everything else is pure composition over existing primitives.
    </div>
  `;
})();
