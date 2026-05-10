import { useState } from 'react';
import { useScoutingGames } from '../hooks/useScoutingGames';
import { useScoutingReport } from '../hooks/useScoutingReport';
import ScoutingReport from './ScoutingReport.jsx';

export default function ScoutingTab() {
  const { games, loading: gamesLoading } = useScoutingGames();
  const { report, loading, error, cacheMsg, fetchReport } = useScoutingReport();
  const [gameId, setGameId] = useState('');

  const byDate = {};
  games.forEach(game => {
    const key = new Date(game.date).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
    if (!byDate[key]) byDate[key] = [];
    byDate[key].push(game);
  });

  function handleGameChange(e) {
    setGameId(e.target.value);
  }

  return (
    <>
      <div className="section-header">
        <h2>Scouting Reports</h2>
        <p>Game-specific previews, matchup breakdowns, and analyst predictions for the selected game.</p>
      </div>
      <div className="form-row">
        <label htmlFor="scouting-game-select">Matchup</label>
        <select id="scouting-game-select" value={gameId} onChange={handleGameChange}>
          <option value="">{gamesLoading ? 'Loading games...' : 'Select a matchup...'}</option>
          {Object.entries(byDate).map(([dateLabel, dayGames]) => (
            <optgroup key={dateLabel} label={dateLabel}>
              {dayGames.map(game => {
                const time = new Date(game.date).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
                const suffix = game.statusState === 'in' ? ' (LIVE)' : game.statusState === 'post' ? ' (Final)' : ` ${time}`;
                return (
                  <option key={game.gameId} value={game.gameId}>
                    {game.awayTeam} @ {game.homeTeam}{suffix}
                  </option>
                );
              })}
            </optgroup>
          ))}
        </select>
        <button id="scouting-fetch-btn" onClick={() => gameId && fetchReport(gameId)}>
          Get Reports
        </button>
      </div>
      {cacheMsg && <div className="scouting-cache-notice">{cacheMsg}</div>}
      {loading && <div className="loader">Fetching scouting reports...</div>}
      {error && <div className="scouting-error-notice">Error loading scouting report: {error}</div>}
      {report && !loading && <ScoutingReport report={report} />}
    </>
  );
}
