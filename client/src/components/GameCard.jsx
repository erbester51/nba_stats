import { useStarters } from '../hooks/useStarters';
import StarterCard from './StarterCard.jsx';
import LeaderCard from './LeaderCard.jsx';
import { getClockDisplay } from '../utils/helpers';

function LeaderGrid({ leaders, onPlayerClick }) {
  if (!leaders) {
    return (
      <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', margin: 0 }}>
        No matchup data available
      </p>
    );
  }
  const categories = [
    { key: 'points', label: 'PTS' },
    { key: 'rebounds', label: 'REB' },
    { key: 'assists', label: 'AST' },
    { key: 'blocks', label: 'BLK' },
    { key: 'threes', label: '3PM' },
  ];
  return (
    <div className="leader-grid">
      {categories.map(c => (
        <LeaderCard key={c.key} label={c.label} leader={leaders[c.key]} onPlayerClick={onPlayerClick} />
      ))}
    </div>
  );
}

function StartersSection({ gameId, awayTeamId, homeTeamId, awayTeam, homeTeam }) {
  const { players, loading } = useStarters(gameId);
  const getStarters = (teamId) => players.filter(p => p.starter === true && p.teamId === teamId);

  return (
    <div className="starters-row">
      <div className="starter-team">
        <h4>{awayTeam} Starters</h4>
        {loading ? (
          <p className="loader">Loading starters...</p>
        ) : (
          <div className="starter-grid">
            {getStarters(awayTeamId).length
              ? getStarters(awayTeamId).map(p => <StarterCard key={p.playerId} player={p} />)
              : <p>No starters available yet.</p>
            }
          </div>
        )}
      </div>
      <div className="starter-team">
        <h4>{homeTeam} Starters</h4>
        {loading ? (
          <p className="loader">Loading starters...</p>
        ) : (
          <div className="starter-grid">
            {getStarters(homeTeamId).length
              ? getStarters(homeTeamId).map(p => <StarterCard key={p.playerId} player={p} />)
              : <p>No starters available yet.</p>
            }
          </div>
        )}
      </div>
    </div>
  );
}

export default function GameCard({ game, onPlayerClick }) {
  const gameDate = new Date(game.date);
  const formattedTime = gameDate.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
  const formattedDate = gameDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

  const statusLower = (game.status || '').toLowerCase();
  const isLive = statusLower.includes('progress') || statusLower.includes('quarter') || statusLower.includes('half');
  const isFinal = statusLower.includes('final');
  const statusClass = isLive ? 'in-progress' : isFinal ? 'final' : statusLower.replace(/\s+/g, '-');

  const clock = getClockDisplay(game);
  const lastMeetingDate = game.lastMeetingDate
    ? new Date(game.lastMeetingDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
    : null;

  return (
    <div className="card game-card card-animate">
      <div className="game-header">
        <div className="game-meta">
          <div className="game-date">{formattedDate} @ {formattedTime}</div>
          <div className={`game-status-badge ${statusClass}`}>{game.status}</div>
        </div>
        <div className="game-scores">
          <div className="team-block away">
            <span className="team-name">{game.awayTeam}</span>
            <span className="team-score">{game.awayScore}</span>
          </div>
          <div className="game-separator">
            <span>vs</span>
            {clock && (
              <div className={`game-clock-display${clock.live ? ' live' : ''}`}>{clock.text}</div>
            )}
          </div>
          <div className="team-block home">
            <span className="team-name">{game.homeTeam}</span>
            <span className="team-score">{game.homeScore}</span>
          </div>
        </div>
        <div className="game-venue">{game.venue || 'TBD'}</div>
      </div>

      <StartersSection
        gameId={game.gameId}
        awayTeamId={game.awayTeamId}
        homeTeamId={game.homeTeamId}
        awayTeam={game.awayTeam}
        homeTeam={game.homeTeam}
      />

      <div className="leaders-section">
        <div className="last-meeting-label">
          Last Matchup Leaders{lastMeetingDate ? ` — ${lastMeetingDate}` : ''}
        </div>
        <div className="leaders-row">
          <div className="leader-team">
            <h4>{game.awayTeam}</h4>
            <LeaderGrid leaders={game.awayLeaders} onPlayerClick={onPlayerClick} />
          </div>
          <div className="leader-team">
            <h4>{game.homeTeam}</h4>
            <LeaderGrid leaders={game.homeLeaders} onPlayerClick={onPlayerClick} />
          </div>
        </div>
      </div>
    </div>
  );
}
