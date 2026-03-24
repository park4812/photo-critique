import { useState } from 'react';
import PhotoQuiz from './PhotoQuiz';
import PhotoBattle from './PhotoBattle';
import Challenge from './Challenge';
import Achievements from './Achievements';

const MODES = [
  { id: 'quiz', label: 'AI 퀴즈', icon: '🧠', desc: 'AI와 안목 대결' },
  { id: 'battle', label: '포토 배틀', icon: '⚔️', desc: '1:1 사진 대결' },
  { id: 'challenge', label: '챌린지', icon: '🎯', desc: '오늘의 주제' },
  { id: 'achievements', label: '업적', icon: '🏅', desc: '나의 뱃지' },
];

export default function Playground({ photos, onPhotoClick, currentUser }) {
  const [mode, setMode] = useState(null);

  if (!mode) {
    return (
      <div className="playground-container">
        <div className="playground-header">
          <h2 className="playground-title">놀이터</h2>
          <p className="playground-subtitle">사진으로 즐기는 다양한 활동</p>
        </div>
        <div className="playground-grid">
          {MODES.map(m => (
            <div key={m.id} className="playground-card" onClick={() => setMode(m.id)}>
              <div className="playground-card-icon">{m.icon}</div>
              <div className="playground-card-label">{m.label}</div>
              <div className="playground-card-desc">{m.desc}</div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="playground-container">
      <button className="playground-back" onClick={() => setMode(null)}>
        ← 놀이터로 돌아가기
      </button>
      {mode === 'quiz' && <PhotoQuiz photos={photos} currentUser={currentUser} />}
      {mode === 'battle' && <PhotoBattle photos={photos} onPhotoClick={onPhotoClick} currentUser={currentUser} />}
      {mode === 'challenge' && <Challenge photos={photos} onPhotoClick={onPhotoClick} currentUser={currentUser} />}
      {mode === 'achievements' && <Achievements photos={photos} currentUser={currentUser} />}
    </div>
  );
}
