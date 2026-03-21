import { useState } from 'react';
import { scoreLabels } from '../sampleData';

export default function CommentForm({ photoId, onSubmit }) {
  const [author, setAuthor] = useState('');
  const [text, setText] = useState('');
  const [showScores, setShowScores] = useState(false);
  const [scores, setScores] = useState({});

  const handleScoreChange = (key, value) => {
    const num = parseFloat(value);
    if (value === '') {
      const next = { ...scores };
      delete next[key];
      setScores(next);
    } else if (!isNaN(num) && num >= 0 && num <= 10) {
      setScores(prev => ({ ...prev, [key]: num }));
    }
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!author.trim() || !text.trim()) return;

    onSubmit({
      author: author.trim(),
      text: text.trim(),
      scores: showScores ? scores : {},
      date: new Date().toISOString().split('T')[0]
    });

    setAuthor('');
    setText('');
    setScores({});
    setShowScores(false);
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

      <div style={{ marginBottom: '12px' }}>
        <label style={{
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          fontSize: '12px',
          color: 'var(--text-secondary)',
          cursor: 'pointer'
        }}>
          <input
            type="checkbox"
            checked={showScores}
            onChange={e => setShowScores(e.target.checked)}
            style={{ accentColor: 'var(--accent)' }}
          />
          항목별 점수도 매기기
        </label>
      </div>

      {showScores && (
        <div className="comment-scores-input">
          {Object.entries(scoreLabels).map(([key, label]) => (
            <div key={key} className="comment-score-input-row">
              <span className="comment-score-input-label">{label.ko}</span>
              <input
                type="number"
                className="comment-score-input"
                min="0" max="10" step="0.5"
                placeholder="-"
                value={scores[key] ?? ''}
                onChange={e => handleScoreChange(key, e.target.value)}
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
