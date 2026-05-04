/* work-panels.js — Portfolio + Team/Canvas+Kanban deliverables */

/* ═══════════ Shared primitive renderers ═══════════ */

// StatusChip matching Version B's StatusChip.tsx exactly.
// status: "healthy" | "behind" | "blocked" | "paused" | "done" | "error"
function wchip(status, label) {
  const l = (label || status).toUpperCase();
  return `<span class="wchip ${status}"><span class="dot"></span>${l}</span>`;
}

// Tag — product or kind label (mono, uppercase).
function wtag(label) {
  return `<span class="wtag">${label}</span>`;
}

// KeyValue — the KeyValue primitive from Version B.
function wkv(label, value) {
  return `<div class="wkv"><span class="l">${label}</span><span class="v">${value}</span></div>`;
}

// BetCard — mirrors Version B's BetCard.tsx shape.
// { title, product, status, appetite, progress?, owner?, ownerInitials?, committedHighlight? }
function betCard(bet) {
  const klass = (bet.status === 'committed' ? 'committed' : '') +
                (bet.overCapacity ? ' over-capacity' : '');
  const pct = bet.progress ? Math.round(100 * bet.progress.done / bet.progress.total) : 0;
  return `
    <div class="bet-card ${klass}">
      <div class="bc-head">
        <span class="bc-title">${bet.title}</span>
        ${wtag(bet.product)}
        ${wchip(bet.statusChip || (bet.status === 'committed' ? 'healthy' : 'paused'))}
      </div>
      <div class="bc-meta">
        ${wkv('Appetite', bet.appetite)}
        ${bet.week ? wkv('Week', bet.week) : ''}
      </div>
      ${bet.progress ? `
        <div class="bc-progress">
          <div class="bar"><div class="fill" style="width:${pct}%"></div></div>
          <div class="labels">
            <span><strong>${bet.progress.done}</strong>/${bet.progress.total} tasks</span>
            <span>${pct}%</span>
          </div>
        </div>
      ` : ''}
      ${bet.ownerInitials ? `
        <div class="bc-owner">
          <div class="avatar">${bet.ownerInitials}</div>
          <span>${bet.owner}</span>
        </div>
      ` : ''}
    </div>`;
}

// TaskCard — mirrors Version B's TaskCard.tsx.
// { title, owner, state, cost?, betTag? }
function taskCard(task) {
  const stateToStatus = {
    proposed: 'paused', accepted: 'healthy', hold: 'paused',
    in_progress: 'healthy', blocked: 'blocked',
    review: 'behind', done: 'done', killed: 'error',
  };
  const stateLabel = { in_progress: 'IN PROGRESS', accepted: 'ACCEPTED',
    blocked: 'BLOCKED', review: 'REVIEW', done: 'DONE' };
  const chip = wchip(stateToStatus[task.state], stateLabel[task.state]);
  return `
    <div class="task-card ${task.state === 'blocked' ? 'blocked' : ''}">
      <div class="tc-head">
        <span class="tc-title">${task.title}</span>
        ${task.betTag ? wtag(task.betTag) : ''}
        ${chip}
      </div>
      <div class="tc-meta">
        <span class="owner">${task.owner}</span>
        ${task.cost ? `<span class="cost">${task.cost}</span>` : ''}
      </div>
    </div>`;
}

// PitchCard — mirrors Version B's PitchCard.tsx.
function pitchCard(pitch, selected) {
  return `
    <div class="pitch-card ${selected ? 'selected' : ''}" data-pitch="${pitch.id}">
      <div class="pc-head">
        <span class="pc-title">${pitch.title}</span>
        ${pitch.kind ? wtag(pitch.kind) : ''}
        ${selected ? '<span class="pc-check">✓</span>' : ''}
      </div>
      <div class="pc-hyp">${pitch.hypothesis}</div>
      <div class="pc-foot">
        <span class="proposer">${pitch.proposer}</span>
        <span>${pitch.appetite}</span>
      </div>
    </div>`;
}

// Sparkline SVG (14 weeks of data, trend-colored).
function sparkline(points, trend) {
  const max = Math.max(...points);
  const min = Math.min(...points);
  const range = max - min || 1;
  const w = 260; const h = 30;
  const step = w / (points.length - 1);
  const path = points.map((p, i) => {
    const x = i * step;
    const y = h - ((p - min) / range) * (h - 4) - 2;
    return `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(' ');
  const color = trend === 'up' ? 'var(--chip-done-fg)' :
                trend === 'down' ? 'var(--chip-error-fg)' :
                'var(--chip-inprogress-fg)';
  const fillColor = trend === 'up' ? 'rgba(111,202,140,0.15)' :
                    trend === 'down' ? 'rgba(233,133,133,0.15)' :
                    'rgba(109,171,224,0.15)';
  return `
    <svg viewBox="0 0 ${w} ${h}" preserveAspectRatio="none">
      <path d="${path} L${w},${h} L0,${h} Z" fill="${fillColor}"/>
      <path d="${path}" fill="none" stroke="${color}" stroke-width="1.5" stroke-linejoin="round"/>
    </svg>`;
}

/* ═══════════ Panel W1 · Portfolio overview ═══════════ */
(function panelPortfolio() {
  const slot = document.getElementById('w1-slot');
  if (!slot) return;

  const products = [
    { name: 'HyperIdle Core', lead: 'MA', leadInitials: 'MA', status: 'healthy',
      activeBets: 4, shipped: 12, velocityPct: '+18%', velocityTrend: 'up',
      spark: [32, 38, 35, 42, 40, 45, 44, 48, 52, 49, 54, 58, 62, 68] },
    { name: 'Knowledge Fabric', lead: 'JS', leadInitials: 'JS', status: 'behind',
      activeBets: 2, shipped: 7, velocityPct: '−4%', velocityTrend: 'down',
      spark: [48, 46, 52, 50, 48, 46, 44, 46, 42, 40, 44, 42, 40, 38] },
    { name: 'Review Workbench', lead: 'LP', leadInitials: 'LP', status: 'blocked',
      activeBets: 1, shipped: 3, velocityPct: 'stalled', velocityTrend: 'down',
      spark: [30, 32, 34, 36, 34, 32, 30, 28, 28, 26, 26, 25, 25, 24] },
    { name: 'Agent Gateway', lead: 'KO', leadInitials: 'KO', status: 'healthy',
      activeBets: 3, shipped: 9, velocityPct: '+22%', velocityTrend: 'up',
      spark: [20, 22, 24, 26, 30, 28, 32, 36, 38, 42, 46, 48, 52, 56] },
  ];

  const productsHtml = products.map(p => {
    const activeColor = p.status === 'blocked' ? 'err' : (p.status === 'behind' ? 'warn' : '');
    return `
      <div class="prod-card">
        <div class="pc-head">
          <div>
            <div class="pc-name">${p.name}</div>
          </div>
          ${wchip(p.status)}
        </div>
        <div class="pc-lead">
          <div class="avatar">${p.leadInitials}</div>
          <span class="lead-lbl">LEAD</span>
          <span class="lead-name">${p.lead}</span>
        </div>
        <div class="pc-stats">
          <div class="pc-stat">
            <span class="l">Active bets</span>
            <span class="v ${activeColor}">${p.activeBets}</span>
          </div>
          <div class="pc-stat">
            <span class="l">Shipped · cycle</span>
            <span class="v">${p.shipped}</span>
          </div>
          <div class="pc-stat">
            <span class="l">Velocity</span>
            <span class="v ${p.velocityTrend === 'down' ? 'err' : ''}" style="font-size:14px">${p.velocityPct}</span>
          </div>
        </div>
        <div class="pc-spark">
          <div class="label-row">
            <span>Tasks · 14 wk</span>
            <span class="delta ${p.velocityTrend}">${p.velocityPct}</span>
          </div>
          ${sparkline(p.spark, p.velocityTrend)}
        </div>
      </div>`;
  }).join('');

  slot.innerHTML = `
    <div class="eyebrow">Deliverable 01 · WorkPortfolio · page composition</div>
    <h1>The 15-second morning check.</h1>
    <p class="lede">
      Four products, scannable in one glance. Each card answers three questions: <strong>is it on track</strong> (StatusChip + active-bet color), <strong>how much shipped last cycle</strong>, and <strong>is velocity trending up or down</strong> (sparkline). The cycle control sits below — present but not dominant.
    </p>
    <h3>Final mockup</h3>
    <div class="dlv-frame-scroll">
      <div class="dlv-frame" style="min-width: 1120px; height: auto; padding: 22px 26px; display: flex; flex-direction: column; gap: 18px;">
        <div style="display: flex; align-items: baseline; justify-content: space-between;">
          <h2 style="font-family: var(--font-heading); font-size: 22px; color: var(--text-hi); font-weight: 600; letter-spacing: -0.015em; margin: 0;">Portfolio</h2>
          <div style="font-family: var(--font-mono); font-size: 10px; letter-spacing: 0.12em; text-transform: uppercase; color: var(--text-lo);">4 products · cycle 14 · week 4 of 6</div>
        </div>

        <div class="portfolio-grid">
          ${productsHtml}
        </div>

        <div class="cycle-stripe">
          <div class="cs-left">
            <span class="cs-lbl">CURRENT CYCLE</span>
            <div class="cs-title">Cycle 14 · &ldquo;Activation&rdquo;</div>
            <div class="cs-meta">
              <span>Started Oct 7 · ends Nov 18</span>
              <span class="sep">·</span>
              <span>10 committed bets · 8 active · 2 shipped</span>
              <span class="sep">·</span>
              <div class="cs-phase">
                <span class="ph">SHAPE</span>
                <span class="arrow">→</span>
                <span class="ph active">BET</span>
                <span class="arrow">→</span>
                <span class="ph">BUILD</span>
                <span class="arrow">→</span>
                <span class="ph">COOLDOWN</span>
              </div>
            </div>
          </div>
          <div class="cs-cta">
            Advance cycle &nbsp;→
          </div>
        </div>
      </div>
    </div>

    <div class="dlv-caption keep">
      <span class="src">From B</span>
      <div class="txt">
        <strong>Tonal layering, no decorative borders.</strong> Each <code>.prod-card</code> uses <code>bg-base-200</code>-equivalent background with shadow-sm only — per <code>UI_DESIGN.md</code> and the existing <code>WorkPortfolio.tsx</code> rule &ldquo;surfaces use tonal layering only, no borders except ghost.&rdquo;
        <strong>StatusChip map preserved.</strong> <code>blocked = warning/amber</code>. The third card ships an amber chip, and its Active Bets count is colored amber as a secondary signal.
        <strong>KeyValue primitive unchanged.</strong> All the mono-uppercase labels throughout are <code>&lt;KeyValue /&gt;</code> rows.
      </div>
    </div>
    <div class="dlv-caption from">
      <span class="src">New · from A</span>
      <div class="txt">
        <strong>Four stats per card, not two.</strong> Version B had only <em>Active bets</em> + <em>Ship rate</em>. The morning-check card adds <em>Shipped · cycle</em>, <em>Velocity</em>, and a <em>14-week sparkline</em>. The sparkline is the signal density upgrade — &ldquo;42% ship rate&rdquo; tells you nothing; &ldquo;+18% week-over-week, trending up&rdquo; tells you the product is healthy.
        <strong>Cycle stripe, not card.</strong> A proposed a cycle-management <em>card</em>. I demoted it to a horizontal stripe: it's a <em>control</em>, not a <em>summary</em>. It shouldn't compete with the products for first-read attention. The phase chips (<code>SHAPE → BET → BUILD → COOLDOWN</code>) come directly from Shape Up's cycle model.
        <strong>Lead avatar on each card.</strong> B has no lead field. Adding one surfaces single-point-of-accountability at a glance.
        <strong>A 4th product (Agent Gateway)</strong> — fixtures today have 3; production will be at least 4 to match the prompt and the morning-check framing.
      </div>
    </div>`;
})();

/* ═══════════ Panel W2 · Team (Canvas + Kanban) ═══════════ */
(function panelTeam() {
  const slot = document.getElementById('w2-slot');
  if (!slot) return;

  const shaped = [
    { id: 's1', title: 'Mobile responsive layout', product: 'HyperIdle', status: 'shaped',
      statusChip: 'paused', appetite: '2 weeks' },
    { id: 's2', title: 'Dark mode toggle', product: 'Knowledge', status: 'shaped',
      statusChip: 'paused', appetite: '1 week' },
    { id: 's3', title: 'Export to PDF', product: 'Review', status: 'shaped',
      statusChip: 'paused', appetite: '3 weeks' },
  ];

  const committed = [
    { id: 'b1', title: 'User auth flow', product: 'HyperIdle', status: 'committed',
      statusChip: 'healthy', appetite: '2 weeks', week: '4 of 6',
      progress: { done: 5, total: 8 },
      owner: 'Dev Agent 1 + 2', ownerInitials: 'DA' },
    { id: 'b2', title: 'Dashboard redesign', product: 'Review', status: 'committed',
      statusChip: 'behind', appetite: '3 weeks', week: '3 of 3',
      progress: { done: 2, total: 5 },
      owner: 'Designer Agent', ownerInitials: 'DS' },
    { id: 'b3', title: 'Rate-limit middleware', product: 'Gateway', status: 'committed',
      statusChip: 'blocked', appetite: '1 week', week: '2 of 1',
      progress: { done: 1, total: 4 },
      owner: 'Dev Agent 1', ownerInitials: 'D1' },
  ];

  const capacity = 4;
  const committedCount = committed.length;

  // Capacity pips (4 total, 3 filled, 1 empty).
  const pips = Array.from({length: capacity}, (_, i) =>
    `<span class="pip ${i < committedCount ? 'on' : ''}"></span>`
  ).join('');

  // Tasks grouped by bet, then by kanban column.
  // STATE_TO_COLUMN: proposed/accepted → planned, blocked → blocked,
  //   in_progress/review → in_progress, done → done, hold/killed → hidden.
  const tasks = [
    // Auth bet
    { id: 't1', title: 'Implement login endpoint', owner: 'Dev Agent 1',
      state: 'in_progress', cost: '$4.20', betTag: 'Auth' },
    { id: 't2', title: 'Design signup form', owner: 'Dev Agent 2',
      state: 'accepted', cost: '$1.80', betTag: 'Auth' },
    { id: 't3', title: 'JWT refresh logic', owner: 'Dev Agent 1',
      state: 'review', cost: '$6.50', betTag: 'Auth' },
    { id: 't4', title: 'Password reset flow', owner: 'Dev Agent 2',
      state: 'accepted', cost: '$2.40', betTag: 'Auth' },
    { id: 't5', title: 'Auth tests + fixtures', owner: 'QA Agent',
      state: 'done', cost: '$3.10', betTag: 'Auth' },

    // Dashboard bet
    { id: 't6', title: 'Wireframe card variants', owner: 'Designer Agent',
      state: 'in_progress', cost: '$2.20', betTag: 'Dashboard' },
    { id: 't7', title: 'Component inventory audit', owner: 'Designer Agent',
      state: 'done', cost: '$1.50', betTag: 'Dashboard' },
    { id: 't8', title: 'Metric sparkline component', owner: 'Dev Agent 2',
      state: 'accepted', cost: '$3.00', betTag: 'Dashboard' },

    // Rate-limit bet (blocked!)
    { id: 't9', title: 'Benchmark against prod traffic', owner: 'Dev Agent 1',
      state: 'blocked', cost: '$5.80', betTag: 'RateLimit' },
    { id: 't10', title: 'Scoped Redis keyspace', owner: 'Infra Agent',
      state: 'accepted', cost: '$2.00', betTag: 'RateLimit' },
    { id: 't11', title: 'Schema for audit log', owner: 'Dev Agent 1',
      state: 'in_progress', cost: '$1.20', betTag: 'RateLimit' },
  ];

  // Group tasks by column, then by bet within column.
  const STATE_TO_COLUMN = {
    proposed: 'planned', accepted: 'planned', blocked: 'blocked',
    in_progress: 'in_progress', review: 'in_progress', done: 'done',
    hold: null, killed: null,
  };

  const bets = ['Auth', 'Dashboard', 'RateLimit'];

  function renderColumn(col) {
    const relevant = tasks.filter(t => STATE_TO_COLUMN[t.state] === col);
    if (relevant.length === 0) {
      return `<div class="kcol-zone empty"><div class="empty-state">No tasks in ${col.replace('_',' ')}</div></div>`;
    }
    const byBet = bets.map(b => {
      const inBet = relevant.filter(t => t.betTag === b);
      if (inBet.length === 0) return '';
      return `
        <div class="kcol-bet-group">
          <div class="group-label"><span>${b}</span><span class="hair"></span><span>${inBet.length}</span></div>
          ${inBet.map(taskCard).join('')}
        </div>`;
    }).join('');
    return `<div class="kcol-zone">${byBet}</div>`;
  }

  const columns = [
    { key: 'planned', label: 'Planned' },
    { key: 'blocked', label: 'Blocked' },
    { key: 'in_progress', label: 'In Progress' },
    { key: 'done', label: 'Done' },
  ];

  const columnCounts = Object.fromEntries(
    columns.map(c => [c.key, tasks.filter(t => STATE_TO_COLUMN[t.state] === c.key).length])
  );

  slot.innerHTML = `
    <div class="eyebrow">Deliverable 02 · WorkTeam · Canvas + Kanban</div>
    <h1>The bet, and the work it generates.</h1>
    <p class="lede">
      Canvas on top = <strong>what we bet on</strong> (2 lanes: shaped / committed, with explicit capacity). Kanban below = <strong>the tasks those bets produced</strong> (4 columns, grouped by bet within each column). The capacity pips are the single most important constraint on the page — three filled, one open. <em>This is the Shape Up betting table.</em>
    </p>
    <h3>Final mockup</h3>
    <div class="dlv-frame-scroll">
      <div class="dlv-frame" style="min-width: 1400px; height: auto; padding: 20px 24px; display: flex; flex-direction: column; gap: 16px;">
        <div style="display: flex; align-items: baseline; justify-content: space-between;">
          <h2 style="font-family: var(--font-heading); font-size: 20px; color: var(--text-hi); font-weight: 600; letter-spacing: -0.01em; margin: 0;">HyperIdle · Team Board</h2>
          <div style="display:flex; gap: 10px; align-items: center;">
            <button style="padding: 7px 14px; background: var(--surface-2); color: var(--text-mid); border-radius: var(--r-btn); font-family: var(--font-heading); font-weight: 600; font-size: 11px; cursor: pointer; box-shadow: inset 0 0 0 1px var(--surface-3);">+ Shape pitch</button>
            <button style="padding: 7px 14px; background: var(--chip-inprogress-bg); color: var(--chip-inprogress-fg); border-radius: var(--r-btn); font-family: var(--font-heading); font-weight: 600; font-size: 11px; cursor: pointer; box-shadow: inset 0 0 0 1px rgba(109,171,224,0.4);">Select pitches →</button>
          </div>
        </div>

        <!-- CANVAS -->
        <div class="canvas-region">
          <div class="canvas-head">
            <h3>Canvas · committed bets</h3>
            <div class="capacity">
              <span>Capacity</span>
              <div class="pips">${pips}</div>
              <span><strong style="color:var(--text-hi)">${committedCount}</strong> / ${capacity} committed</span>
            </div>
          </div>
          <div class="canvas-lanes">
            <div class="canvas-lane">
              <div class="lane-head">
                <div class="lane-title">SHAPED <span class="count">· ${shaped.length}</span></div>
                <span class="lane-hint">available to bet on</span>
              </div>
              <div class="lane-cards">
                ${shaped.map(betCard).join('')}
              </div>
            </div>
            <div class="canvas-lane committed">
              <div class="lane-head">
                <div class="lane-title">COMMITTED <span class="count">· ${committed.length} of ${capacity}</span></div>
                <span class="lane-hint">in progress this cycle</span>
              </div>
              <div class="lane-cards">
                ${committed.map(betCard).join('')}
                <div class="add-slot">
                  <span class="plus">+</span>
                  <span>One slot open · commit a shaped pitch</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- KANBAN -->
        <div class="kanban-region">
          <div class="kanban-head">
            <h3>Tasks · all committed bets</h3>
            <div class="hint">
              Drag to move · <kbd>Alt</kbd><kbd>←</kbd> / <kbd>Alt</kbd><kbd>→</kbd> to move with keyboard
            </div>
          </div>
          <div class="kanban-cols">
            ${columns.map(c => `
              <div class="kcol">
                <div class="kcol-head ${c.key === 'blocked' ? 'blocked' : ''}">
                  <span class="kcol-title">${c.label}</span>
                  ${columnCounts[c.key] > 0 ? `<span class="kcol-count">${columnCounts[c.key]}</span>` : ''}
                </div>
                ${renderColumn(c.key)}
              </div>
            `).join('')}
          </div>
        </div>
      </div>
    </div>

    <div class="dlv-caption keep">
      <span class="src">From B</span>
      <div class="txt">
        <strong>Two-lane Canvas, not four.</strong> Exactly per HUMAN_INTERFACE_LAYER §4.3 and the <code>Canvas.tsx</code> @lore comment. Shaped on the left, Committed on the right. The 1.4× width ratio for Committed visually communicates &ldquo;this is where active work lives.&rdquo;
        <strong>Four-column Kanban with folding.</strong> <code>STATE_TO_COLUMN</code> folds <code>proposed+accepted → planned</code> and <code>in_progress+review → in_progress</code>. Review is a task-card chip, not a column. <code>hold</code> and <code>killed</code> don't render.
        <strong>Blocked column styling.</strong> Column header title colored amber (<code>--chip-blocked-fg</code>) so the attention-column pops even when empty.
        <strong>Keyboard drag hint visible.</strong> <code>Alt+←/→</code> kbd chips in the Kanban header — B has this in code but no UI affordance; surfacing it is the key discoverability fix.
        <strong>TaskCard blocked = red border + amber chip.</strong> Exactly as in <code>TaskCard.tsx</code>. The border is the <em>layout</em> signal (scan the board); the chip is the <em>semantic</em> signal (blocked ≠ error).
      </div>
    </div>
    <div class="dlv-caption from">
      <span class="src">New</span>
      <div class="txt">
        <strong>Capacity pips.</strong> The <code>"3 / 4 committed"</code> badge in Canvas.tsx is textual — easy to miss. Pips (3 filled + 1 empty) turn capacity into a <em>glance</em> signal. If a 5th bet were committed the pip overflow goes red and <code>"Over capacity"</code> renders next to it in error color (already in B's code but invisible).
        <strong>"One slot open" add-card.</strong> Dashed card inside Committed lane that advertises the open slot. This is the trigger for the PitchSelector overlay (see W3).
        <strong>Bet-grouped task rendering.</strong> Inside each Kanban column, tasks cluster by their parent bet with a mono-uppercase sub-header and count. Version B has <code>betTag</code> on tasks but renders them flat — at 15+ tasks per column the flat list is unusable. Grouping is the density fix.
        <strong>Progress on BetCards in Canvas.</strong> The <code>progress</code> prop on <code>BetCard</code> is already supported — we're just showing it here with an actual bar + percentage instead of a plain progress element. Week counter (<code>3 of 6</code>) added as a second KeyValue so the <em>time</em> dimension sits alongside the <em>work</em> dimension.
        <strong>&ldquo;Select pitches&rdquo; as primary CTA.</strong> The current button text in <code>WorkTeam.tsx</code> is &ldquo;Select Pitches&rdquo; / &ldquo;Close Pitches&rdquo; — a toggle. Here it's a clearly primary action because &ldquo;picking what to bet on next&rdquo; is the most important thing the team does.
      </div>
    </div>`;
})();
