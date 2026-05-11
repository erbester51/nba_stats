'use strict';

const axios = require('axios');

// Kalshi moved sports/elections markets to this domain
const KALSHI_API = 'https://api.elections.kalshi.com/trade-api/v2';

// All known event ticker prefix variants per stat category.
// Primary prefix is first; fallbacks are tried if the primary returns no markets.
const STAT_SERIES_VARIANTS = {
  points:   ['KXNBAPTS'],
  rebounds: ['KXNBAREB'],
  assists:  ['KXNBAAST'],
  threes:   ['KXNBA3PT', 'KXNBA3PM', 'KXNBATHREE', 'KXNBA3PTMADE', 'KXNBA3'],
  steals:   ['KXNBASTL', 'KXNBASTEAL', 'KXNBASTLS', 'KXNBAST'],
  blocks:   ['KXNBABLK', 'KXNBABLOCK', 'KXNBABKS',  'KXNBABK'],
};

// Title keyword lists for stat classification — checked in order, most-specific first.
// Short abbreviations (stl/blk/reb/ast/pts) are space-prefixed to avoid false matches.
const STAT_KEYWORDS = {
  threes:   ['three-pointer', '3-pointer', '3-pointers made', 'three pointers made',
             'threes made', '3pt made', 'three pointers', 'three made', '3 pointer',
             'made threes', 'threes', '3pt', 'three'],
  blocks:   ['blocks', ' blk', 'block'],
  steals:   ['steals', ' stl', 'steal'],
  rebounds: ['rebounds', 'rebound', ' reb'],
  assists:  ['assists', 'assist', ' ast'],
  points:   ['points', 'point', ' pts'],
};

// Known name mismatches between NBA API and Kalshi market titles.
// Key: normalized full name (lowercase, hyphens→spaces, no punctuation)
// Value: extra aliases to try when normal matching fails
const NAME_ALIASES = {
  'shai gilgeous alexander': ['sga', 'gilgeous alexander', 'gilgeous'],
  'lebron james':            ['lebron'],
  'karl anthony towns':      ['kat', 'karl anthony'],
  'nickeil alexander walker':['naw', 'alexander walker'],
  'jaren jackson':           ['jjj'],
  'og anunoby':              ['og anunoby', 'og'],
  'naz reid':                ['naz'],
  'tj mcconnell':            ['t.j. mcconnell', 'tj mcconnell'],
  'pj washington':           ['p.j. washington', 'pj washington'],
  'cj mccollum':             ['c.j. mccollum', 'cj mccollum'],
  'dj wilson':               ['d.j. wilson'],
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

  // Parse "Player Name: X+ stat desc" → { playerName, line, statDesc }
  _parseMarketTitle(title) {
    if (!title) return null;
    const m = title.match(/^([^:]+):\s*(\d+(?:\.\d+)?)\+\s*(.*)/);
    if (!m) return null;
    return { playerName: m[1].trim(), line: parseFloat(m[2]), statDesc: m[3].trim().toLowerCase() };
  }

  // Classify a market into a stat category by checking ticker prefix first, then title keywords.
  _detectStatCategory(eventTicker, title) {
    const ticker = (eventTicker || '').toUpperCase();
    for (const [stat, variants] of Object.entries(STAT_SERIES_VARIANTS)) {
      if (variants.some(v => ticker.startsWith(v))) return stat;
    }
    const t = (title || '').toLowerCase();
    for (const [stat, keywords] of Object.entries(STAT_KEYWORDS)) {
      if (keywords.some(kw => t.includes(kw))) return stat;
    }
    return 'other';
  }

  _yesPrice(market) {
    const bid = parseFloat(market.yes_bid) || null;
    const ask = parseFloat(market.yes_ask) || null;
    if (bid !== null && ask !== null) return Math.round((bid + ask) / 2);
    const last = parseFloat(market.last_price_dollars || market.last_price);
    return isNaN(last) ? null : Math.round(last * 100);
  }

  // Fetch all player prop markets for a specific game.
  //
  // Strategy: search each known series by series_ticker (no need to guess event ticker format or
  // team-combo order). Filter results locally by kalshiDate + either team abbreviation. Then
  // classify every market by title keywords — no stat assumed from query params.
  //
  // Returns { points, rebounds, assists, threes, steals, blocks, other }
  async fetchMarketsForGame(gameDate, abbr1, abbr2) {
    const kalshiDate  = this._formatDate(gameDate);
    const a1          = abbr1.toUpperCase();
    const a2          = abbr2.toUpperCase();
    const sleep       = ms => new Promise(r => setTimeout(r, ms));

    const allStats = ['points', 'rebounds', 'assists', 'threes', 'steals', 'blocks'];
    const result   = Object.fromEntries([...allStats, 'other'].map(s => [s, []]));
    const seen     = new Set();

    // Deduplicated flat list of every series prefix we know about
    const seriesList = [...new Set(Object.values(STAT_SERIES_VARIANTS).flat())];

    console.log(`[Kalshi] Searching ${seriesList.length} series for ${a1}/${a2} on ${kalshiDate}`);

    for (let i = 0; i < seriesList.length; i++) {
      const series = seriesList[i];
      try {
        const { data } = await this.http.get('/markets', {
          params: { series_ticker: series, status: 'open', limit: 1000 },
        });

        // Keep only markets whose event_ticker contains today's date + either team abbreviation
        const gameMarkets = (data.markets || []).filter(m => {
          const et = (m.event_ticker || '').toUpperCase();
          return et.includes(kalshiDate) && (et.includes(a1) || et.includes(a2));
        });

        if (gameMarkets.length) {
          console.log(`[Kalshi] series ${series}: ${gameMarkets.length} game markets`);
        }

        for (const m of gameMarkets) {
          if (seen.has(m.ticker)) continue;
          seen.add(m.ticker);
          const p = this._parseMarketTitle(m.title);
          if (!p) continue;
          const category = this._detectStatCategory(m.event_ticker, m.title);
          console.log(`[Kalshi]   ${m.title} → ${category}`);
          result[category].push({
            playerName:   p.playerName,
            line:         p.line,
            statDesc:     p.statDesc,
            ticker:       m.ticker,
            yesPrice:     this._yesPrice(m),
            yesBid:       parseFloat(m.yes_bid) || 0,
            openInterest: Number(m.open_interest) || 0,
          });
        }
      } catch (err) {
        console.warn(`[Kalshi] series ${series}: ${err.message}`);
      }
      if (i < seriesList.length - 1) await sleep(100);
    }

    console.log('[Kalshi] Markets per category:', Object.fromEntries(
      Object.entries(result).map(([k, v]) => [k, v.length])
    ));

    return result;
  }

  // Normalize a name for fuzzy comparison:
  // lowercase, strip apostrophes/periods/backticks, hyphen→space, collapse whitespace
  _normName(s) {
    return (s || '').toLowerCase()
      .replace(/[''`\.]/g, '')
      .replace(/-/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  // Multi-step fuzzy match: returns the step number (1–5) that matched, or 0 for no match.
  // Step 1: exact full name
  // Step 2: last name + full first name or first-letter word
  // Step 3: first initial as leading word + last name (e.g. "S Gilgeous Alexander")
  // Step 4: any surname component matches + first-name hint (handles hyphenated names)
  // Step 5: known alias match
  _matchStep(mNameNorm, fullNorm, first, last, surnameComponents, aliases) {
    const t = mNameNorm;
    const words = t.split(' ');

    if (t === fullNorm) return 1;

    if (t.includes(last)) {
      if (t.includes(first)) return 2;
      if (words.some(w => w === first[0] || w === first[0] + '.')) return 2;
    }

    // Step 3: market name starts with just the initial, then contains last
    if (t.includes(last) && words[0] === first[0]) return 3;

    // Step 4: multi-part surname — any component present + first-name hint
    if (surnameComponents.length > 1) {
      const hasSurname = surnameComponents.some(sc => t.includes(sc));
      const hasFirst   = t.includes(first) || words.some(w => w === first[0] || w === first[0] + '.');
      if (hasSurname && hasFirst) return 4;
    }

    // Step 5: alias
    if (aliases.length && aliases.some(a => t === a || t.includes(a))) return 5;

    return 0;
  }

  // From the per-stat market lists, find which players have markets.
  // Returns { athleteId: { stat: [{...market, _matchStep}] } }
  matchPlayersToMarkets(statMarkets, players) {
    const allStats = Object.keys(statMarkets).filter(s => s !== 'other');
    const SUFFIXES = new Set(['jr', 'sr', 'ii', 'iii', 'iv', 'v']);
    const result   = {};

    for (const player of players) {
      const aid = player.athleteId;
      if (!aid) continue;

      const fullNorm = this._normName(player.fullName);
      if (!fullNorm) continue;

      const parts        = fullNorm.split(' ').filter(p => p.length > 0);
      const isLastSuffix = parts.length > 2 && SUFFIXES.has(parts[parts.length - 1]);
      const last         = isLastSuffix ? parts[parts.length - 2] : parts[parts.length - 1];
      const first        = parts[0] || '';
      // All name words after the first (these are the surname components, incl. hyphen parts)
      const surnameComponents = isLastSuffix ? parts.slice(1, -1) : parts.slice(1);
      const aliases           = NAME_ALIASES[fullNorm] || [];

      // Also add each hyphen-component word as a standalone alias search
      const extraComponents   = surnameComponents.filter(sc => sc !== last);

      const matched = {};
      for (const stat of allStats) {
        const hits = [];
        for (const m of (statMarkets[stat] || [])) {
          const mNorm = this._normName(m.playerName);
          let   step  = this._matchStep(mNorm, fullNorm, first, last, surnameComponents, aliases);

          // Extra pass: try matching on each hyphen component alone + first hint
          if (!step && extraComponents.length) {
            const t     = mNorm;
            const words = t.split(' ');
            if (extraComponents.some(ec => t.includes(ec)) &&
                (t.includes(first) || words.some(w => w === first[0] || w === first[0] + '.'))) {
              step = 4;
            }
          }

          if (step > 0) hits.push({ ...m, _matchStep: step });
        }
        if (hits.length) {
          // Prefer earlier step, then lower line as secondary
          hits.sort((a, b) => a._matchStep !== b._matchStep
            ? a._matchStep - b._matchStep : a.line - b.line);
          matched[stat] = hits;
        }
      }

      const foundStats   = Object.keys(matched);
      const missingStats = allStats.filter(s => !matched[s]);

      if (foundStats.length) {
        const stepLog = foundStats
          .map(s => `${s}(step${matched[s][0]._matchStep})`)
          .join(', ');
        console.log(`[Kalshi] ${player.fullName}: matched [${stepLog}]` +
          (missingStats.length ? ` | missing [${missingStats.join(', ')}]` : ''));
        result[aid] = matched;
      } else {
        console.log(`[Kalshi] ${player.fullName}: NO MATCH` +
          ` — last="${last}" first="${first}"` +
          (aliases.length ? ` aliases=[${aliases.join(',')}]` : ''));
      }
    }

    return result;
  }
}

module.exports = new KalshiService();
