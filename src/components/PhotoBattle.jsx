import { useState, useMemo, useCallback } from 'react';

export default function PhotoBattle({ photos, onPhotoClick, currentUser }) {
  const scoredPhotos = useMemo(() =>
    photos.filter(p => p.aiEvaluated && p.totalScore > 0 && p.imageUrl), [photos]);

  const [battleLog, setBattleLog] = useState([]);
  const [pair, setPair] = useState(null);
  const [eloMap, setEloMap] = useState(() => {
    const m = {};
    scoredPhotos.forEach(p => { m[p.id] = 1200; });
    return m;
  });
  const [totalBattles, setTotalBattles] = useState(0);
  const [showResult, setShowResult] = useState(false);

  const pickPair = useCallback(() => {
    if (scoredPhotos.length < 2) return;
    const shuffled = [...scoredPhotos].sort(() => Math.random() - 0.5);
    setPair([shuffled[0], shuffled[1]]);
    setShowResult(false);
  }, [scoredPhotos]);

  if (!pair && scoredPhotos.length >= 2 && totalBattles === 0) {
    pickPair();
  }

  const calcElo = (winnerElo, loserElo) => {
    const K = 32;
    const expected = 1 / (1 + Math.pow(10, (loserElo - winnerElo) / 400));
    return { winner: winnerElo + K * (1 - expected), loser: loserElo + K * (0 - (1 - expected)) };
  };

  const handleVote = useCallback((winnerIdx) => {
    if (!pair) return;
    const winner = pair[winnerIdx];
    const loser = pair[1 - winnerIdx];
    const result = calcElo(eloMap[winner.id] || 1200, eloMap[loser.id] || 1200);
    setEloMap(prev => ({ ...prev, [winner.id]: result.winner, [loser.id]: result.loser }));
    setBattleLog(prev => [...prev, { winner, loser }]);
    setTotalBattles(t => t + 1);
    setShowResult(true);
  }, [pair, eloMap]);

  const rankings = useMemo(() => {
    return scoredPhotos
      .map(p => ({ ...p, elo: Math.round(eloMap[p.id] || 1200) }))
      .sort((a, b) => b.elo - a.elo);
  }, [scoredPhotos, eloMap]);

  if (scoredPhotos.length < 2) {
    return (
      <div className="battle-empty">
        <div style={{ fontSize: 48 }}>⚔️</div>
        <p>사진이 2장 이상 필요합니다</p>
      </div>
    );
  }

  return (
    <div className="battle-container">
      <div className="battle-counter">배틀 #{totalBattles + 1}</div>

      {pair && !showResult && (
        <div className="battle-arena">
          <div className="battle-card" onClick={() => handleVote(0)}>
            <img src={pair[0].thumbnailUrl || pair[0].imageUrl} alt="" className="battle-card-img" />
            <div className="battle-card-title">{pair[0].title}</div>
            <div className="battle-card-elo">ELO: {Math.round(eloMap[pair[0].id] || 1200)}</div>
          </div>
          <div className="battle-vs">VS</div>
          <div className="battle-card" onClick={() => handleVote(1)}>
            <img src={pair[1].thumbnailUrl || pair[1].imageUrl} alt="" className="battle-card-img" />
            <div className="battle-card-title">{pair[1].title}</div>
            <div className="battle-card-elo">ELO: {Math.round(eloMap[pair[1].id] || 1200)}</div>
          </div>
        </div>
      )}

      {showResult && pair && (
        <div className="battle-result-overlay">
          <div className="battle-result-text">승자! 🏆</div>
          <img src={battleLog[battleLog.length - 1]?.winner.thumbnailUrl || battleLog[battleLog.length - 1]?.winner.imageUrl} alt="" className="battle-result-img" />
          <button className="battle-next-btn" onClick={pickPair}>다음 배틀 →</button>
        </div>
      )}

      {totalBattles > 0 && (
        <div className="battle-rankings">
          <div className="battle-rankings-title">ELO 랭킹 (배틀 {totalBattles}회)</div>
          <div className="battle-rankings-list">
            {rankings.slice(0, 10).map((p, i) => (
              <div key={p.id} className="battle-rank-item" onClick={() => onPhotoClick(p)}>
                <span className="battle-rank-num">{i + 1}</span>
                <img src={p.thumbnailUrl || p.imageUrl} alt="" className="battle-rank-thumb" />
                <span className="battle-rank-title">{p.title}</span>
                <span className="battle-rank-elo">{p.elo}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
