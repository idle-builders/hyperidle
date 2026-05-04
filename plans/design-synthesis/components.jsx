// components.jsx — Primitives + Block components for HyperIdle
// All components exported to window for cross-script use.

// ═════════ Icons (1.75 stroke, 16px) ═════════
const Icon = ({ name, size = 16, className = '' }) => {
  const s = { width: size, height: size };
  const common = { fill: 'none', stroke: 'currentColor', strokeWidth: 1.75, strokeLinecap: 'round', strokeLinejoin: 'round' };
  const paths = {
    conversations: <><path d="M3 5h18v10H7l-4 4V5z" {...common}/></>,
    work: <><rect x="3" y="6" width="18" height="14" rx="1" {...common}/><path d="M8 6V4h8v2" {...common}/></>,
    knowledge: <><path d="M4 4h10a4 4 0 014 4v12H8a4 4 0 01-4-4V4z" {...common}/><path d="M4 4v12a4 4 0 004 4h10" {...common}/></>,
    settings: <><circle cx="12" cy="12" r="3" {...common}/><path d="M12 3v3m0 12v3M3 12h3m12 0h3M5.6 5.6l2.1 2.1m8.6 8.6l2.1 2.1M5.6 18.4l2.1-2.1m8.6-8.6l2.1-2.1" {...common}/></>,
    search: <><circle cx="11" cy="11" r="7" {...common}/><path d="M21 21l-4.3-4.3" {...common}/></>,
    bell: <><path d="M6 8a6 6 0 0112 0c0 7 3 7 3 9H3c0-2 3-2 3-9z" {...common}/><path d="M10 21a2 2 0 004 0" {...common}/></>,
    block: <><circle cx="12" cy="12" r="9" {...common}/><path d="M5.6 5.6l12.8 12.8" {...common}/></>,
    cost: <><path d="M12 3v18M8 7h5a3 3 0 010 6H9a3 3 0 000 6h7" {...common}/></>,
    unread: <><circle cx="12" cy="12" r="9" {...common}/><circle cx="12" cy="12" r="2" fill="currentColor" stroke="none"/></>,
    check: <><path d="M4 12l5 5L20 6" {...common}/></>,
    close: <><path d="M6 6l12 12M18 6L6 18" {...common}/></>,
    plus: <><path d="M12 5v14M5 12h14" {...common}/></>,
    filter: <><path d="M4 5h16M7 12h10M10 19h4" {...common}/></>,
    sliders: <><path d="M4 6h10M18 6h2M4 18h2M10 18h10M4 12h6M14 12h6" {...common}/><circle cx="16" cy="6" r="2" {...common}/><circle cx="8" cy="18" r="2" {...common}/><circle cx="12" cy="12" r="2" {...common}/></>,
    chevronRight: <><path d="M9 6l6 6-6 6" {...common}/></>,
    chevronDown: <><path d="M6 9l6 6 6-6" {...common}/></>,
    paperclip: <><path d="M21 11l-9 9a5 5 0 01-7-7l9-9a3.5 3.5 0 115 5l-8.5 8.5a2 2 0 11-3-3l7-7" {...common}/></>,
    reply: <><path d="M9 17l-5-5 5-5M4 12h10a6 6 0 016 6v2" {...common}/></>,
    more: <><circle cx="5" cy="12" r="1" fill="currentColor" stroke="none"/><circle cx="12" cy="12" r="1" fill="currentColor" stroke="none"/><circle cx="19" cy="12" r="1" fill="currentColor" stroke="none"/></>,
    arrowUp: <><path d="M12 19V5M5 12l7-7 7 7" {...common}/></>,
    send: <><path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z" {...common}/></>,
    layers: <><path d="M12 2l10 6-10 6L2 8l10-6z" {...common}/><path d="M2 16l10 6 10-6M2 12l10 6 10-6" {...common}/></>,
    panel: <><rect x="3" y="4" width="18" height="16" rx="1" {...common}/><path d="M15 4v16" {...common}/></>,
    user: <><circle cx="12" cy="8" r="4" {...common}/><path d="M4 21a8 8 0 0116 0" {...common}/></>,
    alert: <><path d="M12 3l10 17H2L12 3z" {...common}/><path d="M12 10v4M12 17v.5" {...common}/></>,
    book: <><path d="M4 4v16h14a2 2 0 002-2V4H6a2 2 0 00-2 2z" {...common}/><path d="M4 16h14" {...common}/></>,
    dollar: <><path d="M12 2v20M16 6h-6a3 3 0 000 6h4a3 3 0 010 6H8" {...common}/></>,
    lock: <><rect x="5" y="11" width="14" height="10" rx="1" {...common}/><path d="M8 11V7a4 4 0 018 0v4" {...common}/></>,
    mic: <><rect x="9" y="3" width="6" height="12" rx="3" {...common}/><path d="M6 11a6 6 0 0012 0M12 17v4" {...common}/></>,
    sparkle: <><path d="M12 3v6M12 15v6M3 12h6M15 12h6" {...common}/></>,
  };
  return <svg viewBox="0 0 24 24" className={`ico ${className}`} style={s}>{paths[name]}</svg>;
};

// ═════════ Primitives ═════════

const StatusChip = ({ status = 'healthy', label }) => {
  const labels = { healthy: 'Healthy', behind: 'Behind', blocked: 'Blocked', paused: 'Paused', done: 'Done', error: 'Error' };
  return (
    <span className={`chip ${status}`}>
      <span className="chip-dot" />
      {label || labels[status]}
    </span>
  );
};

const Tag = ({ variant = 'kind', children }) => (
  <span className={`tag ${variant}`}>{children}</span>
);

const KeyValue = ({ label, value, inline = false }) => (
  <div className={`kv ${inline ? 'inline' : ''}`}>
    <span className="kv-label">{label}</span>
    <span className="kv-value">{value}</span>
  </div>
);

const NavItem = ({ icon, label, count, selected, onClick, disabled }) => (
  <div
    className={`navitem ${selected ? 'selected' : ''} ${disabled ? 'disabled' : ''}`}
    onClick={disabled ? undefined : onClick}
  >
    {icon && <Icon name={icon} />}
    <span className="navitem-label">{label}</span>
    {count != null && <span className="navitem-count">{count}</span>}
  </div>
);

const SearchField = ({ placeholder = 'Search', value, onChange, shortcut = '⌘K' }) => (
  <div className="search">
    <span className="search-icon"><Icon name="search" size={14} /></span>
    <input
      type="text"
      placeholder={placeholder}
      value={value || ''}
      onChange={e => onChange && onChange(e.target.value)}
    />
    {shortcut && <span className="kbd">{shortcut}</span>}
  </div>
);

// ═════════ Block components ═════════

const Avatar = ({ initials, size = 'md', bot = false }) => (
  <div className={`avatar ${size} ${bot ? 'bot' : ''}`}>{initials}</div>
);

const ThreadRow = ({ initials, bot, title, caption, status, time, selected, onClick, product }) => (
  <div className={`threadrow ${selected ? 'selected' : ''}`} onClick={onClick}>
    <Avatar initials={initials} bot={bot} />
    <div className="threadrow-body">
      <div className="threadrow-top">
        <span className="threadrow-title">{title}</span>
        <span className="threadrow-time">{time}</span>
      </div>
      <div className="threadrow-caption">{caption}</div>
      <div className="threadrow-meta">
        {status && <StatusChip status={status} />}
        {product && <Tag variant="product">{product}</Tag>}
      </div>
    </div>
  </div>
);

const BetCard = ({ product, title, status, progress = 0, owner, progressTone = 'primary' }) => (
  <div className="betcard">
    <div className="betcard-top">
      <Tag variant="product">{product}</Tag>
      <StatusChip status={status} />
    </div>
    <div className="betcard-title">{title}</div>
    <div className="progress">
      <div className={`progress-bar ${progressTone}`} style={{ width: `${progress}%` }} />
    </div>
    <div className="betcard-meta">
      <span className="mono-sm">{progress}% · 6W cycle</span>
      <Avatar initials={owner} size="sm" />
    </div>
  </div>
);

const PitchCard = ({ kind, title, appetite, status }) => (
  <div className="pitchcard">
    <div className="betcard-top">
      <Tag variant="kind">{kind}</Tag>
      <StatusChip status={status} />
    </div>
    <div className="pitchcard-title">{title}</div>
    <div className="pitchcard-meta">
      <KeyValue label="Appetite" value={appetite} />
    </div>
  </div>
);

const TaskCard = ({ title, status, bet, owner }) => (
  <div className="taskcard">
    <div className="taskcard-title">{title}</div>
    <div className="taskcard-meta">
      <div className="taskcard-meta-left">
        <StatusChip status={status} />
        {bet && <Tag variant="product">{bet}</Tag>}
      </div>
      <Avatar initials={owner} size="sm" />
    </div>
  </div>
);

const KnowledgeRow = ({ title, category, caption, time, selected, onClick }) => (
  <div className={`kbrow ${selected ? 'selected' : ''}`} onClick={onClick}>
    <div className="kbrow-body">
      <div className="kbrow-top">
        <span className="kbrow-title">{title}</span>
        <Tag variant="kind">{category}</Tag>
      </div>
      <div className="kbrow-caption">{caption}</div>
    </div>
    <span className="kbrow-time">{time}</span>
  </div>
);

const NotificationRow = ({ status, summary, source, time, action }) => (
  <div className="notifrow">
    <div className="notifrow-top">
      <StatusChip status={status} />
      <span className="notifrow-time">{time}</span>
    </div>
    <div className="notifrow-summary">{summary}</div>
    <div className="notifrow-foot">
      <div className="notifrow-meta">
        {source && <Tag variant="product">{source}</Tag>}
      </div>
      {action && <button className={`btn-ghost ${action.primary ? 'primary' : ''}`}>{action.label}</button>}
    </div>
  </div>
);

Object.assign(window, {
  Icon, StatusChip, Tag, KeyValue, NavItem, SearchField, Avatar,
  ThreadRow, BetCard, PitchCard, TaskCard, KnowledgeRow, NotificationRow,
});
