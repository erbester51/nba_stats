const express = require('express');
const router = express.Router();
const gamesController = require('../controllers/gamesController');
const bettingController = require('../controllers/bettingController');

// Get live games for today or specific date
router.get('/', gamesController.getLiveGames);

// Get scores for today or specific date
router.get('/scores', gamesController.getScores);

// Get upcoming games for next N days
router.get('/upcoming', gamesController.getUpcomingGames);

// Get player stats for a specific game
router.get('/:gameId/players', gamesController.getGamePlayers);

// Get scouting report for a specific game
router.get('/:gameId/scouting', gamesController.getScoutingReport);

// Get Kalshi bet analysis for a specific game
router.get('/:gameId/betting', bettingController.getBettingAnalysis);

// Get game details by game ID
router.get('/:gameId', gamesController.getGameDetails);

module.exports = router;
