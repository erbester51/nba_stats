const axios = require('axios');
const cheerio = require('cheerio');

const ESPN_BASE = 'https://site.api.espn.com/apis/site/v2/sports/basketball/nba';
const NBA_STATS_API = 'https://stats.nba.com/stats';

class NBAService {
  constructor() {
    // Set up axios instance with proper headers to avoid 401 errors
    this.client = axios.create({
      timeout: 15000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'application/json, text/plain, */*',
        'Referer': 'https://www.nba.com',
        'Origin': 'https://www.nba.com'
      }
    });
    this.teamsCache = null;
    this.teamRosterCache = {};
    this.playerGameTotalsCache = {};
    this.lastMeetingCache = {};
    this.leagueStatsCache = null;
    this.leaguePlayoffStatsCache = null;
    this.teamSeasonLeadersCache = {};
  }

  /**
   * Get live games for today or a specific date
   * @param {string} date - Date in format YYYYMMDD (optional)
   */
  async getLiveGames(date) {
    try {
      const queryDate = date || this.getLocalTodayDate();
      const response = await this.client.get(`${ESPN_BASE}/scoreboard?dates=${queryDate}`);
      return response.data.events || [];
    } catch (error) {
      console.error('Error fetching live games:', error.message);
      throw new Error(`Failed to fetch live games: ${error.message}`);
    }
  }

  getLocalTodayDate() {
    const today = new Date();
    const year = today.getFullYear();
    const month = String(today.getMonth() + 1).padStart(2, '0');
    const day = String(today.getDate()).padStart(2, '0');
    return `${year}${month}${day}`;
  }

  /**
   * Get scores for today or a specific date
   */
  async getScores(date, includeLeaders = false) {
    try {
      const games = await this.getLiveGames(date);
      let scores = games.map(game => {
        try {
          const competition = game.competitions ? game.competitions[0] : null;
          if (!competition || !competition.competitors || competition.competitors.length < 2) {
            console.warn('Incomplete competition data for game:', game.id);
            return null;
          }
          
          const homeCompetitor = competition.competitors.find(c => c.homeAway === 'home');
          const awayCompetitor = competition.competitors.find(c => c.homeAway === 'away');
          const homeTeam = homeCompetitor?.team || {};
          const awayTeam = awayCompetitor?.team || {};
          
          return {
            gameId: game.id,
            date: game.date,
            status: typeof game.status?.type === 'object' ? game.status?.type?.description || game.status?.type?.name : game.status?.type || 'Unknown',
            statusState: game.status?.type?.state || 'pre',
            statusDetail: game.status?.type?.detail || '',
            displayClock: game.status?.displayClock || '',
            period: game.status?.period || 0,
            homeTeam: homeTeam?.displayName || homeTeam?.name || 'Unknown',
            homeTeamId: homeTeam?.id || null,
            awayTeam: awayTeam?.displayName || awayTeam?.name || 'Unknown',
            awayTeamId: awayTeam?.id || null,
            homeScore: Number(homeCompetitor?.score || 0),
            awayScore: Number(awayCompetitor?.score || 0),
            venue: competition.venue?.fullName || 'Unknown'
          };
        } catch (err) {
          console.error('Error mapping game:', err.message);
          return null;
        }
      }).filter(game => game !== null);

      if (includeLeaders && scores.length > 0) {
        scores = await Promise.all(scores.map(async game => {
          try {
            const meeting = await this.getLastMeetingLeaders(game.homeTeamId, game.awayTeamId);
            return { ...game, homeLeaders: meeting.homeLeaders, awayLeaders: meeting.awayLeaders, lastMeetingDate: meeting.gameDate };
          } catch {
            return { ...game, homeLeaders: null, awayLeaders: null, lastMeetingDate: null };
          }
        }));
      }

      return scores;
    } catch (error) {
      console.error('Error fetching scores:', error.message);
      throw new Error(`Failed to fetch scores: ${error.message}`);
    }
  }

  /**
   * Get boxscore details and player stats for a game
   */
  async getGameBoxscore(gameId) {
    try {
      const response = await this.client.get(`${ESPN_BASE}/summary?event=${gameId}`);
      const summary = response.data;
      const boxscore = summary.boxscore;

      // For pre-game (no boxscore yet), extract teams from the event header
      if (!boxscore || !boxscore.players) {
        const headerComp = summary.header?.competitions?.[0];
        const gameDate   = headerComp?.date || summary.date || null;
        const teams      = [];
        if (headerComp?.competitors) {
          for (const comp of headerComp.competitors) {
            teams.push({
              teamId:       comp.team?.id || comp.id || null,
              teamName:     comp.team?.displayName || comp.team?.name || null,
              abbreviation: comp.team?.abbreviation || null,
              homeAway:     comp.homeAway || null,
            });
          }
        }
        return { gameId, gameDate, players: [], teams };
      }

      const teams = boxscore.teams.map(team => ({
        teamId: team.team?.id || null,
        teamName: team.team?.displayName || team.team?.name || null,
        abbreviation: team.team?.abbreviation || null,
        score: team.score || null,
        leaders: team.leaders || []
      }));

      const players = boxscore.players.flatMap(teamBlock => {
        const team = teamBlock.team || {};
        const statBlock = Array.isArray(teamBlock.statistics) ? teamBlock.statistics[0] : null;
        const statKeys = statBlock?.keys || [];
        const statLabels = statBlock?.labels || [];

        return (statBlock?.athletes || []).map(athleteEntry => ({
          athleteId: athleteEntry.athlete?.id || null,
          fullName: athleteEntry.athlete?.displayName || athleteEntry.athlete?.fullName || null,
          teamId: team.id || null,
          teamName: team.displayName || team.name || null,
          abbreviation: team.abbreviation || null,
          position: athleteEntry.athlete?.position?.abbreviation || null,
          headshot: athleteEntry.athlete?.headshot?.href || null,
          starter: athleteEntry.starter === true,
          active: athleteEntry.active === true,
          didNotPlay: athleteEntry.didNotPlay === true,
          reason: athleteEntry.reason || null,
          statistics: (athleteEntry.stats || []).map((value, index) => ({
            key: statKeys[index] || null,
            label: statLabels[index] || statKeys[index] || null,
            value,
            displayValue: value
          }))
        }));
      });

      return {
        gameId,
        gameDate: summary.date || null,
        status: summary.status?.type?.name || null,
        teams,
        players
      };
    } catch (error) {
      console.error('Error fetching game boxscore:', error.message);
      throw new Error(`Failed to fetch game boxscore: ${error.message}`);
    }
  }

  /**
   * Get all unique teams from scoreboard data
   */
  async getAllTeams() {
    try {
      if (this.teamsCache && this.teamsCache.length > 0) {
        return this.teamsCache;
      }

      try {
        const response = await this.client.get(`${ESPN_BASE}/teams`);
        const teams = response.data?.sports?.[0]?.leagues?.[0]?.teams || [];

        this.teamsCache = teams.map(entry => {
          const team = entry.team || {};
          return {
            teamId: team.id,
            teamName: team.name,
            displayName: team.displayName,
            abbreviation: team.abbreviation,
            logo: team.logo,
            location: team.location,
            color: team.color
          };
        }).filter(team => team.teamId);

        if (this.teamsCache.length > 0) {
          return this.teamsCache;
        }
      } catch (err) {
        console.warn('Could not fetch all teams from ESPN teams endpoint:', err.message);
      }

      // Fallback: extract from today's games if we couldn't fetch the full list
      const games = await this.getLiveGames();
      const teamsMap = new Map();
      games.forEach(game => {
        const competition = game.competitions?.[0];
        if (competition?.competitors) {
          competition.competitors.forEach(competitor => {
            const team = competitor.team;
            if (team && team.id && !teamsMap.has(team.id)) {
              teamsMap.set(team.id, {
                teamId: team.id,
                teamName: team.name,
                displayName: team.displayName,
                abbreviation: team.abbreviation,
                logo: team.logo,
                location: team.location,
                color: team.color
              });
            }
          });
        }
      });

      this.teamsCache = Array.from(teamsMap.values());
      return this.teamsCache;
    } catch (error) {
      console.error('Error fetching teams:', error.message);
      throw new Error(`Failed to fetch teams: ${error.message}`);
    }
  }

  async mapWithConcurrency(items, limit, mapper) {
    const results = [];
    for (let i = 0; i < items.length; i += limit) {
      const batch = items.slice(i, i + limit);
      const batchResults = await Promise.all(batch.map(mapper));
      results.push(...batchResults);
    }
    return results;
  }

  async getTeamRoster(teamId) {
    try {
      if (this.teamRosterCache[teamId]) {
        return this.teamRosterCache[teamId];
      }

      const response = await this.client.get(`${ESPN_BASE}/teams/${teamId}/roster`);
      const athletes = response.data?.athletes || [];
      const roster = athletes.map(athlete => ({
        playerId: athlete.id,
        displayName: athlete.displayName || athlete.fullName || 'Unknown',
        fullName: athlete.fullName || athlete.displayName || 'Unknown',
        headshot: athlete.headshot?.href || null,
        position: athlete.position?.abbreviation || null
      })).filter(player => player.playerId);

      this.teamRosterCache[teamId] = roster;
      return roster;
    } catch (error) {
      console.warn(`Error fetching roster for team ${teamId}:`, error.message);
      return [];
    }
  }

  parsePlayerGameLogTotals(html) {
    const tableMarker = '<table style="border-collapse:collapse;border-spacing:0" class="Table Table--align-right">';
    const tableStart = html.indexOf(tableMarker);
    if (tableStart === -1) {
      return null;
    }

    const tbodyStart = html.indexOf('<tbody', tableStart);
    if (tbodyStart === -1) {
      return null;
    }

    const tbodyEnd = html.indexOf('</tbody>', tbodyStart);
    if (tbodyEnd === -1) {
      return null;
    }

    const tbody = html.slice(tbodyStart, tbodyEnd);
    const rows = tbody.match(/<tr[^>]*>[\s\S]*?<\/tr>/gi) || [];
    const totals = {
      points: 0,
      rebounds: 0,
      assists: 0,
      blocks: 0,
      threes: 0,
      games: 0
    };

    for (const row of rows) {
      if (row.includes('note-row')) {
        continue;
      }

      const cellMatches = Array.from(row.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi));
      const values = cellMatches
        .map(match => match[1].replace(/<[^>]+>/g, '').trim())
        .filter(cell => cell.length > 0);

      if (values.length < 17) {
        continue;
      }

      const firstCell = values[0] || '';
      if (!/^[A-Za-z]{3}/.test(firstCell)) {
        continue;
      }

      const toInt = value => {
        if (!value) return 0;
        const cleaned = value.split('-')[0].replace(/[^0-9.]/g, '');
        return Number(cleaned) || 0;
      };

      totals.points += toInt(values[16]);
      totals.rebounds += toInt(values[10]);
      totals.assists += toInt(values[11]);
      totals.blocks += toInt(values[12]);
      totals.threes += toInt(values[6]);
      totals.games += 1;
    }

    return totals;
  }

  async getPlayerGameTotals(playerId) {
    try {
      if (this.playerGameTotalsCache[playerId]) {
        return this.playerGameTotalsCache[playerId];
      }

      const url = `https://www.espn.com/nba/player/gamelog/_/id/${playerId}`;
      const response = await this.client.get(url, {
        responseType: 'text',
        headers: {
          Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
        }
      });

      const totals = this.parsePlayerGameLogTotals(response.data) || {
        points: 0,
        rebounds: 0,
        assists: 0,
        blocks: 0,
        threes: 0,
        games: 0
      };

      const result = { playerId, ...totals };
      this.playerGameTotalsCache[playerId] = result;
      return result;
    } catch (error) {
      console.warn(`Error fetching game log for player ${playerId}:`, error.message);
      const result = {
        playerId,
        points: 0,
        rebounds: 0,
        assists: 0,
        blocks: 0,
        threes: 0,
        games: 0
      };
      this.playerGameTotalsCache[playerId] = result;
      return result;
    }
  }

  getStatFromPlayer(player, candidates) {
    for (const key of candidates) {
      const stat = (player.statistics || []).find(s => s.key === key || s.label === key);
      if (stat !== undefined) {
        const raw = stat.value ?? stat.displayValue ?? 0;
        if (typeof raw === 'string' && raw.includes('-')) {
          return parseInt(raw.split('-')[0], 10) || 0;
        }
        return parseFloat(raw) || 0;
      }
    }
    return 0;
  }

  async getLastMeetingLeaders(homeTeamId, awayTeamId) {
    const cacheKey = `${homeTeamId}-${awayTeamId}`;
    if (this.lastMeetingCache[cacheKey]) {
      return this.lastMeetingCache[cacheKey];
    }

    try {
      // Fetch regular season and postseason schedules in parallel
      const [regularRes, postRes] = await Promise.allSettled([
        this.client.get(`${ESPN_BASE}/teams/${homeTeamId}/schedule?seasontype=2`),
        this.client.get(`${ESPN_BASE}/teams/${homeTeamId}/schedule?seasontype=3`)
      ]);

      const events = [
        ...(regularRes.status === 'fulfilled' ? regularRes.value.data?.events || [] : []),
        ...(postRes.status === 'fulfilled' ? postRes.value.data?.events || [] : [])
      ];

      const completed = events
        .filter(event => {
          const comp = event.competitions?.[0];
          // status lives on the competition, not the event
          return (
            comp?.status?.type?.completed === true &&
            comp?.competitors?.some(c => String(c.team?.id) === String(awayTeamId))
          );
        })
        .sort((a, b) => new Date(b.competitions?.[0]?.date || b.date) - new Date(a.competitions?.[0]?.date || a.date));

      if (!completed.length) {
        const empty = { homeLeaders: null, awayLeaders: null, gameDate: null };
        this.lastMeetingCache[cacheKey] = empty;
        return empty;
      }

      const lastGame = completed[0];
      const gameDate = lastGame.competitions?.[0]?.date || lastGame.date;
      const boxscore = await this.getGameBoxscore(lastGame.id);
      const players = boxscore.players || [];

      const statMap = {
        points:   ['points', 'PTS'],
        rebounds: ['rebounds', 'REB'],
        assists:  ['assists', 'AST'],
        blocks:   ['blocks', 'BLK'],
        threes:   ['threePointFieldGoalsMade', '3PT', '3FGM']
      };

      const getLeadersForTeam = (teamId) => {
        const teamPlayers = players.filter(p => String(p.teamId) === String(teamId) && !p.didNotPlay);
        if (!teamPlayers.length) return null;

        const leaders = {};
        Object.entries(statMap).forEach(([cat, candidates]) => {
          let best = null;
          let bestVal = -1;
          teamPlayers.forEach(player => {
            const val = this.getStatFromPlayer(player, candidates);
            if (val > bestVal) {
              bestVal = val;
              best = {
                playerId: player.athleteId,
                displayName: player.fullName,
                headshot: player.headshot,
                value: val
              };
            }
          });
          leaders[cat] = best;
        });
        return leaders;
      };

      const result = {
        homeLeaders: getLeadersForTeam(homeTeamId),
        awayLeaders: getLeadersForTeam(awayTeamId),
        gameDate
      };

      this.lastMeetingCache[cacheKey] = result;
      return result;
    } catch (error) {
      console.warn(`Error fetching last meeting for ${homeTeamId} vs ${awayTeamId}:`, error.message);
      const empty = { homeLeaders: null, awayLeaders: null, gameDate: null };
      this.lastMeetingCache[cacheKey] = empty;
      return empty;
    }
  }

  async getTeamLeaders(teamId) {
    const roster = await this.getTeamRoster(teamId);
    if (!roster.length) {
      return {
        teamId,
        leaders: {
          points: null,
          rebounds: null,
          assists: null,
          blocks: null,
          threes: null
        }
      };
    }

    const playerTotals = await this.mapWithConcurrency(roster, 4, async player => {
      const totals = await this.getPlayerGameTotals(player.playerId);
      return {
        ...player,
        totals
      };
    });

    const leaderCategories = {
      points: { stat: 'Points', best: null, value: -1 },
      rebounds: { stat: 'Rebounds', best: null, value: -1 },
      assists: { stat: 'Assists', best: null, value: -1 },
      blocks: { stat: 'Blocks', best: null, value: -1 },
      threes: { stat: '3PM', best: null, value: -1 }
    };

    playerTotals.forEach(player => {
      const totals = player.totals || {};
      const games = totals.games || 0;
      if (games === 0) return;

      Object.entries(leaderCategories).forEach(([key, meta]) => {
        const avg = Number(totals[key] || 0) / games;
        if (avg > meta.value) {
          meta.value = avg;
          meta.best = {
            playerId: player.playerId,
            displayName: player.displayName,
            fullName: player.fullName,
            headshot: player.headshot,
            position: player.position,
            value: Math.round(avg * 10) / 10
          };
        }
      });
    });

    return {
      teamId,
      leaders: {
        points: leaderCategories.points.best,
        rebounds: leaderCategories.rebounds.best,
        assists: leaderCategories.assists.best,
        blocks: leaderCategories.blocks.best,
        threes: leaderCategories.threes.best
      }
    };
  }

  async getTeamInjuries(espnTeamId) {
    try {
      const response = await this.client.get(`${ESPN_BASE}/teams/${espnTeamId}/roster`);
      const athletes = response.data?.athletes || [];

      const injured = athletes
        .filter(athlete => {
          const inj = athlete.injuries;
          if (!inj) return false;
          const arr = Array.isArray(inj) ? inj : [inj];
          return arr.length > 0;
        })
        .map(athlete => {
          const arr = Array.isArray(athlete.injuries) ? athlete.injuries : [athlete.injuries];
          const inj = arr[0] || {};
          return {
            playerId: athlete.id,
            displayName: athlete.displayName,
            position: athlete.position?.abbreviation || null,
            headshot: athlete.headshot?.href || null,
            status: inj.status || 'Out',
            updatedDate: inj.date || null
          };
        })
        .sort((a, b) => {
          const order = { 'Day-To-Day': 0, 'Questionable': 1, 'Out': 2 };
          return (order[a.status] ?? 3) - (order[b.status] ?? 3);
        });

      return { teamId: espnTeamId, injuries: injured };
    } catch (error) {
      console.warn(`Error fetching injuries for team ${espnTeamId}:`, error.message);
      return { teamId: espnTeamId, injuries: [] };
    }
  }

  async getTeamSeasonLeaders(espnTeamId) {
    if (this.teamSeasonLeadersCache[espnTeamId]) {
      return this.teamSeasonLeadersCache[espnTeamId];
    }

    const espnToNba = { GS: 'GSW', NY: 'NYK', NO: 'NOP', SA: 'SAS', UTAH: 'UTA', WSH: 'WAS' };
    const teamInfo = await this.getTeamStats(espnTeamId);
    const espnAbbr = teamInfo.abbreviation;
    const nbaAbbr = espnToNba[espnAbbr] || espnAbbr;

    const nbaHeaders = {
      'Referer': 'https://www.nba.com',
      'Origin': 'https://www.nba.com',
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      'Accept': 'application/json, text/plain, */*',
      'Connection': 'keep-alive',
      'Accept-Language': 'en-US,en;q=0.9',
      'x-nba-stats-origin': 'stats',
      'x-nba-stats-token': 'true'
    };

    const baseParams = {
      College: '', Conference: '', Country: '', DateFrom: '', DateTo: '',
      Division: '', DraftPick: '', DraftYear: '', GameScope: '', GameSegment: '',
      Height: '', LastNGames: 0, LeagueID: '00', Location: '',
      MeasureType: 'Base', Month: 0, OpponentTeamID: 0, Outcome: '',
      PORound: 0, PaceAdjust: 'N', PerMode: 'PerGame', Period: 0,
      PlayerExperience: '', PlayerPosition: '', PlusMinus: 'N', Rank: 'N',
      Season: '2025-26', SeasonSegment: '', ShotClockRange: '',
      StarterBench: '', TeamID: 0, VsConference: '', VsDivision: '', Weight: ''
    };

    const fetchLeagueStats = async (seasonType, cacheKey) => {
      if (!this[cacheKey]) {
        try {
          const response = await this.client.get(`${NBA_STATS_API}/leaguedashplayerstats`, {
            params: { ...baseParams, SeasonType: seasonType },
            headers: nbaHeaders
          });
          const resultSet = response.data?.resultSets?.[0] || {};
          const rowHeaders = resultSet.headers || [];
          this[cacheKey] = (resultSet.rowSet || []).map(row => {
            const obj = {};
            rowHeaders.forEach((h, i) => { obj[h] = row[i]; });
            return obj;
          });
        } catch (err) {
          console.warn(`Failed to fetch ${seasonType} stats:`, err.message);
          this[cacheKey] = [];
        }
      }
      return this[cacheKey];
    };

    const [regularStats, playoffStats] = await Promise.all([
      fetchLeagueStats('Regular Season', 'leagueStatsCache'),
      fetchLeagueStats('Playoffs', 'leaguePlayoffStatsCache')
    ]);

    const categories = [
      { key: 'points',   statKey: 'PTS' },
      { key: 'rebounds', statKey: 'REB' },
      { key: 'assists',  statKey: 'AST' },
      { key: 'steals',   statKey: 'STL' },
      { key: 'blocks',   statKey: 'BLK' },
      { key: 'threes',   statKey: 'FG3M' }
    ];

    const buildLeaders = (statsData, minGames) => {
      const teamPlayers = statsData.filter(
        p => p.TEAM_ABBREVIATION === nbaAbbr && (p.GP || 0) >= minGames
      );
      if (!teamPlayers.length) return null;

      const leaders = {};
      categories.forEach(({ key, statKey }) => {
        let best = null;
        let bestVal = -1;
        teamPlayers.forEach(player => {
          const val = Number(player[statKey] || 0);
          if (val > bestVal) {
            bestVal = val;
            best = {
              playerId: String(player.PLAYER_ID),
              displayName: player.PLAYER_NAME,
              headshot: `https://cdn.nba.com/headshots/nba/latest/1040x760/${player.PLAYER_ID}.png`,
              value: Math.round(val * 10) / 10
            };
          }
        });
        leaders[key] = best;
      });
      return leaders;
    };

    const result = {
      teamId: espnTeamId,
      regularLeaders: buildLeaders(regularStats, 5),
      playoffLeaders: buildLeaders(playoffStats, 1)
    };
    this.teamSeasonLeadersCache[espnTeamId] = result;
    return result;
  }

  async getTeamLeadersForIds(teamIds) {
    const result = {};
    const uniqueIds = Array.from(new Set(teamIds.filter(Boolean)));
    const batch = await this.mapWithConcurrency(uniqueIds, 3, async teamId => {
      const leaders = await this.getTeamLeaders(teamId);
      return { teamId, leaders };
    });
    batch.forEach(item => {
      result[item.teamId] = item.leaders;
    });
    return result;
  }

  /**
   * Get player stats by player ID
   */
  async getCurrentPlayers() {
    try {
      if (this.playersCache && this.playersCache.length > 0) {
        return this.playersCache;
      }

      const response = await this.client.get(`${NBA_STATS_API}/commonallplayers`, {
        params: {
          LeagueID: '00',
          Season: '2025-26',
          IsOnlyCurrentSeason: 1
        },
        headers: {
          'Referer': 'https://www.nba.com',
          'Origin': 'https://www.nba.com',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          'Accept': 'application/json, text/plain, */*',
          'Connection': 'keep-alive',
          'Accept-Language': 'en-US,en;q=0.9',
          'x-nba-stats-origin': 'stats',
          'x-nba-stats-token': 'true'
        }
      });

      const data = response.data;
      const rowSet = data?.resultSets?.[0]?.rowSet || [];
      const headers = data?.resultSets?.[0]?.headers || [];
      const nameIndex = headers.indexOf('DISPLAY_FIRST_LAST');
      const fullNameIndex = headers.indexOf('DISPLAY_LAST_COMMA_FIRST');
      const idIndex = headers.indexOf('PERSON_ID');
      const slugIndex = headers.indexOf('PLAYER_SLUG');
      const teamIndex = headers.indexOf('TEAM_ABBREVIATION');

      if (nameIndex === -1 || idIndex === -1) {
        return [];
      }

      this.playersCache = rowSet
        .map(row => (
          {
            playerId: String(row[idIndex]),
            displayName: row[nameIndex],
            fullName: row[fullNameIndex] || row[nameIndex],
            slug: row[slugIndex] || null,
            team: row[teamIndex] || 'UNK'
          }
        ))
        .sort((a, b) => {
          const teamCompare = a.team.localeCompare(b.team);
          if (teamCompare !== 0) return teamCompare;
          return a.displayName.localeCompare(b.displayName);
        });

      return this.playersCache;
    } catch (error) {
      console.warn('Player list lookup failed:', error.message);
      return [];
    }
  }

  async getPlayerIdByName(name) {
    try {
      const players = await this.getCurrentPlayers();
      const normalizedName = name.trim().toLowerCase();
      const match = players.find(player => player.displayName.toLowerCase() === normalizedName || player.fullName.toLowerCase() === normalizedName);
      if (match) return match.playerId;

      const response = await this.client.get(`${NBA_STATS_API}/commonallplayers`, {
        params: {
          LeagueID: '00',
          Season: '2025-26',
          IsOnlyCurrentSeason: 0
        },
        headers: {
          'Referer': 'https://www.nba.com',
          'Origin': 'https://www.nba.com',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          'Accept': 'application/json, text/plain, */*',
          'Connection': 'keep-alive',
          'Accept-Language': 'en-US,en;q=0.9',
          'x-nba-stats-origin': 'stats',
          'x-nba-stats-token': 'true'
        }
      });

      const data = response.data;
      const rowSet = data?.resultSets?.[0]?.rowSet || [];
      const headers = data?.resultSets?.[0]?.headers || [];
      const nameIndex = headers.indexOf('DISPLAY_FIRST_LAST');
      const idIndex = headers.indexOf('PERSON_ID');

      if (nameIndex === -1 || idIndex === -1) {
        return null;
      }

      const normalizedSearch = name.trim().toLowerCase();
      const searchMatch = rowSet.find(row => row[nameIndex]?.toLowerCase() === normalizedSearch);
      return searchMatch ? searchMatch[idIndex] : null;
    } catch (error) {
      console.warn('Player name lookup failed:', error.message);
      return null;
    }
  }

  async fetchPlayerGameLogsByType(id, season, seasonType, headers) {
    try {
      const response = await this.client.get(`${NBA_STATS_API}/playergamelog`, {
        params: {
          PlayerID: id,
          Season: season,
          SeasonType: seasonType
        },
        headers
      });

      const data = response.data;
      const resultSet = data?.resultSets?.[0] || {};
      const gameHeaders = resultSet.headers || [];
      const gameRows = resultSet.rowSet || [];

      return gameRows.map(row => {
        const rowObj = {};
        gameHeaders.forEach((header, index) => {
          rowObj[header] = row[index];
        });
        rowObj.SEASON_TYPE = seasonType;
        return rowObj;
      });
    } catch (error) {
      console.warn(`Error fetching ${seasonType} game logs:`, error.message);
      return [];
    }
  }

  async getPlayerGameLogs(playerId, season = '2025-26') {
    try {
      const id = /^[0-9]+$/.test(playerId) ? playerId : await this.getPlayerIdByName(playerId);
      if (!id) {
        return { playerId, games: [], error: 'Player not found' };
      }

      const headers = {
        'Referer': 'https://www.nba.com',
        'Origin': 'https://www.nba.com',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'application/json, text/plain, */*',
        'Connection': 'keep-alive',
        'Accept-Language': 'en-US,en;q=0.9',
        'x-nba-stats-origin': 'stats',
        'x-nba-stats-token': 'true'
      };

      const [regularGames, playoffGames] = await Promise.all([
        this.fetchPlayerGameLogsByType(id, season, 'Regular Season', headers),
        this.fetchPlayerGameLogsByType(id, season, 'Playoffs', headers)
      ]);

      const games = [...regularGames, ...playoffGames];

      return { playerId: id, games, season };
    } catch (error) {
      console.warn('Error fetching game logs:', error.message);
      return { playerId, games: [], error: error.message };
    }
  }

  async getPlayerStats(playerId) {
    try {
      const id = /^[0-9]+$/.test(playerId) ? playerId : await this.getPlayerIdByName(playerId);
      if (!id) {
        return {
          playerId,
          error: 'Player not found by name or invalid NBA player ID'
        };
      }

      const headers = {
        'Referer': 'https://www.nba.com',
        'Origin': 'https://www.nba.com',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'application/json, text/plain, */*',
        'Connection': 'keep-alive',
        'Accept-Language': 'en-US,en;q=0.9',
        'x-nba-stats-origin': 'stats',
        'x-nba-stats-token': 'true'
      };

      const [infoResponse, careerResponse] = await Promise.all([
        this.client.get(`${NBA_STATS_API}/commonplayerinfo`, {
          params: { PlayerID: id },
          headers
        }),
        this.client.get(`${NBA_STATS_API}/playercareerstats`, {
          params: {
            PlayerID: id,
            LeagueID: '00',
            PerMode: 'PerGame'
          },
          headers
        })
      ]);

      const careerData = careerResponse.data || {};

      const parseResultSet = (name) => {
        const rs = careerData.resultSets?.find(r => r.name === name) || {};
        const headers = rs.headers || [];
        return (rs.rowSet || []).map(row => headers.reduce((acc, h, i) => { acc[h] = row[i]; return acc; }, {}));
      };

      const bySeasonDesc = (a, b) =>
        (parseInt(String(b.SEASON_ID).slice(0, 4), 10) || 0) -
        (parseInt(String(a.SEASON_ID).slice(0, 4), 10) || 0);

      const regularSeasons = parseResultSet('SeasonTotalsRegularSeason').sort(bySeasonDesc).slice(0, 4);
      const playoffSeasons = parseResultSet('SeasonTotalsPostSeason').sort(bySeasonDesc).slice(0, 4);

      return {
        playerId: id,
        playerInfo: infoResponse.data,
        careerStats: careerData,
        seasonStats: {
          currentSeason: regularSeasons[0] || null,
          last4Seasons: regularSeasons,
          playoffSeasons
        }
      };
    } catch (error) {
      console.error('Error fetching player stats:', error.message);
      throw new Error(`Failed to fetch player stats: ${error.message}`);
    }
  }

  /**
   * Get team stats by team ID
   */
  async getTeamStats(teamId) {
    try {
      const response = await this.client.get(
        `${ESPN_BASE}/teams/${teamId}`
      );
      
      const team = response.data.team;
      return {
        teamId: team.id,
        teamName: team.name,
        displayName: team.displayName,
        abbreviation: team.abbreviation,
        logo: team.logo,
        location: team.location,
        record: team.record || null
      };
    } catch (error) {
      console.error('Error fetching team stats:', error.message);
      throw new Error(`Failed to fetch team stats: ${error.message}`);
    }
  }

  async getUpcomingGames(days = 7) {
    const dateStrings = [];
    const today = new Date();
    for (let i = 0; i < days; i++) {
      const d = new Date(today);
      d.setDate(today.getDate() + i);
      const year = d.getFullYear();
      const month = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      dateStrings.push(`${year}${month}${day}`);
    }

    const results = await Promise.allSettled(
      dateStrings.map(ds => this.client.get(`${ESPN_BASE}/scoreboard?dates=${ds}`))
    );

    const games = [];
    results.forEach(result => {
      if (result.status !== 'fulfilled') return;
      const events = result.value.data.events || [];
      events.forEach(event => {
        const competition = event.competitions?.[0];
        if (!competition?.competitors?.length) return;
        const home = competition.competitors.find(c => c.homeAway === 'home');
        const away = competition.competitors.find(c => c.homeAway === 'away');
        if (!home || !away) return;
        games.push({
          gameId: event.id,
          date: event.date,
          status: event.status?.type?.description || 'Unknown',
          statusState: event.status?.type?.state || 'pre',
          homeTeam: home.team?.displayName || home.team?.name || 'Unknown',
          homeTeamId: home.team?.id || null,
          awayTeam: away.team?.displayName || away.team?.name || 'Unknown',
          awayTeamId: away.team?.id || null,
          venue: competition.venue?.fullName || 'TBD'
        });
      });
    });

    return games.sort((a, b) => new Date(a.date) - new Date(b.date));
  }

  async getTeamNews(teamId) {
    try {
      const response = await this.client.get(`${ESPN_BASE}/news`, {
        params: { teams: teamId, limit: 25 }
      });
      return (response.data.articles || [])
        .filter(a => a.headline && a.links?.web?.href && a.type !== 'Media')
        .map(a => ({
          title: a.headline.trim(),
          snippet: (a.description || '').trim().substring(0, 400),
          url: a.links.web.href,
          source: 'ESPN',
          publishTime: new Date(a.published || Date.now())
        }));
    } catch {
      return [];
    }
  }

  async fetchCBSSportsScoutingNews() {
    try {
      const response = await axios.get('https://www.cbssports.com/rss/headlines/nba/', {
        responseType: 'text',
        timeout: 8000,
        headers: { 'User-Agent': 'Mozilla/5.0', 'Accept': 'text/html,application/xml,*/*' }
      });
      const $ = cheerio.load(response.data, { xmlMode: true });
      const articles = [];
      $('item').each((i, el) => {
        if (articles.length >= 25) return;
        const title = $(el).find('title').text().trim();
        const url = $(el).find('link').text().trim();
        const pubDate = $(el).find('pubDate').text().trim();
        const snippet = $(el).find('description').text().replace(/<[^>]+>/g, '').trim();
        if (title && url) {
          articles.push({
            title,
            snippet: snippet.substring(0, 400),
            url,
            source: 'CBS Sports',
            publishTime: pubDate ? new Date(pubDate) : new Date()
          });
        }
      });
      return articles;
    } catch {
      return [];
    }
  }

  async fetchRSSFeed(url, source) {
    try {
      const response = await axios.get(url, {
        responseType: 'text',
        timeout: 8000,
        headers: { 'User-Agent': 'Mozilla/5.0', 'Accept': 'text/html,application/xml,*/*' }
      });
      const $ = cheerio.load(response.data, { xmlMode: true });
      const articles = [];
      $('item').each((i, el) => {
        if (articles.length >= 25) return;
        const title = $(el).find('title').text().trim();
        const link = $(el).find('link').text().trim() || $(el).find('guid').text().trim();
        const pubDate = $(el).find('pubDate').text().trim();
        const snippet = $(el).find('description').text().replace(/<[^>]+>/g, '').trim();
        if (title && link) {
          articles.push({
            title,
            snippet: snippet.substring(0, 400),
            url: link,
            source,
            publishTime: pubDate ? new Date(pubDate) : new Date()
          });
        }
      });
      return articles;
    } catch {
      return [];
    }
  }

  async fetchNBAOfficialNews() {
    return this.fetchRSSFeed('https://www.nba.com/news/rss.xml', 'NBA.com');
  }

  async fetchYahooSportsNews() {
    return this.fetchRSSFeed('https://sports.yahoo.com/nba/rss.xml', 'Yahoo Sports');
  }

  async fetchSportsIllustratedNews() {
    return this.fetchRSSFeed('https://www.si.com/nba/feed/rss', 'Sports Illustrated');
  }

  async getScoutingReport(gameId) {
    const summaryRes = await this.client.get(`${ESPN_BASE}/summary?event=${gameId}`);
    const summary = summaryRes.data;

    const headerComp = summary.header?.competitions?.[0];
    if (!headerComp?.competitors) throw new Error('Could not determine teams for game');

    const homeComp = headerComp.competitors.find(c => c.homeAway === 'home');
    const awayComp = headerComp.competitors.find(c => c.homeAway === 'away');
    const homeTeamId   = homeComp?.team?.id   || homeComp?.id;
    const awayTeamId   = awayComp?.team?.id   || awayComp?.id;
    const homeTeamName = homeComp?.team?.displayName || homeComp?.team?.name || 'Home Team';
    const awayTeamName = awayComp?.team?.displayName || awayComp?.team?.name || 'Away Team';
    // ESPN's `location` field gives the true city name (e.g. "Portland" for the Trail Blazers)
    // which avoids generating bogus tokens like "Portland Trail" via mechanical slicing
    const homeLocation = homeComp?.team?.location || null;
    const awayLocation = awayComp?.team?.location || null;

    if (!homeTeamId || !awayTeamId) throw new Error('Could not determine teams for game');

    console.log(`[Scouting] Game ${gameId}: ${awayTeamName} @ ${homeTeamName} (IDs: ${awayTeamId} @ ${homeTeamId})`);

    // Articles embedded in the ESPN game summary itself
    const rawSummaryNews = Array.isArray(summary.news) ? summary.news : [];
    const summaryArticles = rawSummaryNews
      .filter(a => a.headline && a.links?.web?.href && a.type !== 'Media')
      .map(a => ({
        title: a.headline.trim(),
        snippet: (a.description || '').trim().substring(0, 400),
        url: a.links.web.href,
        source: 'ESPN',
        publishTime: new Date(a.published || Date.now())
      }));

    const [homeNews, awayNews, combinedNews, cbsArticles, nbaArticles, yahooArticles, siArticles] = await Promise.allSettled([
      this.getTeamNews(homeTeamId),
      this.getTeamNews(awayTeamId),
      this.getTeamNews(`${homeTeamId},${awayTeamId}`),
      this.fetchCBSSportsScoutingNews(),
      this.fetchNBAOfficialNews(),
      this.fetchYahooSportsNews(),
      this.fetchSportsIllustratedNews()
    ]);

    const homeNewsArr = homeNews.status      === 'fulfilled' ? homeNews.value      : [];
    const awayNewsArr = awayNews.status      === 'fulfilled' ? awayNews.value      : [];
    const combinedArr = combinedNews.status  === 'fulfilled' ? combinedNews.value  : [];
    const cbsArr      = cbsArticles.status   === 'fulfilled' ? cbsArticles.value   : [];
    const nbaArr      = nbaArticles.status   === 'fulfilled' ? nbaArticles.value   : [];
    const yahooArr    = yahooArticles.status === 'fulfilled' ? yahooArticles.value  : [];
    const siArr       = siArticles.status    === 'fulfilled' ? siArticles.value    : [];

    console.log(`[Scouting] Fetched — home:${homeNewsArr.length} away:${awayNewsArr.length} combined:${combinedArr.length} cbs:${cbsArr.length} nba:${nbaArr.length} yahoo:${yahooArr.length} si:${siArr.length} summary:${summaryArticles.length}`);

    // Deduplicate by URL across all sources
    const allArticles = [
      ...summaryArticles,
      ...combinedArr,
      ...cbsArr,
      ...nbaArr,
      ...yahooArr,
      ...siArr,
      ...homeNewsArr,
      ...awayNewsArr
    ];

    const seen = new Set();
    const unique = allArticles.filter(a => {
      if (seen.has(a.url)) return false;
      seen.add(a.url);
      return true;
    });

    console.log(`[Scouting] After dedup: ${unique.length} total articles`);

    // ── Team token sets ──────────────────────────────────────────────────────
    const TEAM_NICKNAMES = {
      timberwolves: ['wolves', 'twolves'],
      mavericks:    ['mavs'],
      warriors:     ['dubs'],
      cavaliers:    ['cavs'],
      '76ers':      ['sixers', 'philly'],
      blazers:      ['trail blazers'],
      pelicans:     ['pels'],
      clippers:     ['clips'],
      thunder:      ['okc'],
    };

    const buildTokens = (displayName, location) => {
      const parts    = displayName.trim().split(' ');
      const nickname = parts[parts.length - 1].toLowerCase();
      const tokens   = new Set();
      tokens.add(displayName.toLowerCase());
      tokens.add(nickname);
      if (location) {
        tokens.add(location.trim().toLowerCase());
      } else if (parts.length === 2) {
        tokens.add(parts[0].toLowerCase());
      } else if (parts.length >= 3) {
        tokens.add(parts.slice(0, -1).join(' ').toLowerCase());
      }
      (TEAM_NICKNAMES[nickname] || []).forEach(alias => tokens.add(alias));
      return [...tokens];
    };

    const homeTokens = buildTokens(homeTeamName, homeLocation);
    const awayTokens = buildTokens(awayTeamName, awayLocation);

    console.log(`[Scouting] Home tokens: ${JSON.stringify(homeTokens)}`);
    console.log(`[Scouting] Away tokens: ${JSON.stringify(awayTokens)}`);

    // ── Filter ───────────────────────────────────────────────────────────────
    // Every article must pass three gates in order:
    //   1. Title must not contain a disqualifying keyword
    //   2. Title+snippet must mention the home team
    //   3. Title+snippet must mention the away team
    // No source gets a free pass — ESPN's combined feed and cross-feed articles
    // often return general NBA news that does not mention both matchup teams.

    const EXCLUDE_TITLE = [
      'betting', 'dfs', 'odds', 'picks', 'fantasy', 'tickets',
      'officiating', 'trade', 'injury', 'injured', 'rumors',
      'mvp race', 'donating', 'rips'
    ];

    const filtered = unique.filter(article => {
      const titleLower = article.title.toLowerCase();
      const checkText  = `${titleLower} ${(article.snippet || '').toLowerCase()}`;

      const excludeMatch = EXCLUDE_TITLE.find(k => titleLower.includes(k));
      if (excludeMatch) {
        console.log(`[Scouting] REJECTED (exclude "${excludeMatch}"): "${article.title}"`);
        return false;
      }

      if (!homeTokens.some(t => checkText.includes(t))) {
        console.log(`[Scouting] REJECTED (missing "${homeTeamName}"): "${article.title}"`);
        return false;
      }

      if (!awayTokens.some(t => checkText.includes(t))) {
        console.log(`[Scouting] REJECTED (missing "${awayTeamName}"): "${article.title}"`);
        return false;
      }

      return true;
    });

    console.log(`[Scouting] Matchup filter: ${filtered.length} / ${unique.length} articles passed`);

    const SECTIONS = [
      {
        title: 'Game Preview & Series Context',
        keywords: ['preview', 'series', 'playoff', 'game 2', 'game 3', 'game 4', 'game 5', 'game 6', 'game 7', 'matchup', 'semifinal', 'finals', 'first round', 'second round', 'conference']
      },
      {
        title: 'Key Matchups & Scheme Breakdown',
        keywords: ['defense', 'offense', 'scheme', 'strategy', 'guard', 'switch', 'zone', 'paint', 'coaching', 'lineup', 'rotation', 'perimeter', 'post']
      },
      {
        title: 'What to Watch',
        keywords: ['x-factor', 'storyline', 'key', 'watch', 'adjustments', 'momentum', 'focus', 'spotlight', 'factor', 'impact']
      },
      {
        title: 'Analyst Predictions',
        keywords: ['prediction', 'pick', 'winner', 'advantage', 'edge', 'will win', 'expect', 'forecast', 'odds', 'favor', 'projected', 'analysis']
      }
    ];

    const sections = SECTIONS.map(s => ({
      title: s.title,
      articles: filtered.filter(article => {
        const text = `${article.title} ${article.snippet}`.toLowerCase();
        return s.keywords.some(k => text.includes(k));
      })
    })).filter(s => s.articles.length > 0);

    console.log(`[Scouting] Sections populated: ${sections.map(s => `"${s.title}" (${s.articles.length})`).join(', ') || 'none'}`);

    const espnAbbrToNba = { GS: 'GSW', NY: 'NYK', NO: 'NOP', SA: 'SAS', UTAH: 'UTA', WSH: 'WAS' };
    const toNbaAbbr = abbr => (espnAbbrToNba[abbr] || abbr).toLowerCase();
    const homeAbbr = toNbaAbbr(homeComp?.team?.abbreviation || '');
    const awayAbbr = toNbaAbbr(awayComp?.team?.abbreviation || '');

    const advancedSources = [
      {
        name: 'Cleaning the Glass',
        description: 'Shot quality-adjusted efficiency broken down by zone, play type, lineup, and defensive context — the gold standard for measuring true shooting value.',
        links: [
          { label: homeTeamName, url: `https://cleaningtheglass.com/stats/team/${homeAbbr}` },
          { label: awayTeamName, url: `https://cleaningtheglass.com/stats/team/${awayAbbr}` }
        ]
      },
      {
        name: 'BBall Index',
        description: 'DARKO projections, PIPM defensive impact grades, and lineup-level on/off splits for deep matchup and roster analysis.',
        links: [
          { label: 'Team On/Off Splits', url: 'https://www.bball-index.com/nba-team-on-off/' },
          { label: 'Player Defense Ratings', url: 'https://www.bball-index.com/player-defense/' }
        ]
      },
      {
        name: 'PBP Stats',
        description: 'Play-by-play derived stats: transition frequency, second-chance rates, shot type distribution, foul drawing, and clutch performance by team.',
        links: [
          { label: homeTeamName, url: 'https://www.pbpstats.com/team-stats/nba/team?Season=2025-26&SeasonType=Playoffs' },
          { label: awayTeamName, url: 'https://www.pbpstats.com/team-stats/nba/team?Season=2025-26&SeasonType=Playoffs' }
        ]
      }
    ];

    const sortedArticles = filtered
      .slice()
      .sort((a, b) => new Date(b.publishTime) - new Date(a.publishTime));

    return {
      gameId,
      gameDate: headerComp.date || null,
      homeTeam: { id: homeTeamId, name: homeTeamName },
      awayTeam: { id: awayTeamId, name: awayTeamName },
      // Expose raw pool + filter config so the client can cache raw data and
      // re-run the filter itself — filtered results are never what gets cached.
      rawArticles:     unique,
      homeTokens,
      awayTokens,
      excludeKeywords: EXCLUDE_TITLE,
      totalMatches: filtered.length,
      limitedCoverage: filtered.length < 3,
      articles: sortedArticles,
      sections,
      advancedSources
    };
  }

  /**
   * Get standings (extracted from scoreboard data and team stats)
   */
  async getStandings() {
    try {
      const teams = await this.getAllTeams();
      
      // Fetch detailed standings from ESPN standings endpoint
      try {
        const response = await this.client.get(`${ESPN_BASE}/standings`);
        
        if (response.data.standings && response.data.standings.length > 0) {
          return response.data.standings.map(group => ({
            groupName: group.name || 'League',
            teams: (group.entries || []).map(entry => ({
              teamId: entry.team.id,
              teamName: entry.team.displayName,
              wins: entry.wins || 0,
              losses: entry.losses || 0,
              gamesBack: entry.gamesBack || 0
            }))
          }));
        }
      } catch (err) {
        console.warn('Could not fetch standings from standings endpoint:', err.message);
      }

      // Fallback: Return basic team info if standings endpoint fails
      return {
        groupName: 'NBA Teams',
        teams: teams.map(team => ({
          teamId: team.teamId,
          teamName: team.displayName,
          wins: 0,
          losses: 0,
          gamesBack: 0
        }))
      };
    } catch (error) {
      console.error('Error fetching standings:', error.message);
      throw new Error(`Failed to fetch standings: ${error.message}`);
    }
  }
}

module.exports = new NBAService();
