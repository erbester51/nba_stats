const axios = require('axios');

(async () => {
  try {
    const url = 'https://site.api.espn.com/apis/site/v2/sports/basketball/nba/summary?event=401871159';
    const res = await axios.get(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
    console.log('keys', Object.keys(res.data));
    console.log('competitions keys', res.data.competitions ? Object.keys(res.data.competitions[0] || {}) : 'none');
    const boxscore = res.data.boxscore;
    console.log('boxscore keys', boxscore ? Object.keys(boxscore) : 'none');
    if (boxscore && boxscore.teams) {
      console.log('team length', boxscore.teams.length);
      console.log('team 0 keys', Object.keys(boxscore.teams[0]));
      console.log('first athlete sample', JSON.stringify(boxscore.teams[0].players[0], null, 2).slice(0,500));
    }
  } catch (err) {
    console.error('err', err.message);
    if (err.response) {
      console.error('status', err.response.status);
      console.error(JSON.stringify(err.response.data).slice(0, 500));
    }
  }
})();
