const axios = require('axios');
const cheerio = require('cheerio');

class NewsService {
  constructor() {
    this.client = axios.create({
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'application/json, text/plain, */*',
        'Referer': 'https://www.nba.com',
        'Origin': 'https://www.nba.com'
      }
    });

    this.newsCache = {
      breaking: [],
      general: [],
      timestamp: 0
    };
    this.CACHE_TTL = 5 * 60 * 1000; // 5 minutes
    this.BREAKING_AGE_THRESHOLD = 2 * 60 * 60 * 1000; // 2 hours
  }

  /**
   * Get breaking news and general news
   */
  async getNews() {
    // Check cache freshness
    if (Date.now() - this.newsCache.timestamp < this.CACHE_TTL) {
      return {
        breaking: this.newsCache.breaking,
        general: this.newsCache.general,
        cached: true
      };
    }

    try {
      const [breakingNews, generalNews] = await Promise.all([
        this.fetchBreakingNews(),
        this.fetchGeneralNews()
      ]);

      this.newsCache = {
        breaking: breakingNews,
        general: generalNews,
        timestamp: Date.now()
      };

      return {
        breaking: breakingNews,
        general: generalNews,
        cached: false
      };
    } catch (error) {
      console.error('Error fetching news:', error.message);
      // Return cached data if available, otherwise empty
      return {
        breaking: this.newsCache.breaking || [],
        general: this.newsCache.general || [],
        error: error.message,
        cached: true
      };
    }
  }

  /**
   * Fetch breaking news (recent, high-impact stories)
   */
  async fetchBreakingNews() {
    const articles = [];

    try {
      // Try ESPN first for breaking news
      const espnArticles = await this.scrapeESPNNews();
      articles.push(...espnArticles);
    } catch (error) {
      console.warn('Failed to fetch ESPN news:', error.message);
    }

    try {
      // Try NBA.com
      const nbaArticles = await this.scrapeNBANews();
      articles.push(...nbaArticles);
    } catch (error) {
      console.warn('Failed to fetch NBA.com news:', error.message);
    }

    // Filter for breaking news (last 2 hours) and sort by date
    const now = Date.now();
    const breaking = articles
      .filter(article => {
        const age = now - new Date(article.publishTime).getTime();
        return age < this.BREAKING_AGE_THRESHOLD;
      })
      .sort((a, b) => new Date(b.publishTime) - new Date(a.publishTime))
      .slice(0, 3);

    return breaking;
  }

  /**
   * Fetch general NBA news
   */
  async fetchGeneralNews() {
    const articles = [];

    try {
      const espnArticles = await this.scrapeESPNNews();
      articles.push(...espnArticles);
    } catch (error) {
      console.warn('Failed to fetch ESPN news:', error.message);
    }

    try {
      const nbaArticles = await this.scrapeNBANews();
      articles.push(...nbaArticles);
    } catch (error) {
      console.warn('Failed to fetch NBA.com news:', error.message);
    }

    try {
      const brArticles = await this.scrapeBleacherReportNews();
      articles.push(...brArticles);
    } catch (error) {
      console.warn('Failed to fetch Bleacher Report news:', error.message);
    }

    // Remove duplicates and return top 10
    const uniqueArticles = this.removeDuplicates(articles);
    return uniqueArticles
      .sort((a, b) => new Date(b.publishTime) - new Date(a.publishTime))
      .slice(0, 10);
  }

  /**
   * Scrape ESPN NBA news
   */
  async scrapeESPNNews() {
    try {
      const response = await this.client.get('https://www.espn.com/nba/');
      const $ = cheerio.load(response.data);
      const articles = [];

      // Look for news articles
      $('article').each((index, element) => {
        if (articles.length >= 8) return;

        const titleEl = $(element).find('h2, h3, a[data-testid*="internal-link"]');
        const title = titleEl.text().trim();
        const url = titleEl.attr('href') || '';
        const snippet = $(element).find('p').first().text().trim();
        const timeEl = $(element).find('span[data-testid="timestamp"]');
        const timeText = timeEl.text().trim();

        if (title && url && title.toLowerCase().includes('nba')) {
          articles.push({
            title,
            snippet: snippet.substring(0, 150),
            url: this.normalizeURL(url, 'espn.com'),
            source: 'ESPN',
            publishTime: this.parseTime(timeText) || new Date(),
            sourceIcon: 'https://a.espncdn.com/media/motion/2015/0722/espn_logo.png'
          });
        }
      });

      return articles;
    } catch (error) {
      console.error('ESPN scrape error:', error.message);
      return [];
    }
  }

  /**
   * Scrape NBA.com news
   */
  async scrapeNBANews() {
    try {
      const response = await this.client.get('https://www.nba.com/news');
      const $ = cheerio.load(response.data);
      const articles = [];

      // Look for news cards
      $('[data-testid="news-card"], .NewsCard, article').each((index, element) => {
        if (articles.length >= 8) return;

        const titleEl = $(element).find('h2, h3, a').first();
        const title = titleEl.text().trim();
        const url = titleEl.attr('href') || '';
        const snippet = $(element).find('p').first().text().trim();

        if (title && url) {
          articles.push({
            title,
            snippet: snippet.substring(0, 150),
            url: this.normalizeURL(url, 'nba.com'),
            source: 'NBA.com',
            publishTime: new Date(),
            sourceIcon: 'https://www.nba.com/resources/static/team/v2/nba/favicons/apple-icon-120x120.png'
          });
        }
      });

      return articles;
    } catch (error) {
      console.error('NBA.com scrape error:', error.message);
      return [];
    }
  }

  /**
   * Scrape Bleacher Report news
   */
  async scrapeBleacherReportNews() {
    try {
      const response = await this.client.get('https://bleacherreport.com/nba');
      const $ = cheerio.load(response.data);
      const articles = [];

      // Look for article cards
      $('[data-testid="article-card"], .ArticleCard, article').each((index, element) => {
        if (articles.length >= 8) return;

        const titleEl = $(element).find('h2, h3, a').first();
        const title = titleEl.text().trim();
        const url = titleEl.attr('href') || '';
        const snippet = $(element).find('p').first().text().trim();

        if (title && url) {
          articles.push({
            title,
            snippet: snippet.substring(0, 150),
            url: this.normalizeURL(url, 'bleacherreport.com'),
            source: 'Bleacher Report',
            publishTime: new Date(),
            sourceIcon: 'https://media.bleacherreport.com/image/upload/v1675009055/assets/br-logo.png'
          });
        }
      });

      return articles;
    } catch (error) {
      console.error('Bleacher Report scrape error:', error.message);
      return [];
    }
  }

  /**
   * Normalize URLs to absolute URLs
   */
  normalizeURL(url, domain) {
    if (!url) return '';
    if (url.startsWith('http')) return url;
    if (url.startsWith('/')) {
      return `https://${domain}${url}`;
    }
    return `https://${domain}/${url}`;
  }

  /**
   * Parse time strings like "2h ago", "30m ago", etc.
   */
  parseTime(timeString) {
    if (!timeString) return new Date();

    const now = new Date();
    const match = timeString.match(/(\d+)([mhd])/);

    if (!match) return now;

    const value = parseInt(match[1]);
    const unit = match[2];

    const time = new Date(now);
    if (unit === 'm') time.setMinutes(time.getMinutes() - value);
    else if (unit === 'h') time.setHours(time.getHours() - value);
    else if (unit === 'd') time.setDate(time.getDate() - value);

    return time;
  }

  /**
   * Remove duplicate articles by title
   */
  removeDuplicates(articles) {
    const seen = new Set();
    return articles.filter(article => {
      const key = article.title.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  /**
   * Clear cache (for testing or forced refresh)
   */
  clearCache() {
    this.newsCache = {
      breaking: [],
      general: [],
      timestamp: 0
    };
  }
}

module.exports = new NewsService();
