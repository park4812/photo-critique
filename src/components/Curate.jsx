import { useState, useEffect, useCallback, useMemo } from 'react';
import { db } from '../firebase';
import {
  collection, doc, getDocs, setDoc, query, where, onSnapshot, serverTimestamp
} from 'firebase/firestore';

export default function Curate({ photos, currentUser, onPhotoClick }) {
  const [currentPhoto, setCurrentPhoto] = useState(null);
  const [userScore, setUserScore] = useState(0);
  const [hoverScore, setHoverScore] = useState(0);
  const [submitted, setSubmitted] = useState(false);
  const [userRatings, setUserRatings] = useState({}); // { photoId: { avg, count } }
  const [myRatings, setMyRatings] = useState({}); // { photoId: score }
  const [loading, setLoading] = useState(false);
  const [stats, setStats] = useState({ rated: 0, total: 0 });
  const [showHistory, setShowHistory] = useState(false);

  // 평가 가능한 사진 목록 (내 사진 제외, AI 평가 완료된 것만)
  const eligiblePhotos = useMemo(() => {
    if (!currentUser) return [];
    return photos.filter(p =>
      p.aiEvaluated &&
      p.totalScore > 0 &&
      p.imageUrl &&
      p.uploaderUid !== currentUser.uid
    );
  }, [photos, currentUser]);

  // 내가 이미 평가한 사진 ID 목록 로드
  useEffect(() => {
    if (!currentUser) return;
    let unsub;
    (async () => {
      const ratingsRef = collection(db, 'userRatings');
      const q = query(ratingsRef, where('raterUid', '==', currentUser.uid));
      unsub = onSnapshot(q, (snapshot) => {
        const ratings = {};
        snapshot.forEach(d => {
          const data = d.data();
          ratings[data.photoId] = data.score;
        });
        setMyRatings(ratings);
      });
    })();
    return () => { if (unsub) unsub(); };
  }, [currentUser]);

  // 모든 사진의 유저 평균 점수 로드
  useEffect(() => {
    let unsub;
    (async () => {
      const ratingsRef = collection(db, 'userRatings');
      unsub = onSnapshot(ratingsRef, (snapshot) => {
        const aggregated = {};
        snapshot.forEach(d => {
          const data = d.data();
          if (!aggregated[data.photoId]) {
            aggregated[data.photoId] = { sum: 0, count: 0 };
          }
          aggregated[data.photoId].sum += data.score;
          aggregated[data.photoId].count += 1;
        });
        const result = {};
        Object.entries(aggregated).forEach(([pid, { sum, count }]) => {
          result[pid] = { avg: Math.round((sum / count) * 10) / 10, count };
        });
        setUserRatings(result);
      });
    })();
    return () => { if (unsub) unsub(); };
  }, []);

  // 통계 업데이트
  useEffect(() => {
    const rated = eligiblePhotos.filter(p => myRatings[p.id]).length;
    setStats({ rated, total: eligiblePhotos.length });
  }, [eligiblePhotos, myRatings]);

  // 다음 사진 선택 (아직 평가 안 한 사진 우선)
  const pickNext = useCallback(() => {
    const unrated = eligiblePhotos.filter(p => !myRatings[p.id]);
    const pool = unrated.length > 0 ? unrated : eligiblePhotos;
    if (pool.length === 0) return;
    const idx = Math.floor(Math.random() * pool.length);
    setCurrentPhoto(pool[idx]);
    setUserScore(0);
    setHoverScore(0);
    setSubmitted(false);
  }, [eligiblePhotos, myRatings]);

  // 첫 로드 시 사진 선택
  useEffect(() => {
    if (eligiblePhotos.length > 0 && !currentPhoto) {
      pickNext();
    }
  }, [eligiblePhotos, currentPhoto, pickNext]);

  // 점수 제출
  const handleSubmit = async () => {
    if (!currentPhoto || userScore === 0 || !currentUser) return;
    setLoading(true);
    try {
      const ratingId = `${currentUser.uid}_${currentPhoto.id}`;
      await setDoc(doc(db, 'userRatings', ratingId), {
        photoId: currentPhoto.id,
        raterUid: currentUser.uid,
        raterName: currentUser.displayName || currentUser.email,
        score: userScore,
        createdAt: serverTimestamp()
      });
      setSubmitted(true);
    } catch (err) {
      console.error('Rating submit failed:', err);
      alert('평가 저장 실패: ' + err.message);
    }
    setLoading(false);
  };

  // 내 평가 이력
  const ratedPhotos = useMemo(() => {
    return eligiblePhotos
      .filter(p => myRatings[p.id])
      .map(p => ({
        ...p,
        myScore: myRatings[p.id],
        userAvg: userRatings[p.id]?.avg || myRatings[p.id],
        userCount: userRatings[p.id]?.count || 1
      }))
      .sort((a, b) => b.myScore - a.myScore);
  }, [eligiblePhotos, myRatings, userRatings]);

  if (!currentUser) {
    return (
      <div className="curate-empty">
        <div style={{ fontSize: 48 }}>🎨</div>
        <p>로그인이 필요합니다</p>
      </div>
    );
  }

  if (eligiblePhotos.length === 0) {
    return (
      <div className="curate-empty">
        <div style={{ fontSize: 48 }}>🎨</div>
        <p>평가할 사진이 없습니다</p>
      </div>
    );
  }

  const displayScore = hoverScore || userScore;
  const aiScore = currentPhoto?.totalScore || 0;
  const currentUserAvg = currentPhoto ? userRatings[currentPhoto.id] : null;

  return (
    <div className="curate-container">
      <div className="curate-header">
        <h2 className="curate-title">큐레이트</h2>
        <p className="curate-subtitle">다른 사람의 사진을 평가하고 AI와 비교해보세요</p>
        <div className="curate-stats">
          <span className="curate-stat-item">평가 완료 {stats.rated}/{stats.total}</span>
          <button
            className={`curate-history-btn ${showHistory ? 'active' : ''}`}
            onClick={() => setShowHistory(!showHistory)}
          >
            {showHistory ? '평가하기' : '내 평가 이력'}
          </button>
        </div>
      </div>

      {showHistory ? (
        <div className="curate-history">
          {ratedPhotos.length === 0 ? (
            <div className="curate-empty-small">아직 평가한 사진이 없습니다</div>
          ) : (
            <div className="curate-history-grid">
              {ratedPhotos.map(p => (
                <div key={p.id} className="curate-history-card" onClick={() => onPhotoClick && onPhotoClick(p)}>
                  <img src={p.thumbnailUrl || p.imageUrl} alt={p.title} className="curate-history-img" />
                  <div className="curate-history-info">
                    <div className="curate-history-title">{p.title}</div>
                    <div className="curate-history-scores">
                      <span className="curate-score-ai">AI {p.totalScore}</span>
                      <span className="curate-score-user">유저 {p.userAvg}</span>
                      <span className="curate-score-mine">내 점수 {p.myScore}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      ) : (
        <>
          {currentPhoto && (
            <div className="curate-photo-card">
              <div className="curate-photo-wrapper">
                <img
                  src={currentPhoto.imageUrl}
                  alt={currentPhoto.title}
                  className="curate-photo-img"
                  onClick={() => onPhotoClick && onPhotoClick(currentPhoto)}
                />
              </div>
              <div className="curate-photo-meta">
                <div className="curate-photo-title">{currentPhoto.title}</div>
                <div className="curate-photo-author">by {currentPhoto.uploaderName}</div>
                {currentPhoto.aiTags && (
                  <div className="curate-photo-tags">
                    {currentPhoto.aiTags.slice(0, 3).map(t => (
                      <span key={t} className="curate-tag">{t}</span>
                    ))}
                  </div>
                )}
              </div>

              {/* 점수 입력 */}
              {!submitted ? (
                <div className="curate-rating-section">
                  <div className="curate-rating-label">이 사진에 점수를 매겨주세요</div>
                  <div className="curate-rating-stars">
                    {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(n => (
                      <button
                        key={n}
                        className={`curate-star ${n <= displayScore ? 'active' : ''}`}
                        onMouseEnter={() => setHoverScore(n)}
                        onMouseLeave={() => setHoverScore(0)}
                        onClick={() => setUserScore(n)}
                      >
                        {n}
                      </button>
                    ))}
                  </div>
                  {userScore > 0 && (
                    <div className="curate-selected-score">
                      선택: <strong>{userScore}</strong>점
                    </div>
                  )}
                  <button
                    className="curate-submit-btn"
                    onClick={handleSubmit}
                    disabled={userScore === 0 || loading}
                  >
                    {loading ? '저장 중...' : '평가 제출'}
                  </button>
                </div>
              ) : (
                <div className="curate-result-section">
                  <div className="curate-result-title">평가 완료!</div>
                  <div className="curate-result-comparison">
                    <div className="curate-result-box ai">
                      <div className="curate-result-label">AI 점수</div>
                      <div className="curate-result-value">{aiScore}</div>
                    </div>
                    <div className="curate-result-box user">
                      <div className="curate-result-label">유저 평균</div>
                      <div className="curate-result-value">
                        {currentUserAvg ? currentUserAvg.avg : userScore}
                      </div>
                      <div className="curate-result-count">
                        {currentUserAvg ? `${currentUserAvg.count}명 참여` : '1명 참여'}
                      </div>
                    </div>
                    <div className="curate-result-box mine">
                      <div className="curate-result-label">내 점수</div>
                      <div className="curate-result-value">{userScore}</div>
                    </div>
                  </div>
                  <div className="curate-result-diff">
                    {Math.abs(userScore - aiScore) <= 1
                      ? '👏 AI와 비슷한 안목이네요!'
                      : userScore > aiScore
                        ? '😊 AI보다 후하게 평가했어요'
                        : '🤔 AI보다 냉정하게 평가했어요'}
                  </div>
                  <button className="curate-next-btn" onClick={pickNext}>
                    다음 사진 →
                  </button>
                </div>
              )}
            </div>
          )}

          {/* 이미 평가한 사진이면 표시 */}
          {currentPhoto && myRatings[currentPhoto.id] && !submitted && (
            <div className="curate-already-rated">
              이전에 {myRatings[currentPhoto.id]}점을 매긴 사진입니다.
              <button className="curate-skip-btn" onClick={pickNext}>다른 사진 보기</button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
