import { useState, useEffect, useRef } from 'react';
import { useTeams } from '../hooks/useTeams';
import { useTeamData } from '../hooks/useTeamData';
import LeaderCard from './LeaderCard.jsx';
import InjuryReport from './InjuryReport.jsx';
import { animateStatValues } from '../utils/helpers';

function SeasonLeadersGrid({ leaders, title, type, onPlayerClick }) {
  if (!leaders) return null;
  const categories = [
    { key: 'points', label: 'PPG' },
    { key: 'rebounds', label: 'RPG' },
    { key: 'assists', label: 'APG' },
    { key: 'steals', label: 'SPG' },
    { key: 'blocks', label: 'BPG' },
    { key: 'threes', label: '3PM' },
  ];
  return (
    <div className="team-leaders-section">
      <div className={`team-leaders-title ${type}`}>{title}</div>
      <div className="leader-grid">
        {categories.map(c => (
          <LeaderCard key={c.key} label={c.label} leader={leaders[c.key]} onPlayerClick={onPlayerClick} />
        ))}
      </div>
    </div>
  );
}

export default function TeamTab({ onBgLogo, onPlayerClick }) {
  const { teams, loading: teamsLoading } = useTeams();
  const [teamId, setTeamId] = useState('');
  const { stats, leaders, injuries, loading, error } = useTeamData(teamId);
  const statsRef = useRef(null);

  useEffect(() => {
    if (stats?.logo) onBgLogo(stats.logo);
  }, [stats]);

  useEffect(() => {
    if (statsRef.current) animateStatValues(statsRef.current);
  }, [stats]);

  const overall = stats?.record?.items?.find(i => i.type === 'total') || {};
  const home = stats?.record?.items?.find(i => i.type === 'home') || {};
  const away = stats?.record?.items?.find(i => i.type === 'road') || {};

  const recordChips = [
    { label: 'Overall', value: overall.summary || 'N/A' },
    { label: 'Home', value: home.summary || 'N/A' },
    { label: 'Away', value: away.summary || 'N/A' },
  ];

  return (
    <>
      <div className="section-header">
        <h2>Team Dashboard</h2>
        <p>Select a team to view basic team stats.</p>
      </div>
      <div className="form-row">
        <label htmlFor="team-select">Team</label>
        <select id="team-select" value={teamId} onChange={e => setTeamId(e.target.value)}>
          <option value="">{teamsLoading ? 'Loading teams...' : 'Select a team'}</option>
          {teams.map(team => (
            <option key={team.teamId} value={team.teamId}>{team.displayName || team.teamName}</option>
          ))}
        </select>
      </div>
      <div className="card" ref={statsRef}>
        {!teamId && <p>Select a team to see stats.</p>}
        {teamId && loading && <p className="loader">Loading team stats...</p>}
        {teamId && error && <p>Error loading team stats: {error}</p>}
        {teamId && stats && !loading && (
          <div className="team-card card-animate">
            <h3>{stats.displayName || stats.teamName || 'Team'}</h3>
            <p className="team-meta">{stats.location || ''} &middot; {stats.abbreviation || ''}</p>
            <div className="stat-grid">
              {recordChips.map(c => (
                <div key={c.label} className="stat-chip">
                  <span className="stat-label">{c.label}</span>
                  <span className="stat-value" style={{ fontSize: '1.15rem' }}>{c.value}</span>
                </div>
              ))}
            </div>
            <InjuryReport injuryData={injuries} />
            {leaders && (
              <>
                <SeasonLeadersGrid
                  leaders={leaders.playoffLeaders}
                  title="2025-26 Playoff Leaders"
                  type="playoffs"
                  onPlayerClick={onPlayerClick}
                />
                <SeasonLeadersGrid
                  leaders={leaders.regularLeaders}
                  title="2025-26 Regular Season Leaders"
                  type="regular"
                  onPlayerClick={onPlayerClick}
                />
              </>
            )}
          </div>
        )}
      </div>
    </>
  );
}
