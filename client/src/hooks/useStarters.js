import { useState, useEffect } from 'react';
import { fetchJson } from '../utils/helpers';

export function useStarters(gameId) {
  const [players, setPlayers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!gameId) return;
    setLoading(true);
    fetchJson(`/api/games/${gameId}/players`)
      .then(data => { setPlayers(data.players || []); setError(null); })
      .catch(err => setError(err.message))
      .finally(() => setLoading(false));
  }, [gameId]);

  return { players, loading, error };
}
