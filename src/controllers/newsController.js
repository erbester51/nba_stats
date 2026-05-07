const newsService = require('../services/newsService');

exports.getNews = async (req, res) => {
  try {
    const news = await newsService.getNews();
    res.json(news);
  } catch (error) {
    console.error('Controller error:', error);
    res.status(500).json({ error: error.message });
  }
};

exports.getBreakingNews = async (req, res) => {
  try {
    const news = await newsService.getNews();
    res.json({
      breaking: news.breaking,
      count: news.breaking.length,
      cached: news.cached
    });
  } catch (error) {
    console.error('Controller error:', error);
    res.status(500).json({ error: error.message });
  }
};

exports.getGeneralNews = async (req, res) => {
  try {
    const news = await newsService.getNews();
    res.json({
      general: news.general,
      count: news.general.length,
      cached: news.cached
    });
  } catch (error) {
    console.error('Controller error:', error);
    res.status(500).json({ error: error.message });
  }
};
