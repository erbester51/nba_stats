export const espnAbbrMap = { GSW: 'GS', NYK: 'NY', NOP: 'NO', SAS: 'SA', UTA: 'UTAH', WAS: 'WSH' };

export function getTeamLogoByAbbreviation(abbr, teamLogos) {
  if (!abbr || !teamLogos) return null;
  return teamLogos[abbr] || teamLogos[espnAbbrMap[abbr]] || null;
}

export function parseMatchupAbbreviations(matchup) {
  if (!matchup) return { playerTeamAbbr: null, opponentAbbr: null };
  const tokens = matchup.trim().split(' ');
  if (tokens.length >= 3) {
    return { playerTeamAbbr: tokens[0], opponentAbbr: tokens[tokens.length - 1] };
  }
  return { playerTeamAbbr: null, opponentAbbr: null };
}

export function getClockDisplay(game) {
  if (game.statusState === 'pre') return { text: 'Not Yet Started', live: false };
  if (game.statusState === 'post') return null;
  const detail = (game.statusDetail || '').toLowerCase();
  if (detail.includes('halftime')) return { text: 'Halftime', live: false };
  const quarter = game.period > 4 ? `OT${game.period - 4}` : game.period ? `Q${game.period}` : '';
  const clock = game.displayClock || '';
  const text = [quarter, clock].filter(Boolean).join(' ');
  return { text, live: true };
}

export function getPlayerStat(player, key) {
  const stat = (player.statistics || []).find(item => item.key === key || item.label === key);
  return stat ? stat.displayValue : '-';
}

export function parseNumericStat(value) {
  if (value == null) return -1;
  const numeric = String(value).match(/\d+(?:\.\d+)?/);
  return numeric ? Number(numeric[0]) : -1;
}

export function getLastGameTopStat(player) {
  const metrics = ['PTS', 'REB', 'AST'];
  const best = metrics.reduce((current, key) => {
    const value = parseNumericStat(getPlayerStat(player, key));
    return value > current.value ? { key, value } : current;
  }, { key: null, value: -1 });
  return best.key ? best : null;
}

export async function fetchJson(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`API request failed: ${res.status}`);
  return res.json();
}

export function animateStatValues(container) {
  if (!container) return;
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
