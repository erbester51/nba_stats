const nbaService = require('../services/nbaService');

exports.getPlayerList = async (req, res) => {
  try {
    const players = await nbaService.getCurrentPlayers();
    const term = req.query.term?.trim().toLowerCase();
    const filtered = term
      ? players.filter(player => player.displayName.toLowerCase().includes(term) || player.fullName.toLowerCase().includes(term))
      : players;
    res.json({ count: filtered.length, players: filtered });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

exports.getPlayerStats = async (req, res) => {
  try {
    const { playerId } = req.params;
    const stats = await nbaService.getPlayerStats(playerId);
    res.json(stats);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

exports.getPlayerGameLogs = async (req, res) => {
  try {
    const { playerId } = req.params;
    const season = req.query.season || '2025-26';
    const gameLogs = await nbaService.getPlayerGameLogs(playerId, season);
    res.json(gameLogs);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};
