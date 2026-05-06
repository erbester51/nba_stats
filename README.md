"# NBA Stats Dashboard

A web dashboard for viewing live NBA statistics, games, teams, and players.

## Features

- **Live Games Dashboard**: View today's games with starters for each team
- **Team Stats**: Browse team information and standings
- **Player Stats**: Search players by name or ID, view current and historical season stats
- **Season Overview**: Select seasons to explore league context
- **Responsive Design**: Works on desktop and mobile devices

## Data Sources

- **ESPN API** - Live games, scores, standings, and team data
- **NBA Stats API** - Player statistics and detailed metrics

Both sources are public and require no authentication.

## Getting Started

### Prerequisites

- Node.js (v14 or higher)
- npm or yarn

### Installation

1. Clone the repository:
```bash
git clone <repository-url>
cd nba_stats
```

2. Install dependencies:
```bash
npm install
```

3. Create a `.env` file:
```bash
cp .env.example .env
```

4. Start the server:
```bash
npm run dev
```

The dashboard will be available at `http://localhost:3000`

## Dashboard Tabs

### Today
- Shows all current NBA games for the day
- Click "Show starters" to see starting lineups for each team
- Displays game status, venue, and scores

### Team
- Select from dropdown to view team information
- Shows team name, abbreviation, location, and record

### Player
- Search by player full name or NBA player ID
- View current season stats and select from past 4 seasons
- Displays points, assists, rebounds per game

### Season
- Select from recent NBA seasons
- Provides context for league-wide data

## API Endpoints

The dashboard uses these API endpoints:

### Games
- `GET /api/games` - Get live games (optional query: `?date=YYYYMMDD`)
- `GET /api/games/scores` - Get formatted scores (optional query: `?date=YYYYMMDD`)
- `GET /api/games/:gameId/players` - Get player boxscore stats for a game
- `GET /api/games/:gameId` - Get game details and boxscore summary

### Teams
- `GET /api/teams` - Get all NBA teams
- `GET /api/teams/standings` - Get league standings
- `GET /api/teams/:teamId/stats` - Get team statistics

### Players
- `GET /api/players/:playerId/stats` - Get player information, current season stats, and the past 3 seasons of regular-season stats. `playerId` can be an NBA player ID or a player full name.

### Health Check
- `GET /api/health` - Check API status

## Example Usage

**Get live games:**
```bash
curl http://localhost:3000/api/games
```

**Get today's scores:**
```bash
curl http://localhost:3000/api/games/scores
```

**Get player boxscore stats for a game:**
```bash
curl http://localhost:3000/api/games/401871159/players
```

**Get player historical stats by NBA player ID:**
```bash
curl http://localhost:3000/api/players/201939/stats
```

This endpoint returns a `seasonStats` object that includes `currentSeason` and `last4Seasons`.

**Get player historical stats by name:**
```bash
curl http://localhost:3000/api/players/Stephen%20Curry/stats
```

**Get standings:**
```bash
curl http://localhost:3000/api/teams/standings
```

**Get all teams:**
```bash
curl http://localhost:3000/api/teams
```

## Project Structure

```
src/
├── index.js              # Main Express app with static file serving
├── controllers/          # Request handlers
├── routes/              # Route definitions
├── services/            # Business logic & API calls
├── public/              # Dashboard static files
│   ├── index.html       # Main dashboard page
│   ├── styles.css       # Dashboard styling
│   └── app.js           # Dashboard JavaScript
└── utils/               # Utility functions
```

## Development

To run in development mode with auto-reload:
```bash
npm run dev
```

To run tests:
```bash
npm test
```

## Environment Variables

See `.env.example` for available configuration options.

## License

MIT" 
