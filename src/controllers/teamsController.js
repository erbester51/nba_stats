const nbaService = require('../services/nbaService');

exports.getAllTeams = async (req, res) => {
  try {
    const teams = await nbaService.getAllTeams();
    res.json({ 
      count: teams.length,
      teams 
    });
  } catch (error) {
    console.error('Controller error:', error);
    res.status(500).json({ error: error.message });
  }
};

exports.getTeamStats = async (req, res) => {
  try {
    const { teamId } = req.params;
    const stats = await nbaService.getTeamStats(teamId);
    res.json(stats);
  } catch (error) {
    console.error('Controller error:', error);
    res.status(500).json({ error: error.message });
  }
};

exports.getTeamSeasonLeaders = async (req, res) => {
  try {
    const { teamId } = req.params;
    const leaders = await nbaService.getTeamSeasonLeaders(teamId);
    res.json(leaders);
  } catch (error) {
    console.error('Controller error:', error);
    res.status(500).json({ error: error.message });
  }
};

exports.getStandings = async (req, res) => {
  try {
    const standings = await nbaService.getStandings();
    res.json({ standings });
  } catch (error) {
    console.error('Controller error:', error);
    res.status(500).json({ error: error.message });
  }
};
