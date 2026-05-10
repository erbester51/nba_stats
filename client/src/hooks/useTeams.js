import { useState, useEffect } from 'react';
import { fetchJson } from '../utils/helpers';

// Module-level cache so /api/teams is fetched only once across all components
let teamsCache = null;
let teamsFetchPromise = null;

export function useTeams() {
  const [teams, setTeams] = useState(teamsCache?.teams || []);
  const [teamLogos, setTeamLogos] = useState(teamsCache?.teamLogos || {});
  const [loading, setLoading] = useState(!teamsCache);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (teamsCache) {
      setTeams(teamsCache.teams);
      setTeamLogos(teamsCache.teamLogos);
      setLoading(false);
      return;
    }

    if (!teamsFetchPromise) {
      teamsFetchPromise = fetchJson('/api/teams').then(data => {
        const sorted = (data.teams || []).slice().sort((a, b) => {
          const aName = (a.displayName || a.teamName || '').toUpperCase();
          const bName = (b.displayName || b.teamName || '').toUpperCase();
          return aName.localeCompare(bName);
        });
        const logos = sorted.reduce((map, team) => {
          if (team.abbreviation) map[team.abbreviation] = team.logo;
          return map;
        }, {});
        teamsCache = { teams: sorted, teamLogos: logos };
        return teamsCache;
      });
    }

    teamsFetchPromise
      .then(cache => { setTeams(cache.teams); setTeamLogos(cache.teamLogos); setError(null); })
      .catch(err => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  return { teams, teamLogos, loading, error };
}
