'use strict';

const nbaService   = require('../services/nbaService');
const kalshiService = require('../services/kalshiService');

const ESPN_TO_NBA = { GS: 'GSW', NY: 'NYK', NO: 'NOP', SA: 'SAS', UTAH: 'UTA', WSH: 'WAS' };

const STAT_KEY_MAP = {
  points:   'PTS',
  rebounds: 'REB',
  assists:  'AST',
  threes:   'FG3M',
  steals:   'STL',
  blocks:   'BLK',
};

const ALL_STATS = Object.keys(STAT_KEY_MAP);

function nbaAbbr(espn) {
  return ESPN_TO_NBA[espn] || espn;
}

function safeAvg(games, key) {
  if (!games.length) return null;
  const sum = games.reduce((s, g) => s + (Number(g[key]) || 0), 0);
  return Math.round((sum / games.length) * 10) / 10;
}

// Select the best market for a player+stat. Primary signal: highest yes_bid (lower threshold =
// higher bid price = what Kalshi's app surfaces as default). Falls back to closest line at or
// below season average when bid data is absent.
function pickBestMarket(candidates, seasonAvg, playerName, stat) {
  console.log(
    `[Kalshi pick] ${playerName} ${stat} | avg=${seasonAvg} |`,
    candidates.map(c => `${c.line}+(bid=${c.yesBid},OI=${c.openInterest})`).join(' ')
  );

  if (candidates.length === 1) return candidates[0];

  // Primary: highest yes_bid — a lower threshold has a higher probability → higher bid price.
  // This is exactly the line Kalshi's own app shows as the default.
  const maxBid = Math.max(...candidates.map(c => c.yesBid));
  if (maxBid > 0) {
    const byBid = candidates.filter(c => c.yesBid === maxBid);
    const pick = byBid.length === 1
      ? byBid[0]
      : closestToAvg(byBid, seasonAvg);
    console.log(`[Kalshi pick] → ${pick.line}+ (bid=${pick.yesBid})`);
    return pick;
  }

  // No bid data: prefer lines at or below season avg to avoid picking lines the player rarely hits.
  const pick = closestToAvg(candidates, seasonAvg);
  console.log(`[Kalshi pick] → ${pick.line}+ (no bid, avg fallback)`);
  return pick;
}

function closestToAvg(candidates, seasonAvg) {
  if (seasonAvg == null) return candidates[Math.floor(candidates.length / 2)];
  // Prefer lines at or below the avg; only go above if every candidate exceeds it.
  const atOrBelow = candidates.filter(c => c.line <= seasonAvg);
  const pool = atOrBelow.length ? atOrBelow : candidates;
  return pool.reduce((best, c) =>
    Math.abs(c.line - seasonAvg) < Math.abs(best.line - seasonAvg) ? c : best
  );
}

// Tier weights (base, before scaling/normalization)
const BASE_WEIGHTS = { t1: 0.38, t2: 0.27, t3: 0.22, t4: 0.13 };

function tierRate(games, key, line) {
  if (!games.length) return null;
  return games.filter(g => (Number(g[key]) || 0) >= line).length / games.length;
}

function computeWeightedScore(games, key, line, opponentAbbr) {
  const regular  = games.filter(g => g.SEASON_TYPE !== 'Playoffs');
  const playoffs = games.filter(g => g.SEASON_TYPE === 'Playoffs');

  // T1: current playoff series vs opponent (most recent games vs this opponent in playoffs)
  const seriesGames = opponentAbbr
    ? playoffs.filter(g => (g.MATCHUP || '').toUpperCase().includes(opponentAbbr.toUpperCase()))
    : [];

  // T3: regular season vs opponent
  const vsRegGames = opponentAbbr
    ? regular.filter(g => (g.MATCHUP || '').toUpperCase().includes(opponentAbbr.toUpperCase()))
    : [];

  const t1Rate = tierRate(seriesGames, key, line);
  const t2Rate = tierRate(playoffs, key, line);
  const t3Rate = tierRate(vsRegGames, key, line);
  const t4Rate = tierRate(regular, key, line);

  // Scale T1 by min(games/4, 1), T3 by min(games/3, 1)
  const t1Scale = seriesGames.length ? Math.min(seriesGames.length / 4, 1) : 0;
  const t3Scale = vsRegGames.length  ? Math.min(vsRegGames.length  / 3, 1) : 0;

  const rawWeights = {
    t1: t1Rate != null ? BASE_WEIGHTS.t1 * t1Scale : 0,
    t2: t2Rate != null ? BASE_WEIGHTS.t2           : 0,
    t3: t3Rate != null ? BASE_WEIGHTS.t3 * t3Scale : 0,
    t4: t4Rate != null ? BASE_WEIGHTS.t4           : 0,
  };

  const totalRaw = rawWeights.t1 + rawWeights.t2 + rawWeights.t3 + rawWeights.t4;

  let weightedScore = 0;
  const tiers = {};

  if (totalRaw > 0) {
    const norm = {
      t1: rawWeights.t1 / totalRaw,
      t2: rawWeights.t2 / totalRaw,
      t3: rawWeights.t3 / totalRaw,
      t4: rawWeights.t4 / totalRaw,
    };

    weightedScore =
      (t1Rate ?? 0) * norm.t1 +
      (t2Rate ?? 0) * norm.t2 +
      (t3Rate ?? 0) * norm.t3 +
      (t4Rate ?? 0) * norm.t4;

    tiers.t1 = { games: seriesGames.length, rate: t1Rate, weight: Math.round(norm.t1 * 100), label: 'Series vs Opp' };
    tiers.t2 = { games: playoffs.length,    rate: t2Rate, weight: Math.round(norm.t2 * 100), label: 'All Playoffs'  };
    tiers.t3 = { games: vsRegGames.length,  rate: t3Rate, weight: Math.round(norm.t3 * 100), label: 'Reg vs Opp'   };
    tiers.t4 = { games: regular.length,     rate: t4Rate, weight: Math.round(norm.t4 * 100), label: 'All Reg Season' };
  } else {
    // No data at all — treat as 0%
    tiers.t1 = { games: 0, rate: null, weight: 0, label: 'Series vs Opp' };
    tiers.t2 = { games: 0, rate: null, weight: 0, label: 'All Playoffs'  };
    tiers.t3 = { games: 0, rate: null, weight: 0, label: 'Reg vs Opp'    };
    tiers.t4 = { games: 0, rate: null, weight: 0, label: 'All Reg Season' };
  }

  return { weightedScore, tiers, seriesGames: seriesGames.length };
}

function scoreMarket(games, key, line, opponentAbbr) {
  const byDate = [...games].sort((a, b) => new Date(b.GAME_DATE) - new Date(a.GAME_DATE));

  const regular  = games.filter(g => g.SEASON_TYPE !== 'Playoffs');
  const playoffs = games.filter(g => g.SEASON_TYPE === 'Playoffs');
  const last5    = byDate.slice(0, 5);
  const vsOpp    = opponentAbbr
    ? games.filter(g => (g.MATCHUP || '').toUpperCase().includes(opponentAbbr.toUpperCase()))
    : [];

  const { weightedScore, tiers, seriesGames } = computeWeightedScore(games, key, line, opponentAbbr);

  const rating = weightedScore >= 0.80 ? 'green'
    : weightedScore >= 0.65 ? 'blue'
    : weightedScore >= 0.50 ? 'yellow'
    : 'red';

  // Build per-tier game value arrays for client-side re-scoring when lines change
  const tierGameValues = {
    series: (opponentAbbr
      ? playoffs.filter(g => (g.MATCHUP || '').toUpperCase().includes(opponentAbbr.toUpperCase()))
      : []).map(g => Number(g[key]) || 0),
    playoffs: playoffs.map(g => Number(g[key]) || 0),
    vsReg: (opponentAbbr
      ? regular.filter(g => (g.MATCHUP || '').toUpperCase().includes(opponentAbbr.toUpperCase()))
      : []).map(g => Number(g[key]) || 0),
    regular: regular.map(g => Number(g[key]) || 0),
  };

  return {
    seasonAvg:     safeAvg(regular, key),
    last5Avg:      safeAvg(last5, key),
    playoffAvg:    playoffs.length ? safeAvg(playoffs, key) : null,
    vsAvg:         vsOpp.length ? safeAvg(vsOpp, key) : null,
    vsGames:       vsOpp.length,
    overRate:      Math.round(weightedScore * 100),
    weightedScore: Math.round(weightedScore * 100),
    gamesAnalyzed: games.length,
    rating,
    tiers,
    seriesGames,
    tierGameValues,
  };
}

// ── Per-game context cache (Kalshi markets + roster, reused by per-player endpoint) ──────────
const gameMarketsCache = new Map();
const MARKET_CACHE_TTL = 60 * 60 * 1000; // 1 hour

async function buildGameContext(gameId) {
  const existing = gameMarketsCache.get(gameId);
  if (existing && Date.now() - existing.ts < MARKET_CACHE_TTL) return existing;

  const boxscore = await nbaService.getGameBoxscore(gameId);
  const teams = boxscore.teams || [];
  if (!teams.length) return null;

  let gameDate = boxscore.gameDate;
  if (!gameDate) {
    try {
      const upcoming = await nbaService.getUpcomingGames(14);
      const match = upcoming.find(g => String(g.gameId) === String(gameId));
      if (match) gameDate = match.date;
    } catch { /* ignore */ }
  }
  if (!gameDate) gameDate = new Date().toISOString();

  const abbr1 = nbaAbbr(teams[0]?.abbreviation || '');
  const abbr2 = nbaAbbr(teams[1]?.abbreviation || '');

  const [statMarkets, rosterArrays] = await Promise.all([
    kalshiService.fetchMarketsForGame(gameDate, abbr1, abbr2),
    Promise.all(teams.map(t =>
      nbaService.getTeamRoster(t.teamId)
        .then(r => r.map(p => ({ ...p, teamId: t.teamId, teamName: t.teamName, abbreviation: t.abbreviation })))
        .catch(() => [])
    )),
  ]);

  const allPlayers = [];
  rosterArrays.flat().forEach(p => {
    if (!p.playerId) return;
    allPlayers.push({
      athleteId:    p.playerId,
      fullName:     p.fullName || p.displayName,
      teamId:       p.teamId,
      teamName:     p.teamName,
      abbreviation: p.abbreviation,
      headshot:     p.headshot,
      position:     p.position,
    });
  });

  const marketsByAthlete = kalshiService.matchPlayersToMarkets(statMarkets, allPlayers);
  const totalKalshi = Object.values(statMarkets).reduce((s, arr) => s + arr.length, 0);

  const opponents = {};
  teams.forEach(t => {
    const opp = teams.find(o => String(o.teamId) !== String(t.teamId));
    if (opp) opponents[String(t.teamId)] = nbaAbbr(opp.abbreviation || '');
  });

  const rosterCounts = teams.map(t => ({
    teamId:       t.teamId,
    abbreviation: t.abbreviation,
    teamName:     t.teamName,
    total:        allPlayers.filter(p => String(p.teamId) === String(t.teamId)).length,
  }));

  const ctx = { teams, allPlayers, marketsByAthlete, statMarkets, totalKalshi, opponents, rosterCounts, ts: Date.now() };
  gameMarketsCache.set(gameId, ctx);
  return ctx;
}

// GET /:gameId/betting/setup — fast: returns roster + Kalshi markets, no game-log fetches
exports.getGameSetup = async (req, res) => {
  try {
    const { gameId } = req.params;
    if (req.query.force === '1') gameMarketsCache.delete(gameId);
    const ctx = await buildGameContext(gameId);

    if (!ctx) {
      return res.json({ gameId, teams: [], players: [], message: 'Game information not available yet.' });
    }

    const { teams, allPlayers, marketsByAthlete, totalKalshi, rosterCounts } = ctx;
    const teamsSummary = teams.map(t => ({ teamId: t.teamId, teamName: t.teamName, abbreviation: t.abbreviation }));

    if (!allPlayers.length) {
      return res.json({
        gameId, teams: teamsSummary, players: [], rosterCounts, kalshiTotal: totalKalshi,
        message: 'Player roster data not available yet. Try again closer to tip-off.',
      });
    }

    const matchedCount = Object.keys(marketsByAthlete).length;
    const noMarketsMsg = matchedCount === 0 && totalKalshi > 0
      ? `${totalKalshi} Kalshi markets found but none matched roster names. Markets typically open a few hours before tip-off.`
      : null;

    const players = allPlayers.map(p => ({
      athleteId:    p.athleteId,
      playerName:   p.fullName,
      teamId:       p.teamId,
      teamName:     p.teamName,
      abbreviation: p.abbreviation,
      headshot:     p.headshot,
      position:     p.position,
      markets:      marketsByAthlete[p.athleteId] || {},
      hasMarkets:   Object.keys(marketsByAthlete[p.athleteId] || {}).length > 0,
    }));

    players.sort((a, b) => {
      if (a.hasMarkets !== b.hasMarkets) return a.hasMarkets ? -1 : 1;
      return Object.keys(b.markets).length - Object.keys(a.markets).length;
    });

    res.json({ gameId, teams: teamsSummary, rosterCounts, kalshiTotal: totalKalshi, message: noMarketsMsg, players });
  } catch (error) {
    console.error('[Betting Setup]', error);
    res.status(500).json({ error: error.message });
  }
};

// GET /:gameId/betting/player/:athleteId — fetches game logs + scores for one player
exports.getPlayerBetStats = async (req, res) => {
  try {
    const { gameId, athleteId } = req.params;
    const ctx = await buildGameContext(gameId);
    if (!ctx) return res.status(404).json({ error: 'Game context not available' });

    const { allPlayers, marketsByAthlete, statMarkets, opponents } = ctx;
    const player = allPlayers.find(p => String(p.athleteId) === String(athleteId));
    if (!player) return res.status(404).json({ error: 'Player not found in this game' });

    const opponentAbbr  = opponents[String(player.teamId)] || '';
    const playerMarkets = marketsByAthlete[String(athleteId)] || {};

    // Match "other" markets to this player
    const nameLower = (player.fullName || '').toLowerCase().replace(/[''`]/g, '');
    const nameParts = nameLower.split(/[\s-]+/).filter(p => p.length > 1);
    const suffixes  = new Set(['jr', 'sr', 'ii', 'iii', 'iv', 'v']);
    const lastName  = (suffixes.has(nameParts[nameParts.length - 1]) && nameParts.length > 2)
      ? nameParts[nameParts.length - 2] : nameParts[nameParts.length - 1];
    const firstName = nameParts[0] || '';
    const otherMarkets = (statMarkets?.other || []).filter(m => {
      const t = m.playerName.toLowerCase().replace(/[''`]/g, '');
      if (!t.includes(lastName)) return false;
      return t.includes(firstName) || (firstName.length > 0 && t.startsWith(firstName[0]));
    });

    const logData = await nbaService.getPlayerGameLogs(player.fullName, '2025-26');
    const games   = logData.games || [];

    const summary = { green: 0, blue: 0, yellow: 0, red: 0 };
    const stats   = {};

    for (const stat of ALL_STATS) {
      const candidates = playerMarkets[stat];
      if (!candidates || !candidates.length) { stats[stat] = null; continue; }

      const key          = STAT_KEY_MAP[stat];
      const regularGames = games.filter(g => g.SEASON_TYPE !== 'Playoffs');
      const seasonAvg    = safeAvg(regularGames, key);
      const market       = pickBestMarket(candidates, seasonAvg, player.fullName, stat);
      const scored       = scoreMarket(games, key, market.line, opponentAbbr);

      stats[stat] = { ...market, ...scored, defaultLine: market.line, candidates };
      summary[scored.rating]++;
    }

    const seriesGames = Math.max(
      ...Object.values(stats).filter(Boolean).map(s => s.seriesGames || 0), 0
    );

    res.json({ athleteId, stats, summary, seriesGames, otherMarkets });
  } catch (error) {
    if (error.rateLimited) return res.json({ athleteId: req.params.athleteId, rateLimited: true });
    console.error('[Betting Player]', error);
    res.status(500).json({ error: error.message });
  }
};

// ── Legacy single-request endpoint (kept for backward compat) ─────────────────────────────────
exports.getBettingAnalysis = async (req, res) => {
  try {
    const { gameId } = req.params;

    // 1. Boxscore gives teams; player list comes from roster API (see step 3)
    const boxscore = await nbaService.getGameBoxscore(gameId);
    const teams      = boxscore.teams || [];
    const allPlayers = []; // populated from roster API below — boxscore list is unreliable during live games

    const teamsSummary = teams.map(t => ({
      teamId:       t.teamId,
      teamName:     t.teamName,
      abbreviation: t.abbreviation,
    }));

    if (!teams.length) {
      return res.json({
        gameId,
        teams:   teamsSummary,
        players: [],
        message: 'Game information not available yet.',
      });
    }

    // 2. Determine game date and team abbreviations for Kalshi event ticker construction.
    //    For pre-game, boxscore.gameDate may be null → use upcoming games API as fallback.
    let gameDate = boxscore.gameDate;
    if (!gameDate) {
      try {
        const upcoming = await nbaService.getUpcomingGames(14);
        const match = upcoming.find(g => String(g.gameId) === String(gameId));
        if (match) gameDate = match.date;
      } catch { /* ignore */ }
    }
    if (!gameDate) gameDate = new Date().toISOString();

    const abbr1 = nbaAbbr(teams[0]?.abbreviation || '');
    const abbr2 = nbaAbbr(teams[1]?.abbreviation || '');

    // 3. Fetch Kalshi markets + complete rosters for both teams in parallel.
    //    Always use the roster API as the authoritative player source — the boxscore player
    //    list is incomplete during live games (bench players not yet on court are absent).
    const [statMarkets, rosterArrays] = await Promise.all([
      kalshiService.fetchMarketsForGame(gameDate, abbr1, abbr2),
      Promise.all(teams.map(t =>
        nbaService.getTeamRoster(t.teamId)
          .then(r => r.map(p => ({ ...p, teamId: t.teamId, teamName: t.teamName, abbreviation: t.abbreviation })))
          .catch(() => [])
      )),
    ]);

    // Populate allPlayers from roster data (no filtering by minutes, usage, or play status)
    rosterArrays.flat().forEach(p => {
      if (!p.playerId) return; // skip malformed entries
      allPlayers.push({
        athleteId:    p.playerId,
        fullName:     p.fullName || p.displayName,
        teamId:       p.teamId,
        teamName:     p.teamName,
        abbreviation: p.abbreviation,
        headshot:     p.headshot,
        position:     p.position,
      });
    });

    // Per-team roster counts — sent to the frontend for the roster indicator
    const rosterCounts = teams.map(t => ({
      teamId:       t.teamId,
      abbreviation: t.abbreviation,
      teamName:     t.teamName,
      total:        allPlayers.filter(p => String(p.teamId) === String(t.teamId)).length,
    }));

    const totalKalshi = Object.values(statMarkets).reduce((s, arr) => s + arr.length, 0);

    if (!allPlayers.length) {
      return res.json({
        gameId,
        teams:       teamsSummary,
        players:     [],
        kalshiTotal: totalKalshi,
        message:     'Player roster data not available yet. Try again closer to tip-off.',
      });
    }

    // 4. Match markets to players by name
    const marketsByAthlete = kalshiService.matchPlayersToMarkets(statMarkets, allPlayers);
    const matchedCount     = Object.keys(marketsByAthlete).length;
    const noMarketsMsg     = matchedCount === 0 && totalKalshi > 0
      ? `${totalKalshi} Kalshi markets found but none matched roster names. Markets typically open a few hours before tip-off.`
      : null;

    // Helper: opponent NBA abbreviation for a given teamId
    const opponentNbaFor = (teamId) => {
      const opp = teams.find(t => String(t.teamId) !== String(teamId));
      return opp ? nbaAbbr(opp.abbreviation || '') : '';
    };

    // 5. Fetch game logs + score bets for ALL roster players in parallel.
    //    Players with no Kalshi markets get stats: { <stat>: null } and show "No market available".

    const analyzed = (await Promise.all(allPlayers.map(async player => {
      try {
        const opponentAbbr  = opponentNbaFor(player.teamId);
        const logData       = await nbaService.getPlayerGameLogs(player.fullName, '2025-26');
        const games         = logData.games || [];
        const playerMarkets = marketsByAthlete[player.athleteId] || {};
        const summary       = { green: 0, blue: 0, yellow: 0, red: 0 };
        const stats         = {};

        for (const stat of ALL_STATS) {
          const candidates = playerMarkets[stat];
          if (!candidates || !candidates.length) { stats[stat] = null; continue; }

          const key          = STAT_KEY_MAP[stat];
          const regularGames = games.filter(g => g.SEASON_TYPE !== 'Playoffs');
          const seasonAvg    = safeAvg(regularGames, key);
          const market       = pickBestMarket(candidates, seasonAvg, player.fullName, stat);
          const scored       = scoreMarket(games, key, market.line, opponentAbbr);

          stats[stat] = { ...market, ...scored, defaultLine: market.line, candidates };
          summary[scored.rating]++;
        }

        const playerSeriesGames = Math.max(
          ...Object.values(stats).filter(Boolean).map(s => s.seriesGames || 0), 0
        );

        return {
          athleteId:    player.athleteId,
          playerName:   player.fullName,
          teamId:       player.teamId,
          teamName:     player.teamName,
          abbreviation: player.abbreviation,
          headshot:     player.headshot,
          position:     player.position,
          seriesGames:  playerSeriesGames,
          stats,
          summary,
        };
      } catch (err) {
        console.warn(`[Betting] Skipping ${player.fullName}: ${err.message}`);
        return null;
      }
    }))).filter(Boolean);

    // Sort: most Kalshi markets first, then by green+blue quality
    analyzed.sort((a, b) => {
      const aCount = Object.values(a.stats).filter(Boolean).length;
      const bCount = Object.values(b.stats).filter(Boolean).length;
      if (bCount !== aCount) return bCount - aCount;
      return (b.summary.green + b.summary.blue) - (a.summary.green + a.summary.blue);
    });

    res.json({
      gameId,
      teams:        teamsSummary,
      kalshiTotal:  totalKalshi,
      rosterCounts,
      message:      noMarketsMsg,
      players:      analyzed,
    });
  } catch (error) {
    console.error('[Betting] Controller error:', error);
    res.status(500).json({ error: error.message });
  }
};
