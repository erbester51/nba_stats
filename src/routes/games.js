const express = require('express');
const router = express.Router();
const gamesController = require('../controllers/gamesController');

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

// Get game details by game ID
router.get('/:gameId', gamesController.getGameDetails);

module.exports = router;
