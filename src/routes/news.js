const express = require('express');
const router = express.Router();
const newsController = require('../controllers/newsController');

// Get all news (breaking + general)
router.get('/', newsController.getNews);

// Get breaking news only
router.get('/breaking', newsController.getBreakingNews);

// Get general news only
router.get('/general', newsController.getGeneralNews);

module.exports = router;
