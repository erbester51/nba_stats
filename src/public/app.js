const apiBase = '/api';

const dom = {
  tabs: document.querySelectorAll('.tab-button'),
  panels: document.querySelectorAll('.tab-panel'),
  gamesList: document.getElementById('games-list'),
  gamesLoading: document.getElementById('games-loading'),
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
  seasonSelect: document.getElementById('season-select'),
  seasonSummary: document.getElementById('season-summary')
};

const state = {
  teams: [],
  teamLogos: {},
  lastPlayerStats: null,
  seasons: []
};

function setActiveTab(tabName) {
  dom.tabs.forEach(button => {
    button.classList.toggle('active', button.dataset.tab === tabName);
  });
  dom.panels.forEach(panel => {
    panel.classList.toggle('active', panel.id === tabName);
  });
}

async function fetchJson(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`API request failed: ${res.status}`);
  return res.json();
}

function getTeamLogoByAbbreviation(abbr) {
  return state.teamLogos[abbr] || null;
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

function formatGameCard(game) {
  return `
    <div class="card game-card">
      <h3>${game.awayTeam} @ ${game.homeTeam}</h3>
      <p>Status: ${game.status}</p>
      <p>${game.date ? new Date(game.date).toLocaleString() : ''}</p>
      <p>Venue: ${game.venue || 'TBD'}</p>
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
      <div class="leaders-row">
        <div class="leader-team">
          <h4>${game.awayTeam} Season Leaders</h4>
          ${renderTeamLeaderSection(game.awayLeaders)}
        </div>
        <div class="leader-team">
          <h4>${game.homeTeam} Season Leaders</h4>
          ${renderTeamLeaderSection(game.homeLeaders)}
        </div>
      </div>
    </div>
  `;
}

function renderTeamLeaderSection(leaders) {
  if (!leaders) {
    return '<p class="loader">Loading team leaders...</p>';
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
    <div class="leader-item">
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

  try {
    const data = await fetchJson(`${apiBase}/games/scores?includeLeaders=1`);
    dom.gamesLoading.classList.add('hidden');
    if (!data.scores || data.scores.length === 0) {
      dom.gamesList.innerHTML = '<div class="card"><p>No games found for today.</p></div>';
      return;
    }

    dom.gamesList.innerHTML = data.scores.map(formatGameCard).join('');

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

async function showTeamStats(teamId) {
  if (!teamId) {
    dom.teamInfo.innerHTML = '<p>Select a team to see stats.</p>';
    return;
  }

  try {
    dom.teamInfo.innerHTML = '<p class="loader">Loading team stats...</p>';
    const stats = await fetchJson(`${apiBase}/teams/${teamId}/stats`);
    const overall = stats.record?.items?.find(item => item.type === 'total') || {};
    const home = stats.record?.items?.find(item => item.type === 'home') || {};
    const away = stats.record?.items?.find(item => item.type === 'road') || {};
    dom.teamInfo.innerHTML = `
      <div class="team-card">
        <h3>${stats.displayName || stats.teamName || 'Team'}</h3>
        <p>Abbreviation: ${stats.abbreviation || 'N/A'}</p>
        <p>Location: ${stats.location || 'N/A'}</p>
        <p>Overall: ${overall.summary || 'N/A'}</p>
        <p>Home: ${home.summary || 'N/A'}</p>
        <p>Away: ${away.summary || 'N/A'}</p>
      </div>
    `;
  } catch (error) {
    dom.teamInfo.innerHTML = `<p>Error loading team stats: ${error.message}</p>`;
  }
}

function renderPlayerStats(data) {
  if (data.error) {
    dom.playerInfo.innerHTML = `<div class="card"><p>${data.error}</p></div>`;
    dom.playerSeasonSelect.classList.add('hidden');
    dom.playerSeasonStats.innerHTML = '';
    dom.playerGameLog.innerHTML = '';
    return;
  }

  const playerName = data.playerInfo?.resultSets?.[0]?.rowSet?.[0]?.[3] || data.playerInfo?.resultSets?.[0]?.rowSet?.[0]?.[1] || 'Player';
  const currentSeason = data.seasonStats?.currentSeason;
  const seasons = [currentSeason, ...(data.seasonStats?.last4Seasons || [])].filter(Boolean);

  dom.playerInfo.innerHTML = `
    <div class="player-card">
      <h3>${playerName}</h3>
      <p>Player ID: ${data.playerId}</p>
      <p>Current season: ${currentSeason?.SEASON_ID || 'N/A'}</p>
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
  state.lastPlayerStats = { data, seasons };
  renderSelectedSeason();
  loadPlayerGameLog(data.playerId);
}

function renderSelectedSeason() {
  const selectedSeason = dom.playerSeason.value;
  const seasonStats = state.lastPlayerStats?.seasons?.find(s => s.SEASON_ID === selectedSeason);
  if (!seasonStats) {
    dom.playerSeasonStats.innerHTML = '<p>Select a season to view stats.</p>';
    return;
  }

  dom.playerSeasonStats.innerHTML = `
    <div class="player-card">
      <h3>${seasonStats.SEASON_ID}</h3>
      <p>Team: ${seasonStats.TEAM_ABBREVIATION || 'N/A'}</p>
      <p>Games played: ${seasonStats.GP || 'N/A'}</p>
      <p>Points per game: ${seasonStats.PTS || 'N/A'}</p>
      <p>Assists per game: ${seasonStats.AST || 'N/A'}</p>
      <p>Rebounds per game: ${seasonStats.REB || 'N/A'}</p>
    </div>
  `;
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

function renderGameLog(data) {
  if (data.error || !data.games || data.games.length === 0) {
    dom.playerGameLog.innerHTML = '<p>No game logs available.</p>';
    return;
  }

  const games = data.games || [];
  if (games.length === 0) {
    dom.playerGameLog.innerHTML = '<p>No games found.</p>';
    return;
  }

  const headers = ['DATE', 'OPP', 'RESULT', 'MIN', 'FG', 'FG%', '3PT', '3P%', 'FT', 'FT%', 'REB', 'AST', 'BLK', 'STL', 'PF', 'TO', 'PTS'];

  let html = '<h4>Game Log</h4><table class="game-log-table"><thead><tr>';
  headers.forEach(h => html += `<th>${h}</th>`);
  html += '</tr></thead><tbody>';

  games.forEach(game => {
    const date = game.GAME_DATE ? new Date(game.GAME_DATE).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '-';
    const matchup = game.MATCHUP || '-';
    const { playerTeamAbbr, opponentAbbr } = parseMatchupAbbreviations(matchup);
    const playerLogo = getTeamLogoByAbbreviation(playerTeamAbbr);
    const oppLogo = getTeamLogoByAbbreviation(opponentAbbr);
    const result = game.WL || '-';
    const resultLabel = game.SEASON_TYPE === 'Playoffs' ? `${result} <span class="game-type">PO</span>` : result;
    const oppDisplay = matchup;
    const stats = {
      'DATE': date,
      'OPP': `<div class="opp-cell">${playerLogo ? `<img class="opp-logo" src="${playerLogo}" alt="${playerTeamAbbr || 'Team'}" />` : ''}${oppLogo ? `<img class="opp-logo" src="${oppLogo}" alt="${opponentAbbr || 'opp'}" />` : ''}<span>${oppDisplay}</span></div>`,
      'RESULT': resultLabel,
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
    html += '<tr>';
    headers.forEach(h => html += `<td>${stats[h] || '-'}</td>`);
    html += '</tr>';
  });

  html += '</tbody></table>';
  dom.playerGameLog.innerHTML = html;
}

function populateSeasonDropdown() {
  const now = new Date();
  const year = now.getFullYear();
  const labelYears = [`${year - 1}-${String(year).slice(-2)}`, `${year - 2}-${String(year - 1).slice(-2)}`, `${year - 3}-${String(year - 2).slice(-2)}`, `${year - 4}-${String(year - 3).slice(-2)}`];
  state.seasons = labelYears;
  dom.seasonSelect.innerHTML = labelYears.map(yearLabel => `<option value="${yearLabel}">${yearLabel}</option>`).join('');
  dom.seasonSummary.innerHTML = `<p>Selected season: ${dom.seasonSelect.value}. Use the Player tab to view historical season stats for an individual player.</p>`;
}

function handleTabClick(event) {
  const tabName = event.target.dataset.tab;
  if (!tabName) return;
  setActiveTab(tabName);
}

async function init() {
  dom.tabs.forEach(tab => tab.addEventListener('click', handleTabClick));
  dom.teamSelect.addEventListener('change', e => showTeamStats(e.target.value));
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
  dom.seasonSelect.addEventListener('change', () => {
    dom.seasonSummary.innerHTML = `<p>Selected season: ${dom.seasonSelect.value}. Use the Player tab to see detailed season stats for a player.</p>`;
  });

  await Promise.all([loadGames(), loadTeams(), loadPlayers()]);
  populateSeasonDropdown();
}

window.addEventListener('DOMContentLoaded', init);
