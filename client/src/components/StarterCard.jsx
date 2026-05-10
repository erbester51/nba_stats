import { getPlayerStat, getLastGameTopStat } from '../utils/helpers';

export default function StarterCard({ player }) {
  const min = getPlayerStat(player, 'MIN');
  const pts = getPlayerStat(player, 'PTS');
  const reb = getPlayerStat(player, 'REB');
  const ast = getPlayerStat(player, 'AST');
  const topStat = getLastGameTopStat(player);

  return (
    <div className="leader-item starter-item">
      <img
        className="leader-avatar starter-avatar"
        src={player.headshot || 'https://via.placeholder.com/42?text=?'}
        alt={player.fullName || 'Player'}
      />
      <div className="leader-detail starter-detail">
        <div className="starter-name-row">
          <strong>{player.fullName}</strong>
          <span className="starter-position">{player.position || 'N/A'}</span>
        </div>
        <div className="starter-stats">
          <span className="starter-stat"><strong>MIN</strong> {min}</span>
          <span className="starter-stat"><strong>PTS</strong> {pts}</span>
          <span className="starter-stat"><strong>REB</strong> {reb}</span>
          <span className="starter-stat"><strong>AST</strong> {ast}</span>
        </div>
        {topStat && (
          <span className="starter-topstat">Top last game stat: {topStat.key} {topStat.value}</span>
        )}
      </div>
    </div>
  );
}
