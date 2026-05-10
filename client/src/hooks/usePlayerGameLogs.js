import { useState, useEffect } from 'react';
import { fetchJson } from '../utils/helpers';

export function usePlayerGameLogs(playerId) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!playerId) return;
    setLoading(true);
    fetchJson(`/api/players/${encodeURIComponent(playerId)}/gamelogs`)
      .then(result => { setData(result); setError(null); })
      .catch(err => setError(err.message))
      .finally(() => setLoading(false));
  }, [playerId]);

  return { data, loading, error };
}
