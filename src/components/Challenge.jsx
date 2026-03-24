import { useState, useMemo } from 'react';

const CHALLENGE_TOPICS = [
  { theme: '그림자', desc: '빛과 그림자의 대비를 표현하세요', icon: '🌗' },
  { theme: '미니멀', desc: '단순함 속의 아름다움', icon: '⬜' },
  { theme: '자연', desc: '자연 속 순간을 포착하세요', icon: '🌿' },
  { theme: '도시', desc: '도시의 일상을 담아보세요', icon: '🏙️' },
  { theme: '컬러', desc: '인상적인 색감을 찾아보세요', icon: '🎨' },
  { theme: '대칭', desc: '균형과 대칭의 미학', icon: '🪞' },
  { theme: '물', desc: '물이 있는 풍경을 담아보세요', icon: '💧' },
  { theme: '야경', desc: '밤의 아름다움을 포착하세요', icon: '🌙' },
  { theme: '질감', desc: '재미있는 질감과 텍스처', icon: '🧱' },
  { theme: '반영', desc: '거울, 유리, 물의 반사', icon: '🔮' },
  { theme: '음식', desc: '맛있어 보이는 사진 한 장', icon: '🍽️' },
  { theme: '움직임', desc: '동적인 순간을 포착하세요', icon: '💨' },
  { theme: '패턴', desc: '반복되는 패턴을 찾아보세요', icon: '🔄' },
  { theme: '따뜻함', desc: '따뜻한 느낌이 나는 사진', icon: '☀️' },
];

function getDayOfYear() {
  const now = new Date();
  const start = new Date(now.getFullYear(), 0, 0);
  return Math.floor((now - start) / 86400000);
}

function getWeekOfYear() {
  return Math.floor(getDayOfYear() / 7);
}

export default function Challenge({ photos, onPhotoClick }) {
  const [tab, setTab] = useState('daily');

  const dailyChallenge = CHALLENGE_TOPICS[getDayOfYear() % CHALLENGE_TOPICS.length];
  const weeklyChallenge = CHALLENGE_TOPICS[(getWeekOfYear() + 7) % CHALLENGE_TOPICS.length];

  const challenge = tab === 'daily' ? dailyChallenge : weeklyChallenge;

  // Find matching photos by tags or title keywords
  const matchingPhotos = useMemo(() => {
    const theme = challenge.theme.toLowerCase();
    return photos.filter(p => {
      const tags = (p.aiTags || []).join(' ').toLowerCase();
      const title = (p.title || '').toLowerCase();
      const critique = (p.aiCritique?.summary || '').toLowerCase();
      return tags.includes(theme) || title.includes(theme) || critique.includes(theme);
    }).sort((a, b) => (b.totalScore || 0) - (a.totalScore || 0));
  }, [photos, challenge.theme]);

  const daysLeft = tab === 'daily' ? 0 : (7 - (getDayOfYear() % 7));

  return (
    <div className="challenge-container">
      <div className="challenge-tabs">
        <button className={`challenge-tab ${tab === 'daily' ? 'active' : ''}`} onClick={() => setTab('daily')}>
          오늘의 챌린지
        </button>
        <button className={`challenge-tab ${tab === 'weekly' ? 'active' : ''}`} onClick={() => setTab('weekly')}>
          이번 주 챌린지
        </button>
      </div>

      <div className="challenge-card">
        <div className="challenge-icon">{challenge.icon}</div>
        <div className="challenge-theme">{challenge.theme}</div>
        <div className="challenge-desc">{challenge.desc}</div>
        {tab === 'weekly' && <div className="challenge-timer">남은 기간: {daysLeft}일</div>}
      </div>

      <div className="challenge-section">
        <div className="challenge-section-title">
          관련 사진 {matchingPhotos.length > 0 ? `(${matchingPhotos.length}장)` : ''}
        </div>
        {matchingPhotos.length > 0 ? (
          <div className="challenge-grid">
            {matchingPhotos.map(p => (
              <div key={p.id} className="challenge-photo" onClick={() => onPhotoClick(p)}>
                <img src={p.thumbnailUrl || p.imageUrl} alt="" />
                {p.totalScore > 0 && <span className="challenge-photo-score">{p.totalScore}</span>}
              </div>
            ))}
          </div>
        ) : (
          <div className="challenge-empty-hint">
            아직 이 주제와 관련된 사진이 없습니다.<br />
            사진을 업로드해서 챌린지에 참여해보세요! 📸
          </div>
        )}
      </div>

      <div className="challenge-upcoming">
        <div className="challenge-section-title">다가오는 주제</div>
        <div className="challenge-upcoming-list">
          {[1, 2, 3].map(offset => {
            const future = tab === 'daily'
              ? CHALLENGE_TOPICS[(getDayOfYear() + offset) % CHALLENGE_TOPICS.length]
              : CHALLENGE_TOPICS[(getWeekOfYear() + 7 + offset) % CHALLENGE_TOPICS.length];
            return (
              <div key={offset} className="challenge-upcoming-item">
                <span className="challenge-upcoming-icon">{future.icon}</span>
                <span className="challenge-upcoming-theme">{future.theme}</span>
                <span className="challenge-upcoming-when">
                  {tab === 'daily' ? `${offset}일 후` : `${offset}주 후`}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
