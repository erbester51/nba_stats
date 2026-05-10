import { useState, useEffect, useRef } from 'react';
import { usePlayers } from '../hooks/usePlayers';
import { usePlayerStats } from '../hooks/usePlayerStats';
import { usePlayerGameLogs } from '../hooks/usePlayerGameLogs';
import { useTeams } from '../hooks/useTeams';
import { getTeamLogoByAbbreviation, animateStatValues } from '../utils/helpers';
import GameLogTable from './GameLogTable.jsx';

const SEASON_CHIPS = [
  { label: 'PPG', key: 'PTS', highlight: true },
  { label: 'APG', key: 'AST' },
  { label: 'RPG', key: 'REB' },
  { label: 'GP', key: 'GP' },
  { label: 'Team', key: 'TEAM_ABBREVIATION' },
];

export default function PlayerTab({ onBgLogo }) {
  const { players, loading: playersLoading } = usePlayers();
  const { data, loading: statsLoading, error: statsError, load: loadStats } = usePlayerStats();
  const { teamLogos } = useTeams();

  const playerId = data?.playerId || null;
  const { data: gameLogs, loading: logsLoading } = usePlayerGameLogs(playerId);

  const [selectValue, setSelectValue] = useState('');
  const [inputValue, setInputValue] = useState('');
  const [selectedSeason, setSelectedSeason] = useState('');
  const statsRef = useRef(null);

  const currentSeason = data?.seasonStats?.currentSeason;
  const seasons = [currentSeason, ...(data?.seasonStats?.last4Seasons || [])].filter(Boolean);
  const playoffSeasons = data?.seasonStats?.playoffSeasons || [];
  const playerName = data?.playerInfo?.resultSets?.[0]?.rowSet?.[0]?.[3]
    || data?.playerInfo?.resultSets?.[0]?.rowSet?.[0]?.[1]
    || 'Player';

  useEffect(() => {
    if (currentSeason?.TEAM_ABBREVIATION) {
      onBgLogo(getTeamLogoByAbbreviation(currentSeason.TEAM_ABBREVIATION, teamLogos) || null);
    }
  }, [currentSeason, teamLogos]);

  useEffect(() => {
    if (seasons.length > 0 && !selectedSeason) {
      setSelectedSeason(seasons[0].SEASON_ID);
    }
  }, [seasons.length]);

  useEffect(() => {
    if (statsRef.current) animateStatValues(statsRef.current);
  }, [selectedSeason, data]);

  const regularStats = seasons.find(s => s.SEASON_ID === selectedSeason);
  const playoffStats = playoffSeasons.find(s => s.SEASON_ID === selectedSeason);

  const playersByTeam = {};
  players.forEach(p => {
    const team = p.team || 'UNK';
    if (!playersByTeam[team]) playersByTeam[team] = [];
    playersByTeam[team].push(p);
  });

  function handleSelectChange(e) {
    const id = e.target.value;
    setSelectValue(id);
    setInputValue('');
    setSelectedSeason('');
    if (id) loadStats(id);
  }

  function handleSearch() {
    const q = inputValue.trim();
    if (!q) return;
    setSelectValue('');
    setSelectedSeason('');
    loadStats(q);
  }

  return (
    <>
      <div className="section-header">
        <h2>Player Stats</h2>
        <p>Select a player from the list or search by name or NBA player ID.</p>
      </div>
      <div className="player-search-layout">
        <div className="player-search-controls">
          <div className="form-row">
            <label htmlFor="player-select">Player</label>
            <select id="player-select" value={selectValue} onChange={handleSelectChange}>
              <option value="">{playersLoading ? 'Loading players...' : 'Select a player'}</option>
              {Object.keys(playersByTeam).sort().map(team => (
                <optgroup key={team} label={team}>
                  {playersByTeam[team].map(p => (
                    <option key={p.playerId} value={p.playerId}>{p.displayName}</option>
                  ))}
                </optgroup>
              ))}
            </select>
          </div>
          <div className="form-row">
            <input
              id="player-input"
              type="text"
              placeholder="Stephen Curry or 201939"
              value={inputValue}
              onChange={e => setInputValue(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleSearch()}
            />
            <button id="player-search" onClick={handleSearch}>Search</button>
          </div>
        </div>
        <div className="player-photo-area">
          {playerId && (
            <img
              id="player-headshot"
              className="player-headshot"
              src={`https://cdn.nba.com/headshots/nba/latest/1040x760/${playerId}.png`}
              alt="Player"
            />
          )}
        </div>
      </div>

      <div className="card">
        {statsLoading && <p className="loader">Loading player stats...</p>}
        {statsError && <p>Error: {statsError}</p>}
        {data?.error && <p>{data.error}</p>}
        {data && !statsLoading && !data.error && (
          <div className="player-card card-animate">
            <h3>{playerName}</h3>
            <div className="stat-grid">
              <div className="stat-chip">
                <span className="stat-label">Season</span>
                <span className="stat-value" style={{ fontSize: '1rem' }}>{currentSeason?.SEASON_ID || 'N/A'}</span>
              </div>
              <div className="stat-chip">
                <span className="stat-label">Team</span>
                <span className="stat-value" style={{ fontSize: '1rem' }}>{currentSeason?.TEAM_ABBREVIATION || 'N/A'}</span>
              </div>
              <div className="stat-chip">
                <span className="stat-label">ID</span>
                <span className="stat-value" style={{ fontSize: '0.9rem' }}>{playerId}</span>
              </div>
            </div>
          </div>
        )}
      </div>

      {seasons.length > 0 && (
        <div className="form-row">
          <label htmlFor="player-season">Season</label>
          <select id="player-season" value={selectedSeason} onChange={e => setSelectedSeason(e.target.value)}>
            {seasons.map(s => (
              <option key={s.SEASON_ID} value={s.SEASON_ID}>{s.SEASON_ID}</option>
            ))}
          </select>
        </div>
      )}

      {(regularStats || playoffStats) && (
        <div className="season-stats-grid" ref={statsRef}>
          {regularStats && (
            <div className="player-card card-animate">
              <div className="season-type-header regular">Regular Season</div>
              <div className="stat-grid">
                {SEASON_CHIPS.map(c => (
                  <div key={c.label} className="stat-chip">
                    <span className="stat-label">{c.label}</span>
                    <span className={`stat-value${c.highlight ? ' highlight' : ''}`}>
                      {regularStats[c.key] != null ? regularStats[c.key] : 'N/A'}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
          {playoffStats && (
            <div className="player-card card-animate">
              <div className="season-type-header playoffs">Playoffs</div>
              <div className="stat-grid">
                {SEASON_CHIPS.map(c => (
                  <div key={c.label} className="stat-chip">
                    <span className="stat-label">{c.label}</span>
                    <span className={`stat-value${c.highlight ? ' highlight' : ''}`}>
                      {playoffStats[c.key] != null ? playoffStats[c.key] : 'N/A'}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      <div className="card">
        {logsLoading && <p className="loader">Loading game log...</p>}
        {gameLogs && !logsLoading && <GameLogTable data={gameLogs} teamLogos={teamLogos} />}
      </div>
    </>
  );
}
