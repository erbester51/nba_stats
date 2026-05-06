require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const gamesRoutes = require('./routes/games');
const teamsRoutes = require('./routes/teams');
const playersRoutes = require('./routes/players');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());

// Serve static files from public directory
app.use(express.static(path.join(__dirname, 'public')));

// Routes
app.use('/api/games', gamesRoutes);
app.use('/api/teams', teamsRoutes);
app.use('/api/players', playersRoutes);

// Serve dashboard at root
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({ status: 'API is running' });
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Internal server error' });
});

app.listen(PORT, () => {
  console.log(`NBA Stats API listening on port ${PORT}`);
  console.log(`Dashboard available at http://localhost:${PORT}`);
});

module.exports = app;
