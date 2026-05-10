const apiBase = '/api';

const dom = {
  tabs: document.querySelectorAll('.tab-button'),
  panels: document.querySelectorAll('.tab-panel'),
  gamesList: document.getElementById('games-list'),
  gamesLoading: document.getElementById('games-loading'),
  breakingCarousel: document.getElementById('breaking-carousel'),
  breakingNewsLoading: document.getElementById('breaking-news-loading'),
  newsFeed: document.getElementById('news-feed'),
  newsLoading: document.getElementById('news-loading'),
  teamSelect: document.getElementById('team-select'),
  teamInfo: document.getElementById('team-info'),
  playerSelect: document.getElementById('player-select'),
  playerInput: document.getElementById('player-input'),
  playerSearch: document.getElementById('player-search'),
  playerInfo: document.getElementById('player-info'),
  playerSeasonSelect: document.getElementById('player-season-select'),
  playerSeason: document.getElementById('player-season'),
  playerSeasonStats: document.getElementById('player-season-stats'),
  playerGameLog: document.getElementById('player-game-log'),
  scoutingGameSelect: document.getElementById('scouting-game-select'),
  scoutingFetchBtn: document.getElementById('scouting-fetch-btn'),
  scoutingLoading: document.getElementById('scouting-loading'),
  scoutingError: document.getElementById('scouting-error'),
  scoutingContent: document.getElementById('scouting-content'),
  bettingGameSelect: document.getElementById('betting-game-select'),
  bettingFetchBtn: document.getElementById('betting-fetch-btn'),
  bettingLoading: document.getElementById('betting-loading'),
  bettingError: document.getElementById('betting-error'),
  bettingContent: document.getElementById('betting-content'),
};

const state = {
  teams: [],
  teamLogos: {},
  lastPlayerStats: null
};

let liveRefreshTimeout = null;

// State for the Bet Analysis tab — persists across line edits
const bettingState = {
  players: [],
  teams: [],
  overrides: {}, // key: `${athleteId}_${stat}`, value: custom line (integer)
  allGames: {},  // gameId → { players, teams } — accumulates across analyses this session
  top5Keys: [],  // previous top5 pick keys for flash-animation diff
  parlaySort: { col: null, dir: null },
};

// Re-score a stat against a custom line using cached last-20 game values
function clientRescore(gameValues, line) {
  if (!gameValues || !gameValues.length) return { overRate: 0, rating: 'red', gamesAnalyzed: 0 };
  const over = gameValues.filter(v => v >= line).length;
  const rate = over / gameValues.length;
  return {
    overRate: Math.round(rate * 100),
    gamesAnalyzed: gameValues.length,
    rating: rate >= 0.70 ? 'green' : rate >= 0.55 ? 'blue' : rate >= 0.40 ? 'yellow' : 'red',
  };
}

function setActiveTab(tabName) {
  dom.tabs.forEach(button => {
    button.classList.toggle('active', button.dataset.tab === tabName);
  });
  dom.panels.forEach(panel => {
    panel.classList.toggle('active', panel.id === tabName);
  });
  if (tabName !== 'team' && tabName !== 'player') {
    setBackgroundLogo(null);
  }
}

async function fetchJson(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`API request failed: ${res.status}`);
  return res.json();
}

const espnAbbrMap = { GSW: 'GS', NYK: 'NY', NOP: 'NO', SAS: 'SA', UTA: 'UTAH', WAS: 'WSH' };

function getTeamLogoByAbbreviation(abbr) {
  if (!abbr) return null;
  return state.teamLogos[abbr] || state.teamLogos[espnAbbrMap[abbr]] || null;
}

function parseMatchupAbbreviations(matchup) {
  if (!matchup) return { playerTeamAbbr: null, opponentAbbr: null };
  const tokens = matchup.trim().split(' ');
  if (tokens.length >= 3) {
    return {
      playerTeamAbbr: tokens[0],
      opponentAbbr: tokens[tokens.length - 1]
    };
  }
  return { playerTeamAbbr: null, opponentAbbr: null };
}

function getClockDisplay(game) {
  if (game.statusState === 'pre') return { text: 'Not Yet Started', live: false };
  if (game.statusState === 'post') return null;
  const detail = (game.statusDetail || '').toLowerCase();
  if (detail.includes('halftime')) return { text: 'Halftime', live: false };
  const quarter = game.period > 4 ? `OT${game.period - 4}` : game.period ? `Q${game.period}` : '';
  const clock = game.displayClock || '';
  const text = [quarter, clock].filter(Boolean).join(' ');
  return { text, live: true };
}


function formatGameCard(game) {
  const gameDate = new Date(game.date);
  const formattedTime = gameDate.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
  const formattedDate = gameDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

  const statusLower = (game.status || '').toLowerCase();
  const isLive = statusLower.includes('progress') || statusLower.includes('quarter') || statusLower.includes('half');
  const isFinal = statusLower.includes('final');
  const statusClass = isLive ? 'in-progress' : isFinal ? 'final' : statusLower.replace(/\s+/g, '-');

  return `
    <div class="card game-card card-animate">
      <div class="game-header">
        <div class="game-meta">
          <div class="game-date">${formattedDate} @ ${formattedTime}</div>
          <div class="game-status-badge ${statusClass}">${game.status}</div>
        </div>
        <div class="game-scores">
          <div class="team-block away">
            <span class="team-name">${game.awayTeam}</span>
            <span class="team-score">${game.awayScore}</span>
          </div>
          <div class="game-separator">
          <span>vs</span>
          ${(() => {
            const clock = getClockDisplay(game);
            if (!clock) return '';
            return `<div class="game-clock-display${clock.live ? ' live' : ''}">${clock.text}</div>`;
          })()}
        </div>
          <div class="team-block home">
            <span class="team-name">${game.homeTeam}</span>
            <span class="team-score">${game.homeScore}</span>
          </div>
        </div>
        <div class="game-venue">${game.venue || 'TBD'}</div>
      </div>
      <div class="starters-row">
        <div class="starter-team">
          <h4>${game.awayTeam} Starters</h4>
          <div id="starters-away-${game.gameId}" class="starter-grid"><p class="loader">Loading starters...</p></div>
        </div>
        <div class="starter-team">
          <h4>${game.homeTeam} Starters</h4>
          <div id="starters-home-${game.gameId}" class="starter-grid"><p class="loader">Loading starters...</p></div>
        </div>
      </div>
      <div class="leaders-section">
        <div class="last-meeting-label">
          Last Matchup Leaders${game.lastMeetingDate ? ' &mdash; ' + new Date(game.lastMeetingDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : ''}
        </div>
        <div class="leaders-row">
          <div class="leader-team">
            <h4>${game.awayTeam}</h4>
            ${renderTeamLeaderSection(game.awayLeaders)}
          </div>
          <div class="leader-team">
            <h4>${game.homeTeam}</h4>
            ${renderTeamLeaderSection(game.homeLeaders)}
          </div>
        </div>
      </div>
    </div>
  `;
}

function renderTeamLeaderSection(leaders) {
  if (!leaders) {
    return '<p style="color:var(--text-muted);font-size:0.85rem;margin:0">No matchup data available</p>';
  }

  const categories = [
    { key: 'points', label: 'PTS' },
    { key: 'rebounds', label: 'REB' },
    { key: 'assists', label: 'AST' },
    { key: 'blocks', label: 'BLK' },
    { key: 'threes', label: '3PM' }
  ];

  return `
    <div class="leader-grid">
      ${categories.map(category => renderLeaderCard(category.label, leaders[category.key])).join('')}
    </div>
  `;
}

function renderLeaderCard(label, leader) {
  if (!leader || !leader.playerId) {
    return `
      <div class="leader-item">
        <div class="leader-detail">
          <strong>${label}</strong>
          <span>No data</span>
        </div>
      </div>
    `;
  }

  return `
    <div class="leader-item clickable-player" data-player-id="${leader.playerId}" data-player-name="${leader.displayName || 'Player'}" title="View last 10 games">
      <img class="leader-avatar" src="${leader.headshot || 'https://via.placeholder.com/42?text=?'}" alt="${leader.displayName || 'Player'}" />
      <div class="leader-detail">
        <strong>${label}: ${leader.value}</strong>
        <span>${leader.displayName}</span>
      </div>
    </div>
  `;
}

function getPlayerStat(player, key) {
  const stat = (player.statistics || []).find(item => item.key === key || item.label === key);
  return stat ? stat.displayValue : '-';
}

function parseNumericStat(value) {
  if (value == null) return -1;
  const numeric = String(value).match(/\d+(?:\.\d+)?/);
  return numeric ? Number(numeric[0]) : -1;
}

function getLastGameTopStat(player) {
  const metrics = ['PTS', 'REB', 'AST'];
  const best = metrics.reduce((current, key) => {
    const value = parseNumericStat(getPlayerStat(player, key));
    if (value > current.value) {
      return { key, value };
    }
    return current;
  }, { key: null, value: -1 });
  return best.key ? best : null;
}

function renderStarterCard(player) {
  const min = getPlayerStat(player, 'MIN');
  const pts = getPlayerStat(player, 'PTS');
  const reb = getPlayerStat(player, 'REB');
  const ast = getPlayerStat(player, 'AST');
  const topStat = getLastGameTopStat(player);

  return `
    <div class="leader-item starter-item">
      <img class="leader-avatar starter-avatar" src="${player.headshot || 'https://via.placeholder.com/42?text=?'}" alt="${player.fullName || 'Player'}" />
      <div class="leader-detail starter-detail">
        <div class="starter-name-row">
          <strong>${player.fullName}</strong>
          <span class="starter-position">${player.position || 'N/A'}</span>
        </div>
        <div class="starter-stats">
          <span class="starter-stat"><strong>MIN</strong> ${min}</span>
          <span class="starter-stat"><strong>PTS</strong> ${pts}</span>
          <span class="starter-stat"><strong>REB</strong> ${reb}</span>
          <span class="starter-stat"><strong>AST</strong> ${ast}</span>
        </div>
        ${topStat ? `<span class="starter-topstat">Top last game stat: ${topStat.key} ${topStat.value}</span>` : ''}
      </div>
    </div>
  `;
}

function buildStarterGrid(players, teamId) {
  const starters = players.filter(player => player.starter === true && player.teamId === teamId);
  return starters.length
    ? `<div class="starter-grid">${starters.map(renderStarterCard).join('')}</div>`
    : '<p>No starters available yet.</p>';
}

async function loadGames() {
  dom.gamesLoading.classList.remove('hidden');
  dom.gamesList.innerHTML = '';
  if (liveRefreshTimeout) { clearTimeout(liveRefreshTimeout); liveRefreshTimeout = null; }

  try {
    const data = await fetchJson(`${apiBase}/games/scores?includeLeaders=1`);
    dom.gamesLoading.classList.add('hidden');
    if (!data.scores || data.scores.length === 0) {
      dom.gamesList.innerHTML = '<div class="card"><p>No games found for today.</p></div>';
      return;
    }

    dom.gamesList.innerHTML = data.scores.map(formatGameCard).join('');

    const hasLive = data.scores.some(g => g.statusState === 'in');
    if (hasLive) {
      liveRefreshTimeout = setTimeout(loadGames, 30000);
    }

    await Promise.allSettled(data.scores.map(async game => {
      const awayContainer = document.getElementById(`starters-away-${game.gameId}`);
      const homeContainer = document.getElementById(`starters-home-${game.gameId}`);
      if (!awayContainer || !homeContainer) return;
      try {
        const box = await fetchJson(`${apiBase}/games/${game.gameId}/players`);
        awayContainer.innerHTML = buildStarterGrid(box.players || [], game.awayTeamId);
        homeContainer.innerHTML = buildStarterGrid(box.players || [], game.homeTeamId);
      } catch (err) {
        awayContainer.innerHTML = `<p>Error loading starters: ${err.message}</p>`;
        homeContainer.innerHTML = `<p>Error loading starters: ${err.message}</p>`;
      }
    }));
  } catch (error) {
    dom.gamesLoading.classList.add('hidden');
    dom.gamesList.innerHTML = `<div class="card"><p>Error loading games: ${error.message}</p></div>`;
  }
}

async function loadTeams() {
  try {
    const data = await fetchJson(`${apiBase}/teams`);
    state.teams = (data.teams || []).slice().sort((a, b) => {
      const aName = (a.displayName || a.teamName || '').toUpperCase();
      const bName = (b.displayName || b.teamName || '').toUpperCase();
      return aName.localeCompare(bName);
    });
    state.teamLogos = state.teams.reduce((map, team) => {
      if (team.abbreviation) {
        map[team.abbreviation] = team.logo;
      }
      return map;
    }, {});
    dom.teamSelect.innerHTML = '<option value="">Select a team</option>' + state.teams
      .map(team => `<option value="${team.teamId}">${team.displayName || team.teamName}</option>`)
      .join('');
  } catch (error) {
    dom.teamSelect.innerHTML = '<option value="">Failed to load teams</option>';
  }
}

async function loadPlayers() {
  try {
    const data = await fetchJson(`${apiBase}/players/list`);
    const players = data.players || [];
    
    // Group players by team
    const playersByTeam = {};
    players.forEach(player => {
      const team = player.team || 'UNK';
      if (!playersByTeam[team]) {
        playersByTeam[team] = [];
      }
      playersByTeam[team].push(player);
    });

    // Build select with optgroups
    let html = '<option value="">Select a player</option>';
    Object.keys(playersByTeam).sort().forEach(team => {
      html += `<optgroup label="${team}">`;
      playersByTeam[team].forEach(player => {
        html += `<option value="${player.playerId}">${player.displayName}</option>`;
      });
      html += '</optgroup>';
    });
    dom.playerSelect.innerHTML = html;
  } catch (error) {
    dom.playerSelect.innerHTML = '<option value="">Failed to load players</option>';
  }
}

function renderInjuryReport(injuryData) {
  if (!injuryData) return '';
  const injuries = injuryData.injuries || [];
  if (!injuries.length) {
    return `
      <div class="injury-section">
        <div class="injury-section-title">Injury Report</div>
        <p class="injury-none">No players currently listed on the injury report.</p>
      </div>
    `;
  }

  const statusOrder = { 'Day-To-Day': 'dtd', 'Questionable': 'questionable', 'Out': 'out' };

  const rows = injuries.map(player => {
    const statusClass = statusOrder[player.status] || 'out';
    const statusLabel = player.status === 'Day-To-Day' ? 'DTD' : player.status;
    const updated = player.updatedDate
      ? new Date(player.updatedDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
      : null;

    return `
      <div class="injury-item">
        <img class="injury-avatar" src="${player.headshot || 'https://via.placeholder.com/36?text=?'}" alt="${player.displayName}" />
        <div class="injury-info">
          <div class="injury-name">${player.displayName}</div>
          ${player.position ? `<div class="injury-position">${player.position}</div>` : ''}
        </div>
        <span class="injury-status-badge ${statusClass}">${statusLabel}</span>
        ${updated ? `<span class="injury-date">Updated ${updated}</span>` : ''}
      </div>
    `;
  }).join('');

  return `
    <div class="injury-section">
      <div class="injury-section-title">Injury Report <span class="injury-count">${injuries.length} player${injuries.length !== 1 ? 's' : ''}</span></div>
      <div class="injury-list">${rows}</div>
    </div>
  `;
}

function renderSeasonLeadersGrid(leaders, title, type) {
  if (!leaders) return '';
  const categories = [
    { key: 'points',   label: 'PPG' },
    { key: 'rebounds', label: 'RPG' },
    { key: 'assists',  label: 'APG' },
    { key: 'steals',   label: 'SPG' },
    { key: 'blocks',   label: 'BPG' },
    { key: 'threes',   label: '3PM' }
  ];
  return `
    <div class="team-leaders-section">
      <div class="team-leaders-title ${type}">${title}</div>
      <div class="leader-grid">
        ${categories.map(c => renderLeaderCard(c.label, leaders[c.key])).join('')}
      </div>
    </div>
  `;
}

async function showTeamStats(teamId) {
  if (!teamId) {
    dom.teamInfo.innerHTML = '<p>Select a team to see stats.</p>';
    return;
  }

  dom.teamInfo.innerHTML = '<p class="loader">Loading team stats...</p>';
  try {
    const [stats, leadersData, injuryData] = await Promise.all([
      fetchJson(`${apiBase}/teams/${teamId}/stats`),
      fetchJson(`${apiBase}/teams/${teamId}/leaders`).catch(() => null),
      fetchJson(`${apiBase}/teams/${teamId}/injuries`).catch(() => null)
    ]);
    setBackgroundLogo(stats.logo || null);
    const overall = stats.record?.items?.find(item => item.type === 'total') || {};
    const home = stats.record?.items?.find(item => item.type === 'home') || {};
    const away = stats.record?.items?.find(item => item.type === 'road') || {};

    const chips = [
      { label: 'Overall', value: overall.summary || 'N/A' },
      { label: 'Home', value: home.summary || 'N/A' },
      { label: 'Away', value: away.summary || 'N/A' },
    ];

    dom.teamInfo.innerHTML = `
      <div class="team-card card-animate">
        <h3>${stats.displayName || stats.teamName || 'Team'}</h3>
        <p class="team-meta">${stats.location || ''} &middot; ${stats.abbreviation || ''}</p>
        <div class="stat-grid">
          ${chips.map(c => `
            <div class="stat-chip">
              <span class="stat-label">${c.label}</span>
              <span class="stat-value" style="font-size:1.15rem">${c.value}</span>
            </div>
          `).join('')}
        </div>
        ${renderInjuryReport(injuryData)}
        ${leadersData ? [
          renderSeasonLeadersGrid(leadersData.playoffLeaders, '2025-26 Playoff Leaders', 'playoffs'),
          renderSeasonLeadersGrid(leadersData.regularLeaders, '2025-26 Regular Season Leaders', 'regular')
        ].join('') : ''}
      </div>
    `;
  } catch (error) {
    dom.teamInfo.innerHTML = `<p>Error loading team stats: ${error.message}</p>`;
  }
}

function setPlayerHeadshot(playerId) {
  const el = document.getElementById('player-headshot');
  if (!el) return;
  if (!playerId) {
    el.classList.add('hidden');
    el.src = '';
    return;
  }
  el.src = `https://cdn.nba.com/headshots/nba/latest/1040x760/${playerId}.png`;
  el.classList.remove('hidden');
}

function renderPlayerStats(data) {
  if (data.error) {
    setPlayerHeadshot(null);
    dom.playerInfo.innerHTML = `<div class="card"><p>${data.error}</p></div>`;
    dom.playerSeasonSelect.classList.add('hidden');
    dom.playerSeasonStats.innerHTML = '';
    dom.playerGameLog.innerHTML = '';
    return;
  }
  setPlayerHeadshot(data.playerId);

  const playerName = data.playerInfo?.resultSets?.[0]?.rowSet?.[0]?.[3] || data.playerInfo?.resultSets?.[0]?.rowSet?.[0]?.[1] || 'Player';
  const currentSeason = data.seasonStats?.currentSeason;
  const seasons = [currentSeason, ...(data.seasonStats?.last4Seasons || [])].filter(Boolean);
  setBackgroundLogo(getTeamLogoByAbbreviation(currentSeason?.TEAM_ABBREVIATION) || null);

  dom.playerInfo.innerHTML = `
    <div class="player-card card-animate">
      <h3>${playerName}</h3>
      <div class="stat-grid">
        <div class="stat-chip">
          <span class="stat-label">Season</span>
          <span class="stat-value" style="font-size:1rem">${currentSeason?.SEASON_ID || 'N/A'}</span>
        </div>
        <div class="stat-chip">
          <span class="stat-label">Team</span>
          <span class="stat-value" style="font-size:1rem">${currentSeason?.TEAM_ABBREVIATION || 'N/A'}</span>
        </div>
        <div class="stat-chip">
          <span class="stat-label">ID</span>
          <span class="stat-value" style="font-size:0.9rem">${data.playerId}</span>
        </div>
      </div>
    </div>
  `;

  if (seasons.length === 0) {
    dom.playerSeasonSelect.classList.add('hidden');
    dom.playerSeasonStats.innerHTML = '<p>No season stats available.</p>';
    return;
  }

  dom.playerSeasonSelect.classList.remove('hidden');
  dom.playerSeason.innerHTML = seasons
    .map(season => `<option value="${season.SEASON_ID}">${season.SEASON_ID}</option>`)
    .join('');
  state.lastPlayerStats = { data, seasons, playoffSeasons: data.seasonStats?.playoffSeasons || [] };
  renderSelectedSeason();
  loadPlayerGameLog(data.playerId);
}

function renderSelectedSeason() {
  const selectedSeason = dom.playerSeason.value;
  const regularStats = state.lastPlayerStats?.seasons?.find(s => s.SEASON_ID === selectedSeason);
  const playoffStats = state.lastPlayerStats?.playoffSeasons?.find(s => s.SEASON_ID === selectedSeason);

  if (!regularStats && !playoffStats) {
    dom.playerSeasonStats.innerHTML = '<p>Select a season to view stats.</p>';
    return;
  }

  const buildCard = (stats, type) => {
    const chips = [
      { label: 'PPG', value: stats.PTS, highlight: true },
      { label: 'APG', value: stats.AST },
      { label: 'RPG', value: stats.REB },
      { label: 'GP',  value: stats.GP },
      { label: 'Team', value: stats.TEAM_ABBREVIATION },
    ];
    return `
      <div class="player-card card-animate">
        <div class="season-type-header ${type}">${type === 'playoffs' ? 'Playoffs' : 'Regular Season'}</div>
        <div class="stat-grid">
          ${chips.map(c => `
            <div class="stat-chip">
              <span class="stat-label">${c.label}</span>
              <span class="stat-value${c.highlight ? ' highlight' : ''}">${c.value != null ? c.value : 'N/A'}</span>
            </div>
          `).join('')}
        </div>
      </div>
    `;
  };

  dom.playerSeasonStats.innerHTML = `
    <div class="season-stats-grid">
      ${regularStats ? buildCard(regularStats, 'regular') : ''}
      ${playoffStats ? buildCard(playoffStats, 'playoffs') : ''}
    </div>
  `;
  animateStatValues(dom.playerSeasonStats);
}

async function loadPlayerGameLog(playerId) {
  try {
    dom.playerGameLog.innerHTML = '<p class="loader">Loading game log...</p>';
    const data = await fetchJson(`${apiBase}/players/${encodeURIComponent(playerId)}/gamelogs`);
    renderGameLog(data);
  } catch (error) {
    dom.playerGameLog.innerHTML = `<p>Error loading game log: ${error.message}</p>`;
  }
}

function buildGameTable(title, games, type) {
  const cols = ['DATE', 'OPP', 'RESULT', 'MIN', 'FG', 'FG%', '3PT', '3P%', 'FT', 'FT%', 'REB', 'AST', 'BLK', 'STL', 'PF', 'TO', 'PTS'];
  let html = `
    <div class="game-log-section">
      <div class="season-type-header ${type}">
        ${title}
        <span class="game-count">${games.length} games</span>
      </div>
      <table class="game-log-table"><thead><tr>
        ${cols.map(h => `<th>${h}</th>`).join('')}
      </tr></thead><tbody>
  `;
  games.forEach(game => {
    const date = game.GAME_DATE ? new Date(game.GAME_DATE).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '-';
    const matchup = game.MATCHUP || '-';
    const { playerTeamAbbr, opponentAbbr } = parseMatchupAbbreviations(matchup);
    const playerLogo = getTeamLogoByAbbreviation(playerTeamAbbr);
    const oppLogo = getTeamLogoByAbbreviation(opponentAbbr);
    const stats = {
      'DATE': date,
      'OPP': `<div class="opp-cell">${oppLogo ? `<img class="opp-logo" src="${oppLogo}" alt="${opponentAbbr}" />` : ''}<span>${matchup}</span></div>`,
      'RESULT': game.WL || '-',
      'MIN': game.MIN || '-',
      'FG': `${game.FGM || 0}-${game.FGA || 0}`,
      'FG%': game.FG_PCT ? (game.FG_PCT * 100).toFixed(1) : '-',
      '3PT': `${game.FG3M || 0}-${game.FG3A || 0}`,
      '3P%': game.FG3_PCT ? (game.FG3_PCT * 100).toFixed(1) : '-',
      'FT': `${game.FTM || 0}-${game.FTA || 0}`,
      'FT%': game.FT_PCT ? (game.FT_PCT * 100).toFixed(1) : '-',
      'REB': game.REB || '-',
      'AST': game.AST || '-',
      'BLK': game.BLK || '-',
      'STL': game.STL || '-',
      'PF': game.PF || '-',
      'TO': game.TO || '-',
      'PTS': game.PTS || '-'
    };
    html += '<tr>' + cols.map(h => `<td>${stats[h] ?? '-'}</td>`).join('') + '</tr>';
  });
  html += '</tbody></table></div>';
  return html;
}

function renderGameLog(data) {
  if (data.error || !data.games || data.games.length === 0) {
    dom.playerGameLog.innerHTML = '<p>No game logs available.</p>';
    return;
  }

  const playoffGames = data.games.filter(g => g.SEASON_TYPE === 'Playoffs');
  const regularGames = data.games.filter(g => g.SEASON_TYPE !== 'Playoffs');

  let html = '';
  if (playoffGames.length > 0) html += buildGameTable('Playoffs', playoffGames, 'playoffs');
  if (regularGames.length > 0) html += buildGameTable('Regular Season', regularGames, 'regular');
  dom.playerGameLog.innerHTML = html || '<p>No game logs available.</p>';
}

async function loadNews() {
  dom.breakingNewsLoading.classList.remove('hidden');
  dom.newsLoading.classList.remove('hidden');
  dom.breakingCarousel.innerHTML = '';
  dom.newsFeed.innerHTML = '';

  try {
    const data = await fetchJson(`${apiBase}/news`);
    dom.breakingNewsLoading.classList.add('hidden');
    dom.newsLoading.classList.add('hidden');

    renderBreakingNewsTicker(data.breaking || []);

    if (data.general && data.general.length > 0) {
      renderNewsFeed(data.general);
    } else {
      dom.newsFeed.innerHTML = '<p>No news available.</p>';
    }
  } catch (error) {
    dom.breakingNewsLoading.classList.add('hidden');
    dom.newsLoading.classList.add('hidden');
    dom.breakingCarousel.innerHTML = `<p>Error loading breaking news: ${error.message}</p>`;
    dom.newsFeed.innerHTML = `<p>Error loading news: ${error.message}</p>`;
  }
}

function renderBreakingNewsTicker(articles) {
  if (!articles || !articles.length) {
    dom.breakingCarousel.innerHTML = '<p style="color:var(--text-muted);font-size:0.9rem;padding:12px 0">No breaking news available.</p>';
    return;
  }

  const itemsHtml = articles.map(article => {
    const time = new Date(article.publishTime).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
    const safeTitle = article.title.replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    return `<a class="ticker-item" href="${article.url}" target="_blank" rel="noopener noreferrer" title="${safeTitle}"><span class="ticker-source">${article.source}</span><span class="ticker-headline">${safeTitle}</span><span class="ticker-time">${time}</span></a><span class="ticker-sep" aria-hidden="true">◆</span>`;
  }).join('');

  const duration = Math.max(30, articles.length * 5);

  dom.breakingCarousel.innerHTML = `
    <div class="ticker-wrapper">
      <div class="ticker-label"><span class="ticker-dot"></span>BREAKING</div>
      <div class="ticker-track">
        <div class="ticker-content" style="animation-duration:${duration}s">${itemsHtml}${itemsHtml}</div>
      </div>
    </div>
  `;
}

function renderNewsFeed(articles) {
  let html = '';

  articles.forEach(article => {
    const date = new Date(article.publishTime).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric'
    });

    html += `
      <div class="card news-card">
        <div class="news-card-header">
          <h3>${article.title}</h3>
        </div>
        <p>${article.snippet}</p>
        <div class="news-card-footer">
          <span class="news-source">${article.source}</span>
          <span class="news-date">${date}</span>
        </div>
        <a href="${article.url}" target="_blank" class="news-link">Read Full Story →</a>
      </div>
    `;
  });

  dom.newsFeed.innerHTML = html || '<p>No news available.</p>';
}


function setBackgroundLogo(logoUrl) {
  let el = document.getElementById('bg-logo');
  if (!el) {
    el = document.createElement('div');
    el.id = 'bg-logo';
    el.className = 'bg-logo-overlay';
    document.body.appendChild(el);
  }
  el.style.opacity = '0';
  if (!logoUrl) return;
  setTimeout(() => {
    el.style.backgroundImage = `url('${logoUrl}')`;
    el.style.opacity = '0.07';
  }, 300);
}

function createModal() {
  if (document.getElementById('player-modal')) return;
  const overlay = document.createElement('div');
  overlay.id = 'player-modal';
  overlay.className = 'modal-overlay hidden';
  overlay.innerHTML = `
    <div class="modal-container">
      <div class="modal-header">
        <div>
          <h3 id="modal-player-name"></h3>
          <p class="modal-subtitle">Last 10 Games</p>
        </div>
        <button class="modal-close" id="modal-close-btn">&times;</button>
      </div>
      <div id="modal-content" class="modal-content"></div>
    </div>
  `;
  document.body.appendChild(overlay);
  document.getElementById('modal-close-btn').addEventListener('click', closePlayerModal);
  overlay.addEventListener('click', e => { if (e.target === overlay) closePlayerModal(); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape') closePlayerModal(); });
}

function closePlayerModal() {
  const modal = document.getElementById('player-modal');
  if (modal) modal.classList.add('hidden');
  document.body.style.overflow = '';
}

async function openPlayerModal(playerId, playerName) {
  const modal = document.getElementById('player-modal');
  document.getElementById('modal-player-name').textContent = playerName;
  document.getElementById('modal-content').innerHTML = '<p class="loader">Loading last 10 games...</p>';
  modal.classList.remove('hidden');
  document.body.style.overflow = 'hidden';

  try {
    const data = await fetchJson(`${apiBase}/players/${encodeURIComponent(playerName)}/gamelogs`);
    const sorted = (data.games || []).slice().sort((a, b) => new Date(b.GAME_DATE) - new Date(a.GAME_DATE));
    const last10 = sorted.slice(0, 10);
    document.getElementById('modal-content').innerHTML = last10.length
      ? buildModalGameTable(last10)
      : '<p>No recent games found.</p>';
  } catch (err) {
    document.getElementById('modal-content').innerHTML = `<p>Error loading games: ${err.message}</p>`;
  }
}

function buildModalGameTable(games) {
  const cols = ['DATE', 'OPP', 'RESULT', 'MIN', 'PTS', 'REB', 'AST', 'STL', 'BLK', 'FG', '3PT', 'FT'];
  let html = `<table class="game-log-table"><thead><tr>${cols.map(h => `<th>${h}</th>`).join('')}</tr></thead><tbody>`;

  games.forEach(game => {
    const date = game.GAME_DATE
      ? new Date(game.GAME_DATE).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
      : '-';
    const matchup = game.MATCHUP || '-';
    const { opponentAbbr } = parseMatchupAbbreviations(matchup);
    const oppLogo = getTeamLogoByAbbreviation(opponentAbbr);
    const isPlayoff = game.SEASON_TYPE === 'Playoffs';
    const pts = Number(game.PTS) || 0;

    const row = {
      'DATE': date,
      'OPP': `<div class="opp-cell">${oppLogo ? `<img class="opp-logo" src="${oppLogo}" alt="${opponentAbbr}" />` : ''}<span>${matchup}</span></div>`,
      'RESULT': `${game.WL || '-'}${isPlayoff ? ' <span class="game-type">PO</span>' : ''}`,
      'MIN': game.MIN || '-',
      'PTS': `<span class="${pts >= 30 ? 'stat-highlight' : ''}">${pts || '-'}</span>`,
      'REB': game.REB || '-',
      'AST': game.AST || '-',
      'STL': game.STL || '-',
      'BLK': game.BLK || '-',
      'FG':  `${game.FGM || 0}-${game.FGA || 0}`,
      '3PT': `${game.FG3M || 0}-${game.FG3A || 0}`,
      'FT':  `${game.FTM || 0}-${game.FTA || 0}`,
    };
    html += '<tr>' + cols.map(h => `<td>${row[h] ?? '-'}</td>`).join('') + '</tr>';
  });

  html += '</tbody></table>';
  return html;
}

function animateStatValues(container) {
  container.querySelectorAll('.stat-value').forEach(el => {
    const raw = el.textContent.trim();
    const num = parseFloat(raw);
    if (isNaN(num) || raw.includes('-') || raw.length > 6) return;
    const isDecimal = raw.includes('.');
    const decimals = isDecimal ? (raw.split('.')[1] || '').length : 0;
    const duration = 700;
    const startTime = performance.now();
    function update(now) {
      const progress = Math.min((now - startTime) / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      el.textContent = isDecimal ? (eased * num).toFixed(decimals) : Math.round(eased * num);
      if (progress < 1) requestAnimationFrame(update);
    }
    requestAnimationFrame(update);
  });
}


async function loadScoutingGames() {
  dom.scoutingGameSelect.innerHTML = '<option value="">Loading games...</option>';
  try {
    const data = await fetchJson(`${apiBase}/games/upcoming?days=14`);
    const games = data.games || [];
    if (!games.length) {
      dom.scoutingGameSelect.innerHTML = '<option value="">No upcoming games found</option>';
      return;
    }

    let byDate = {};
    games.forEach(game => {
      const d = new Date(game.date);
      const key = d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
      if (!byDate[key]) byDate[key] = [];
      byDate[key].push(game);
    });

    let html = '<option value="">Select a matchup...</option>';
    Object.entries(byDate).forEach(([dateLabel, dayGames]) => {
      html += `<optgroup label="${dateLabel}">`;
      dayGames.forEach(game => {
        const time = new Date(game.date).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
        const statusSuffix = game.statusState === 'in' ? ' (LIVE)' : game.statusState === 'post' ? ' (Final)' : ` ${time}`;
        html += `<option value="${game.gameId}">${game.awayTeam} @ ${game.homeTeam}${statusSuffix}</option>`;
      });
      html += '</optgroup>';
    });
    dom.scoutingGameSelect.innerHTML = html;
  } catch (error) {
    dom.scoutingGameSelect.innerHTML = '<option value="">Failed to load games</option>';
  }
}

async function fetchScoutingReport() {
  const gameId = dom.scoutingGameSelect.value;
  if (!gameId) return;

  dom.scoutingLoading.classList.remove('hidden');
  dom.scoutingError.classList.add('hidden');
  dom.scoutingContent.innerHTML = '';

  try {
    const report = await fetchJson(`${apiBase}/games/${gameId}/scouting`);
    dom.scoutingLoading.classList.add('hidden');
    renderScoutingReport(report);
  } catch (error) {
    dom.scoutingLoading.classList.add('hidden');
    dom.scoutingError.textContent = `Error loading scouting report: ${error.message}`;
    dom.scoutingError.classList.remove('hidden');
  }
}

function renderScoutingReport(report) {
  const formatArticles = (articles) => `
    <div class="scouting-articles">
      ${articles.slice(0, 6).map(article => {
        const date = new Date(article.publishTime).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
        const title = article.title.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
        const snippet = (article.snippet || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
        return `
          <a class="scouting-article-card" href="${article.url}" target="_blank" rel="noopener noreferrer">
            <div class="scouting-article-meta">
              <span class="news-source">${article.source}</span>
              <span class="news-date">${date}</span>
            </div>
            <p class="scouting-article-title">${title}</p>
            ${snippet ? `<p class="scouting-article-blurb">${snippet}</p>` : ''}
          </a>
        `;
      }).join('')}
    </div>
  `;

  const sections = report.sections || [];
  const advancedSources = report.advancedSources || [];
  const gameDateStr = report.gameDate
    ? new Date(report.gameDate).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })
    : '';

  const matchupHeader = `
    <div class="scouting-matchup-header">
      <span class="scouting-team">${report.awayTeam.name}</span>
      <span class="scouting-at">@</span>
      <span class="scouting-team">${report.homeTeam.name}</span>
      ${gameDateStr ? `<span class="scouting-cache-badge">${gameDateStr}</span>` : ''}
    </div>
  `;

  const sectionsHtml = sections.length ? sections.map((section, i) => `
    ${i > 0 ? '<div style="border-top: 1px solid var(--border); margin: 8px 0;"></div>' : ''}
    <div class="scouting-section">
      <div class="scouting-section-header">
        <h3>${section.title}</h3>
        <span class="scouting-article-count">${section.articles.length} article${section.articles.length !== 1 ? 's' : ''}</span>
      </div>
      ${formatArticles(section.articles)}
    </div>
  `).join('') : `<p class="scouting-empty">No game-specific scouting articles found for this matchup yet. Check back closer to game time.</p>`;

  const advancedHtml = advancedSources.length ? `
    <div style="border-top: 1px solid var(--border); margin: 24px 0 8px;"></div>
    <div class="scouting-section">
      <div class="scouting-section-header">
        <h3>Advanced Scouting Data</h3>
      </div>
      <div class="scouting-advanced-grid">
        ${advancedSources.map(src => `
          <div class="scouting-advanced-card">
            <div class="scouting-advanced-name">${src.name}</div>
            <p class="scouting-advanced-desc">${src.description}</p>
            <div class="scouting-advanced-links">
              ${src.links.map(link => `<a class="scouting-advanced-link" href="${link.url}" target="_blank" rel="noopener noreferrer">${link.label} →</a>`).join('')}
            </div>
          </div>
        `).join('')}
      </div>
    </div>
  ` : '';

  dom.scoutingContent.innerHTML = `
    <div class="card card-animate">
      ${matchupHeader}
      ${sectionsHtml}
      ${advancedHtml}
    </div>
  `;
}

// ── Bet Analysis Tab ─────────────────────────────────────────────────────────

async function loadBettingGames() {
  dom.bettingGameSelect.innerHTML = '<option value="">Loading games...</option>';
  try {
    const data = await fetchJson(`${apiBase}/games/upcoming?days=14`);
    const games = data.games || [];
    if (!games.length) {
      dom.bettingGameSelect.innerHTML = '<option value="">No upcoming games found</option>';
      return;
    }
    let byDate = {};
    games.forEach(game => {
      const d = new Date(game.date);
      const key = d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
      if (!byDate[key]) byDate[key] = [];
      byDate[key].push(game);
    });
    let html = '<option value="">Select a matchup...</option>';
    Object.entries(byDate).forEach(([dateLabel, dayGames]) => {
      html += `<optgroup label="${dateLabel}">`;
      dayGames.forEach(game => {
        const time = new Date(game.date).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
        const statusSuffix = game.statusState === 'in' ? ' (LIVE)' : game.statusState === 'post' ? ' (Final)' : ` ${time}`;
        html += `<option value="${game.gameId}">${game.awayTeam} @ ${game.homeTeam}${statusSuffix}</option>`;
      });
      html += '</optgroup>';
    });
    dom.bettingGameSelect.innerHTML = html;
  } catch {
    dom.bettingGameSelect.innerHTML = '<option value="">Failed to load games</option>';
  }
}

async function fetchBettingAnalysis() {
  const gameId = dom.bettingGameSelect.value;
  if (!gameId) return;

  dom.bettingLoading.classList.remove('hidden');
  dom.bettingError.classList.add('hidden');
  dom.bettingContent.innerHTML = '';

  try {
    const data = await fetchJson(`${apiBase}/games/${gameId}/betting`);
    dom.bettingLoading.classList.add('hidden');
    renderBettingContent(data);
  } catch (error) {
    dom.bettingLoading.classList.add('hidden');
    dom.bettingError.textContent = `Error loading bet analysis: ${error.message}`;
    dom.bettingError.classList.remove('hidden');
  }
}

// ── Parlay builder ───────────────────────────────────────────────────────────

function renderParlayTh(col, label) {
  const { col: activeCol, dir } = bettingState.parlaySort;
  const isActive = activeCol === col;
  const arrow = isActive ? (dir === 'asc' ? ' ↑' : ' ↓') : '';
  return `<th class="bet-parlay-th${isActive ? ' bet-parlay-th-active' : ''}" data-parlay-sort="${col}">${label}${arrow}</th>`;
}

function sortedParlayLegs(legs) {
  const { col, dir } = bettingState.parlaySort;
  if (!col || !dir) return legs;
  return legs.slice().sort((a, b) => {
    switch (col) {
      case 'player': {
        const cmp = a.playerName.localeCompare(b.playerName);
        return dir === 'asc' ? cmp : -cmp;
      }
      case 'stat': {
        const aLabel = BET_STAT_LABELS[a.stat] || a.stat;
        const bLabel = BET_STAT_LABELS[b.stat] || b.stat;
        const cmp = aLabel.localeCompare(bLabel);
        return dir === 'asc' ? cmp : -cmp;
      }
      case 'line':
        return dir === 'asc' ? a.line - b.line : b.line - a.line;
      case 'price':
        return dir === 'asc' ? a.yesPrice - b.yesPrice : b.yesPrice - a.yesPrice;
      case 'hitrate':
        return dir === 'asc' ? a.overRate - b.overRate : b.overRate - a.overRate;
      case 'rating': {
        const order = { green: 0, blue: 1 };
        const aRank = order[a.rating] ?? 2;
        const bRank = order[b.rating] ?? 2;
        return dir === 'asc' ? aRank - bRank : bRank - aRank;
      }
      default:
        return 0;
    }
  });
}

// Collect eligible legs from a single game's players/teams
function collectLegs(players, teams, includeCustom = false) {
  const legs = [];
  players.forEach(player => {
    const opponentTeam = teams.find(t => String(t.teamId) !== String(player.teamId));
    const opponentAbbr = opponentTeam ? opponentTeam.abbreviation : 'OPP';
    const gameLabel = teams.length === 2
      ? `${teams[0].abbreviation} vs ${teams[1].abbreviation}` : '';

    Object.entries(player.stats).forEach(([stat, analysis]) => {
      if (!analysis) return;
      if (analysis.rating !== 'green' && analysis.rating !== 'blue') return;

      const candidates = analysis.candidates || [];
      const matched = candidates.find(c => c.line === analysis.line);
      const isCustom = candidates.length > 0 && !matched;
      if (isCustom && !includeCustom) return;

      const yesPrice = isCustom ? 0 : (matched ? matched.yesPrice : analysis.yesPrice);
      if (yesPrice == null) return;

      legs.push({
        playerName: player.playerName,
        stat,
        line: analysis.line,
        rating: analysis.rating,
        overRate: analysis.overRate,
        gamesAnalyzed: analysis.gamesAnalyzed,
        yesPrice,
        isCustom,
        opponentAbbr,
        gameLabel,
      });
    });
  });
  return legs;
}

// Per-game Top 5 — strictly scoped to one game's players/teams
function buildPerGameTop5(players, teams) {
  const all = [];
  collectLegs(players, teams, true).forEach(leg => {
    if (!leg.isCustom && leg.yesPrice === 0) return;
    all.push(leg);
  });
  all.sort((a, b) => {
    if (b.overRate !== a.overRate) return b.overRate - a.overRate;
    if (b.yesPrice !== a.yesPrice) return b.yesPrice - a.yesPrice;
    if (a.rating === 'green' && b.rating !== 'green') return -1;
    if (b.rating === 'green' && a.rating !== 'green') return 1;
    return 0;
  });
  return all.slice(0, 5);
}

// Cross-game Top 5 ranked by: overRate DESC → yesPrice DESC → green before blue
function buildTop5Picks() {
  const all = [];
  Object.values(bettingState.allGames).forEach(({ players, teams }) => {
    collectLegs(players, teams, true).forEach(leg => {
      if (!leg.isCustom && leg.yesPrice === 0) return; // exclude real 0¢ Kalshi markets
      all.push(leg);
    });
  });

  all.sort((a, b) => {
    if (b.overRate !== a.overRate) return b.overRate - a.overRate;
    if (b.yesPrice !== a.yesPrice) return b.yesPrice - a.yesPrice;
    if (a.rating === 'green' && b.rating !== 'green') return -1;
    if (b.rating === 'green' && a.rating !== 'green') return 1;
    return 0;
  });

  return all.slice(0, 5);
}

// opts.perGame  — true: scoped to one game, false: cross-game
// opts.gameLabel — "Team A vs Team B" shown in per-game title
// opts.trackKeys — whether to update bettingState.top5Keys for flash tracking
function renderTop5Html(top5, flash = false, opts = {}) {
  const { perGame = false, gameLabel = '', trackKeys = true } = opts;
  if (!top5.length) return '';

  const showGameCol = !perGame;
  const prevKeys = bettingState.top5Keys;

  const rowsHtml = top5.map((pick, i) => {
    const key = `${pick.playerName}_${pick.stat}_${pick.line}`;
    const isNew = flash && !prevKeys.includes(key);
    const rowAttrs = isNew ? ' class="top5-row-new"' : '';
    // Cross-game column shows full matchup (e.g. "SAS vs MIN"); per-game omits it
    const gameCell = showGameCol
      ? `<td class="top5-opp">${pick.gameLabel || `vs ${pick.opponentAbbr}`}</td>`
      : '';
    const customBadge = pick.isCustom ? '<span class="top5-custom-badge">Custom</span>' : '';
    const priceCell = pick.isCustom
      ? `<span class="top5-no-price">&mdash;</span>`
      : `<span class="bet-parlay-price">${pick.yesPrice}&cent; yes</span>`;
    return `
      <tr${rowAttrs}>
        <td class="top5-rank">${i + 1}</td>
        <td class="bet-parlay-player">${pick.playerName}${customBadge}</td>
        ${gameCell}
        <td>${BET_STAT_LABELS[pick.stat] || pick.stat}</td>
        <td class="bet-parlay-line">O ${pick.line}</td>
        <td>${priceCell}</td>
        <td>${pick.overRate}% <span class="bet-parlay-games">last ${pick.gamesAnalyzed}</span></td>
        <td><span class="bet-rating-badge bet-rating-${pick.rating}">${pick.rating.toUpperCase()}</span></td>
      </tr>`;
  }).join('');

  if (trackKeys) bettingState.top5Keys = top5.map(p => `${p.playerName}_${p.stat}_${p.line}`);

  const pricedLegs = top5.filter(p => p.yesPrice > 0);
  const multiplier = pricedLegs.reduce((m, p) => m * (100 / p.yesPrice), 1);
  const avgHitRate = Math.round(top5.reduce((s, p) => s + p.overRate, 0) / top5.length);
  const confRating = avgHitRate >= 80 ? 'green' : avgHitRate >= 65 ? 'blue' : avgHitRate >= 50 ? 'yellow' : 'red';
  const confLabel  = avgHitRate >= 80 ? 'High' : avgHitRate >= 65 ? 'Moderate' : avgHitRate >= 50 ? 'Low' : 'Poor';

  const excludedNote = pricedLegs.length < top5.length
    ? `<p class="top5-exclude-note">${top5.length - pricedLegs.length} pick(s) with $0¢ price excluded from multiplier.</p>`
    : '';

  const payoutRows = [10, 25, 50].map(stake =>
    `<tr><td>$${stake}</td><td class="bet-parlay-payout-val">$${(stake * multiplier).toFixed(2)}</td></tr>`
  ).join('');

  const gameColHeader = showGameCol ? '<th>Game</th>' : '';
  const sectionClass = perGame ? 'top5-section' : 'top5-section top5-section-cross';
  const sectionTitle = perGame && gameLabel
    ? `Top 5 Picks &mdash; ${gameLabel}`
    : `Top Picks &mdash; Across ${Object.keys(bettingState.allGames).length} Games`;
  const subtitleText = perGame
    ? 'Best bets from this game by hit rate then Kalshi price.'
    : 'Best bets across all analyzed games by hit rate then Kalshi price.';
  const badge = !perGame
    ? `<span class="top5-multi-badge">${Object.keys(bettingState.allGames).length} games</span>`
    : '';

  return `
    <div class="${sectionClass}">
      <div class="top5-header">
        <span class="top5-star">&#11088;</span>
        <span class="top5-title">${sectionTitle}</span>
        ${badge}
      </div>
      <p class="top5-subtitle">${subtitleText} Custom-edited lines shown with badge &mdash; excluded from parlay multiplier.</p>
      <div class="top5-layout">
        <div class="top5-table-wrap">
          <table class="top5-table">
            <thead>
              <tr>
                <th>#</th><th>Player</th>${gameColHeader}<th>Stat</th><th>Line</th><th>Price</th><th>Hit Rate</th><th>Rating</th>
              </tr>
            </thead>
            <tbody>${rowsHtml}</tbody>
          </table>
        </div>
        <div class="top5-summary-card">
          <div class="top5-conf-label">Avg Hit Rate</div>
          <div class="top5-conf-val bet-rating-${confRating}">${avgHitRate}%</div>
          <div class="top5-conf-badge bet-rating-${confRating}">${confLabel} Confidence</div>
          <div class="top5-multiplier">${multiplier.toFixed(2)}x</div>
          <div class="top5-multiplier-label">5-Leg Multiplier</div>
          ${excludedNote}
          <table class="bet-parlay-payout-table" style="margin-top:10px">
            <thead><tr><th>Stake</th><th>Payout</th></tr></thead>
            <tbody>${payoutRows}</tbody>
          </table>
        </div>
      </div>
    </div>`;
}

function renderParlayHtml(flash = false) {
  const isMultiGame = Object.keys(bettingState.allGames).length > 1;

  // Cross-game section — only shown when multiple games have been analyzed
  let crossTop5Html = '';
  if (isMultiGame) {
    const crossTop5 = buildTop5Picks();
    // trackKeys:false so the per-game section owns flash tracking
    crossTop5Html = renderTop5Html(crossTop5, false, { trackKeys: false });
  }

  // Per-game section — strictly current game's players only
  const perTop5 = buildPerGameTop5(bettingState.players, bettingState.teams);
  const gameLabel = bettingState.teams.length === 2
    ? `${bettingState.teams[0].teamName} vs ${bettingState.teams[1].teamName}`
    : '';
  const perTop5Html = perTop5.length
    ? renderTop5Html(perTop5, flash, { perGame: true, gameLabel, trackKeys: true })
    : '';
  const top5Html = `${crossTop5Html}${perTop5Html}`;

  if (!bettingState.players.length) return top5Html;

  const legs = collectLegs(bettingState.players, bettingState.teams);

  if (!legs.length) {
    return `${top5Html}
      <div class="bet-parlay-section">
        <div class="bet-parlay-title">Parlay Builder</div>
        <p class="bet-empty-msg" style="margin:8px 0 0">No green or blue Kalshi market bets to build a parlay from.</p>
      </div>`;
  }

  const multiplier = legs.reduce((m, leg) => m * (100 / leg.yesPrice), 1);

  const legsHtml = sortedParlayLegs(legs).map(leg => `
    <tr>
      <td class="bet-parlay-player">${leg.playerName}</td>
      <td>${BET_STAT_LABELS[leg.stat] || leg.stat}</td>
      <td class="bet-parlay-line">O ${leg.line}</td>
      <td><span class="bet-parlay-price">${leg.yesPrice}&cent; yes</span></td>
      <td>${leg.overRate}% <span class="bet-parlay-games">last ${leg.gamesAnalyzed}</span></td>
      <td><span class="bet-rating-badge bet-rating-${leg.rating}">${leg.rating.toUpperCase()}</span></td>
    </tr>`).join('');

  const payoutRows = [1, 5, 10, 25].map(stake =>
    `<tr><td>$${stake}</td><td class="bet-parlay-payout-val">$${(stake * multiplier).toFixed(2)}</td></tr>`
  ).join('');

  return `${top5Html}
    <div class="bet-parlay-section">
      <div class="bet-parlay-title">
        Parlay Builder
        <span class="bet-parlay-legs-badge">${legs.length} leg${legs.length !== 1 ? 's' : ''}</span>
      </div>
      <p class="bet-parlay-subtitle">All green &amp; blue real Kalshi markets from this game &mdash; custom lines excluded.</p>
      <div class="bet-parlay-layout">
        <div class="bet-parlay-legs-wrap">
          <table class="bet-parlay-table">
            <thead><tr>${renderParlayTh('player','Player')}${renderParlayTh('stat','Stat')}${renderParlayTh('line','Line')}${renderParlayTh('price','Price')}${renderParlayTh('hitrate','Hit Rate')}${renderParlayTh('rating','Rating')}</tr></thead>
            <tbody>${legsHtml}</tbody>
          </table>
        </div>
        <div class="bet-parlay-payout-wrap">
          <div class="bet-parlay-multiplier">${multiplier.toFixed(2)}x</div>
          <div class="bet-parlay-multiplier-label">Combined Multiplier</div>
          <table class="bet-parlay-payout-table">
            <thead><tr><th>Stake</th><th>Payout</th></tr></thead>
            <tbody>${payoutRows}</tbody>
          </table>
        </div>
      </div>
    </div>`;
}

// ── Line editing ──────────────────────────────────────────────────────────────

function applyLineOverride(athleteId, stat, newLine) {
  const player = bettingState.players.find(p => String(p.athleteId) === String(athleteId));
  if (!player || !player.stats[stat]) return;

  const analysis = player.stats[stat];
  const defaultLine = analysis.defaultLine ?? analysis.line;
  const key = `${athleteId}_${stat}`;

  if (newLine === defaultLine) {
    delete bettingState.overrides[key];
  } else {
    bettingState.overrides[key] = newLine;
  }

  const rescore = clientRescore(analysis.gameValues, newLine);
  analysis.line    = newLine;
  analysis.overRate      = rescore.overRate;
  analysis.gamesAnalyzed = rescore.gamesAnalyzed;
  analysis.rating        = rescore.rating;

  const summary = { green: 0, blue: 0, yellow: 0, red: 0 };
  Object.values(player.stats).forEach(a => { if (a) summary[a.rating]++; });
  player.summary = summary;

  const teams = bettingState.teams;
  const opponentTeam = teams.find(t => String(t.teamId) !== String(player.teamId));
  const opponentAbbr = opponentTeam ? opponentTeam.abbreviation : 'OPP';

  const rowEl = document.querySelector(`.bet-market-item[data-aid="${athleteId}"][data-stat="${stat}"]`);
  if (rowEl) rowEl.outerHTML = renderBetStatRow(stat, analysis, opponentAbbr, athleteId);

  const pillsEl = document.querySelector(`.bet-player-card[data-aid="${player.athleteId}"] .bet-summary`);
  if (pillsEl) {
    const summaryPills = Object.entries(player.summary)
      .filter(([, count]) => count > 0)
      .map(([rating, count]) =>
        `<span class="bet-summary-pill bet-pill-${rating}">${count} ${BET_RATING_LABELS[rating]}</span>`
      ).join('');
    pillsEl.innerHTML = summaryPills || '<span class="bet-no-markets-badge">No lines</span>';
  }

  const parlaySection = document.getElementById('bet-parlay-section');
  if (parlaySection) parlaySection.innerHTML = renderParlayHtml(true);
}

function activateLineEdit(pill) {
  const { aid, stat } = pill.dataset;
  const currentLine = parseInt(pill.textContent.replace(/[^0-9]/g, ''), 10);

  pill.classList.add('editing');
  const input = document.createElement('input');
  input.type = 'number';
  input.className = 'bet-line-input';
  input.value = currentLine;
  input.min = 1;
  input.step = 1;

  pill.textContent = '';
  pill.appendChild(input);
  input.focus();
  input.select();

  let committed = false;

  function commit() {
    if (committed) return;
    committed = true;
    const val = parseInt(input.value, 10);
    if (!isNaN(val) && val > 0) {
      applyLineOverride(aid, stat, val);
    } else {
      // Restore the row without changes
      const player = bettingState.players.find(p => String(p.athleteId) === String(aid));
      if (player && player.stats[stat]) {
        const teams = bettingState.teams;
        const oppTeam = teams.find(t => String(t.teamId) !== String(player.teamId));
        const oppAbbr = oppTeam ? oppTeam.abbreviation : 'OPP';
        const rowEl = pill.closest('.bet-market-item');
        if (rowEl) rowEl.outerHTML = renderBetStatRow(stat, player.stats[stat], oppAbbr, aid);
      }
    }
  }

  function cancelEdit() {
    if (committed) return;
    committed = true;
    const player = bettingState.players.find(p => String(p.athleteId) === String(aid));
    if (player && player.stats[stat]) {
      const teams = bettingState.teams;
      const oppTeam = teams.find(t => String(t.teamId) !== String(player.teamId));
      const oppAbbr = oppTeam ? oppTeam.abbreviation : 'OPP';
      const rowEl = pill.closest('.bet-market-item');
      if (rowEl) rowEl.outerHTML = renderBetStatRow(stat, player.stats[stat], oppAbbr, aid);
    }
  }

  input.addEventListener('keydown', e => {
    if (e.key === 'Enter') { e.preventDefault(); commit(); }
    if (e.key === 'Escape') { e.preventDefault(); cancelEdit(); }
  });
  input.addEventListener('blur', commit);
}

function renderBettingContent(data) {
  if (!data.players || !data.players.length) {
    const msg = data.message || 'No Kalshi bet data available for this game.';
    dom.bettingContent.innerHTML = `
      <div class="card card-animate">
        <p class="bet-empty-msg">${msg}</p>
        ${data.kalshiTotal != null ? `<p class="bet-empty-msg" style="margin-top:8px;font-size:0.8rem;">${data.kalshiTotal} open NBA markets fetched from Kalshi.</p>` : ''}
      </div>`;
    return;
  }

  // Save raw data — used for client-side re-scoring on line changes
  bettingState.players  = data.players;
  bettingState.teams    = data.teams || [];
  bettingState.overrides = {};
  bettingState.top5Keys = [];
  bettingState.parlaySort = { col: null, dir: null };
  // Accumulate into cross-game store (shared reference — mutations via applyLineOverride are reflected)
  if (data.gameId) {
    bettingState.allGames[data.gameId] = { players: data.players, teams: data.teams || [] };
  }

  const t = data.teams || [];
  const matchupHtml = t.length === 2 ? `
    <div class="bet-matchup-header">
      <span class="scouting-team">${t[0].teamName}</span>
      <span class="scouting-at">vs</span>
      <span class="scouting-team">${t[1].teamName}</span>
      ${data.kalshiTotal ? `<span class="scouting-cache-badge">${data.kalshiTotal} Kalshi markets</span>` : ''}
    </div>` : '';

  const playersHtml = data.players
    .map(player => renderBetPlayerCard(player, data.teams))
    .join('');

  dom.bettingContent.innerHTML = `
    <div class="card card-animate">
      ${matchupHtml}
      <div class="bet-players-grid">${playersHtml}</div>
      <div id="bet-parlay-section">${renderParlayHtml()}</div>
    </div>`;
}

const BET_STAT_LABELS = {
  points: 'Points', rebounds: 'Rebounds', assists: 'Assists',
  threes: '3-Pointers', steals: 'Steals', blocks: 'Blocks',
};

const BET_RATING_LABELS = { green: 'Good', blue: 'Lean Over', yellow: 'Caution', red: 'Fade' };

function renderBetPlayerCard(player, teams) {
  const opponentTeam = (teams || []).find(t => String(t.teamId) !== String(player.teamId));
  const opponentAbbr = opponentTeam ? opponentTeam.abbreviation : 'OPP';

  const summaryPills = Object.entries(player.summary)
    .filter(([, count]) => count > 0)
    .map(([rating, count]) =>
      `<span class="bet-summary-pill bet-pill-${rating}">${count} ${BET_RATING_LABELS[rating]}</span>`
    ).join('');

  const statsHtml = Object.keys(BET_STAT_LABELS)
    .map(stat => renderBetStatRow(stat, player.stats[stat], opponentAbbr, player.athleteId))
    .join('');

  const headshotSrc = player.headshot || '';

  return `
    <div class="bet-player-card" data-aid="${player.athleteId}">
      <div class="bet-player-header">
        ${headshotSrc ? `<img class="bet-player-avatar" src="${headshotSrc}" alt="${player.playerName}" onerror="this.style.display='none'" />` : ''}
        <div class="bet-player-identity">
          <div class="bet-player-name">${player.playerName}</div>
          <div class="bet-player-team">${player.teamName}${player.position ? ` &middot; ${player.position}` : ''}</div>
        </div>
        <div class="bet-summary">${summaryPills || '<span class="bet-no-markets-badge">No lines</span>'}</div>
      </div>
      <div class="bet-markets-list">${statsHtml}</div>
    </div>`;
}

function renderBetStatRow(stat, analysis, opponentAbbr, athleteId) {
  const label = BET_STAT_LABELS[stat] || stat;

  if (!analysis) {
    return `
      <div class="bet-market-item bet-no-market">
        <span class="bet-stat-name">${label}</span>
        <span class="bet-no-market-text">No market available</span>
      </div>`;
  }

  const currentLine = analysis.line;
  const defaultLine = analysis.defaultLine ?? currentLine;
  const candidates  = analysis.candidates || [];
  const isOverridden = currentLine !== defaultLine;

  // Determine if current line matches a real Kalshi market
  const matched  = candidates.find(c => c.line === currentLine);
  const isCustom = candidates.length > 0 && !matched;

  // Price badge: kalshi price if real market, Custom badge if not, nothing if no candidate data
  let badgeHtml = '';
  if (candidates.length === 0) {
    badgeHtml = analysis.yesPrice != null ? `<span class="bet-kalshi-price">${analysis.yesPrice}&cent; yes</span>` : '';
  } else if (isCustom) {
    badgeHtml = `<span class="bet-custom-badge">Custom</span>`;
  } else {
    const price = matched ? matched.yesPrice : analysis.yesPrice;
    badgeHtml = price != null ? `<span class="bet-kalshi-price">${price}&cent; yes</span>` : '';
  }

  const oiNote = analysis.openInterest > 0
    ? `<span class="bet-oi-note">${analysis.openInterest.toLocaleString()} OI</span>` : '';

  const resetHtml = isOverridden
    ? `<button class="bet-reset-btn" data-aid="${athleteId}" data-stat="${stat}" title="Reset to Kalshi default (${defaultLine}+)">&#8635; Reset</button>`
    : '';

  // Quick-select buttons for all real Kalshi thresholds (only when 2+ options exist)
  const quickBtnsHtml = candidates.length > 1 ? `
    <div class="bet-quick-btns">
      ${candidates.map(c =>
        `<button class="bet-quick-btn${c.line === currentLine ? ' active' : ''}" data-aid="${athleteId}" data-stat="${stat}" data-line="${c.line}">${c.line}+</button>`
      ).join('')}
    </div>` : '';

  const parlayNoteHtml = isCustom
    ? `<div class="bet-parlay-note-row"><span class="bet-parlay-exclude-note">Custom line — no Kalshi market for parlay</span></div>`
    : '';

  return `
    <div class="bet-market-item" data-aid="${athleteId}" data-stat="${stat}">
      <div class="bet-market-header">
        <span class="bet-stat-name">${label}</span>
        <span class="bet-line-pill bet-line-editable" data-aid="${athleteId}" data-stat="${stat}" title="Click to edit line">O ${currentLine}</span>
        ${badgeHtml}
        <span class="bet-rating-badge bet-rating-${analysis.rating}">${analysis.rating.toUpperCase()}</span>
        <span class="bet-over-pct">${analysis.overRate}% over last ${analysis.gamesAnalyzed}</span>
        ${oiNote}
        ${resetHtml}
      </div>
      ${quickBtnsHtml}
      ${parlayNoteHtml}
      <div class="bet-context-row">
        ${renderContextChip('Season Avg', analysis.seasonAvg)}
        ${renderContextChip('Last 5', analysis.last5Avg)}
        ${renderContextChip('Playoff Avg', analysis.playoffAvg)}
        ${renderContextChip(`vs ${opponentAbbr}`, analysis.vsAvg, analysis.vsGames)}
      </div>
    </div>`;
}

function renderContextChip(label, value, gamesCount) {
  let display;
  if (value != null) {
    display = value;
  } else if (gamesCount === 0) {
    display = 'No games';
  } else {
    display = 'N/A';
  }
  const note = gamesCount != null && gamesCount > 0 ? `<span class="bet-context-note">${gamesCount}g</span>` : '';
  return `
    <div class="bet-context-chip">
      <span class="bet-context-label">${label}</span>
      <span class="bet-context-value">${display}${note}</span>
    </div>`;
}

function handleTabClick(event) {
  const tabName = event.target.dataset.tab;
  if (!tabName) return;
  setActiveTab(tabName);
}

async function init() {
  createModal();
  dom.tabs.forEach(tab => tab.addEventListener('click', handleTabClick));
  dom.gamesList.addEventListener('click', e => {
    const card = e.target.closest('.clickable-player');
    if (!card) return;
    openPlayerModal(card.dataset.playerId, card.dataset.playerName);
  });
  dom.teamSelect.addEventListener('change', e => showTeamStats(e.target.value));
  dom.teamInfo.addEventListener('click', e => {
    const card = e.target.closest('.clickable-player');
    if (!card) return;
    openPlayerModal(card.dataset.playerId, card.dataset.playerName);
  });
  dom.playerSelect.addEventListener('change', async () => {
    const selectedId = dom.playerSelect.value;
    if (!selectedId) return;
    dom.playerInput.value = '';
    dom.playerInfo.innerHTML = '<p class="loader">Loading player stats...</p>';
    try {
      const data = await fetchJson(`${apiBase}/players/${encodeURIComponent(selectedId)}/stats`);
      renderPlayerStats(data);
    } catch (error) {
      dom.playerInfo.innerHTML = `<p>Error loading player stats: ${error.message}</p>`;
    }
  });
  dom.playerSearch.addEventListener('click', async () => {
    const query = dom.playerInput.value.trim();
    if (!query) return;
    dom.playerSelect.value = '';
    dom.playerInfo.innerHTML = '<p class="loader">Loading player stats...</p>';
    try {
      const data = await fetchJson(`${apiBase}/players/${encodeURIComponent(query)}/stats`);
      renderPlayerStats(data);
    } catch (error) {
      dom.playerInfo.innerHTML = `<p>Error loading player stats: ${error.message}</p>`;
    }
  });
  dom.playerSeason.addEventListener('change', renderSelectedSeason);
  dom.scoutingFetchBtn.addEventListener('click', fetchScoutingReport);
  dom.scoutingGameSelect.addEventListener('change', () => {
    dom.scoutingContent.innerHTML = '';
    dom.scoutingError.classList.add('hidden');
  });
  dom.bettingFetchBtn.addEventListener('click', fetchBettingAnalysis);
  dom.bettingGameSelect.addEventListener('change', () => {
    dom.bettingContent.innerHTML = '';
    dom.bettingError.classList.add('hidden');
  });
  dom.bettingContent.addEventListener('click', e => {
    const sortTh = e.target.closest('[data-parlay-sort]');
    if (sortTh) {
      const col = sortTh.dataset.parlaySort;
      const s = bettingState.parlaySort;
      if (s.col === col) {
        bettingState.parlaySort = s.dir === 'asc'
          ? { col, dir: 'desc' }
          : { col: null, dir: null };
      } else {
        bettingState.parlaySort = { col, dir: 'asc' };
      }
      const parlaySection = document.getElementById('bet-parlay-section');
      if (parlaySection) parlaySection.innerHTML = renderParlayHtml(false);
      return;
    }
    // Quick-select threshold button
    const quickBtn = e.target.closest('.bet-quick-btn');
    if (quickBtn) {
      const { aid, stat, line } = quickBtn.dataset;
      applyLineOverride(aid, stat, parseInt(line, 10));
      return;
    }
    // Reset to Kalshi default link
    const resetBtn = e.target.closest('.bet-reset-btn');
    if (resetBtn) {
      const { aid, stat } = resetBtn.dataset;
      const player = bettingState.players.find(p => String(p.athleteId) === String(aid));
      if (player && player.stats[stat]) {
        const defaultLine = player.stats[stat].defaultLine ?? player.stats[stat].line;
        applyLineOverride(aid, stat, defaultLine);
      }
      return;
    }
    // Editable line pill — skip if already contains an input
    const pill = e.target.closest('.bet-line-editable');
    if (pill && !pill.querySelector('.bet-line-input')) {
      activateLineEdit(pill);
      return;
    }
  });
  await Promise.all([loadGames(), loadTeams(), loadPlayers(), loadNews(), loadScoutingGames(), loadBettingGames()]);
}

window.addEventListener('DOMContentLoaded', init);
