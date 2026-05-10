export default function NewsFeed({ articles }) {
  if (!articles || !articles.length) {
    return <p>No news available.</p>;
  }
  return (
    <div className="grid">
      {articles.map((article, i) => {
        const date = new Date(article.publishTime).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
        return (
          <div key={i} className="card news-card">
            <div className="news-card-header">
              <h3>{article.title}</h3>
            </div>
            <p>{article.snippet}</p>
            <div className="news-card-footer">
              <span className="news-source">{article.source}</span>
              <span className="news-date">{date}</span>
            </div>
            <a href={article.url} target="_blank" rel="noopener noreferrer" className="news-link">
              Read Full Story →
            </a>
          </div>
        );
      })}
    </div>
  );
}
