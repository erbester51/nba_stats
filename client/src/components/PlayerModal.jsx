import { useEffect } from 'react';
import { usePlayerGameLogs } from '../hooks/usePlayerGameLogs';
import { useTeams } from '../hooks/useTeams';
import { parseMatchupAbbreviations, getTeamLogoByAbbreviation } from '../utils/helpers';

const COLS = ['DATE', 'OPP', 'RESULT', 'MIN', 'PTS', 'REB', 'AST', 'STL', 'BLK', 'FG', '3PT', 'FT'];

function ModalGameTable({ games, teamLogos }) {
  return (
    <table className="game-log-table">
      <thead>
        <tr>{COLS.map(h => <th key={h}>{h}</th>)}</tr>
      </thead>
      <tbody>
        {games.map((game, i) => {
          const date = game.GAME_DATE
            ? new Date(game.GAME_DATE).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
            : '-';
          const matchup = game.MATCHUP || '-';
          const { opponentAbbr } = parseMatchupAbbreviations(matchup);
          const oppLogo = getTeamLogoByAbbreviation(opponentAbbr, teamLogos);
          const isPlayoff = game.SEASON_TYPE === 'Playoffs';
          const pts = Number(game.PTS) || 0;

          const cells = {
            'DATE': date,
            'OPP': (
              <div className="opp-cell">
                {oppLogo && <img className="opp-logo" src={oppLogo} alt={opponentAbbr} />}
                <span>{matchup}</span>
              </div>
            ),
            'RESULT': <>{game.WL || '-'}{isPlayoff && <span className="game-type"> PO</span>}</>,
            'MIN': game.MIN || '-',
            'PTS': <span className={pts >= 30 ? 'stat-highlight' : ''}>{pts || '-'}</span>,
            'REB': game.REB || '-',
            'AST': game.AST || '-',
            'STL': game.STL || '-',
            'BLK': game.BLK || '-',
            'FG': `${game.FGM || 0}-${game.FGA || 0}`,
            '3PT': `${game.FG3M || 0}-${game.FG3A || 0}`,
            'FT': `${game.FTM || 0}-${game.FTA || 0}`,
          };

          return (
            <tr key={i}>
              {COLS.map(h => <td key={h}>{cells[h] ?? '-'}</td>)}
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

export default function PlayerModal({ playerName, onClose }) {
  const { data, loading } = usePlayerGameLogs(playerName);
  const { teamLogos } = useTeams();

  const sorted = (data?.games || []).slice().sort((a, b) => new Date(b.GAME_DATE) - new Date(a.GAME_DATE));
  const last10 = sorted.slice(0, 10);

  useEffect(() => {
    document.body.style.overflow = 'hidden';
    const handler = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handler);
    return () => {
      document.body.style.overflow = '';
      document.removeEventListener('keydown', handler);
    };
  }, [onClose]);

  return (
    <div
      id="player-modal"
      className="modal-overlay"
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="modal-container">
        <div className="modal-header">
          <div>
            <h3>{playerName}</h3>
            <p className="modal-subtitle">Last 10 Games</p>
          </div>
          <button className="modal-close" onClick={onClose}>&times;</button>
        </div>
        <div className="modal-content">
          {loading && <p className="loader">Loading last 10 games...</p>}
          {!loading && last10.length > 0 && <ModalGameTable games={last10} teamLogos={teamLogos} />}
          {!loading && last10.length === 0 && <p>No recent games found.</p>}
        </div>
      </div>
    </div>
  );
}
