import { useGames } from '../hooks/useGames';
import { useNews } from '../hooks/useNews';
import GameCard from './GameCard.jsx';
import BreakingTicker from './BreakingTicker.jsx';
import NewsFeed from './NewsFeed.jsx';

export default function GamesTab({ onPlayerClick }) {
  const { games, loading: gamesLoading, error: gamesError } = useGames();
  const { breaking, general, loading: newsLoading } = useNews();

  return (
    <>
      <div className="section-header">
        <h2>Today's Games</h2>
        <p>Current games and starters for each team.</p>
      </div>
      {gamesLoading && <div className="loader">Loading games...</div>}
      {gamesError && <div className="card"><p>Error loading games: {gamesError}</p></div>}
      {!gamesLoading && !gamesError && (
        <div className="grid">
          {games.length === 0
            ? <div className="card"><p>No games found for today.</p></div>
            : games.map(game => (
                <GameCard key={game.gameId} game={game} onPlayerClick={onPlayerClick} />
              ))
          }
        </div>
      )}

      <div className="section-header" style={{ marginTop: 40 }}>
        <h2>Breaking News</h2>
        <p>Latest NBA news and headlines.</p>
      </div>
      {newsLoading && <div className="loader">Loading breaking news...</div>}
      {!newsLoading && <BreakingTicker articles={breaking} />}

      <div className="section-header" style={{ marginTop: 40 }}>
        <h2>NBA News</h2>
        <p>More news from top sports outlets.</p>
      </div>
      {newsLoading && <div className="loader">Loading news...</div>}
      {!newsLoading && <NewsFeed articles={general} />}
    </>
  );
}
