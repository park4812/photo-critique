import { useState } from 'react';
import { scoreLabels } from '../sampleData';

function StarRating({ value = 0, onChange, size = 20 }) {
  const [hoverValue, setHoverValue] = useState(0);
  const stars = [1, 2, 3, 4, 5];
  const displayValue = hoverValue || value;

  const handleClick = (starIndex, isHalf) => {
    const newValue = isHalf ? (starIndex - 0.5) * 2 : starIndex * 2; // Convert to 0-10 scale
    onChange(newValue === value ? 0 : newValue);
  };

  const handleMouseMove = (starIndex, e) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const isLeftHalf = (e.clientX - rect.left) < rect.width / 2;
    setHoverValue(isLeftHalf ? (starIndex - 0.5) * 2 : starIndex * 2);
  };

  return (
    <div className="star-rating" onMouseLeave={() => setHoverValue(0)}>
      {stars.map(star => {
        const starScore = star * 2; // Each star = 2 points
        const halfStarScore = (star - 0.5) * 2;
        const isFull = displayValue >= starScore;
        const isHalf = !isFull && displayValue >= halfStarScore;

        return (
          <span
            key={star}
            className={`star ${isFull ? 'star-full' : isHalf ? 'star-half' : 'star-empty'}`}
            style={{ fontSize: `${size}px`, cursor: 'pointer' }}
            onMouseMove={(e) => handleMouseMove(star, e)}
            onClick={(e) => {
              const rect = e.currentTarget.getBoundingClientRect();
              const isLeftHalf = (e.clientX - rect.left) < rect.width / 2;
              handleClick(star, isLeftHalf);
            }}
          >
            {isFull ? '★' : isHalf ? '⯨' : '☆'}
          </span>
        );
      })}
      {value > 0 && (
        <span className="star-value">{value.toFixed(1)}</span>
      )}
    </div>
  );
}

// Simpler star display for half-star using CSS overlay
function StarDisplay({ value = 0, size = 14 }) {
  const stars = [1, 2, 3, 4, 5];
  return (
    <span className="star-display">
      {stars.map(star => {
        const starScore = star * 2;
        const halfStarScore = (star - 0.5) * 2;
        const isFull = value >= starScore;
        const isHalf = !isFull && value >= halfStarScore;
        return (
          <span key={star} style={{ fontSize: `${size}px` }}
            className={isFull ? 'star-full' : isHalf ? 'star-half' : 'star-empty'}>
            {isFull ? '★' : isHalf ? '⯨' : '☆'}
          </span>
        );
      })}
    </span>
  );
}

export { StarDisplay };

export default function CommentForm({ photoId, onSubmit }) {
  const [author, setAuthor] = useState('');
  const [text, setText] = useState('');
  const [overallRating, setOverallRating] = useState(0);
  const [showDetailScores, setShowDetailScores] = useState(false);
  const [scores, setScores] = useState({});

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!author.trim() || !text.trim()) return;

    onSubmit({
      author: author.trim(),
      text: text.trim(),
      overallRating,
      scores: showDetailScores ? scores : {},
      date: new Date().toISOString().split('T')[0]
    });

    setAuthor('');
    setText('');
    setOverallRating(0);
    setScores({});
    setShowDetailScores(false);
  };

  return (
    <form className="comment-form" onSubmit={handleSubmit}>
      <div className="comment-form-title">크리틱 남기기</div>

      <input
        className="comment-name-input"
        placeholder="이름"
        value={author}
        onChange={e => setAuthor(e.target.value)}
      />

      <textarea
        className="comment-textarea"
        placeholder="이 사진에 대한 크리틱을 남겨주세요..."
        value={text}
        onChange={e => setText(e.target.value)}
      />

      {/* Overall Star Rating */}
      <div className="comment-rating-section">
        <span className="comment-rating-label">별점</span>
        <StarRating value={overallRating} onChange={setOverallRating} size={24} />
      </div>

      {/* Detailed Scores Toggle */}
      <div style={{ marginBottom: '12px' }}>
        <label style={{
          display: 'flex', alignItems: 'center', gap: '8px',
          fontSize: '12px', color: 'var(--text-secondary)', cursor: 'pointer'
        }}>
          <input
            type="checkbox"
            checked={showDetailScores}
            onChange={e => setShowDetailScores(e.target.checked)}
            style={{ accentColor: 'var(--accent)' }}
          />
          항목별 세부 평점 매기기
        </label>
      </div>

      {showDetailScores && (
        <div className="comment-detail-scores">
          {Object.entries(scoreLabels).map(([key, label]) => (
            <div key={key} className="comment-detail-score-row">
              <span className="comment-detail-score-label">
                {label.icon} {label.ko}
              </span>
              <StarRating
                value={scores[key] || 0}
                onChange={(val) => setScores(prev => ({ ...prev, [key]: val }))}
                size={18}
              />
            </div>
          ))}
        </div>
      )}

      <button type="submit" className="comment-submit">
        크리틱 등록
      </button>
    </form>
  );
}
