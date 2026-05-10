import { useState, useEffect, useRef } from 'react';
import { fetchJson } from '../utils/helpers';

export function useGames() {
  const [games, setGames] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const timeoutRef = useRef(null);

  useEffect(() => {
    async function load() {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      setLoading(true);
      try {
        const data = await fetchJson('/api/games/scores?includeLeaders=1');
        setGames(data.scores || []);
        setError(null);
        if ((data.scores || []).some(g => g.statusState === 'in')) {
          timeoutRef.current = setTimeout(load, 30000);
        }
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    }

    load();
    return () => { if (timeoutRef.current) clearTimeout(timeoutRef.current); };
  }, []);

  return { games, loading, error };
}
