'use strict';

const axios = require('axios');

// Kalshi moved sports/elections markets to this domain
const KALSHI_API = 'https://api.elections.kalshi.com/trade-api/v2';

// Individual stat series event ticker prefixes
const STAT_SERIES = {
  points:   'KXNBAPTS',
  rebounds: 'KXNBAREB',
  assists:  'KXNBAAST',
  threes:   'KXNBA3PT',
  steals:   'KXNBASTL',
  blocks:   'KXNBABLK',
};

// Months for Kalshi date format (YYMMM DD → e.g., 26MAY10)
const MONTHS = ['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'];

class KalshiService {
  constructor() {
    this.http = axios.create({
      baseURL: KALSHI_API,
      timeout: 6000,
      headers: { Accept: 'application/json' },
    });
  }

  // Convert an ISO date string to Kalshi event date format (e.g., "26MAY10")
  // NBA games use US Eastern time; we use UTC date which is correct for all
  // games except very late (>10 PM ET) west-coast start times.
  _formatDate(dateStr) {
    const d = new Date(dateStr);
    // Shift 5h back to approximate ET (handles EDT and edge cases)
    const et = new Date(d.getTime() - 5 * 60 * 60 * 1000);
    const year  = et.getUTCFullYear().toString().slice(-2);
    const month = MONTHS[et.getUTCMonth()];
    const day   = et.getUTCDate().toString().padStart(2, '0');
    return `${year}${month}${day}`;
  }

  // Parse "Player Name: X+ stat" → { playerName, line }
  _parseMarketTitle(title) {
    if (!title) return null;
    const m = title.match(/^([^:]+):\s*(\d+(?:\.\d+)?)\+/);
    if (!m) return null;
    return { playerName: m[1].trim(), line: parseFloat(m[2]) };
  }

  _yesPrice(market) {
    const bid = parseFloat(market.yes_bid) || null;
    const ask = parseFloat(market.yes_ask) || null;
    if (bid !== null && ask !== null) return Math.round((bid + ask) / 2);
    const last = parseFloat(market.last_price_dollars || market.last_price);
    return isNaN(last) ? null : Math.round(last * 100);
  }

  // Fetch all individual player prop markets for a specific game.
  // Tries both home/away orderings automatically.
  // Returns { points: [{playerName, line, ticker, yesPrice}], rebounds: [...], ... }
  async fetchMarketsForGame(gameDate, abbr1, abbr2) {
    const kalshiDate = this._formatDate(gameDate);
    const teamCombos = [`${abbr1}${abbr2}`, `${abbr2}${abbr1}`];

    const sleep = ms => new Promise(r => setTimeout(r, ms));
    const result = {};

    for (const [stat, series] of Object.entries(STAT_SERIES)) {
      result[stat] = [];
      if (Object.keys(result).length > 1) await sleep(150);

      for (const combo of teamCombos) {
        const eventTicker = `${series}-${kalshiDate}${combo}`;
        try {
          const { data } = await this.http.get('/markets', {
            params: { event_ticker: eventTicker, limit: 200 },
          });
          const markets = data.markets || [];
          if (!markets.length) continue;

          const parsed = markets
            .map(m => {
              const p = this._parseMarketTitle(m.title);
              if (!p) return null;
              return {
                playerName:   p.playerName,
                line:         p.line,
                ticker:       m.ticker,
                yesPrice:     this._yesPrice(m),
                yesBid:       parseFloat(m.yes_bid) || 0,
                openInterest: Number(m.open_interest) || 0,
              };
            })
            .filter(Boolean);

          if (parsed.length) {
            result[stat] = parsed;
            break;
          }
        } catch (err) {
          console.warn(`[Kalshi] ${eventTicker}: ${err.message}`);
        }
      }
    }

    console.log('[Kalshi] Markets per stat:', Object.fromEntries(
      Object.entries(result).map(([k, v]) => [k, v.length])
    ));

    return result;
  }

  // From the per-stat market lists, find which players have markets and pick
  // the best line for each player+stat pair.
  // Returns { athleteId: { stat: { line, yesPrice, ticker } } }
  matchPlayersToMarkets(statMarkets, players) {
    const result = {};

    for (const player of players) {
      const name = (player.fullName || '').toLowerCase().replace(/[''`]/g, '');
      const aid  = player.athleteId;
      if (!name || !aid) continue;

      const nameParts = name.split(/[\s-]+/).filter(p => p.length > 1);
      const suffixes  = new Set(['jr', 'sr', 'ii', 'iii', 'iv', 'v']);
      const last = (suffixes.has(nameParts[nameParts.length - 1]) && nameParts.length > 2)
        ? nameParts[nameParts.length - 2]
        : nameParts[nameParts.length - 1];
      const first = nameParts[0] || '';

      for (const [stat, markets] of Object.entries(statMarkets)) {
        // Find all markets matching this player
        const matched = markets.filter(m => {
          const t = m.playerName.toLowerCase().replace(/[''`]/g, '');
          if (!t.includes(last)) return false;
          return t.includes(first) || (first.length > 0 && t.startsWith(first[0]));
        });

        if (!matched.length) continue;

        // Return all candidates sorted by line ascending; controller picks the best.
        matched.sort((a, b) => a.line - b.line);

        if (!result[aid]) result[aid] = {};
        result[aid][stat] = matched;
      }
    }

    return result;
  }
}

module.exports = new KalshiService();
