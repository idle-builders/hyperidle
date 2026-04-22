// work-views.jsx — Work view deliverables

// ═════════ Helpers ═════════

const Sparkline = ({ data, tone = 'primary', width = 100, height = 28 }) => {
  const min = Math.min(...data), max = Math.max(...data);
  const range = max - min || 1;
  const points = data.map((v, i) => {
    const x = (i / (data.length - 1)) * width;
    const y = height - 4 - ((v - min) / range) * (height - 8);
    return `${x},${y}`;
  }).join(' ');
  const colorMap = { primary: 'var(--primary)', ok: 'var(--ok)', warn: 'var(--warn)', danger: 'var(--danger)' };
  const color = colorMap[tone] || colorMap.primary;
  const last = points.split(' ').pop().split(',');
  return (
    <svg width={width} height={height} style={{ display: 'block' }}>
      <polyline points={points} fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" opacity="0.9" />
      <circle cx={last[0]} cy={last[1]} r="2" fill={color} />
    </svg>
  );
};

const PhaseTrack = ({ phases, activeIndex }) => (
  <div>
    <div className="phase-track">
      {phases.map((_, i) => (
        <div key={i} className={`phase-seg ${i < activeIndex ? 'done' : ''} ${i === activeIndex ? 'active' : ''}`} />
      ))}
    </div>
    <div className="phase-labels">
      {phases.map((p, i) => (
        <div key={p} className={`phase-label ${i < activeIndex ? 'done' : ''} ${i === activeIndex ? 'active' : ''}`}>{p}</div>
      ))}
    </div>
  </div>
);

const WeekTrack = ({ current, total, tone = 'primary' }) => (
  <div className="week-track">
    {Array.from({ length: total }).map((_, i) => (
      <div key={i} className={`week-seg ${i < current ? 'done' : ''} ${i === current - 1 ? `active ${tone}` : ''} ${i < current && tone !== 'primary' ? tone : ''}`} />
    ))}
  </div>
);

const CapacityPill = ({ used, total }) => {
  const full = used >= total;
  return (
    <span className={`capacity-pill ${full ? 'full' : ''}`}>
      <span>{used}/{total} committed</span>
      <span className="dots">
        {Array.from({ length: total }).map((_, i) => (
          <span key={i} className={`cap-dot ${i < used ? 'filled' : ''}`} />
        ))}
      </span>
      {full && <span>· at cap</span>}
    </span>
  );
};

const Breadcrumb = ({ items }) => (
  <div className="breadcrumb">
    {items.map((it, i) => (
      <React.Fragment key={i}>
        <span className={i === items.length - 1 ? 'bc-current' : 'bc-link'}>{it}</span>
        {i < items.length - 1 && <span className="sep">/</span>}
      </React.Fragment>
    ))}
  </div>
);

// ═════════ Work Submenu v2 (product selector) ═════════

const WorkSubmenuV2 = ({ selected, onSelect }) => (
  <>
    <div className="submenu-header">
      <div className="submenu-title">
        <span>Work</span>
        <span className="count">{PRODUCTS.length}</span>
      </div>
      <SearchField placeholder="Search bets, tasks" shortcut="⌘K" />
    </div>
    <div className="submenu-list">
      <div className="submenu-list-group"><span>Portfolio</span></div>
      <NavItem icon="layers" label="All Products" selected={selected === 'all'} onClick={() => onSelect('all')} />
      <div className="submenu-list-group"><span>Products</span></div>
      {PRODUCTS.map(p => (
        <div
          key={p.id}
          className={`navitem ${selected === p.id ? 'selected' : ''}`}
          onClick={() => onSelect(p.id)}
        >
          <span className="product-card-dot" style={{
            background: p.status === 'healthy' ? 'var(--ok)'
              : p.status === 'behind' ? 'var(--warn)'
              : p.status === 'blocked' ? 'var(--danger)' : 'var(--t-low)'
          }} />
          <span className="navitem-label">{p.name}</span>
          <span className="navitem-count">{p.activeBets}</span>
        </div>
      ))}
    </div>
  </>
);

// ═════════ LEVEL 1 — Portfolio Overview ═════════

const PortfolioOverview = ({ onOpenProduct }) => (
  <>
    <div className="work-topbar">
      <div style={{ flex: 1 }}>
        <Breadcrumb items={['Work', 'Portfolio']} />
        <div className="work-title" style={{ marginTop: 4 }}>Portfolio</div>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <Tag variant="kind">CYCLE {CYCLE.number}</Tag>
        <StatusChip status="healthy" label={CYCLE.phase.toUpperCase()} />
        <button className="btn-sec">Cycle history</button>
      </div>
    </div>

    <div className="portfolio-body">
      {/* Metrics bar */}
      <div className="portfolio-metrics">
        <div className="port-metric">
          <span className="port-metric-label">Active bets</span>
          <span className="port-metric-value">9</span>
          <span className="port-metric-sub">across 4 products</span>
        </div>
        <div className="port-metric">
          <span className="port-metric-label">Shipped / cycle</span>
          <span className="port-metric-value">14</span>
          <span className="port-metric-sub up">+2 vs C13</span>
        </div>
        <div className="port-metric">
          <span className="port-metric-label">Decisions pending</span>
          <span className="port-metric-value">3</span>
          <span className="port-metric-sub warn">1 overdue</span>
        </div>
        <div className="port-metric">
          <span className="port-metric-label">Cycle spend</span>
          <span className="port-metric-value">$41.2K</span>
          <span className="port-metric-sub">of $46.0K appetite</span>
        </div>
        <div className="port-metric">
          <span className="port-metric-label">Velocity</span>
          <span className="port-metric-value">2.3/wk</span>
          <span className="port-metric-sub up">+0.4 vs C13</span>
        </div>
      </div>

      {/* Cycle management */}
      <div className="cycle-card">
        <div className="cycle-info">
          <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 15, fontWeight: 600 }}>Cycle {CYCLE.number}</span>
            <span style={{ fontSize: 13, color: 'var(--t-mid)' }}>{CYCLE.range}</span>
            <span className="mono-sm">{CYCLE.daysRemaining} DAYS REMAINING</span>
          </div>
          <PhaseTrack phases={CYCLE.phases} activeIndex={CYCLE.phaseIndex} />
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <button className="btn-sec">Notes</button>
          <button className="btn-primary">Advance cycle →</button>
        </div>
      </div>

      {/* Products grid */}
      <div>
        <div className="section-heading" style={{ paddingBottom: 10 }}>PRODUCTS</div>
        <div className="product-grid">
          {PRODUCTS.map(p => {
            const toneMap = { healthy: 'ok', behind: 'warn', blocked: 'danger' };
            return (
              <div key={p.id} className="product-card" onClick={() => onOpenProduct(p.id)}>
                <div className="product-card-head">
                  <div className="product-card-name">
                    <span className="product-card-dot" style={{
                      background: p.status === 'healthy' ? 'var(--ok)'
                        : p.status === 'behind' ? 'var(--warn)'
                        : 'var(--danger)'
                    }} />
                    {p.name}
                  </div>
                  <Avatar initials={p.lead.initials} size="sm" bot />
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 }}>
                  <StatusChip status={p.status} label={p.statusLabel} />
                  <span className="mono-sm" style={{ color: p.trend.startsWith('+') ? 'var(--ok)' : 'var(--danger)' }}>{p.trend}</span>
                </div>
                <div className="product-card-stats">
                  <KeyValue label="Active" value={p.activeBets} />
                  <KeyValue label="Shipped" value={p.shipped} />
                  <KeyValue label="ARR" value={p.revenue} />
                </div>
                <div className="product-card-spark">
                  <Sparkline data={p.spark} tone={toneMap[p.status] || 'primary'} width={260} height={28} />
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Past cycles */}
      <div className="past-cycles">
        <div className="past-cycles-head">
          <span className="mono-sm" style={{ color: 'var(--t-mid)' }}>PAST CYCLES</span>
          <span className="mono-sm">4 CYCLES · 25 SHIPPED · 6 KILLED</span>
        </div>
        {PAST_CYCLES.map(c => (
          <div key={c.id} className="past-cycle-row">
            <span className="pc-cycle">{c.cycle}</span>
            <span className="pc-range">{c.range}</span>
            <span className="pc-metric"><span className="label">Shipped</span>{c.shipped}</span>
            <span className="pc-metric"><span className="label">Killed</span>{c.killed}</span>
            <span className="pc-metric"><span className="label">Cost</span>{c.cost}</span>
            <span className="pc-metric" style={{
              color: c.varianceTone === 'ok' ? 'var(--ok)' : c.varianceTone === 'warn' ? 'var(--warn)' : 'var(--danger)'
            }}>
              <span className="label" style={{ color: 'var(--t-low)' }}>Variance</span>{c.variance}
            </span>
            <Icon name="chevronRight" size={14} />
          </div>
        ))}
      </div>
    </div>
  </>
);

// ═════════ LEVEL 2 — Team View (Canvas + Kanban) ═════════

const TeamCanvas = ({ bets, onOpenBet, onOpenPitchSelector, atCapacity = false, capacityTotal = 3 }) => {
  const used = bets.length;
  return (
    <div className="canvas-section">
      <div className="canvas-head">
        <div className="canvas-head-left">
          <div className="canvas-title">Bet canvas</div>
          <CapacityPill used={used} total={capacityTotal} />
          <span className="mono-sm">CYCLE C14 · WEEK 4 OF 6</span>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <span className="mono-sm">HARD CAP · 3 BETS</span>
        </div>
      </div>

      {bets.length === 0 ? (
        <div className="canvas-empty">
          <div className="canvas-empty-card">
            <Icon name="layers" size={28} />
            <div style={{ fontSize: 15, fontWeight: 600 }}>No bets committed this cycle</div>
            <div style={{ fontSize: 13, color: 'var(--t-mid)', lineHeight: 1.5 }}>
              Shape-Up runs on bets, not backlogs. Commit 1 – 3 pitches from the selector to start building.
            </div>
            <button className="btn-primary" onClick={onOpenPitchSelector}>
              <Icon name="plus" size={14} /> Choose from {AVAILABLE_PITCHES.length} available pitches
            </button>
            <span className="mono-sm">PITCHES EXPIRE AFTER 2 CYCLES</span>
          </div>
        </div>
      ) : (
        <div className="canvas-grid">
          {bets.map(b => {
            const toneMap = { healthy: 'healthy', behind: 'behind', blocked: 'blocked', paused: 'paused' };
            return (
              <div key={b.id} className={`betcard-lg ${toneMap[b.status]}`} onClick={() => onOpenBet(b.id)}>
                <div className="betcard-lg-top">
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    <Tag variant="product">{b.product}</Tag>
                    <span className="appetite-pill">{b.appetite}</span>
                  </div>
                  <StatusChip status={b.status} />
                </div>
                <div className="betcard-lg-title">{b.title}</div>
                {b.blocker && (
                  <div className="blocker-row">
                    <Icon name="block" size={12} />
                    <span className="blocker-label">BLOCKED</span>
                    <span style={{ color: 'var(--t-mid)' }}>· {b.blocker}</span>
                  </div>
                )}
                <div className="betcard-lg-meta-row">
                  <KeyValue label="Week" value={`${b.week} / ${b.weeksTotal}`} />
                  <KeyValue label="Progress" value={`${b.progress}%`} />
                  <KeyValue label="Cost" value={`${b.cost} / ${b.costOf}`} />
                </div>
                <WeekTrack current={b.week} total={b.weeksTotal} tone={b.status} />
                <div className="betcard-lg-foot">
                  <span className="mono-sm">OWNER · {b.owner.name}</span>
                  <Avatar initials={b.owner.initials} size="sm" bot />
                </div>
              </div>
            );
          })}
          {!atCapacity && used < capacityTotal && (
            <div className="add-bet-card" onClick={onOpenPitchSelector}>
              <Icon name="plus" size={20} />
              <span className="add-bet-title">Commit a pitch</span>
              <span className="add-bet-hint">{capacityTotal - used} SLOT{capacityTotal - used === 1 ? '' : 'S'} LEFT</span>
            </div>
          )}
          {atCapacity && (
            <div className="add-bet-card disabled">
              <Icon name="lock" size={20} />
              <span className="add-bet-title">At capacity</span>
              <span className="add-bet-hint">KILL A BET TO FREE A SLOT</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

const TeamKanban = ({ tasks }) => {
  const cols = [
    { key: 'planned',    label: 'Planned',      items: tasks.planned,    countTone: 't-low',  statusDot: 'paused'  },
    { key: 'inProgress', label: 'In progress',  items: tasks.inProgress, countTone: 'primary', statusDot: 'healthy' },
    { key: 'blocked',    label: 'Blocked',      items: tasks.blocked,    countTone: 'danger',  statusDot: 'blocked' },
    { key: 'done',       label: 'Done',         items: tasks.done,       countTone: 'ok',      statusDot: 'done'    },
  ];

  const statusFor = (col, task) =>
    col === 'blocked' ? 'blocked'
    : col === 'done' ? 'done'
    : col === 'inProgress' ? 'healthy'
    : 'paused';

  return (
    <div className="kanban-section">
      <div className="kanban-section-head">
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <div className="kanban-section-title">Tasks across current bets</div>
          <span className="mono-sm">{tasks.planned.length + tasks.inProgress.length + tasks.blocked.length + tasks.done.length} TASKS</span>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn-ghost"><Icon name="filter" size={14} /> Filter by bet</button>
          <button className="btn-ghost"><Icon name="sliders" size={14} /> Dependencies</button>
        </div>
      </div>
      <div className="kanban-v2">
        {cols.map(col => (
          <div key={col.key} className={`kcol ${col.key === 'blocked' ? 'blocked' : ''}`}>
            <div className="kcol-head">
              <div className="kcol-title-wrap">
                <span className={`kcol-title ${col.key === 'blocked' ? 'blocked' : ''}`}>{col.label}</span>
                <span className="kcol-count">{col.items.length}</span>
              </div>
              <button className="btn-ghost" style={{ padding: 2 }}><Icon name="plus" size={14} /></button>
            </div>
            <div className="kcol-list">
              {col.items.length === 0 ? (
                <div className="kanban-empty-col">No tasks</div>
              ) : col.items.map(t => (
                <div key={t.id} className="taskcard-v2">
                  <div className="taskcard-v2-title">{t.title}</div>
                  {t.blocker && (
                    <div className="blocker-row">
                      <Icon name="block" size={12} />
                      <span>{t.blocker}</span>
                      <span className="blocker-duration">{t.blockedFor}</span>
                    </div>
                  )}
                  <div className="taskcard-v2-foot">
                    <div className="taskcard-v2-left">
                      <StatusChip status={statusFor(col.key, t)} />
                      {t.bet && <Tag variant="kind">{t.bet}</Tag>}
                    </div>
                    <div className="taskcard-v2-owner">
                      <Avatar initials={t.owner.initials} size="sm" bot />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

const PitchSelector = ({ pitches, onClose, expandedId, onExpand, showNewForm, onToggleNewForm }) => (
  <div className="pitch-selector">
    <div className="pitch-selector-head">
      <div>
        <div className="pitch-selector-title">Available pitches</div>
        <div className="pitch-selector-sub">{pitches.length} shaped · 2 slots remaining in this cycle</div>
      </div>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <button className="btn-sec" onClick={onToggleNewForm}><Icon name="plus" size={14} /> New pitch</button>
        <button className="btn-ghost" onClick={onClose}><Icon name="close" size={14} /> Back to tasks</button>
      </div>
    </div>

    <div className="pitch-list">
      {showNewForm && (
        <div className="new-pitch-form">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--t-high)' }}>New pitch</span>
            <button className="btn-ghost" onClick={onToggleNewForm}><Icon name="close" size={14} /></button>
          </div>
          <div className="npf-row">
            <div>
              <label>Title</label>
              <input placeholder="What are we pitching?" />
            </div>
            <div>
              <label>Appetite</label>
              <div style={{ display: 'flex', gap: 6 }}>
                {['1W', '2W', '6W'].map(a => <button key={a} className="btn-sec" style={{ flex: 1 }}>{a}</button>)}
              </div>
            </div>
          </div>
          <div>
            <label>Problem</label>
            <textarea placeholder="Who hits this and how often?" />
          </div>
          <div>
            <label>Solution sketch</label>
            <textarea placeholder="Fat marker — just the shape." />
          </div>
          <div className="npf-row">
            <div>
              <label>Rabbit holes</label>
              <textarea placeholder="One per line." />
            </div>
            <div>
              <label>Done condition</label>
              <textarea placeholder="How do we know it's shipped?" />
            </div>
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
            <button className="btn-ghost" onClick={onToggleNewForm}>Cancel</button>
            <button className="btn-primary">Save pitch</button>
          </div>
        </div>
      )}

      {pitches.map(p => (
        <div key={p.id} className="pitchcard-v2">
          <div className="pitchcard-v2-head" onClick={() => onExpand(expandedId === p.id ? null : p.id)}>
            <div className="pitchcard-v2-main">
              <div className="pitchcard-v2-title">{p.title}</div>
              <div className="pitchcard-v2-summary">{p.summary}</div>
            </div>
            <span className={`appetite-pill ${p.appetiteKind}`}>{p.appetite}</span>
            <span className="pitch-expire">EXPIRES {p.expires}</span>
            <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              <Avatar initials={p.shaper.initials} size="sm" bot={p.shaper.initials.length === 2 && p.shaper.name.startsWith('Agent')} />
              <Icon name={expandedId === p.id ? 'chevronDown' : 'chevronRight'} size={16} />
            </div>
          </div>
          {expandedId === p.id && (
            <div className="pitchcard-v2-body">
              <div className="pitch-section">
                <div className="pitch-section-label">Problem</div>
                <div className="pitch-section-body">{p.problem}</div>
              </div>
              <div className="pitch-section">
                <div className="pitch-section-label">Solution</div>
                <div className="pitch-section-body">{p.solution}</div>
              </div>
              <div className="pitch-section">
                <div className="pitch-section-label">Rabbit holes</div>
                <div className="pitch-section-body">
                  <ul>{p.rabbitHoles.map((r, i) => <li key={i}>{r}</li>)}</ul>
                </div>
              </div>
              <div className="pitch-section">
                <div className="pitch-section-label">Done</div>
                <div className="pitch-section-body"><strong>{p.done}</strong></div>
              </div>
              <div className="pitch-actions">
                <button className="btn-ghost" style={{ color: 'var(--danger)' }}>Kill</button>
                <button className="btn-sec">Reshape</button>
                <button className="btn-primary"><Icon name="check" size={14} /> Commit to cycle</button>
              </div>
            </div>
          )}
        </div>
      ))}
    </div>
  </div>
);

const TeamView = ({ productId, bets, tasks, atCapacity, showPitchSelector, setShowPitchSelector, onOpenBet, emptyCanvas = false }) => {
  const [expandedPitch, setExpandedPitch] = React.useState('pitch-a1');
  const [showNewForm, setShowNewForm] = React.useState(false);
  const product = PRODUCTS.find(p => p.id === productId) || PRODUCTS[0];

  const canvasBets = emptyCanvas ? [] : bets;

  return (
    <>
      <div className="work-topbar">
        <div style={{ flex: 1 }}>
          <Breadcrumb items={['Work', product.name]} />
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 4 }}>
            <span className="work-title">{product.name}</span>
            <span className="product-card-dot" style={{
              background: product.status === 'healthy' ? 'var(--ok)'
                : product.status === 'behind' ? 'var(--warn)' : 'var(--danger)'
            }} />
            <StatusChip status={product.status} label={product.statusLabel} />
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <KeyValue label="Lead agent" value={product.lead.name} inline />
          <Tag variant="kind">CYCLE C14</Tag>
        </div>
      </div>

      <div className="team-body">
        <TeamCanvas
          bets={canvasBets}
          onOpenBet={onOpenBet}
          onOpenPitchSelector={() => setShowPitchSelector(true)}
          atCapacity={atCapacity}
          capacityTotal={3}
        />
        {showPitchSelector ? (
          <PitchSelector
            pitches={AVAILABLE_PITCHES}
            onClose={() => setShowPitchSelector(false)}
            expandedId={expandedPitch}
            onExpand={setExpandedPitch}
            showNewForm={showNewForm}
            onToggleNewForm={() => setShowNewForm(v => !v)}
          />
        ) : (
          <TeamKanban tasks={tasks} />
        )}
      </div>
    </>
  );
};

// ═════════ LEVEL 3 — Bet Detail ═════════

const BetDetail = ({ bet, onBack }) => (
  <>
    <div className="work-topbar">
      <div style={{ flex: 1 }}>
        <Breadcrumb items={['Work', bet.product, bet.title]} />
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 4, flexWrap: 'wrap' }}>
          <span className="work-title">{bet.title}</span>
          <Tag variant="product">{bet.product}</Tag>
          <span className="appetite-pill">{bet.appetite}</span>
          <StatusChip status={bet.status} />
        </div>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <button className="btn-ghost" onClick={onBack}><Icon name="chevronRight" size={14} style={{ transform: 'rotate(180deg)' }} /> Back</button>
        <button className="btn-sec">Add note</button>
        <button className="btn-sec" style={{ color: 'var(--warn)' }}>Flag blocker</button>
        <button className="btn-sec" style={{ color: 'var(--danger)' }}>Kill bet</button>
      </div>
    </div>

    <div className="bet-detail">
      {/* Stats */}
      <div className="bet-stats-grid">
        <div className="stat-card">
          <span className="stat-card-title">PROGRESS</span>
          <div className="stat-card-grid">
            <KeyValue label="Week" value={`${bet.week} of ${bet.weeksTotal}`} />
            <KeyValue label="Completion" value={`${bet.progress}%`} />
            <KeyValue label="Tasks done" value={`${bet.tasksDone} / ${bet.tasksTotal}`} />
            <KeyValue label="Cycle" value={bet.cycle} />
          </div>
          <div style={{ marginTop: 8 }}>
            <WeekTrack current={bet.week} total={bet.weeksTotal} tone={bet.status} />
          </div>
        </div>
        <div className="stat-card">
          <span className="stat-card-title">COST</span>
          <KeyValue label="Spent" value={bet.spent} />
          <KeyValue label="Appetite" value={bet.appetiteCost} />
          <div className="progress" style={{ marginTop: 4 }}>
            <div className="progress-bar primary" style={{ width: '79%' }} />
          </div>
          <span className="mono-sm" style={{ color: 'var(--ok)' }}>79% OF APPETITE</span>
        </div>
        <div className="stat-card">
          <span className="stat-card-title">TEAM</span>
          <KeyValue label="Owner" value={bet.owner.name} />
          <KeyValue label="Shaper" value={bet.shaper} />
          <KeyValue label="Sessions" value={bet.sessions} />
        </div>
      </div>

      {/* Pitch body */}
      <div>
        <div className="section-heading" style={{ paddingBottom: 8 }}>PITCH</div>
        <div className="pitch-body-card">
          <h3>Problem</h3>
          <p>{bet.problem}</p>
          <h3>Solution</h3>
          <p>{bet.solution}</p>
          <h3>Rabbit holes</h3>
          <ul>{bet.rabbitHoles.map((r, i) => <li key={i}>{r}</li>)}</ul>
          <h3>Done condition</h3>
          <p><strong>{bet.done}</strong></p>
        </div>
      </div>

      {/* Task table */}
      <div>
        <div className="section-heading" style={{ paddingBottom: 8 }}>TASKS · {bet.tasks.length}</div>
        <div className="task-table">
          <div className="task-table-head">
            <span>Title</span>
            <span>Owner</span>
            <span>State</span>
            <span>Dependency</span>
            <span style={{ textAlign: 'right' }}>Sessions</span>
            <span style={{ textAlign: 'right' }}>Cost</span>
          </div>
          {bet.tasks.map(t => {
            const stateMap = { done: 'done', 'in-progress': 'healthy', planned: 'paused', blocked: 'blocked' };
            return (
              <div key={t.id} className="task-row">
                <span className="task-row-title">{t.title}</span>
                <span className="task-row-owner"><Avatar initials={t.owner} size="sm" bot={t.owner !== 'MA'} /> {t.owner}</span>
                <StatusChip status={stateMap[t.state]} label={t.state.replace('-', ' ').toUpperCase()} />
                <span className="task-row-dep">{t.dep}</span>
                <span className="task-row-num">{t.sessions}</span>
                <span className="task-row-num">{t.cost}</span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Comments */}
      <div>
        <div className="section-heading" style={{ paddingBottom: 8 }}>COMMENTS · {bet.comments.length}</div>
        <div style={{ background: 'var(--s2)', borderRadius: 'var(--r2)', padding: '4px 16px' }}>
          {bet.comments.map(c => (
            <div key={c.id} style={{ display: 'flex', gap: 12, padding: '14px 0', borderTop: '1px solid var(--s3)' }}>
              <Avatar initials={c.initials} size="md" bot={c.bot} />
              <div style={{ flex: 1 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 4 }}>
                  <span style={{ fontSize: 13, fontWeight: 600, color: c.bot ? 'var(--primary)' : 'var(--t-high)' }}>{c.author}</span>
                  <span className="mono-sm">{c.time}</span>
                </div>
                <div style={{ fontSize: 13, color: 'var(--t-mid)', lineHeight: 1.55 }}>{c.body}</div>
              </div>
            </div>
          ))}
          <div style={{ padding: '14px 0', borderTop: '1px solid var(--s3)' }}>
            <div style={{ background: 'var(--s3)', borderRadius: 'var(--r2)', padding: 10 }}>
              <textarea
                placeholder="Add a note, flag a blocker, or request a scope reduction…"
                style={{
                  width: '100%', background: 'transparent', color: 'var(--t-high)',
                  fontSize: 13, lineHeight: 1.55, minHeight: 44, resize: 'none', border: 0, outline: 0,
                  fontFamily: 'var(--ui)',
                }}
              />
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 8 }}>
                <div style={{ display: 'flex', gap: 6 }}>
                  <button className="btn-ghost"><Icon name="paperclip" size={14} /></button>
                  <button className="btn-ghost"><Icon name="sparkle" size={14} /></button>
                </div>
                <div style={{ display: 'flex', gap: 6 }}>
                  <button className="btn-sec">Request scope cut</button>
                  <button className="btn-primary">Comment <Icon name="arrowUp" size={14} /></button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </>
);

Object.assign(window, {
  WorkSubmenuV2, PortfolioOverview, TeamView, BetDetail,
  Sparkline, PhaseTrack, WeekTrack, CapacityPill, Breadcrumb,
});
