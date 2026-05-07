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
  seasonSelect: document.getElementById('season-select'),
  seasonSummary: document.getElementById('season-summary')
};

const state = {
  teams: [],
  teamLogos: {},
  lastPlayerStats: null,
  seasons: []
};

let liveRefreshTimeout = null;

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
    const [stats, leadersData] = await Promise.all([
      fetchJson(`${apiBase}/teams/${teamId}/stats`),
      fetchJson(`${apiBase}/teams/${teamId}/leaders`).catch(() => null)
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

    if (data.breaking && data.breaking.length > 0) {
      renderBreakingNews(data.breaking);
    } else {
      dom.breakingCarousel.innerHTML = '<p>No breaking news available.</p>';
    }

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

function renderBreakingNews(articles) {
  let html = '';

  articles.forEach((article, index) => {
    const date = new Date(article.publishTime).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });

    html += `
      <div class="news-card breaking-news-card">
        <div class="breaking-badge">BREAKING</div>
        <div class="news-card-content">
          <h3>${article.title}</h3>
          <p>${article.snippet}</p>
          <div class="news-card-footer">
            <span class="news-source">${article.source}</span>
            <span class="news-date">${date}</span>
          </div>
          <a href="${article.url}" target="_blank" class="news-link">Read More →</a>
        </div>
      </div>
    `;
  });

  dom.breakingCarousel.innerHTML = html ? `<div class="carousel-container">${html}</div>` : '<p>No breaking news.</p>';
  startCarousel();
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

let carouselIndex = 0;
let carouselInterval = null;

function startCarousel() {
  const cards = dom.breakingCarousel.querySelectorAll('.breaking-news-card');
  if (cards.length === 0) return;

  if (cards.length === 1) {
    cards[0].classList.add('active');
    return;
  }

  const dotsEl = document.createElement('div');
  dotsEl.className = 'carousel-dots';
  cards.forEach((_, i) => {
    const dot = document.createElement('button');
    dot.className = 'carousel-dot' + (i === 0 ? ' active' : '');
    dot.addEventListener('click', () => goToSlide(i));
    dotsEl.appendChild(dot);
  });
  dom.breakingCarousel.appendChild(dotsEl);

  function goToSlide(index) {
    carouselIndex = index;
    cards.forEach((card, i) => card.classList.toggle('active', i === index));
    dotsEl.querySelectorAll('.carousel-dot').forEach((dot, i) => {
      dot.classList.toggle('active', i === index);
    });
  }

  goToSlide(0);
  clearInterval(carouselInterval);
  carouselInterval = setInterval(() => goToSlide((carouselIndex + 1) % cards.length), 5000);
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
  dom.seasonSelect.addEventListener('change', () => {
    dom.seasonSummary.innerHTML = `<p>Selected season: ${dom.seasonSelect.value}. Use the Player tab to see detailed season stats for a player.</p>`;
  });

  await Promise.all([loadGames(), loadTeams(), loadPlayers(), loadNews()]);
  populateSeasonDropdown();
}

window.addEventListener('DOMContentLoaded', init);
