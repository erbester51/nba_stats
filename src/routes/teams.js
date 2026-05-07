const express = require('express');
const router = express.Router();
const teamsController = require('../controllers/teamsController');

// Get all teams
router.get('/', teamsController.getAllTeams);

// Get standings
router.get('/standings', teamsController.getStandings);

// Get team stats
router.get('/:teamId/stats', teamsController.getTeamStats);

// Get team season leaders
router.get('/:teamId/leaders', teamsController.getTeamSeasonLeaders);

module.exports = router;
