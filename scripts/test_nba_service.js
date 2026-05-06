const nbaService = require('../src/services/nbaService');

(async () => {
  try {
    const stats = await nbaService.getPlayerStats('201939');
    console.log('playerId', stats.playerId);
    console.log('info resultSets', Array.isArray(stats.playerInfo?.resultSets));
    console.log('careerStats resultSets', Array.isArray(stats.careerStats?.resultSets));
    console.log('careerStats length', stats.careerStats?.resultSets?.[0]?.rowSet?.length);
  } catch (err) {
    console.error('ERROR', err.message);
  }
})();
