const nbaService = require('../services/nbaService');

exports.getLiveGames = async (req, res) => {
  try {
    const { date } = req.query;
    const games = await nbaService.getLiveGames(date);
    res.json({ 
      count: games.length,
      games 
    });
  } catch (error) {
    console.error('Controller error:', error);
    res.status(500).json({ error: error.message });
  }
};

exports.getScores = async (req, res) => {
  try {
    const { date, includeLeaders } = req.query;
    const scores = await nbaService.getScores(date, includeLeaders === '1' || includeLeaders === 'true');
    res.json({ 
      count: scores.length,
      scores 
    });
  } catch (error) {
    console.error('Controller error:', error);
    res.status(500).json({ error: error.message });
  }
};

exports.getGamePlayers = async (req, res) => {
  try {
    const { gameId } = req.params;
    const boxscore = await nbaService.getGameBoxscore(gameId);
    res.json(boxscore);
  } catch (error) {
    console.error('Controller error:', error);
    res.status(500).json({ error: error.message });
  }
};

exports.getUpcomingGames = async (req, res) => {
  try {
    const days = Math.min(parseInt(req.query.days) || 7, 14);
    const games = await nbaService.getUpcomingGames(days);
    res.json({ count: games.length, games });
  } catch (error) {
    console.error('Controller error:', error);
    res.status(500).json({ error: error.message });
  }
};

exports.getScoutingReport = async (req, res) => {
  try {
    const { gameId } = req.params;
    const report = await nbaService.getScoutingReport(gameId);
    res.json(report);
  } catch (error) {
    console.error('Controller error:', error);
    res.status(500).json({ error: error.message });
  }
};

exports.getGameDetails = async (req, res) => {
  try {
    const { gameId } = req.params;
    const boxscore = await nbaService.getGameBoxscore(gameId);
    res.json({ gameId, details: boxscore });
  } catch (error) {
    console.error('Controller error:', error);
    res.status(500).json({ error: error.message });
  }
};
