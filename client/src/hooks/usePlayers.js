import { useState, useEffect } from 'react';
import { fetchJson } from '../utils/helpers';

// Module-level cache so /api/players/list is fetched only once
let playersCache = null;
let playersFetchPromise = null;

export function usePlayers() {
  const [players, setPlayers] = useState(playersCache || []);
  const [loading, setLoading] = useState(!playersCache);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (playersCache) {
      setPlayers(playersCache);
      setLoading(false);
      return;
    }

    if (!playersFetchPromise) {
      playersFetchPromise = fetchJson('/api/players/list').then(data => {
        playersCache = data.players || [];
        return playersCache;
      });
    }

    playersFetchPromise
      .then(cached => { setPlayers(cached); setError(null); })
      .catch(err => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  return { players, loading, error };
}
