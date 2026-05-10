import { parseMatchupAbbreviations, getTeamLogoByAbbreviation } from '../utils/helpers';

const COLS = ['DATE', 'OPP', 'RESULT', 'MIN', 'FG', 'FG%', '3PT', '3P%', 'FT', 'FT%', 'REB', 'AST', 'BLK', 'STL', 'PF', 'TO', 'PTS'];

function GameRows({ games, teamLogos }) {
  return games.map((game, i) => {
    const date = game.GAME_DATE
      ? new Date(game.GAME_DATE).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
      : '-';
    const matchup = game.MATCHUP || '-';
    const { opponentAbbr } = parseMatchupAbbreviations(matchup);
    const oppLogo = getTeamLogoByAbbreviation(opponentAbbr, teamLogos);

    const cells = {
      'DATE': date,
      'OPP': (
        <div className="opp-cell">
          {oppLogo && <img className="opp-logo" src={oppLogo} alt={opponentAbbr} />}
          <span>{matchup}</span>
        </div>
      ),
      'RESULT': game.WL || '-',
      'MIN': game.MIN || '-',
      'FG': `${game.FGM || 0}-${game.FGA || 0}`,
      'FG%': game.FG_PCT ? (game.FG_PCT * 100).toFixed(1) : '-',
      '3PT': `${game.FG3M || 0}-${game.FG3A || 0}`,
      '3P%': game.FG3_PCT ? (game.FG3_PCT * 100).toFixed(1) : '-',
      'FT': `${game.FTM || 0}-${game.FTA || 0}`,
      'FT%': game.FT_PCT ? (game.FT_PCT * 100).toFixed(1) : '-',
      'REB': game.REB || '-',
      'AST': game.AST || '-',
      'BLK': game.BLK || '-',
      'STL': game.STL || '-',
      'PF': game.PF || '-',
      'TO': game.TO || '-',
      'PTS': game.PTS || '-',
    };

    return (
      <tr key={i}>
        {COLS.map(h => <td key={h}>{cells[h] ?? '-'}</td>)}
      </tr>
    );
  });
}

function Section({ title, games, type, teamLogos }) {
  if (!games.length) return null;
  return (
    <div className="game-log-section">
      <div className={`season-type-header ${type}`}>
        {title}
        <span className="game-count">{games.length} games</span>
      </div>
      <table className="game-log-table">
        <thead>
          <tr>{COLS.map(h => <th key={h}>{h}</th>)}</tr>
        </thead>
        <tbody>
          <GameRows games={games} teamLogos={teamLogos} />
        </tbody>
      </table>
    </div>
  );
}

export default function GameLogTable({ data, teamLogos }) {
  if (!data || !data.games || data.games.length === 0) {
    return <p>No game logs available.</p>;
  }

  const playoffGames = data.games.filter(g => g.SEASON_TYPE === 'Playoffs');
  const regularGames = data.games.filter(g => g.SEASON_TYPE !== 'Playoffs');

  return (
    <>
      <Section title="Playoffs" games={playoffGames} type="playoffs" teamLogos={teamLogos} />
      <Section title="Regular Season" games={regularGames} type="regular" teamLogos={teamLogos} />
    </>
  );
}
