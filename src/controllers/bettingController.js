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

function scoreMarket(games, key, line, opponentAbbr) {
  const byDate = [...games].sort((a, b) => new Date(b.GAME_DATE) - new Date(a.GAME_DATE));

  const regular  = games.filter(g => g.SEASON_TYPE !== 'Playoffs');
  const playoffs = games.filter(g => g.SEASON_TYPE === 'Playoffs');
  const last5    = byDate.slice(0, 5);
  const last20   = byDate.slice(0, 20);
  const vsOpp    = opponentAbbr
    ? games.filter(g => (g.MATCHUP || '').toUpperCase().includes(opponentAbbr.toUpperCase()))
    : [];

  const overCount = last20.filter(g => (Number(g[key]) || 0) >= line).length;
  const overRate  = last20.length ? overCount / last20.length : 0;

  const rating = overRate >= 0.70 ? 'green'
    : overRate >= 0.55 ? 'blue'
    : overRate >= 0.40 ? 'yellow'
    : 'red';

  return {
    seasonAvg:     safeAvg(regular, key),
    last5Avg:      safeAvg(last5, key),
    playoffAvg:    playoffs.length ? safeAvg(playoffs, key) : null,
    vsAvg:         vsOpp.length ? safeAvg(vsOpp, key) : null,
    vsGames:       vsOpp.length,
    overRate:      Math.round(overRate * 100),
    gamesAnalyzed: last20.length,
    rating,
  };
}

exports.getBettingAnalysis = async (req, res) => {
  try {
    const { gameId } = req.params;

    // 1. Boxscore gives players + teams (may be sparse for pre-game)
    const boxscore = await nbaService.getGameBoxscore(gameId);
    const teams      = boxscore.teams || [];
    const allPlayers = (boxscore.players || []).filter(p => p.fullName && !p.didNotPlay);

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

    // 3. Fetch individual stat markets from Kalshi by event ticker (parallel with roster fetch)
    const [statMarkets, rosterData] = await Promise.all([
      kalshiService.fetchMarketsForGame(gameDate, abbr1, abbr2),
      // Pre-game: fetch rosters for both teams to populate the player list
      allPlayers.length === 0
        ? Promise.all(teams.map(t => nbaService.getTeamRoster(t.teamId).then(r =>
            r.map(p => ({ ...p, teamId: t.teamId, teamName: t.teamName, abbreviation: t.abbreviation }))
          ).catch(() => [])))
        : Promise.resolve(null),
    ]);

    // Merge roster data into allPlayers when boxscore was empty
    if (rosterData) {
      const merged = rosterData.flat().map(p => ({
        athleteId:    p.playerId,   // roster uses playerId (ESPN athlete ID)
        fullName:     p.fullName || p.displayName,
        teamId:       p.teamId,
        teamName:     p.teamName,
        abbreviation: p.abbreviation,
        headshot:     p.headshot,
        position:     p.position,
        didNotPlay:   false,
      }));
      allPlayers.push(...merged);
    }

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
    const matchedIds       = Object.keys(marketsByAthlete);

    if (!matchedIds.length) {
      return res.json({
        gameId,
        teams:       teamsSummary,
        players:     [],
        kalshiTotal: totalKalshi,
        message:     `Found ${totalKalshi} Kalshi markets but none matched players in this game's roster. Markets typically open a few hours before tip-off.`,
      });
    }

    // Helper: opponent NBA abbreviation for a given teamId
    const opponentNbaFor = (teamId) => {
      const opp = teams.find(t => String(t.teamId) !== String(teamId));
      return opp ? nbaAbbr(opp.abbreviation || '') : '';
    };

    // 5. Fetch game logs + score bets (all players in parallel)
    const matchedPlayers = allPlayers.filter(p => marketsByAthlete[p.athleteId]);

    const analyzed = (await Promise.all(matchedPlayers.map(async player => {
      try {
        const opponentAbbr  = opponentNbaFor(player.teamId);
        const logData       = await nbaService.getPlayerGameLogs(player.fullName, '2025-26');
        const games         = logData.games || [];
        const playerMarkets = marketsByAthlete[player.athleteId];
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

          const byDate     = [...games].sort((a, b) => new Date(b.GAME_DATE) - new Date(a.GAME_DATE));
          const gameValues = byDate.slice(0, 20).map(g => Number(g[key]) || 0);

          stats[stat] = { ...market, ...scored, defaultLine: market.line, candidates, gameValues };
          summary[scored.rating]++;
        }

        return {
          athleteId:    player.athleteId,
          playerName:   player.fullName,
          teamId:       player.teamId,
          teamName:     player.teamName,
          abbreviation: player.abbreviation,
          headshot:     player.headshot,
          position:     player.position,
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
      teams:       teamsSummary,
      kalshiTotal: totalKalshi,
      players:     analyzed,
    });
  } catch (error) {
    console.error('[Betting] Controller error:', error);
    res.status(500).json({ error: error.message });
  }
};
