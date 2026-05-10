export default function LeaderCard({ label, leader, onPlayerClick }) {
  if (!leader || !leader.playerId) {
    return (
      <div className="leader-item">
        <div className="leader-detail">
          <strong>{label}</strong>
          <span>No data</span>
        </div>
      </div>
    );
  }

  return (
    <div
      className="leader-item clickable-player"
      onClick={() => onPlayerClick?.(leader.playerId, leader.displayName || 'Player')}
      title="View last 10 games"
      style={{ cursor: 'pointer' }}
    >
      <img
        className="leader-avatar"
        src={leader.headshot || 'https://via.placeholder.com/42?text=?'}
        alt={leader.displayName || 'Player'}
      />
      <div className="leader-detail">
        <strong>{label}: {leader.value}</strong>
        <span>{leader.displayName}</span>
      </div>
    </div>
  );
}
