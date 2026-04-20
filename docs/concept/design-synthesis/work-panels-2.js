/* work-panels-2.js — PitchSelector (w3), BetDetail (w4), critique, delta */

/* Tiny local copies of primitives to avoid cross-file deps. */
function _wchip(status, label) {
  const l = (label || status).toUpperCase();
  return `<span class="wchip ${status}"><span class="dot"></span>${l}</span>`;
}
function _wtag(label) { return `<span class="wtag">${label}</span>`; }

/* ═══════════ Panel W3 · PitchSelector with detail pane ═══════════ */
(function panelPitchSelector() {
  const slot = document.getElementById('w3-slot');
  if (!slot) return;

  const pitches = [
    { id: 'p1', title: 'Mobile responsive layout', kind: 'Product',
      status: 'shaped', proposer: 'Designer Agent', appetite: '2 weeks',
      hypothesis: 'Director uses the surface from phone during 1:1s but the three-column layout forces horizontal scroll.',
      selected: true,
      problem: 'The current WorkTeam layout assumes ≥1280px viewport. On a 390px phone the Canvas and Kanban both require horizontal scrolling, making the morning check effectively desktop-only. Observed in 3 director sessions over the last cycle.',
      appetiteReason: 'Small appetite because we already have a breakpoint system — this is a layout refactor, not new chrome.',
      solution: [
        'Collapse Canvas lanes into a tabbed single-column below 900px',
        'Kanban becomes a vertical accordion with current column expanded',
        'Bet cards keep all their info; only the canvas container flexes',
      ],
      rabbitHoles: [
        'Drag-and-drop across collapsed columns is out of scope — read-only on mobile',
        'Do NOT design a new mobile navigation — reuse existing topbar',
      ],
      noGos: [
        'Do not attempt PWA installability in this bet',
        'Do not change desktop layout',
      ],
    },
    { id: 'p2', title: 'Dark mode toggle', kind: 'Platform',
      status: 'shaped', proposer: 'Lumi Park', appetite: '1 week',
      hypothesis: 'Several agents work in low-light environments. A proper light-mode pass would help, but the tokens are already dark-first.',
    },
    { id: 'p3', title: 'Export to PDF', kind: 'Integration',
      status: 'shaped', proposer: 'MA', appetite: '3 weeks',
      hypothesis: 'Directors need to share bet summaries with stakeholders outside the tool.',
    },
    { id: 'p4', title: 'Bet dependency graph', kind: 'Feature',
      status: 'shaped', proposer: 'Jiro Sato', appetite: '4 weeks',
      hypothesis: 'When bet A depends on bet B shipping, the canvas hides the dependency and both look independently healthy.',
    },
    { id: 'p5', title: 'Scheduled cycle digest', kind: 'Platform',
      status: 'shaped', proposer: 'MA', appetite: '1 week',
      hypothesis: 'End-of-week summary email for stakeholders. Small.',
    },
    { id: 'p6', title: 'Per-agent cost budgets', kind: 'Platform',
      status: 'shaped', proposer: 'Kenji Ota', appetite: '2 weeks',
      hypothesis: 'Individual agents should throw a warning at 80% of their cycle budget.',
    },
  ];

  const selected = pitches.find(p => p.selected);

  const listHtml = pitches.map(p => `
    <div class="pitch-card ${p.selected ? 'selected' : ''}" data-pitch="${p.id}">
      <div class="pc-head">
        <span class="pc-title">${p.title}</span>
        ${_wtag(p.kind)}
        ${p.selected ? '<span class="pc-check">✓</span>' : ''}
      </div>
      <div class="pc-hyp">${p.hypothesis}</div>
      <div class="pc-foot">
        <span class="proposer">${p.proposer}</span>
        <span>${p.appetite}</span>
      </div>
    </div>`).join('');

  slot.innerHTML = `
    <div class="eyebrow">Deliverable 03 · PitchSelector · with detail pane</div>
    <h1>Reading a pitch before you bet on it.</h1>
    <p class="lede">
      Version B's <code>PitchSelector.tsx</code> is a scrollable list with a ✓ marker — it treats bet selection as filtering. But committing capacity is <strong>the</strong> most consequential decision the team makes in a cycle. The list should be a <em>menu</em>, and selecting a pitch should reveal <em>enough to make the call</em>: the problem, the appetite reasoning, the solution sketch, and — critically — the rabbit holes and no-goes.
    </p>
    <h3>Final mockup</h3>
    <div class="dlv-frame-scroll">
      <div class="dlv-frame" style="min-width: 1200px; height: auto; padding: 20px 24px; display: flex; flex-direction: column; gap: 16px;">
        <div style="display:flex; align-items:baseline; justify-content:space-between;">
          <h2 style="font-family: var(--font-heading); font-size: 20px; color: var(--text-hi); font-weight: 600; letter-spacing: -0.01em; margin: 0;">
            Pitches &nbsp;<span style="color: var(--text-lo); font-weight: 400;">· Select what to commit</span>
          </h2>
          <div style="display: flex; gap: 10px; align-items:center;">
            <span style="font-family: var(--font-mono); font-size: 10px; letter-spacing: 0.1em; text-transform: uppercase; color: var(--text-lo);">
              <span style="color: var(--text-hi); font-weight: 600;">1</span> selected · <span style="color: var(--text-hi); font-weight: 600;">1</span> slot available
            </span>
            <button style="padding: 7px 14px; background: var(--surface-2); color: var(--text-mid); border-radius: var(--r-btn); font-family: var(--font-heading); font-weight: 600; font-size: 11px; cursor: pointer; box-shadow: inset 0 0 0 1px var(--surface-3);">Close</button>
          </div>
        </div>

        <div class="pitch-selector">
          <!-- LEFT: list -->
          <div class="ps-list">
            <div class="ps-list-head">
              <h4>Shaped pitches</h4>
              <span class="c">${pitches.length}</span>
            </div>
            <div class="ps-search">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>
              <span>Search pitches…</span>
            </div>
            ${listHtml}
          </div>

          <!-- RIGHT: detail -->
          <div class="ps-detail">
            <div>
              <div style="display: flex; align-items: center; gap: 10px; margin-bottom: 6px;">
                ${_wtag(selected.kind)}
                ${_wchip('paused', 'SHAPED')}
                <span style="font-family: var(--font-mono); font-size: 10px; letter-spacing: 0.06em; color: var(--text-lo); margin-left: auto;">
                  Proposed ${selected.proposer} · 2 days ago
                </span>
              </div>
              <h2>${selected.title}</h2>
            </div>

            <div class="ps-meta">
              <div><span>APPETITE</span> <span class="v">${selected.appetite}</span></div>
              <div><span>CAPACITY</span> <span class="v">1 designer + 1 dev</span></div>
              <div><span>COST CEILING</span> <span class="v">$40</span></div>
              <div><span>PROPOSER</span> <span class="v">${selected.proposer}</span></div>
            </div>

            <div class="ps-section">
              <h5>Problem</h5>
              <p>${selected.problem}</p>
            </div>

            <div class="ps-section">
              <h5>Why this appetite</h5>
              <p>${selected.appetiteReason}</p>
            </div>

            <div class="ps-section">
              <h5>Solution sketch</h5>
              <ul>
                ${selected.solution.map(s => `<li>${s}</li>`).join('')}
              </ul>
            </div>

            <div class="ps-section">
              <h5>Rabbit holes</h5>
              <ul>
                ${selected.rabbitHoles.map(s => `<li>${s}</li>`).join('')}
              </ul>
            </div>

            <div class="ps-section">
              <h5>No-goes</h5>
              <ul>
                ${selected.noGos.map(s => `<li>${s}</li>`).join('')}
              </ul>
            </div>

            <div class="ps-actions">
              <button class="btn primary">Commit this pitch &nbsp;→</button>
              <button class="btn ghost">Ask a question</button>
              <button class="btn ghost">Defer to next cycle</button>
            </div>
          </div>
        </div>
      </div>
    </div>

    <div class="dlv-caption keep">
      <span class="src">From B</span>
      <div class="txt">
        <strong>Not a modal — a page surface.</strong> The PitchSelector replaces the Kanban region below the Canvas rather than floating on top. The &ldquo;Close&rdquo; button returns to the task board. This is <em>already</em> how <code>PitchSelector.tsx</code> and its conditional render in <code>WorkTeam.tsx</code> work — we just make that more legible by showing it flush against the Canvas.
        <strong>List search affordance.</strong> The <code>SearchField</code> above the list is exactly per the existing implementation in <code>PitchSelector.tsx</code>.
        <strong>✓ marker on selected cards.</strong> Preserve the visual treatment from <code>PitchCard.tsx</code> — blue tint, left-side checkmark, ✓ icon.
        <strong>StatusChip on the detail header.</strong> <code>paused = SHAPED</code> per <code>BET_STATUS_MAP</code>. Neutral grey — it's not in progress yet.
      </div>
    </div>
    <div class="dlv-caption from">
      <span class="src">New · from A's instinct</span>
      <div class="txt">
        <strong>Two-pane split view.</strong> B's current PitchSelector is a single-column list — clicking a card toggles the ✓ but shows no detail. To commit, you rely on whatever the 1-line hypothesis said. The split-pane (320px list + flexible detail) lets the director scan the list <em>and</em> read the full Shape Up pitch. It's the same affordance as &ldquo;inbox + preview&rdquo; that every mail client uses because it's the right pattern for &ldquo;pick one thing from many.&rdquo;
        <strong>Full pitch schema, not just hypothesis.</strong> Shape Up pitches have a standard shape: Problem → Appetite → Solution → Rabbit holes → No-goes. Stuffing this into a single <code>hypothesis</code> string loses the most important parts (the rabbit holes and no-goes are what <em>prevent scope creep</em>, and they're exactly what gets lost when you commit blind). We persist this as structured fields on the <code>Pitch</code> type in <code>data/types.ts</code>.
        <strong>Three actions, not one button.</strong> The &ldquo;Commit&rdquo; CTA is primary. But &ldquo;Ask a question&rdquo; (opens a conversation against the proposer) and &ldquo;Defer to next cycle&rdquo; (marks the pitch for carry-over) cover the other two things directors actually do in this moment. A single commit button forces fake-agreement.
        <strong>Meta row as KeyValue grid.</strong> Appetite + capacity + cost ceiling + proposer — four scannable facts across the top of the detail pane, matching the <code>&lt;KeyValue /&gt;</code> primitive used throughout Version B. The cost ceiling is new and comes from the agent-cost system already tracked on tasks.
      </div>
    </div>`;
})();

/* ═══════════ Panel W4 · Bet detail page ═══════════ */
(function panelBetDetail() {
  const slot = document.getElementById('w4-slot');
  if (!slot) return;

  const tasks = [
    { title: 'Implement login endpoint', owner: 'Dev Agent 1', state: 'in_progress',
      stateChip: 'healthy', stateLabel: 'IN PROGRESS', cost: '$4.20', estCost: '$5.00', deps: '—' },
    { title: 'Design signup form', owner: 'Dev Agent 2', state: 'accepted',
      stateChip: 'paused', stateLabel: 'ACCEPTED', cost: '$1.80', estCost: '$2.50', deps: '—' },
    { title: 'JWT refresh logic', owner: 'Dev Agent 1', state: 'review',
      stateChip: 'behind', stateLabel: 'REVIEW', cost: '$6.50', estCost: '$4.00', deps: 'T-001' },
    { title: 'Password reset flow', owner: 'Dev Agent 2', state: 'accepted',
      stateChip: 'paused', stateLabel: 'ACCEPTED', cost: '$2.40', estCost: '$3.00', deps: 'T-001' },
    { title: 'Auth integration tests', owner: 'QA Agent', state: 'blocked',
      stateChip: 'blocked', stateLabel: 'BLOCKED', cost: '$0.00', estCost: '$4.00', deps: 'T-003' },
    { title: 'Fixture helpers + seeds', owner: 'QA Agent', state: 'done',
      stateChip: 'done', stateLabel: 'DONE', cost: '$3.10', estCost: '$3.00', deps: '—' },
    { title: 'Rate-limit on signup', owner: 'Dev Agent 1', state: 'accepted',
      stateChip: 'paused', stateLabel: 'ACCEPTED', cost: '$0.80', estCost: '$2.00', deps: 'T-001' },
    { title: 'Audit log schema', owner: 'Infra Agent', state: 'in_progress',
      stateChip: 'healthy', stateLabel: 'IN PROGRESS', cost: '$1.80', estCost: '$2.00', deps: '—' },
  ];

  const totalCost = 20.60;
  const budget = 40.00;

  slot.innerHTML = `
    <div class="eyebrow">Deliverable 04 · WorkBet · detail page</div>
    <h1>Scan, and then understand.</h1>
    <p class="lede">
      The board surfaces <em>status</em>; the bet page surfaces <em>substance</em>. Same data model, denser layout, and the pitch body + comment thread that got lost when Version B shipped <code>WorkBet.tsx</code> as a thin task list.
    </p>
    <h3>Final mockup</h3>
    <div class="dlv-frame-scroll">
      <div class="dlv-frame" style="min-width: 1200px; height: auto;">
        <div class="bet-detail">
          <div class="bet-bc">
            <a>HyperIdle</a>
            <span class="sep">/</span>
            <a>Team</a>
            <span class="sep">/</span>
            <span class="cur">User auth flow</span>
          </div>

          <div class="bet-hero">
            <div class="bh-head">
              ${_wtag('HyperIdle')}
              ${_wchip('healthy', 'ON TRACK')}
              <h1 class="bh-title">User authentication flow</h1>
              <button style="padding: 7px 14px; background: var(--surface-2); color: var(--text-mid); border-radius: var(--r-btn); font-family: var(--font-heading); font-weight: 600; font-size: 11px; cursor: pointer; box-shadow: inset 0 0 0 1px var(--surface-3);">Open pitch source ↗</button>
            </div>

            <div class="bh-progress"><div class="fill" style="width:62%"></div></div>

            <div class="bh-stats">
              <div class="bh-stat">
                <div class="l">Appetite</div>
                <div class="v">2 weeks <span class="sub">week 4 of 6</span></div>
              </div>
              <div class="bh-stat">
                <div class="l">Progress</div>
                <div class="v">5 / 8 <span class="sub">62%</span></div>
              </div>
              <div class="bh-stat">
                <div class="l">Cost spent</div>
                <div class="v">$${totalCost.toFixed(2)} <span class="sub">of $${budget.toFixed(0)}</span></div>
              </div>
              <div class="bh-stat">
                <div class="l">Team</div>
                <div class="v">
                  <div style="display: inline-flex; gap: -4px;">
                    <span style="width: 24px; height: 24px; border-radius: 50%; background: linear-gradient(135deg, #3a3430, #252020); display: inline-grid; place-items: center; font-family: var(--font-mono); font-size: 10px; font-weight: 600; color: var(--text-hi); box-shadow: 0 0 0 2px var(--surface-1); margin-right: -6px;">D1</span>
                    <span style="width: 24px; height: 24px; border-radius: 50%; background: linear-gradient(135deg, #2a3540, #1a2030); display: inline-grid; place-items: center; font-family: var(--font-mono); font-size: 10px; font-weight: 600; color: var(--chip-inprogress-fg); box-shadow: 0 0 0 2px var(--surface-1); margin-right: -6px;">D2</span>
                    <span style="width: 24px; height: 24px; border-radius: 50%; background: linear-gradient(135deg, #3a3040, #2a2030); display: inline-grid; place-items: center; font-family: var(--font-mono); font-size: 10px; font-weight: 600; color: var(--chip-review-fg); box-shadow: 0 0 0 2px var(--surface-1);">QA</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <!-- Pitch body -->
          <div class="bet-section">
            <h3>Pitch</h3>
            <div class="pitch-body">
              <h4>Problem</h4>
              <p>Every Factory install re-invents auth. The current demo uses a <code>localStorage</code> token that expires without warning and has no refresh semantics — tolerable for a demo, unacceptable the moment a real team logs in.</p>

              <h4>Appetite &middot; 2 weeks</h4>
              <p>We're not building an IdP. This is glue: username + password, JWT with refresh, password reset email. If the work overshoots two weeks, kill it and re-shape. Do not extend.</p>

              <h4>Solution</h4>
              <ul>
                <li>Server issues a short-lived access token (15 min) and a long-lived refresh token (14 days).</li>
                <li>The web client holds the refresh token in <strong>httpOnly cookie</strong>; the access token in memory only.</li>
                <li>Password reset is a <strong>signed-link</strong> flow. No security questions.</li>
                <li>Rate-limiting at the edge (see dependent bet &mdash; <em>RateLimit middleware</em>).</li>
              </ul>

              <h4>Rabbit holes</h4>
              <ul>
                <li><strong>Don't</strong> build a session management UI. Logout is one POST; that's the UI.</li>
                <li><strong>Don't</strong> integrate with OAuth providers in this bet. Username + password, period.</li>
                <li><strong>Don't</strong> build 2FA. That's its own bet after this one ships.</li>
              </ul>

              <h4>No-goes</h4>
              <ul>
                <li>No custom crypto. <code>argon2id</code> via <code>node-argon2</code>.</li>
                <li>No refresh-token rotation in this bet &mdash; single refresh until expiry. Rotation is a later bet.</li>
              </ul>
            </div>
          </div>

          <!-- Task table -->
          <div class="bet-section">
            <h3>Tasks</h3>
            <div class="task-table">
              <div class="tt-hd"></div>
              <div class="tt-hd">Task</div>
              <div class="tt-hd">Owner</div>
              <div class="tt-hd">State</div>
              <div class="tt-hd">Cost · est</div>
              <div class="tt-hd">Deps</div>

              ${tasks.map(t => {
                const blockedCls = t.state === 'blocked' ? 'blocked-row' : '';
                const dotColor = t.stateChip === 'healthy' ? 'var(--chip-inprogress-fg)' :
                                t.stateChip === 'blocked' ? 'var(--chip-blocked-fg)' :
                                t.stateChip === 'behind' ? 'var(--chip-review-fg)' :
                                t.stateChip === 'done' ? 'var(--chip-done-fg)' :
                                'var(--text-lo)';
                return `
                  <div class="tt-cell ${blockedCls}" style="justify-content: center;">
                    <span class="dot" style="background: ${dotColor};"></span>
                  </div>
                  <div class="tt-cell title ${blockedCls}">${t.title}</div>
                  <div class="tt-cell ${blockedCls}">${t.owner}</div>
                  <div class="tt-cell ${blockedCls}">${_wchip(t.stateChip, t.stateLabel)}</div>
                  <div class="tt-cell cost ${blockedCls}">${t.cost} <span style="color: var(--text-lo); margin: 0 4px;">/</span> ${t.estCost}</div>
                  <div class="tt-cell cost ${blockedCls}">${t.deps}</div>
                `;
              }).join('')}
            </div>
          </div>

          <!-- Comments -->
          <div class="bet-section">
            <h3>Discussion · 4</h3>
            <div class="comment-thread">
              <div class="comment-item">
                <div class="avatar">MA</div>
                <div>
                  <div class="cm-head">
                    <span class="name">MA</span>
                    <span class="role">Director</span>
                    <span class="t">2 days ago</span>
                  </div>
                  <div class="cm-body">
                    The rate-limit dep is blocking <code>Auth integration tests</code>. Can we land a stub so tests unblock while <strong>RateLimit</strong> finishes shaping?
                  </div>
                </div>
              </div>

              <div class="comment-item">
                <div class="avatar agent">D1</div>
                <div>
                  <div class="cm-head">
                    <span class="name">Dev Agent 1</span>
                    <span class="role">Agent</span>
                    <span class="t">1 day ago</span>
                  </div>
                  <div class="cm-body">
                    Stub shipped in <code>middleware/rate-limit.stub.ts</code>. Always allows. QA tests unblocked — moving <code>Auth integration tests</code> out of Blocked.
                  </div>
                </div>
              </div>

              <div class="comment-item">
                <div class="avatar agent">QA</div>
                <div>
                  <div class="cm-head">
                    <span class="name">QA Agent</span>
                    <span class="role">Agent</span>
                    <span class="t">18 hours ago</span>
                  </div>
                  <div class="cm-body">
                    Confirmed. Test suite green locally. One flake on password-reset (timing-sensitive). Filed as a task under this bet rather than a new one — hope that's ok.
                  </div>
                </div>
              </div>

              <div class="comment-item">
                <div class="avatar">MA</div>
                <div>
                  <div class="cm-head">
                    <span class="name">MA</span>
                    <span class="role">Director</span>
                    <span class="t">12 hours ago</span>
                  </div>
                  <div class="cm-body">
                    Correct. Sub-task under the bet is right. If the flake won't resolve in 4 hrs, kill it — rotation/signed-link timing is a rabbit hole we said we wouldn't enter this cycle.
                  </div>
                </div>
              </div>
            </div>

            <div class="comment-input">
              <textarea placeholder="Reply to thread…"></textarea>
              <button class="send">Send</button>
            </div>
          </div>
        </div>
      </div>
    </div>

    <div class="dlv-caption keep">
      <span class="src">From B</span>
      <div class="txt">
        <strong>BetCard-as-hero at the top.</strong> The <code>.bet-hero</code> is a scaled-up BetCard — same Tag + StatusChip + progress bar as in Canvas, just sized for a page hero. The visual language carries across surfaces.
        <strong>TaskCard semantics preserved in table form.</strong> The state dot on the left matches <code>TASK_STATE_MAP</code> colors. Blocked row tinted red. Cost column mirrors the existing <code>cost</code> prop. The state column is a full <code>StatusChip</code>, not a plain text label.
      </div>
    </div>
    <div class="dlv-caption from">
      <span class="src">New · from A</span>
      <div class="txt">
        <strong>Pitch body markdown block.</strong> Rendered from a new <code>bet.pitch</code> field (JSON markdown string). This single addition is the biggest unlock: right now team members can't read why a bet was framed the way it was without leaving the tool to find the Notion/doc. The bet page becomes the source of truth.
        <strong>Task <em>table</em> not stack of cards.</strong> On the detail page, you're looking at one bet — 5–12 tasks — and you want to <em>compare</em> them. A table with sortable columns (owner, state, cost) is the right density here. Cards would be wasted space. The board keeps cards because there you're scanning across bets.
        <strong>Cost + est column.</strong> Shows <code>actual / estimated</code> spend. Over-budget rows go amber. This is a critical director signal — it's the first place you'd notice an agent silently burning budget on a task that should have been simple.
        <strong>Comment thread with agent vs human styling.</strong> Agent avatars get a blue tint, human avatars neutral. The thread is the <em>operational</em> surface for a bet — where &ldquo;unblock X&rdquo; / &ldquo;kill Y&rdquo; decisions actually get made.
        <strong>Breadcrumb.</strong> <code>HyperIdle / Team / User auth flow</code> — makes the hierarchy legible and allows back-navigation without relying on browser back.
        <strong>Progress bar in hero.</strong> Reuses the BetCard progress bar treatment, scaled up. The week counter (<code>week 4 of 6</code>) under appetite adds time-axis context — &ldquo;5 of 8&rdquo; tasks done is very different at week 2 than at week 6.
      </div>
    </div>`;
})();

/* ═══════════ Panel · Critique ═══════════ */
(function panelCritique() {
  const slot = document.getElementById('w-crit-slot');
  if (!slot) return;

  const items = [
    { sev: 'red-dot', sevLabel: 'MUST', title: 'Kill "cycle management card" as a hero',
      from: 'Version A',
      body: 'A promoted cycle management to a dedicated card equal-footing with products. That\'s wrong — cycle is context, not a product. The synthesis demotes it to a horizontal stripe below the product grid. If the stripe grows teeth (voting, retrospectives), promote to its own page, not its own card.' },
    { sev: 'red-dot', sevLabel: 'MUST', title: 'No four-lane Canvas',
      from: 'Version A',
      body: 'Two-lane Canvas is non-negotiable per HUMAN_INTERFACE_LAYER §4.3 and the @lore comment on Canvas.tsx. Shaped + Committed. Adding lanes for "in review" or "shipped" would turn it back into a Kanban, collapsing the Shape Up model. Shipped bets leave the canvas — they go to an archive/history surface.' },
    { sev: 'yel-dot', sevLabel: 'SHOULD', title: 'Watch the density on portfolio cards',
      from: 'This synthesis',
      body: '4 stats + sparkline + lead is close to the edge of what fits without feeling cramped. If a product name runs long (>28 chars) the StatusChip will wrap. Consider truncating product name with tooltip, OR forcing a 2-row layout on names that wrap.' },
    { sev: 'yel-dot', sevLabel: 'SHOULD', title: 'PitchSelector detail pane needs empty state',
      from: 'This synthesis',
      body: 'If zero pitches selected, the right pane is empty. Design a proper zero-state: "Select a pitch from the left to read the full proposal." Not a bug — just an obvious gap in the deliverable.' },
    { sev: 'yel-dot', sevLabel: 'SHOULD', title: 'Bet-grouped Kanban breaks with unassigned tasks',
      from: 'This synthesis',
      body: 'Tasks have optional <code>betTag</code>. Tasks without a betTag currently have no group to belong to in the grouped Kanban. Add an "Unassigned" group at the bottom of each column — OR require betTag on committed tasks (more aggressive schema change, probably correct).' },
    { sev: 'grn-dot', sevLabel: 'NICE', title: 'Sparkline hover states',
      from: 'Follow-up',
      body: 'Hovering a sparkline point should show the week and value in a tooltip. Doesn\'t block ship. Would make the cards more clickable.' },
    { sev: 'grn-dot', sevLabel: 'NICE', title: 'Cost-over-budget row styling in task table',
      from: 'Follow-up',
      body: 'Currently the task table has blocked-row styling but not over-budget styling. Amber tint when <code>actual > 1.2 × estimate</code>. Consistent with how Critique S3 handles cost on conversations.' },
    { sev: 'grn-dot', sevLabel: 'NICE', title: 'Keyboard drag on Canvas lanes (not just Kanban)',
      from: 'Follow-up',
      body: 'Alt+←/→ already works on Kanban columns. Same pattern for promoting shaped→committed would round out the keyboard story. Non-blocker; most commit operations happen via PitchSelector.' },
  ];

  slot.innerHTML = `
    <div class="eyebrow">05 · Critique</div>
    <h1>What I\'m worried about.</h1>
    <p class="lede">
      Three categories: <strong class="crit-red">must fix before build</strong>, <strong class="crit-yel">should solve in the sprint</strong>, <strong class="crit-grn">nice to have, queue for follow-up</strong>. The must-fixes are both about <em>Version A tried to add shape where B had already committed</em>.
    </p>

    <div class="crit-list">
      ${items.map(it => `
        <div class="crit-item">
          <div class="crit-sev ${it.sev}">
            <span class="dot"></span>
            <span class="lbl">${it.sevLabel}</span>
          </div>
          <div class="crit-body">
            <div class="crit-title">${it.title}</div>
            <div class="crit-from">From · ${it.from}</div>
            <div class="crit-txt">${it.body}</div>
          </div>
        </div>
      `).join('')}
    </div>
  `;
})();

/* ═══════════ Panel · Delta ═══════════ */
(function panelDelta() {
  const slot = document.getElementById('w-delta-slot');
  if (!slot) return;

  const rows = [
    { id: '01', file: 'web/src/routes/WorkPortfolio.tsx', tag: 'structural',
      change: 'Replace the current 3-card grid with a 4-card grid. Enrich product card to include lead avatar, shipped count, velocity %, and 14-week sparkline.',
      reason: 'Version B\'s card has 4 data points; the synthesis needs 7. Sparkline requires a new <Sparkline /> primitive in web/src/components/ or reuse an existing chart lib if one is in deps.' },
    { id: '02', file: 'web/src/routes/WorkPortfolio.tsx', tag: 'new',
      change: 'Add <CycleStripe /> component rendered below the product grid. Hosts cycle name, week counter, bet counts, phase chips (SHAPE/BET/BUILD/COOLDOWN), and an "Advance cycle" CTA.',
      reason: 'Cycle management has nowhere to live in B today. Stripe, not card — demoting visual weight vs. A\'s original design.' },
    { id: '03', file: 'web/src/components/BetCard.tsx', tag: 'visual',
      change: 'No logic changes. Add an optional week KV ("Week 3 of 6") next to Appetite when a week prop is supplied.',
      reason: 'Surface the time dimension alongside the work dimension on Canvas cards.' },
    { id: '04', file: 'web/src/components/Canvas.tsx', tag: 'visual',
      change: 'Replace text "N / C committed" badge with capacity-pip component (C squares, N filled). Preserve over-capacity warning — pips past C turn red.',
      reason: 'Capacity is the single most important constraint; it deserves a glance-level signal, not a text string.' },
    { id: '05', file: 'web/src/components/Canvas.tsx', tag: 'new',
      change: 'Add dashed <AddSlot /> card to the Committed lane when capacity remains. Wires to onOpenPitchSelector.',
      reason: 'Advertises the open slot — right now the open capacity is invisible unless you notice the badge.' },
    { id: '06', file: 'web/src/components/Kanban.tsx', tag: 'structural',
      change: 'Inside each column, group tasks by <code>betTag</code>. Add KcolBetGroup sub-component with a mono-uppercase group label and count. Tasks without betTag fall into an "Unassigned" group.',
      reason: 'Flat list becomes unusable past ~15 tasks. Group-by-bet is the density fix. See Critique S5 for unassigned-task edge case.' },
    { id: '07', file: 'web/src/components/Kanban.tsx', tag: 'visual',
      change: 'Surface the keyboard-drag shortcut (Alt+←/→) as a visible hint in the Kanban header with kbd chips.',
      reason: 'Shortcut exists in handleKeyDown but has no UI affordance. Discoverability fix.' },
    { id: '08', file: 'web/src/components/StatusChip.tsx', tag: 'nochange',
      change: 'None. STATUS_MAP preserved exactly: healthy/behind/blocked/paused/done/error.',
      reason: 'Primitive is correct. Every chip on every surface of this synthesis uses it as-is.' },
    { id: '09', file: 'web/src/components/TaskCard.tsx', tag: 'nochange',
      change: 'None. Blocked-border treatment preserved; optional betTag preserved.',
      reason: 'Correct primitive. The grouping/table treatments are at the container level, not on the card itself.' },
    { id: '10', file: 'web/src/components/PitchSelector.tsx', tag: 'structural',
      change: 'Split into <PitchList /> (left, 320px fixed) + <PitchDetail /> (right, flexible). Selected state becomes single-pitch "active detail," distinct from multi-select ✓ marks.',
      reason: 'Version B treats selection as filtering. Elevating to detail-preview turns the surface into a reading tool, not just a picker.' },
    { id: '11', file: 'web/src/data/types.ts', tag: 'structural',
      change: 'Extend Pitch type: add <code>problem</code>, <code>appetiteReason</code>, <code>solution: string[]</code>, <code>rabbitHoles: string[]</code>, <code>noGos: string[]</code>. Keep existing <code>hypothesis</code> as a short summary for list view.',
      reason: 'Full Shape Up pitch structure. Without rabbit-holes/no-goes persisted, they get lost on commit.' },
    { id: '12', file: 'web/src/components/PitchSelector.tsx', tag: 'new',
      change: 'Three actions in PitchDetail: "Commit this pitch" (primary), "Ask a question", "Defer to next cycle".',
      reason: 'B has one implicit action (toggle ✓). Explicit named actions map to director intent.' },
    { id: '13', file: 'web/src/routes/WorkBet.tsx', tag: 'structural',
      change: 'Rebuild page. Breadcrumb → BetHero (scaled BetCard + progress + 4-KV stats row) → PitchBody (markdown) → TaskTable → CommentThread.',
      reason: 'Current B implementation is BetCard + stack of TaskCards. Loses the pitch body and the discussion — the two reasons a director opens a bet page.' },
    { id: '14', file: 'web/src/components/TaskTable.tsx', tag: 'new',
      change: 'New component. Grid layout: status-dot, title, owner, state-chip, cost/est, deps. Blocked rows tinted. Used ONLY on the bet detail page — board keeps TaskCards.',
      reason: 'Denser read for "all tasks on one bet." Sortable headers. TaskCard would be wasted space here.' },
    { id: '15', file: 'web/src/components/CommentThread.tsx', tag: 'new',
      change: 'New component. Agent vs human avatar differentiation, markdown body, timestamp, threaded reply input.',
      reason: 'Operational surface for bet decisions. Reuse on Conversations detail once that surface exists.' },
    { id: '16', file: 'web/src/components/KeyValue.tsx', tag: 'nochange',
      change: 'None.',
      reason: 'Primitive works perfectly. Used in Canvas capacity, BetCard meta, BetHero stats, PitchDetail meta.' },
    { id: '17', file: 'docs/HUMAN_INTERFACE_LAYER.md', tag: 'structural',
      change: '§4.3 updated to reflect full pitch schema (5 fields) and bet-detail page structure. §4.5 new: "Cycle management as context, not card."',
      reason: 'Docs follow code. These two additions are the only behavioral changes in the spec.' },
  ];

  slot.innerHTML = `
    <div class="eyebrow">06 · Implementation delta</div>
    <h1>File-by-file.</h1>
    <p class="lede">
      Seventeen rows — every structural change needed to land this synthesis in <code>web/src</code>. Five primitives need no change. The real work is <em>three components</em> (CycleStripe, TaskTable, CommentThread) plus <em>two restructures</em> (PitchSelector split-pane, WorkBet rebuild).
    </p>

    <div class="delta-table">
      <div class="delta-row head">
        <div>#</div>
        <div>File</div>
        <div>Change</div>
        <div>Reason</div>
        <div>Tag</div>
      </div>
      ${rows.map(r => `
        <div class="delta-row">
          <div class="delta-id">${r.id}</div>
          <div class="delta-file">${r.file}</div>
          <div class="delta-change">${r.change}</div>
          <div class="delta-reason">${r.reason}</div>
          <div><span class="tag-d ${r.tag}">${r.tag}</span></div>
        </div>
      `).join('')}
    </div>

    <div style="margin-top: 28px; padding: 20px; background: var(--surface-2); border-radius: var(--r-box); font-size: 13px; color: var(--text-mid); line-height: 1.6; box-shadow: inset 0 0 0 1px var(--surface-3);">
      <div style="font-family: var(--font-mono); font-size: 10px; letter-spacing: 0.1em; text-transform: uppercase; color: var(--text-lo); margin-bottom: 8px;">Recommended sequence</div>
      <strong style="color: var(--text-hi)">Sprint 1 · Foundations.</strong> Rows 11 (Pitch type) + 16 + 17 first — types and docs. Then 03, 04, 07, 09 — small per-component upgrades.
      <br><br>
      <strong style="color: var(--text-hi)">Sprint 2 · Restructures.</strong> Rows 01, 02, 10, 12 — WorkPortfolio rebuild + PitchSelector split. Both ship together so the surfaces stay consistent.
      <br><br>
      <strong style="color: var(--text-hi)">Sprint 3 · WorkBet + new components.</strong> Rows 13, 14, 15 + 05, 06 — the bet page and grouped Kanban. The new components (TaskTable, CommentThread) should land first, then WorkBet consumes them.
    </div>
  `;
})();
