import { useMemo } from 'react';

const BADGES = [
  { id: 'first_upload', icon: '📷', name: '첫 업로드', desc: '첫 번째 사진 업로드', check: (stats) => stats.totalPhotos >= 1 },
  { id: 'five_uploads', icon: '🖼️', name: '컬렉터', desc: '사진 5장 업로드', check: (stats) => stats.totalPhotos >= 5 },
  { id: 'ten_uploads', icon: '📸', name: '사진작가', desc: '사진 10장 업로드', check: (stats) => stats.totalPhotos >= 10 },
  { id: 'twenty_uploads', icon: '🎞️', name: '프로 포토그래퍼', desc: '사진 20장 업로드', check: (stats) => stats.totalPhotos >= 20 },
  { id: 'first_s', icon: '⭐', name: '첫 S등급', desc: 'S등급(9.0+) 달성', check: (stats) => stats.sGrade >= 1 },
  { id: 'three_s', icon: '🌟', name: 'S등급 마스터', desc: 'S등급 3회 달성', check: (stats) => stats.sGrade >= 3 },
  { id: 'all_grades', icon: '🎓', name: '올라운더', desc: '모든 등급 경험', check: (stats) => stats.uniqueGrades >= 5 },
  { id: 'high_avg', icon: '👑', name: '평균 8점 이상', desc: '평균 AI 점수 8.0+', check: (stats) => stats.avgScore >= 8.0 && stats.scoredPhotos >= 3 },
  { id: 'perfect10', icon: '💎', name: '완벽한 10점', desc: '10.0 만점 획득', check: (stats) => stats.perfectScore },
  { id: 'first_comment', icon: '💬', name: '첫 크리틱', desc: '첫 번째 댓글 작성', check: (stats) => stats.comments >= 1 },
  { id: 'ten_comments', icon: '🗣️', name: '활발한 크리틱커', desc: '댓글 10개 작성', check: (stats) => stats.comments >= 10 },
  { id: 'diverse_tags', icon: '🏷️', name: '다양한 장르', desc: '5개 이상 태그 보유', check: (stats) => stats.uniqueTags >= 5 },
  { id: 'consistent', icon: '🔥', name: '꾸준함', desc: '5일 이상 업로드', check: (stats) => stats.uploadDays >= 5 },
  { id: 'top3', icon: '🏆', name: 'TOP 3', desc: 'AI 점수 상위 3위 안에 들기', check: (stats) => stats.isTop3 },
  { id: 'night_owl', icon: '🦉', name: '야행성', desc: '밤 10시 이후 업로드', check: (stats) => stats.nightUpload },
  { id: 'early_bird', icon: '🐦', name: '얼리버드', desc: '오전 6시 이전 업로드', check: (stats) => stats.earlyUpload },
];

export default function Achievements({ photos, currentUser }) {
  const stats = useMemo(() => {
    const myPhotos = currentUser
      ? photos.filter(p => p.uploaderUid === currentUser.uid)
      : photos;

    const scored = myPhotos.filter(p => p.aiEvaluated && p.totalScore > 0);
    const grades = new Set();
    let sGrade = 0;
    let perfectScore = false;

    scored.forEach(p => {
      const s = p.totalScore;
      if (s >= 9) { grades.add('S'); sGrade++; }
      else if (s >= 8) grades.add('A');
      else if (s >= 7) grades.add('B');
      else if (s >= 6) grades.add('C');
      else if (s >= 5) grades.add('D');
      else grades.add('F');
      if (s >= 10) perfectScore = true;
    });

    const allScored = photos.filter(p => p.aiEvaluated && p.totalScore > 0).sort((a, b) => b.totalScore - a.totalScore);
    const isTop3 = allScored.slice(0, 3).some(p => currentUser && p.uploaderUid === currentUser.uid);

    const allTags = new Set();
    myPhotos.forEach(p => (p.aiTags || []).forEach(t => allTags.add(t)));

    const uploadDates = new Set();
    myPhotos.forEach(p => {
      if (p.date) uploadDates.add(p.date);
    });

    let nightUpload = false;
    let earlyUpload = false;
    let comments = 0;
    myPhotos.forEach(p => {
      const ts = p.createdAt?.seconds;
      if (ts) {
        const hour = new Date(ts * 1000).getHours();
        if (hour >= 22 || hour < 2) nightUpload = true;
        if (hour >= 4 && hour < 6) earlyUpload = true;
      }
    });

    // Count comments by current user across all photos
    photos.forEach(p => {
      (p.comments || []).forEach(c => {
        if (currentUser && c.authorUid === currentUser.uid) comments++;
      });
    });

    return {
      totalPhotos: myPhotos.length,
      scoredPhotos: scored.length,
      sGrade,
      uniqueGrades: grades.size,
      avgScore: scored.length > 0 ? scored.reduce((s, p) => s + p.totalScore, 0) / scored.length : 0,
      perfectScore,
      comments,
      uniqueTags: allTags.size,
      uploadDays: uploadDates.size,
      isTop3,
      nightUpload,
      earlyUpload,
    };
  }, [photos, currentUser]);

  const earned = BADGES.filter(b => b.check(stats));
  const locked = BADGES.filter(b => !b.check(stats));

  return (
    <div className="achievements-container">
      <div className="achievements-summary">
        <div className="achievements-count">
          <span className="achievements-count-num">{earned.length}</span>
          <span className="achievements-count-total">/ {BADGES.length}</span>
        </div>
        <div className="achievements-progress-bar">
          <div className="achievements-progress-fill" style={{ width: `${(earned.length / BADGES.length) * 100}%` }} />
        </div>
      </div>

      {earned.length > 0 && (
        <div className="achievements-section">
          <div className="achievements-section-title">획득한 업적 ({earned.length})</div>
          <div className="achievements-grid">
            {earned.map(b => (
              <div key={b.id} className="achievement-card earned">
                <div className="achievement-icon">{b.icon}</div>
                <div className="achievement-name">{b.name}</div>
                <div className="achievement-desc">{b.desc}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="achievements-section">
        <div className="achievements-section-title">미획득 ({locked.length})</div>
        <div className="achievements-grid">
          {locked.map(b => (
            <div key={b.id} className="achievement-card locked">
              <div className="achievement-icon locked">🔒</div>
              <div className="achievement-name">{b.name}</div>
              <div className="achievement-desc">{b.desc}</div>
            </div>
          ))}
        </div>
      </div>

      <div className="achievements-stats">
        <div className="achievements-stats-title">내 통계</div>
        <div className="achievements-stats-grid">
          <div className="stat-item"><span className="stat-num">{stats.totalPhotos}</span><span className="stat-label">업로드</span></div>
          <div className="stat-item"><span className="stat-num">{stats.avgScore > 0 ? stats.avgScore.toFixed(1) : '-'}</span><span className="stat-label">평균 점수</span></div>
          <div className="stat-item"><span className="stat-num">{stats.sGrade}</span><span className="stat-label">S등급</span></div>
          <div className="stat-item"><span className="stat-num">{stats.comments}</span><span className="stat-label">댓글</span></div>
          <div className="stat-item"><span className="stat-num">{stats.uniqueTags}</span><span className="stat-label">태그</span></div>
          <div className="stat-item"><span className="stat-num">{stats.uploadDays}</span><span className="stat-label">활동일</span></div>
        </div>
      </div>
    </div>
  );
}
