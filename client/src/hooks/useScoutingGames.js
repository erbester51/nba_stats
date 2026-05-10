import { useState, useEffect } from 'react';
import { fetchJson } from '../utils/helpers';

export function useScoutingGames() {
  const [games, setGames] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    fetchJson('/api/games/upcoming?days=14')
      .then(data => { setGames(data.games || []); setError(null); })
      .catch(err => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  return { games, loading, error };
}
