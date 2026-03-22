import { useState } from 'react';
import { scoreLabels } from '../sampleData';
import CommentForm from './CommentForm';

function getScoreColor(score) {
  if (score >= 7) return '#4ade80';
  if (score >= 5) return '#fbbf24';
  return '#f87171';
}

function getScoreClass(score) {
  if (score >= 7) return 'score-high';
  if (score >= 5) return 'score-mid';
  return 'score-low';
}

export default function SidePanel({ photo, isOpen, onClose, onAddComment, onReEvaluate, isAdmin, onDeletePhoto }) {
  const [activeTab, setActiveTab] = useState('critique');
  const [reEvalLoading, setReEvalLoading] = useState(false);

  if (!photo) return <div className={`side-panel ${isOpen ? 'open' : ''}`}></div>;

  const comments = photo.comments || [];
  const aiStatus = photo.aiStatus || (photo.aiEvaluated ? 'done' : 'none');
  const isPending = aiStatus === 'pending' || aiStatus === 'processing';

  const handleReEvaluate = async () => {
    if (!onReEvaluate) return;
    setReEvalLoading(true);
    try {
      await onReEvaluate(photo.id);
    } catch (err) {
      console.error('Re-evaluate failed:', err);
    }
    setReEvalLoading(false);
  };

  return (
    <div className={`side-panel ${isOpen ? 'open' : ''}`}>
      <div className="panel-header">
        <span className="panel-title">{photo.title}</span>
        <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
          {isAdmin && (
            <button
              className="panel-delete-btn"
              onClick={() => {
                if (window.confirm('이 사진을 삭제하시겠습니까?')) {
                  onDeletePhoto(photo.id);
                }
              }}
              title="사진 삭제"
            >
              🗑
            </button>
          )}
          <button className="panel-close" onClick={onClose}>&times;</button>
        </div>
      </div>

      <img className="panel-image" src={photo.imageUrl} alt={photo.title} />

      <div className="panel-content">
        {/* AI Status Banner */}
        {isPending && (
          <div style={{
            padding: '10px 14px',
            background: 'rgba(200, 168, 110, 0.1)',
            border: '1px solid rgba(200, 168, 110, 0.2)',
            borderRadius: '8px',
            marginBottom: '16px',
            display: 'flex',
            alignItems: 'center',
            gap: '10px'
          }}>
            <div style={{
              width: '16px', height: '16px', border: '2px solid var(--accent)',
              borderTopColor: 'transparent', borderRadius: '50%',
              animation: 'spin 1s linear infinite'
            }} />
            <div>
              <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--accent)' }}>
                AI 평가 진행 중
              </div>
              <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                Cloud Function이 사진을 분석하고 있습니다. 완료되면 자동 업데이트됩니다.
              </div>
            </div>
          </div>
        )}

        {photo.aiError && (
          <div style={{
            padding: '10px 14px',
            background: 'rgba(248, 113, 113, 0.1)',
            border: '1px solid rgba(248, 113, 113, 0.2)',
            borderRadius: '8px',
            marginBottom: '16px'
          }}>
            <div style={{ fontSize: '13px', fontWeight: 600, color: '#f87171' }}>
              AI 평가 실패
            </div>
            <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginBottom: '8px' }}>
              {photo.aiError}
            </div>
            {onReEvaluate && (
              <button
                onClick={handleReEvaluate}
                disabled={reEvalLoading}
                style={{
                  padding: '6px 12px', fontSize: '12px', fontWeight: 600,
                  background: 'var(--accent)', color: '#000', border: 'none',
                  borderRadius: '4px', cursor: 'pointer'
                }}
              >
                {reEvalLoading ? '재평가 중...' : '재평가'}
              </button>
            )}
          </div>
        )}

        {/* Total Score */}
        <div className="score-section">
          <div className="score-total">
            <span className={`score-total-number ${getScoreClass(photo.totalScore)}`}>
              {photo.totalScore.toFixed(1)}
            </span>
            <div>
              <div className="score-total-label">종합 점수</div>
              <div style={{ fontSize: '11px', color: '#555', display: 'flex', alignItems: 'center', gap: '6px' }}>
                7항목 평균
                {photo.aiEvaluated && (
                  <span style={{
                    padding: '1px 6px', background: 'rgba(200, 168, 110, 0.15)',
                    borderRadius: '4px', fontSize: '10px', color: 'var(--accent)'
                  }}>AI</span>
                )}
              </div>
            </div>
            {onReEvaluate && photo.aiEvaluated && !isPending && (
              <button
                onClick={handleReEvaluate}
                disabled={reEvalLoading}
                style={{
                  marginLeft: 'auto', padding: '4px 10px', fontSize: '11px',
                  background: 'transparent', border: '1px solid var(--border-light)',
                  borderRadius: '4px', color: 'var(--text-secondary)', cursor: 'pointer'
                }}
              >
                {reEvalLoading ? '...' : '재평가'}
              </button>
            )}
          </div>

          <div className="score-bars">
            {Object.entries(photo.scores).map(([key, val]) => (
              <div key={key} className="score-bar-row">
                <span className="score-bar-label">{scoreLabels[key]?.ko}</span>
                <div className="score-bar-track">
                  <div
                    className="score-bar-fill"
                    style={{ width: `${val * 10}%`, background: getScoreColor(val) }}
                  />
                </div>
                <span className="score-bar-value" style={{ color: getScoreColor(val) }}>
                  {val.toFixed(1)}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Tags */}
        {photo.tags && photo.tags.length > 0 && (
          <div className="tags">
            {photo.tags.map(tag => <span key={tag} className="tag">#{tag}</span>)}
          </div>
        )}

        {/* Tab Switch */}
        <div style={{
          display: 'flex', gap: '2px', marginBottom: '16px',
          background: 'var(--bg)', borderRadius: '8px', padding: '3px'
        }}>
          <button
            onClick={() => setActiveTab('critique')}
            style={{
              flex: 1, padding: '8px', border: 'none', borderRadius: '6px',
              background: activeTab === 'critique' ? 'var(--bg-hover)' : 'transparent',
              color: activeTab === 'critique' ? 'var(--text)' : 'var(--text-muted)',
              fontSize: '13px', fontWeight: activeTab === 'critique' ? 600 : 400, cursor: 'pointer'
            }}
          >
            AI 크리틱
          </button>
          <button
            onClick={() => setActiveTab('comments')}
            style={{
              flex: 1, padding: '8px', border: 'none', borderRadius: '6px',
              background: activeTab === 'comments' ? 'var(--bg-hover)' : 'transparent',
              color: activeTab === 'comments' ? 'var(--text)' : 'var(--text-muted)',
              fontSize: '13px', fontWeight: activeTab === 'comments' ? 600 : 400, cursor: 'pointer'
            }}
          >
            개인 크리틱 ({comments.length})
          </button>
        </div>

        {/* Critique Tab */}
        {activeTab === 'critique' && (
          <>
            {photo.critique ? (
              <>
                <div className="critique-section">
                  <div className="section-title">요약</div>
                  <p className="critique-summary">{photo.critique.summary}</p>
                </div>

                {photo.critique.strengths?.length > 0 && (
                  <div className="critique-section">
                    <div className="section-title">강점</div>
                    <ul className="critique-list strengths">
                      {photo.critique.strengths.map((s, i) => <li key={i}>{s}</li>)}
                    </ul>
                  </div>
                )}

                {photo.critique.improvements?.length > 0 && (
                  <div className="critique-section">
                    <div className="section-title">개선점</div>
                    <ul className="critique-list improvements">
                      {photo.critique.improvements.map((s, i) => <li key={i}>{s}</li>)}
                    </ul>
                  </div>
                )}

                {photo.critique.technicalNotes && (
                  <div className="critique-section">
                    <div className="section-title">테크니컬 노트</div>
                    <div className="technical-note">{photo.critique.technicalNotes}</div>
                  </div>
                )}

                {photo.aiModel && (
                  <div style={{
                    fontSize: '11px', color: 'var(--text-muted)',
                    textAlign: 'right', marginTop: '8px'
                  }}>
                    평가 모델: {photo.aiModel}
                  </div>
                )}
              </>
            ) : (
              <div style={{
                padding: '40px 20px', textAlign: 'center',
                color: 'var(--text-muted)', fontSize: '13px'
              }}>
                {isPending
                  ? 'AI가 사진을 분석하고 있습니다...'
                  : '아직 크리틱이 없습니다'}
              </div>
            )}
          </>
        )}

        {/* Comments Tab */}
        {activeTab === 'comments' && (
          <div className="comments-section">
            {comments.map((c, i) => (
              <div key={i} className="comment-card">
                <div className="comment-header">
                  <span className="comment-author">{c.author}</span>
                  <span className="comment-date">{c.date}</span>
                </div>
                {c.scores && Object.keys(c.scores).length > 0 && (
                  <div className="comment-scores">
                    {Object.entries(c.scores).map(([key, val]) => (
                      <span key={key} className="comment-score-chip">
                        {scoreLabels[key]?.ko} {val}
                      </span>
                    ))}
                  </div>
                )}
                <p className="comment-text">{c.text}</p>
              </div>
            ))}

            <CommentForm
              photoId={photo.id}
              onSubmit={(comment) => onAddComment(photo.id, comment)}
            />
          </div>
        )}
      </div>

      <style>{`
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}
