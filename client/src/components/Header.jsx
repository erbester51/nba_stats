export default function Header() {
  return (
    <header>
      <div className="brand">
        <div className="logo-section">
          <svg className="nba-logo" viewBox="0 0 120 120" xmlns="http://www.w3.org/2000/svg">
            <circle cx="60" cy="60" r="55" fill="#1D428A" />
            <circle cx="60" cy="60" r="55" fill="none" stroke="#C8102E" strokeWidth="3" />
            <text x="60" y="58" fontSize="30" fontWeight="900" fill="#ffffff" textAnchor="middle" fontFamily="Arial Black, Arial, sans-serif">NBA</text>
            <text x="60" y="76" fontSize="11" fontWeight="700" fill="#C8102E" textAnchor="middle" fontFamily="Arial, sans-serif" letterSpacing="3">LIVE</text>
          </svg>
          <div className="header-text">
            <h1>NBA Live Dashboard</h1>
            <p>Current games, starters, team and player stats in one place.</p>
          </div>
        </div>
      </div>
    </header>
  );
}
