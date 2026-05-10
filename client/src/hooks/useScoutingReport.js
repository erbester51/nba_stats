import { useState } from 'react';
import { fetchJson } from '../utils/helpers';

// Keyed by gameId. Stores RAW articles + filter config, never pre-filtered results.
const reportCache = {};

function applyFilter(rawArticles, homeTokens, awayTokens, excludeKeywords) {
  return (rawArticles || [])
    .filter(article => {
      const titleLower = article.title.toLowerCase();
      const checkText  = `${titleLower} ${(article.snippet || '').toLowerCase()}`;
      if (excludeKeywords.some(k => titleLower.includes(k))) return false;
      if (!homeTokens.some(t => checkText.includes(t))) return false;
      if (!awayTokens.some(t => checkText.includes(t))) return false;
      return true;
    })
    .sort((a, b) => new Date(b.publishTime) - new Date(a.publishTime));
}

export function useScoutingReport() {
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [cacheMsg, setCacheMsg] = useState('');

  async function fetchReport(gameId) {
    if (!gameId) return;

    // Always bypass cache — stale pre-filter results must never be served.
    delete reportCache[gameId];
    setCacheMsg('Cache cleared — fetching fresh data…');

    setLoading(true);
    setError(null);
    setReport(null);

    try {
      const raw = await fetchJson(`/api/games/${gameId}/scouting`);

      const homeTokens      = raw.homeTokens      || [];
      const awayTokens      = raw.awayTokens      || [];
      const excludeKeywords = raw.excludeKeywords  || [];

      // Cache raw articles + filter config. The filtered article list is derived
      // fresh from this every time, so a future filter fix takes effect immediately.
      reportCache[gameId] = {
        rawArticles: raw.rawArticles || [],
        homeTokens,
        awayTokens,
        excludeKeywords,
        meta: raw
      };

      const articles = applyFilter(raw.rawArticles, homeTokens, awayTokens, excludeKeywords);

      setReport({
        ...raw,
        articles,
        totalMatches:   articles.length,
        limitedCoverage: articles.length < 3
      });
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
      setCacheMsg('');
    }
  }

  return { report, loading, error, cacheMsg, fetchReport };
}
