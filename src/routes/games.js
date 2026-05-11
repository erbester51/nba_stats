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

// Progressive bet analysis: fast setup (roster + Kalshi, no game logs)
router.get('/:gameId/betting/setup', bettingController.getGameSetup);
// Per-player stats (game logs + scoring for one player, with retry logic)
router.get('/:gameId/betting/player/:athleteId', bettingController.getPlayerBetStats);
// Legacy single-shot analysis (kept for backward compat)
router.get('/:gameId/betting', bettingController.getBettingAnalysis);

// Get game details by game ID
router.get('/:gameId', gamesController.getGameDetails);

module.exports = router;
