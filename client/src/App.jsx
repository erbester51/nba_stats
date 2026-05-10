import { useState } from 'react';
import Header from './components/Header.jsx';
import GamesTab from './components/GamesTab.jsx';
import TeamTab from './components/TeamTab.jsx';
import PlayerTab from './components/PlayerTab.jsx';
import ScoutingTab from './components/ScoutingTab.jsx';
import PlayerModal from './components/PlayerModal.jsx';

const TABS = ['games', 'team', 'player', 'scouting'];
const TAB_LABELS = { games: 'Today', team: 'Team', player: 'Player', scouting: 'Scouting' };

export default function App() {
  const [activeTab, setActiveTab] = useState('games');
  const [bgLogo, setBgLogo] = useState(null);
  const [modal, setModal] = useState(null);

  function openModal(playerId, playerName) {
    setModal({ playerId, playerName });
  }

  function handleTabChange(tab) {
    setActiveTab(tab);
    if (tab !== 'team' && tab !== 'player') setBgLogo(null);
  }

  return (
    <>
      <div
        className="bg-logo-overlay"
        style={{ backgroundImage: bgLogo ? `url('${bgLogo}')` : 'none', opacity: bgLogo ? 0.07 : 0 }}
      />
      <Header />
      <main>
        <section className="cards-row">
          {TABS.map(tab => (
            <button
              key={tab}
              className={`tab-button${activeTab === tab ? ' active' : ''}`}
              onClick={() => handleTabChange(tab)}
            >
              {TAB_LABELS[tab]}
            </button>
          ))}
        </section>

        <section id="games" className={`tab-panel${activeTab === 'games' ? ' active' : ''}`}>
          <GamesTab onPlayerClick={openModal} />
        </section>
        <section id="team" className={`tab-panel${activeTab === 'team' ? ' active' : ''}`}>
          <TeamTab onBgLogo={setBgLogo} onPlayerClick={openModal} />
        </section>
        <section id="player" className={`tab-panel${activeTab === 'player' ? ' active' : ''}`}>
          <PlayerTab onBgLogo={setBgLogo} />
        </section>
        <section id="scouting" className={`tab-panel${activeTab === 'scouting' ? ' active' : ''}`}>
          <ScoutingTab />
        </section>
      </main>

      {modal && (
        <PlayerModal
          playerName={modal.playerName}
          onClose={() => setModal(null)}
        />
      )}
    </>
  );
}
