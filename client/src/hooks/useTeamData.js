import { useState, useEffect } from 'react';
import { fetchJson } from '../utils/helpers';

export function useTeamData(teamId) {
  const [stats, setStats] = useState(null);
  const [leaders, setLeaders] = useState(null);
  const [injuries, setInjuries] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!teamId) {
      setStats(null); setLeaders(null); setInjuries(null);
      return;
    }
    setLoading(true);
    Promise.all([
      fetchJson(`/api/teams/${teamId}/stats`),
      fetchJson(`/api/teams/${teamId}/leaders`).catch(() => null),
      fetchJson(`/api/teams/${teamId}/injuries`).catch(() => null),
    ])
      .then(([s, l, i]) => { setStats(s); setLeaders(l); setInjuries(i); setError(null); })
      .catch(err => setError(err.message))
      .finally(() => setLoading(false));
  }, [teamId]);

  return { stats, leaders, injuries, loading, error };
}
