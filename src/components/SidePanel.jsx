import { useState } from 'react';
import { scoreLabels } from '../sampleData';
import CommentForm, { StarDisplay } from './CommentForm';

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

const AI_COLORS = {
  'Claude': '#d4a574',
  'GPT-4': '#74b9ff',
  'Gemini': '#a29bfe',
  '진행자': '#888',
};

function DebateView({ debate, individualEvaluations }) {
  const evals = individualEvaluations || {};

  return (
    <div className="debate-view">
      {/* Individual Scores Comparison */}
      {(evals.claude || evals.gpt || evals.gemini) && (
        <div className="debate-scores-compare">
          <div className="section-title">개별 AI 점수 비교</div>
          <table className="score-compare-table">
            <thead>
              <tr>
                <th></th>
                {evals.claude && <th style={{ color: AI_COLORS['Claude'] }}>Claude</th>}
                {evals.gpt && <th style={{ color: AI_COLORS['GPT-4'] }}>GPT-4</th>}
                {evals.gemini && <th style={{ color: AI_COLORS['Gemini'] }}>Gemini</th>}
              </tr>
            </thead>
            <tbody>
              {Object.keys(scoreLabels).map(key => (
                <tr key={key}>
                  <td className="compare-label">{scoreLabels[key]?.ko}</td>
                  {evals.claude?.scores && (
                    <td style={{ color: getScoreColor(evals.claude.scores[key]) }}>
                      {evals.claude.scores[key]?.toFixed(1) || '-'}
                    </td>
                  )}
                  {evals.gpt?.scores && (
                    <td style={{ color: getScoreColor(evals.gpt.scores[key]) }}>
                      {evals.gpt.scores[key]?.toFixed(1) || '-'}
                    </td>
                  )}
                  {evals.gemini?.scores && (
                    <td style={{ color: getScoreColor(evals.gemini.scores[key]) }}>
                      {evals.gemini.scores[key]?.toFixed(1) || '-'}
                    </td>
                  )}
                </tr>
              ))}
              <tr className="compare-total-row">
                <td className="compare-label" style={{ fontWeight: 700 }}>종합</td>
                {evals.claude && (
                  <td style={{ fontWeight: 700, color: getScoreColor(evals.claude.totalScore) }}>
                    {evals.claude.totalScore?.toFixed(1) || '-'}
                  </td>
                )}
                {evals.gpt && (
                  <td style={{ fontWeight: 700, color: getScoreColor(evals.gpt.totalScore) }}>
                    {evals.gpt.totalScore?.toFixed(1) || '-'}
                  </td>
                )}
                {evals.gemini && (
                  <td style={{ fontWeight: 700, color: getScoreColor(evals.gemini.totalScore) }}>
                    {evals.gemini.totalScore?.toFixed(1) || '-'}
                  </td>
                )}
              </tr>
            </tbody>
          </table>
        </div>
      )}

      {/* Debate Transcript */}
      {debate && debate.length > 0 && (
        <div className="debate-transcript">
          <div className="section-title">AI 토론 과정</div>
          <div className="debate-messages">
            {debate.map((msg, i) => (
              <div key={i} className="debate-message">
                <div className="debate-speaker" style={{ color: AI_COLORS[msg.speaker] || '#888' }}>
                  <span className="debate-avatar" style={{
                    background: AI_COLORS[msg.speaker] || '#888'
                  }}>
                    {msg.speaker === '진행자' ? '🎙' :
                     msg.speaker === 'Claude' ? 'C' :
                     msg.speaker === 'GPT-4' ? 'G' : 'Ge'}
                  </span>
                  {msg.speaker}
                </div>
                <div className="debate-text">{msg.text}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {!debate && !individualEvaluations && (
        <div style={{
          padding: '40px 20px', textAlign: 'center',
          color: 'var(--text-muted)', fontSize: '13px'
        }}>
          토론 평가가 진행되면 여기에 표시됩니다.<br />
          Firebase 연결 후 "AI 토론 평가" 버튼으로 시작할 수 있습니다.
        </div>
      )}
    </div>
  );
}

export default function SidePanel({ photo, isOpen, onClose, onAddComment, onReEvaluate, onDebateEvaluate, isAdmin, onDeletePhoto }) {
  const [activeTab, setActiveTab] = useState('critique');
  const [reEvalLoading, setReEvalLoading] = useState(false);
  const [debateLoading, setDebateLoading] = useState(false);

  if (!photo) return <div className={`side-panel ${isOpen ? 'open' : ''}`}></div>;

  const comments = photo.comments || [];
  const aiStatus = photo.aiStatus || (photo.aiEvaluated ? 'done' : 'none');
  const isPending = aiStatus === 'pending' || aiStatus === 'processing';
  const hasDebate = photo.debate || photo.individualEvaluations;
  const isDebateModel = photo.aiModel === 'multi-ai-debate';

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

  const handleDebateEvaluate = async () => {
    if (!onDebateEvaluate) return;
    setDebateLoading(true);
    try {
      await onDebateEvaluate(photo.id);
    } catch (err) {
      console.error('Debate evaluate failed:', err);
    }
    setDebateLoading(false);
  };

  const tabs = [
    { key: 'critique', label: isDebateModel ? '합의 결과' : 'AI 크리틱' },
    ...(hasDebate ? [{ key: 'debate', label: 'AI 토론' }] : []),
    { key: 'comments', label: `개인 크리틱 (${comments.length})` },
  ];

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
            borderRadius: '8px', marginBottom: '16px',
            display: 'flex', alignItems: 'center', gap: '10px'
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
                Cloud Function이 사진을 분석하고 있습니다.
              </div>
            </div>
          </div>
        )}

        {photo.debateStatus === 'processing' && (
          <div style={{
            padding: '10px 14px',
            background: 'rgba(162, 155, 254, 0.1)',
            border: '1px solid rgba(162, 155, 254, 0.2)',
            borderRadius: '8px', marginBottom: '16px',
            display: 'flex', alignItems: 'center', gap: '10px'
          }}>
            <div style={{
              width: '16px', height: '16px', border: '2px solid #a29bfe',
              borderTopColor: 'transparent', borderRadius: '50%',
              animation: 'spin 1s linear infinite'
            }} />
            <div>
              <div style={{ fontSize: '13px', fontWeight: 600, color: '#a29bfe' }}>
                AI 토론 진행 중
              </div>
              <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                Claude, GPT-4, Gemini가 토론하고 있습니다...
              </div>
            </div>
          </div>
        )}

        {photo.aiError && (
          <div style={{
            padding: '10px 14px',
            background: 'rgba(248, 113, 113, 0.1)',
            border: '1px solid rgba(248, 113, 113, 0.2)',
            borderRadius: '8px', marginBottom: '16px'
          }}>
            <div style={{ fontSize: '13px', fontWeight: 600, color: '#f87171' }}>AI 평가 실패</div>
            <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginBottom: '8px' }}>{photo.aiError}</div>
            {onReEvaluate && (
              <button onClick={handleReEvaluate} disabled={reEvalLoading}
                style={{ padding: '6px 12px', fontSize: '12px', fontWeight: 600, background: 'var(--accent)', color: '#000', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>
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
                {isDebateModel ? (
                  <span style={{
                    padding: '1px 6px', background: 'rgba(162, 155, 254, 0.15)',
                    borderRadius: '4px', fontSize: '10px', color: '#a29bfe'
                  }}>3-AI 합의</span>
                ) : photo.aiEvaluated ? (
                  <span style={{
                    padding: '1px 6px', background: 'rgba(200, 168, 110, 0.15)',
                    borderRadius: '4px', fontSize: '10px', color: 'var(--accent)'
                  }}>AI</span>
                ) : null}
              </div>
            </div>
            {photo.aiEvaluated && !isPending && (
              <div style={{ marginLeft: 'auto', display: 'flex', gap: '4px' }}>
                {onDebateEvaluate && !isDebateModel && photo.debateStatus !== 'processing' && (
                  <button onClick={handleDebateEvaluate} disabled={debateLoading}
                    style={{ padding: '4px 10px', fontSize: '11px', background: 'rgba(162, 155, 254, 0.15)', border: '1px solid rgba(162, 155, 254, 0.3)', borderRadius: '4px', color: '#a29bfe', cursor: 'pointer', whiteSpace: 'nowrap' }}>
                    {debateLoading ? '...' : '3-AI 토론'}
                  </button>
                )}
                {onReEvaluate && (
                  <button onClick={handleReEvaluate} disabled={reEvalLoading}
                    style={{ padding: '4px 10px', fontSize: '11px', background: 'transparent', border: '1px solid var(--border-light)', borderRadius: '4px', color: 'var(--text-secondary)', cursor: 'pointer' }}>
                    {reEvalLoading ? '...' : '재평가'}
                  </button>
                )}
              </div>
            )}
          </div>

          <div className="score-bars">
            {Object.entries(photo.scores).map(([key, val]) => (
              <div key={key} className="score-bar-row">
                <span className="score-bar-label">{scoreLabels[key]?.ko}</span>
                <div className="score-bar-track">
                  <div className="score-bar-fill" style={{ width: `${val * 10}%`, background: getScoreColor(val) }} />
                </div>
                <span className="score-bar-value" style={{ color: getScoreColor(val) }}>{val.toFixed(1)}</span>
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
          {tabs.map(tab => (
            <button key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              style={{
                flex: 1, padding: '8px', border: 'none', borderRadius: '6px',
                background: activeTab === tab.key ? 'var(--bg-hover)' : 'transparent',
                color: activeTab === tab.key ? 'var(--text)' : 'var(--text-muted)',
                fontSize: '12px', fontWeight: activeTab === tab.key ? 600 : 400, cursor: 'pointer',
                whiteSpace: 'nowrap'
              }}
            >
              {tab.label}
            </button>
          ))}
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
                  <div style={{ fontSize: '11px', color: 'var(--text-muted)', textAlign: 'right', marginTop: '8px' }}>
                    평가: {photo.aiModel === 'multi-ai-debate' ? 'Claude + GPT-4 + Gemini 토론 합의' : photo.aiModel}
                  </div>
                )}
              </>
            ) : (
              <div style={{ padding: '40px 20px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '13px' }}>
                {isPending ? 'AI가 사진을 분석하고 있습니다...' : '아직 크리틱이 없습니다'}
              </div>
            )}
          </>
        )}

        {/* Debate Tab */}
        {activeTab === 'debate' && (
          <DebateView
            debate={photo.debate}
            individualEvaluations={photo.individualEvaluations}
          />
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
                {c.overallRating > 0 && (
                  <div className="comment-overall-rating">
                    <StarDisplay value={c.overallRating} size={16} />
                    <span className="comment-rating-value">{c.overallRating.toFixed(1)}</span>
                  </div>
                )}
                {c.scores && Object.keys(c.scores).length > 0 && (
                  <div className="comment-detail-chips">
                    {Object.entries(c.scores).map(([key, val]) => (
                      <span key={key} className="comment-score-chip">
                        {scoreLabels[key]?.icon} {scoreLabels[key]?.ko} <StarDisplay value={val} size={11} />
                      </span>
                    ))}
                  </div>
                )}
                <p className="comment-text">{c.text}</p>
              </div>
            ))}
            <CommentForm photoId={photo.id} onSubmit={(comment) => onAddComment(photo.id, comment)} />
          </div>
        )}
      </div>

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
}
