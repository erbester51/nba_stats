import { useState, useEffect } from 'react';
import { fetchJson } from '../utils/helpers';

export function useNews() {
  const [breaking, setBreaking] = useState([]);
  const [general, setGeneral] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    fetchJson('/api/news')
      .then(data => { setBreaking(data.breaking || []); setGeneral(data.general || []); })
      .catch(err => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  return { breaking, general, loading, error };
}
