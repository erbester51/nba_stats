const STATUS_CLASS = { 'Day-To-Day': 'dtd', 'Questionable': 'questionable', 'Out': 'out' };

export default function InjuryReport({ injuryData }) {
  if (!injuryData) return null;
  const injuries = injuryData.injuries || [];

  if (!injuries.length) {
    return (
      <div className="injury-section">
        <div className="injury-section-title">Injury Report</div>
        <p className="injury-none">No players currently listed on the injury report.</p>
      </div>
    );
  }

  return (
    <div className="injury-section">
      <div className="injury-section-title">
        Injury Report{' '}
        <span className="injury-count">{injuries.length} player{injuries.length !== 1 ? 's' : ''}</span>
      </div>
      <div className="injury-list">
        {injuries.map((player, i) => {
          const statusClass = STATUS_CLASS[player.status] || 'out';
          const statusLabel = player.status === 'Day-To-Day' ? 'DTD' : player.status;
          const updated = player.updatedDate
            ? new Date(player.updatedDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
            : null;
          return (
            <div key={i} className="injury-item">
              <img
                className="injury-avatar"
                src={player.headshot || 'https://via.placeholder.com/36?text=?'}
                alt={player.displayName}
              />
              <div className="injury-info">
                <div className="injury-name">{player.displayName}</div>
                {player.position && <div className="injury-position">{player.position}</div>}
              </div>
              <span className={`injury-status-badge ${statusClass}`}>{statusLabel}</span>
              {updated && <span className="injury-date">Updated {updated}</span>}
            </div>
          );
        })}
      </div>
    </div>
  );
}
