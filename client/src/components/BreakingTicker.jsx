function TickerItems({ articles, prefix }) {
  return articles.flatMap((article, i) => {
    const time = new Date(article.publishTime).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
    return [
      <a
        key={`${prefix}-a-${i}`}
        className="ticker-item"
        href={article.url}
        target="_blank"
        rel="noopener noreferrer"
        title={article.title}
      >
        <span className="ticker-source">{article.source}</span>
        <span className="ticker-headline">{article.title}</span>
        <span className="ticker-time">{time}</span>
      </a>,
      <span key={`${prefix}-s-${i}`} className="ticker-sep" aria-hidden="true">◆</span>,
    ];
  });
}

export default function BreakingTicker({ articles }) {
  if (!articles || !articles.length) {
    return (
      <div id="breaking-carousel" className="carousel">
        <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', padding: '12px 0' }}>
          No breaking news available.
        </p>
      </div>
    );
  }

  const duration = Math.max(60, articles.length * 15);

  return (
    <div id="breaking-carousel" className="carousel">
      <div className="ticker-wrapper">
        <div className="ticker-label">
          <span className="ticker-dot"></span>BREAKING
        </div>
        <div className="ticker-track">
          <div className="ticker-content" style={{ animationDuration: `${duration}s` }}>
            <TickerItems articles={articles} prefix="a" />
            <TickerItems articles={articles} prefix="b" />
          </div>
        </div>
      </div>
    </div>
  );
}
