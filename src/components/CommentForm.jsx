import { useState } from 'react';
import { scoreLabels } from '../sampleData';

// SVG Star component - clean half-star support
function Star({ filled = 0, size = 20, onClick, onMouseMove }) {
  // filled: 0 = empty, 0.5 = half, 1 = full
  const color = '#fbbf24';
  const emptyColor = '#333';

  return (
    <svg
      width={size} height={size} viewBox="0 0 24 24"
      style={{ cursor: onClick ? 'pointer' : 'default', transition: 'transform 0.1s' }}
      onClick={onClick}
      onMouseMove={onMouseMove}
    >
      {/* Empty star background */}
      <path
        d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"
        fill={emptyColor}
        stroke="none"
      />
      {filled === 1 && (
        /* Full star */
        <path
          d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"
          fill={color}
          stroke="none"
        />
      )}
      {filled === 0.5 && (
        /* Half star - clip left half */
        <clipPath id={`half-${size}-${Math.random().toString(36).substr(2, 5)}`}>
          <rect x="0" y="0" width="12" height="24" />
        </clipPath>
      )}
      {filled === 0.5 && (
        <path
          d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"
          fill={color}
          stroke="none"
          clipPath="inset(0 50% 0 0)"
        />
      )}
    </svg>
  );
}

function StarRating({ value = 0, onChange, size = 20 }) {
  const [hoverValue, setHoverValue] = useState(0);
  const stars = [1, 2, 3, 4, 5];
  const displayValue = hoverValue || value;

  return (
    <div className="star-rating" onMouseLeave={() => setHoverValue(0)}>
      {stars.map(star => {
        const starScore = star * 2;
        const halfStarScore = (star - 0.5) * 2;
        const isFull = displayValue >= starScore;
        const isHalf = !isFull && displayValue >= halfStarScore;
        const filled = isFull ? 1 : isHalf ? 0.5 : 0;

        return (
          <span key={star} className="star-wrapper" style={{ display: 'inline-flex' }}>
            <Star
              filled={filled}
              size={size}
              onMouseMove={(e) => {
                const rect = e.currentTarget.getBoundingClientRect();
                const isLeftHalf = (e.clientX - rect.left) < rect.width / 2;
                setHoverValue(isLeftHalf ? (star - 0.5) * 2 : star * 2);
              }}
              onClick={(e) => {
                const rect = e.currentTarget.getBoundingClientRect();
                const isLeftHalf = (e.clientX - rect.left) < rect.width / 2;
                const newValue = isLeftHalf ? (star - 0.5) * 2 : star * 2;
                onChange(newValue === value ? 0 : newValue);
              }}
            />
          </span>
        );
      })}
      {value > 0 && (
        <span className="star-value">{value.toFixed(1)}</span>
      )}
    </div>
  );
}

function StarDisplay({ value = 0, size = 14 }) {
  const stars = [1, 2, 3, 4, 5];
  return (
    <span className="star-display">
      {stars.map(star => {
        const starScore = star * 2;
        const halfStarScore = (star - 0.5) * 2;
        const isFull = value >= starScore;
        const isHalf = !isFull && value >= halfStarScore;
        const filled = isFull ? 1 : isHalf ? 0.5 : 0;
        return (
          <span key={star} style={{ display: 'inline-flex' }}>
            <Star filled={filled} size={size} />
          </span>
        );
      })}
    </span>
  );
}

export { StarDisplay };

export default function CommentForm({ photoId, onSubmit, currentUser }) {
  const [author, setAuthor] = useState(currentUser?.displayName || currentUser?.email || '');
  const [text, setText] = useState('');
  const [overallRating, setOverallRating] = useState(0);
  const [showDetailScores, setShowDetailScores] = useState(false);
  const [scores, setScores] = useState({});

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!author.trim() || !text.trim()) return;

    onSubmit({
      author: author.trim(),
      authorUid: currentUser?.uid || '',
      text: text.trim(),
      overallRating,
      scores: showDetailScores ? scores : {},
      date: new Date().toISOString().split('T')[0]
    });

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
        readOnly={!!currentUser}
        style={currentUser ? { opacity: 0.6, cursor: 'default' } : {}}
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
