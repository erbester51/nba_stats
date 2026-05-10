import { useState } from 'react';
import { fetchJson } from '../utils/helpers';

export function usePlayerStats() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  async function load(query) {
    if (!query) return;
    setLoading(true);
    setError(null);
    try {
      const result = await fetchJson(`/api/players/${encodeURIComponent(query)}/stats`);
      setData(result);
    } catch (err) {
      setError(err.message);
      setData(null);
    } finally {
      setLoading(false);
    }
  }

  return { data, loading, error, load };
}
