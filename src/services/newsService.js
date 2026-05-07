const axios = require('axios');
const cheerio = require('cheerio');

class NewsService {
  constructor() {
    this.client = axios.create({
      timeout: 8000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'application/json, text/html, application/xml, */*'
      }
    });
    this.newsCache = { breaking: [], general: [], timestamp: 0 };
    this.CACHE_TTL = 5 * 60 * 1000;
  }

  async getNews() {
    if (Date.now() - this.newsCache.timestamp < this.CACHE_TTL) {
      return { breaking: this.newsCache.breaking, general: this.newsCache.general, cached: true };
    }

    const [espnResult, cbsResult] = await Promise.allSettled([
      this.fetchESPNNews(),
      this.fetchCBSSportsNews()
    ]);

    const all = [
      ...(espnResult.status === 'fulfilled' ? espnResult.value : []),
      ...(cbsResult.status === 'fulfilled' ? cbsResult.value : [])
    ];

    if (!all.length) {
      return { breaking: this.newsCache.breaking || [], general: this.newsCache.general || [], cached: true };
    }

    const sorted = this.removeDuplicates(all)
      .sort((a, b) => new Date(b.publishTime) - new Date(a.publishTime));

    const breaking = sorted.slice(0, 15);
    const general = sorted.slice(0, 10);

    this.newsCache = { breaking, general, timestamp: Date.now() };
    return { breaking, general, cached: false };
  }

  async fetchESPNNews() {
    const response = await this.client.get(
      'https://site.api.espn.com/apis/site/v2/sports/basketball/nba/news',
      { params: { limit: 20 } }
    );
    return (response.data.articles || [])
      .filter(a => a.headline && a.links?.web?.href && a.headline !== a.description)
      .map(a => ({
        title: a.headline.trim(),
        snippet: (a.description || '').trim().substring(0, 200),
        url: a.links.web.href,
        source: 'ESPN',
        publishTime: new Date(a.published || Date.now())
      }));
  }

  async fetchCBSSportsNews() {
    const response = await this.client.get('https://www.cbssports.com/rss/headlines/nba/', {
      responseType: 'text'
    });
    const $ = cheerio.load(response.data, { xmlMode: true });
    const articles = [];
    $('item').each((i, el) => {
      if (articles.length >= 12) return;
      const title = $(el).find('title').text().trim();
      const url = $(el).find('link').text().trim();
      const pubDate = $(el).find('pubDate').text().trim();
      const snippet = $(el).find('description').text().replace(/<[^>]+>/g, '').trim();
      if (title && url) {
        articles.push({
          title,
          snippet: snippet.substring(0, 200),
          url,
          source: 'CBS Sports',
          publishTime: pubDate ? new Date(pubDate) : new Date()
        });
      }
    });
    return articles;
  }

  removeDuplicates(articles) {
    const seen = new Set();
    return articles.filter(article => {
      const key = article.title.toLowerCase().replace(/\s+/g, ' ').substring(0, 60);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }
}

module.exports = new NewsService();
