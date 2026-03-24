import { useState, useMemo, useCallback } from 'react';

export default function PhotoQuiz({ photos, currentUser }) {
  const scoredPhotos = useMemo(() =>
    photos.filter(p => p.aiEvaluated && p.totalScore > 0), [photos]);

  const [round, setRound] = useState(0);
  const [userScores, setUserScores] = useState([]);
  const [currentScore, setCurrentScore] = useState(5);
  const [submitted, setSubmitted] = useState(false);
  const [gameFinished, setGameFinished] = useState(false);
  const TOTAL_ROUNDS = Math.min(5, scoredPhotos.length);

  const quizPhotos = useMemo(() => {
    const shuffled = [...scoredPhotos].sort(() => Math.random() - 0.5);
    return shuffled.slice(0, TOTAL_ROUNDS);
  }, [scoredPhotos, TOTAL_ROUNDS]);

  const currentPhoto = quizPhotos[round];

  const handleSubmit = useCallback(() => {
    if (!currentPhoto) return;
    setUserScores(prev => [...prev, {
      photo: currentPhoto,
      userScore: currentScore,
      aiScore: currentPhoto.totalScore,
      diff: Math.abs(currentScore - currentPhoto.totalScore)
    }]);
    setSubmitted(true);
  }, [currentPhoto, currentScore]);

  const handleNext = useCallback(() => {
    if (round + 1 >= TOTAL_ROUNDS) {
      setGameFinished(true);
    } else {
      setRound(r => r + 1);
      setCurrentScore(5);
      setSubmitted(false);
    }
  }, [round, TOTAL_ROUNDS]);

  const handleRestart = useCallback(() => {
    setRound(0);
    setUserScores([]);
    setCurrentScore(5);
    setSubmitted(false);
    setGameFinished(false);
  }, []);

  if (scoredPhotos.length < 3) {
    return (
      <div className="quiz-empty">
        <div style={{ fontSize: 48 }}>🧠</div>
        <p>AI 평가된 사진이 3장 이상 필요합니다</p>
      </div>
    );
  }

  if (gameFinished) {
    const avgDiff = userScores.reduce((s, r) => s + r.diff, 0) / userScores.length;
    const matchPercent = Math.max(0, Math.round((1 - avgDiff / 10) * 100));
    const grade = matchPercent >= 90 ? 'S' : matchPercent >= 80 ? 'A' : matchPercent >= 70 ? 'B' : matchPercent >= 60 ? 'C' : 'D';
    const gradeColor = { S: '#ff6b6b', A: '#ffa94d', B: '#ffd43b', C: '#69db7c', D: '#74c0fc' }[grade];
    const comment = matchPercent >= 90 ? 'AI와 거의 같은 안목!' : matchPercent >= 80 ? '뛰어난 사진 감각!' : matchPercent >= 70 ? '좋은 안목이에요!' : matchPercent >= 60 ? '나쁘지 않아요!' : '독특한 시각을 가지고 있네요!';

    return (
      <div className="quiz-result">
        <div className="quiz-result-header">
          <div className="quiz-result-grade" style={{ color: gradeColor }}>{grade}</div>
          <div className="quiz-result-percent">{matchPercent}% 일치</div>
          <div className="quiz-result-comment">{comment}</div>
        </div>
        <div className="quiz-result-list">
          {userScores.map((r, i) => (
            <div key={i} className="quiz-result-item">
              <img src={r.photo.thumbnailUrl || r.photo.imageUrl} alt="" className="quiz-result-thumb" />
              <div className="quiz-result-scores">
                <div>내 점수: <strong>{r.userScore.toFixed(1)}</strong></div>
                <div>AI 점수: <strong>{r.aiScore.toFixed(1)}</strong></div>
                <div className={`quiz-result-diff ${r.diff < 1 ? 'close' : r.diff < 2 ? 'medium' : 'far'}`}>
                  차이: {r.diff.toFixed(1)}
                </div>
              </div>
            </div>
          ))}
        </div>
        <button className="quiz-restart-btn" onClick={handleRestart}>다시 도전</button>
      </div>
    );
  }

  if (!currentPhoto) return null;

  return (
    <div className="quiz-game">
      <div className="quiz-progress">
        {Array.from({ length: TOTAL_ROUNDS }, (_, i) => (
          <div key={i} className={`quiz-progress-dot ${i < round ? 'done' : i === round ? 'current' : ''}`} />
        ))}
      </div>
      <div className="quiz-round-label">Round {round + 1} / {TOTAL_ROUNDS}</div>

      <div className="quiz-photo-wrap">
        <img src={currentPhoto.imageUrl} alt="" className="quiz-photo" />
      </div>

      {!submitted ? (
        <div className="quiz-input">
          <div className="quiz-score-display">{currentScore.toFixed(1)}</div>
          <input
            type="range"
            min="0"
            max="10"
            step="0.5"
            value={currentScore}
            onChange={e => setCurrentScore(parseFloat(e.target.value))}
            className="quiz-slider"
          />
          <div className="quiz-slider-labels">
            <span>0</span><span>5</span><span>10</span>
          </div>
          <button className="quiz-submit-btn" onClick={handleSubmit}>점수 확정!</button>
        </div>
      ) : (
        <div className="quiz-reveal">
          <div className="quiz-reveal-row">
            <div className="quiz-reveal-box user">
              <div className="quiz-reveal-label">내 점수</div>
              <div className="quiz-reveal-score">{currentScore.toFixed(1)}</div>
            </div>
            <div className="quiz-reveal-vs">VS</div>
            <div className="quiz-reveal-box ai">
              <div className="quiz-reveal-label">AI 점수</div>
              <div className="quiz-reveal-score">{currentPhoto.totalScore.toFixed(1)}</div>
            </div>
          </div>
          <div className={`quiz-reveal-diff ${Math.abs(currentScore - currentPhoto.totalScore) < 1 ? 'close' : 'far'}`}>
            {Math.abs(currentScore - currentPhoto.totalScore) < 1 ? '거의 일치! 🎯' :
             Math.abs(currentScore - currentPhoto.totalScore) < 2 ? '비슷해요! 👍' : '시각 차이가 크네요! 🤔'}
          </div>
          <button className="quiz-next-btn" onClick={handleNext}>
            {round + 1 >= TOTAL_ROUNDS ? '결과 보기' : '다음 사진 →'}
          </button>
        </div>
      )}
    </div>
  );
}
