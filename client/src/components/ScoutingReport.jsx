function ArticleCard({ article }) {
  const date = new Date(article.publishTime).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  return (
    <a className="scouting-article-card" href={article.url} target="_blank" rel="noopener noreferrer">
      <div className="scouting-article-meta">
        <span className="news-source">{article.source}</span>
        <span className="news-date">{date}</span>
      </div>
      <p className="scouting-article-title">{article.title}</p>
      {article.snippet && <p className="scouting-article-blurb">{article.snippet}</p>}
    </a>
  );
}

function SectionBlock({ section, index }) {
  return (
    <div>
      {index > 0 && <div style={{ borderTop: '1px solid var(--border)', margin: '8px 0' }} />}
      <div className="scouting-section">
        <div className="scouting-section-header">
          <h3>{section.title}</h3>
          <span className="scouting-article-count">
            {section.articles.length} article{section.articles.length !== 1 ? 's' : ''}
          </span>
        </div>
        <div className="scouting-articles">
          {section.articles.slice(0, 6).map((article, j) => (
            <ArticleCard key={j} article={article} />
          ))}
        </div>
      </div>
    </div>
  );
}

export default function ScoutingReport({ report }) {
  const sections = report.sections || [];
  const articles = report.articles || [];
  const advancedSources = report.advancedSources || [];
  const limitedCoverage = !!report.limitedCoverage;
  const gameDateStr = report.gameDate
    ? new Date(report.gameDate).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })
    : '';

  const renderArticles = () => {
    if (articles.length === 0) {
      return (
        <p className="scouting-empty">
          No matchup-specific reports found yet. Check back closer to game time.
        </p>
      );
    }

    if (limitedCoverage) {
      return (
        <>
          <p className="scouting-limited-notice">
            Limited scouting coverage found for this matchup. Check back closer to game time.
          </p>
          <div className="scouting-articles">
            {articles.map((article, i) => (
              <ArticleCard key={i} article={article} />
            ))}
          </div>
        </>
      );
    }

    if (sections.length > 0) {
      // Collect URLs already shown in sections so we can surface uncategorized ones below
      const shownUrls = new Set(
        sections.flatMap(s => s.articles.slice(0, 6).map(a => a.url))
      );
      const uncategorized = articles.filter(a => !shownUrls.has(a.url));

      return (
        <>
          {sections.map((section, i) => (
            <SectionBlock key={i} section={section} index={i} />
          ))}
          {uncategorized.length > 0 && (
            <div>
              <div style={{ borderTop: '1px solid var(--border)', margin: '8px 0' }} />
              <div className="scouting-section">
                <div className="scouting-section-header">
                  <h3>More Coverage</h3>
                  <span className="scouting-article-count">
                    {uncategorized.length} article{uncategorized.length !== 1 ? 's' : ''}
                  </span>
                </div>
                <div className="scouting-articles">
                  {uncategorized.slice(0, 8).map((article, i) => (
                    <ArticleCard key={i} article={article} />
                  ))}
                </div>
              </div>
            </div>
          )}
        </>
      );
    }

    // Articles passed the both-teams filter but none matched section keywords
    return (
      <div className="scouting-section">
        <div className="scouting-section-header">
          <h3>Matchup Coverage</h3>
          <span className="scouting-article-count">
            {articles.length} article{articles.length !== 1 ? 's' : ''}
          </span>
        </div>
        <div className="scouting-articles">
          {articles.slice(0, 12).map((article, i) => (
            <ArticleCard key={i} article={article} />
          ))}
        </div>
      </div>
    );
  };

  return (
    <div className="card card-animate">
      <div className="scouting-matchup-header">
        <span className="scouting-team">{report.awayTeam?.name}</span>
        <span className="scouting-at">@</span>
        <span className="scouting-team">{report.homeTeam?.name}</span>
        {gameDateStr && <span className="scouting-cache-badge">{gameDateStr}</span>}
      </div>

      {renderArticles()}

      {advancedSources.length > 0 && (
        <>
          <div style={{ borderTop: '1px solid var(--border)', margin: '24px 0 8px' }} />
          <div className="scouting-section">
            <div className="scouting-section-header">
              <h3>Advanced Scouting Data</h3>
            </div>
            <div className="scouting-advanced-grid">
              {advancedSources.map((src, i) => (
                <div key={i} className="scouting-advanced-card">
                  <div className="scouting-advanced-name">{src.name}</div>
                  <p className="scouting-advanced-desc">{src.description}</p>
                  <div className="scouting-advanced-links">
                    {src.links.map((link, j) => (
                      <a key={j} className="scouting-advanced-link" href={link.url} target="_blank" rel="noopener noreferrer">
                        {link.label} →
                      </a>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
