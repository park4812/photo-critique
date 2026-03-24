import { useState, useMemo } from 'react';

const RANK_MEDALS = {
  1: { emoji: '🥇', class: 'ranking-gold' },
  2: { emoji: '🥈', class: 'ranking-silver' },
  3: { emoji: '🥉', class: 'ranking-bronze' },
};

const GRADE_INFO = {
  S: { label: 'S', color: '#ff6b6b', min: 9.0 },
  A: { label: 'A', color: '#ffa94d', min: 8.0 },
  B: { label: 'B', color: '#ffd43b', min: 7.0 },
  C: { label: 'C', color: '#69db7c', min: 6.0 },
  D: { label: 'D', color: '#74c0fc', min: 5.0 },
  F: { label: 'F', color: '#868e96', min: 0 },
};

const PERIODS = [
  { key: 'all', label: '전체' },
  { key: 'month', label: '이번달' },
  { key: 'week', label: '이번주' },
  { key: 'today', label: '오늘' },
];

function getGrade(score) {
  if (score >= 9.0) return GRADE_INFO.S;
  if (score >= 8.0) return GRADE_INFO.A;
  if (score >= 7.0) return GRADE_INFO.B;
  if (score >= 6.0) return GRADE_INFO.C;
  if (score >= 5.0) return GRADE_INFO.D;
  return GRADE_INFO.F;
}

function getDateRange(period) {
  const now = new Date();
  if (period === 'today') {
    const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    return start;
  }
  if (period === 'week') {
    const day = now.getDay();
    const diff = day === 0 ? 6 : day - 1; // 월요일 시작
    const start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - diff);
    return start;
  }
  if (period === 'month') {
    return new Date(now.getFullYear(), now.getMonth(), 1);
  }
  return null; // all
}

function getPhotoDate(photo) {
  if (photo.createdAt?.seconds) return new Date(photo.createdAt.seconds * 1000);
  if (photo.createdAt?.toDate) return photo.createdAt.toDate();
  if (photo.date) return new Date(photo.date);
  return null;
}

export default function Ranking({ photos, onPhotoClick }) {
  const [viewMode, setViewMode] = useState('all');
  const [period, setPeriod] = useState('all');

  const filteredByPeriod = useMemo(() => {
    const startDate = getDateRange(period);
    if (!startDate) return photos;
    return photos.filter(p => {
      const d = getPhotoDate(p);
      return d && d >= startDate;
    });
  }, [photos, period]);

  const rankedPhotos = useMemo(() => {
    return [...filteredByPeriod]
      .filter(p => p.aiEvaluated && p.totalScore > 0)
      .sort((a, b) => b.totalScore - a.totalScore);
  }, [filteredByPeriod]);

  const top10 = rankedPhotos.slice(0, 10);
  const top3 = rankedPhotos.slice(0, 3);

  const gradeGroups = useMemo(() => {
    const groups = { S: [], A: [], B: [], C: [], D: [], F: [] };
    rankedPhotos.forEach(p => {
      const grade = getGrade(p.totalScore);
      const key = Object.keys(GRADE_INFO).find(k => GRADE_INFO[k] === grade);
      if (key) groups[key].push(p);
    });
    return groups;
  }, [rankedPhotos]);

  // 주간 MVP 계산
  const weeklyMVP = useMemo(() => {
    const weekStart = getDateRange('week');
    const weekPhotos = photos.filter(p => {
      const d = getPhotoDate(p);
      return d && d >= weekStart && p.aiEvaluated && p.totalScore > 0;
    });

    if (weekPhotos.length === 0) return null;

    // 가장 많이 업로드한 유저
    const uploadCounts = {};
    const userNames = {};
    weekPhotos.forEach(p => {
      const uid = p.uploaderUid || 'unknown';
      uploadCounts[uid] = (uploadCounts[uid] || 0) + 1;
      if (p.uploaderName) userNames[uid] = p.uploaderName;
    });
    const topUploaderUid = Object.entries(uploadCounts).sort((a, b) => b[1] - a[1])[0];

    // 이번주 최고 점수
    const bestPhoto = [...weekPhotos].sort((a, b) => b.totalScore - a.totalScore)[0];

    // 이번주 평균 점수 최고 유저 (3장 이상)
    const userScores = {};
    weekPhotos.forEach(p => {
      const uid = p.uploaderUid || 'unknown';
      if (!userScores[uid]) userScores[uid] = [];
      userScores[uid].push(p.totalScore);
    });
    let bestAvgUser = null;
    let bestAvg = 0;
    Object.entries(userScores).forEach(([uid, scores]) => {
      if (scores.length >= 2) {
        const avg = scores.reduce((a, b) => a + b, 0) / scores.length;
        if (avg > bestAvg) {
          bestAvg = avg;
          bestAvgUser = { uid, name: userNames[uid] || '익명', avg, count: scores.length };
        }
      }
    });

    return {
      topUploader: topUploaderUid ? {
        name: userNames[topUploaderUid[0]] || '익명',
        count: topUploaderUid[1],
      } : null,
      bestPhoto,
      bestAvgUser,
      totalWeekPhotos: weekPhotos.length,
    };
  }, [photos]);

  const displayPhotos = viewMode === 'top10' ? top10 : rankedPhotos;

  return (
    <div className="ranking-container">
      {/* 주간 MVP */}
      {weeklyMVP && (
        <div className="ranking-mvp-section">
          <div className="ranking-mvp-title">이번주 MVP</div>
          <div className="ranking-mvp-cards">
            {weeklyMVP.topUploader && (
              <div className="ranking-mvp-card">
                <div className="ranking-mvp-icon">🔥</div>
                <div className="ranking-mvp-label">최다 업로드</div>
                <div className="ranking-mvp-value">{weeklyMVP.topUploader.name}</div>
                <div className="ranking-mvp-sub">{weeklyMVP.topUploader.count}장</div>
              </div>
            )}
            {weeklyMVP.bestPhoto && (
              <div className="ranking-mvp-card clickable" onClick={() => onPhotoClick(weeklyMVP.bestPhoto)}>
                <div className="ranking-mvp-icon">👑</div>
                <div className="ranking-mvp-label">최고 점수</div>
                <div className="ranking-mvp-value">{weeklyMVP.bestPhoto.uploaderName || '익명'}</div>
                <div className="ranking-mvp-sub">{weeklyMVP.bestPhoto.totalScore}점</div>
              </div>
            )}
            {weeklyMVP.bestAvgUser && (
              <div className="ranking-mvp-card">
                <div className="ranking-mvp-icon">📊</div>
                <div className="ranking-mvp-label">최고 평균</div>
                <div className="ranking-mvp-value">{weeklyMVP.bestAvgUser.name}</div>
                <div className="ranking-mvp-sub">{weeklyMVP.bestAvgUser.avg.toFixed(1)}점 ({weeklyMVP.bestAvgUser.count}장)</div>
              </div>
            )}
          </div>
          <div className="ranking-mvp-week-total">이번주 {weeklyMVP.totalWeekPhotos}장 업로드</div>
        </div>
      )}

      {/* 기간 필터 */}
      <div className="ranking-period-filter">
        {PERIODS.map(p => (
          <button
            key={p.key}
            className={`ranking-period-btn ${period === p.key ? 'active' : ''}`}
            onClick={() => setPeriod(p.key)}
          >{p.label}</button>
        ))}
      </div>

      {/* 포디움 - Top 3 */}
      {top3.length >= 3 && (
        <div className="ranking-podium">
          <div className="ranking-podium-title">
            {period === 'all' ? 'AI 점수 TOP 3' : `${PERIODS.find(p => p.key === period)?.label} TOP 3`}
          </div>
          <div className="ranking-podium-row">
            {/* 2위 */}
            <div className="ranking-podium-item second" onClick={() => onPhotoClick(top3[1])}>
              <div className="ranking-podium-medal">🥈</div>
              <div className="ranking-podium-img-wrap">
                <img src={top3[1].thumbnailUrl || top3[1].imageUrl} alt="" className="ranking-podium-img" />
              </div>
              <div className="ranking-podium-info">
                <div className="ranking-podium-name">{top3[1].title}</div>
                <div className="ranking-podium-author">{top3[1].uploaderName || '익명'}</div>
                <div className="ranking-podium-score">{top3[1].totalScore}</div>
              </div>
              <div className="ranking-podium-bar second"></div>
            </div>
            {/* 1위 */}
            <div className="ranking-podium-item first" onClick={() => onPhotoClick(top3[0])}>
              <div className="ranking-podium-medal">🥇</div>
              <div className="ranking-podium-img-wrap">
                <img src={top3[0].thumbnailUrl || top3[0].imageUrl} alt="" className="ranking-podium-img" />
              </div>
              <div className="ranking-podium-info">
                <div className="ranking-podium-name">{top3[0].title}</div>
                <div className="ranking-podium-author">{top3[0].uploaderName || '익명'}</div>
                <div className="ranking-podium-score">{top3[0].totalScore}</div>
              </div>
              <div className="ranking-podium-bar first"></div>
            </div>
            {/* 3위 */}
            <div className="ranking-podium-item third" onClick={() => onPhotoClick(top3[2])}>
              <div className="ranking-podium-medal">🥉</div>
              <div className="ranking-podium-img-wrap">
                <img src={top3[2].thumbnailUrl || top3[2].imageUrl} alt="" className="ranking-podium-img" />
              </div>
              <div className="ranking-podium-info">
                <div className="ranking-podium-name">{top3[2].title}</div>
                <div className="ranking-podium-author">{top3[2].uploaderName || '익명'}</div>
                <div className="ranking-podium-score">{top3[2].totalScore}</div>
              </div>
              <div className="ranking-podium-bar third"></div>
            </div>
          </div>
        </div>
      )}

      {/* 뷰 모드 토글 */}
      <div className="ranking-controls">
        <div className="ranking-view-toggle">
          <button
            className={`ranking-toggle-btn ${viewMode === 'all' ? 'active' : ''}`}
            onClick={() => setViewMode('all')}
          >전체 ({rankedPhotos.length})</button>
          <button
            className={`ranking-toggle-btn ${viewMode === 'top10' ? 'active' : ''}`}
            onClick={() => setViewMode('top10')}
          >TOP 10</button>
          <button
            className={`ranking-toggle-btn ${viewMode === 'byGrade' ? 'active' : ''}`}
            onClick={() => setViewMode('byGrade')}
          >등급별</button>
        </div>
      </div>

      {/* 등급별 보기 */}
      {viewMode === 'byGrade' ? (
        <div className="ranking-grade-view">
          {Object.entries(GRADE_INFO).map(([key, info]) => {
            const group = gradeGroups[key];
            if (group.length === 0) return null;
            return (
              <div key={key} className="ranking-grade-section">
                <div className="ranking-grade-header">
                  <span className="ranking-grade-badge" style={{ background: info.color }}>
                    {info.label}
                  </span>
                  <span className="ranking-grade-count">{group.length}장</span>
                  <span className="ranking-grade-range">
                    {info.min === 0 ? '5.0 미만' : `${info.min}+`}
                  </span>
                </div>
                <div className="ranking-grade-grid">
                  {group.map((photo) => {
                    const globalRank = rankedPhotos.indexOf(photo) + 1;
                    return (
                      <div key={photo.id} className="ranking-card mini" onClick={() => onPhotoClick(photo)}>
                        <span className="ranking-card-rank">#{globalRank}</span>
                        <img src={photo.thumbnailUrl || photo.imageUrl} alt="" className="ranking-card-img" />
                        <div className="ranking-card-info">
                          <div className="ranking-card-title">{photo.title}</div>
                          <div className="ranking-card-score" style={{ color: info.color }}>{photo.totalScore}</div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        /* 리스트 보기 (전체 / TOP 10) */
        <div className="ranking-list">
          {displayPhotos.map((photo, idx) => {
            const rank = idx + 1;
            const medal = RANK_MEDALS[rank];
            const grade = getGrade(photo.totalScore);
            return (
              <div
                key={photo.id}
                className={`ranking-card ${medal?.class || ''}`}
                onClick={() => onPhotoClick(photo)}
              >
                <div className="ranking-card-rank-col">
                  {medal ? (
                    <span className="ranking-card-medal">{medal.emoji}</span>
                  ) : (
                    <span className="ranking-card-num">{rank}</span>
                  )}
                </div>
                <img src={photo.thumbnailUrl || photo.imageUrl} alt="" className="ranking-card-thumb" />
                <div className="ranking-card-detail">
                  <div className="ranking-card-title">{photo.title}</div>
                  <div className="ranking-card-tags">
                    {(photo.aiTags || []).slice(0, 3).map(tag => (
                      <span key={tag} className="ranking-card-tag">{tag}</span>
                    ))}
                  </div>
                </div>
                <div className="ranking-card-score-col">
                  <span className="ranking-card-grade" style={{ color: grade.color }}>{grade.label}</span>
                  <span className="ranking-card-score">{photo.totalScore}</span>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {rankedPhotos.length === 0 && (
        <div className="ranking-empty">
          <div style={{ fontSize: '48px', marginBottom: '16px' }}>🏆</div>
          <p>{period === 'all' ? '아직 AI 평가된 사진이 없습니다' : `${PERIODS.find(p => p.key === period)?.label} 업로드된 사진이 없습니다`}</p>
          <p style={{ fontSize: '12px', opacity: 0.5 }}>
            {period !== 'all' ? '다른 기간을 선택해보세요' : '갤러리에 사진을 업로드하면 자동으로 평가됩니다'}
          </p>
        </div>
      )}
    </div>
  );
}
