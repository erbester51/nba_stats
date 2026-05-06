const express = require('express');
const router = express.Router();
const playersController = require('../controllers/playersController');

// Get current player list / search by name
router.get('/list', playersController.getPlayerList);

// Get player stats
router.get('/:playerId/stats', playersController.getPlayerStats);

// Get player game logs
router.get('/:playerId/gamelogs', playersController.getPlayerGameLogs);

module.exports = router;
