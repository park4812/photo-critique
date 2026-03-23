import { useState, useEffect } from 'react';
import { scoreLabels } from '../sampleData';

const EXIF_FIELDS = [
  { key: 'camera', label: '카메라', icon: '📷' },
  { key: 'lens', label: '렌즈', icon: '🔭' },
  { key: 'settings', label: '촬영 설정', icon: '⚙️' },
  { key: 'dateTime', label: '촬영 일시', icon: '📅' },
  { key: 'gps', label: 'GPS 위치', icon: '📍' },
  { key: 'resolution', label: '해상도', icon: '📐' },
];

const EXIF_SETTINGS_KEY = 'photo-critique-exif-settings';

function getExifSettings() {
  try {
    const saved = localStorage.getItem(EXIF_SETTINGS_KEY);
    if (saved) return JSON.parse(saved);
  } catch {}
  // 기본값: 모두 표시
  return EXIF_FIELDS.reduce((acc, f) => ({ ...acc, [f.key]: true }), {});
}

function saveExifSettings(settings) {
  localStorage.setItem(EXIF_SETTINGS_KEY, JSON.stringify(settings));
}
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

function getGrade(score) {
  if (score >= 9.0) return { grade: 'S', label: '마스터', color: '#e2b340' };
  if (score >= 8.0) return { grade: 'A', label: '프로급', color: '#4ade80' };
  if (score >= 7.0) return { grade: 'B', label: '우수', color: '#60a5fa' };
  if (score >= 5.0) return { grade: 'C', label: '양호', color: '#fbbf24' };
  if (score >= 3.0) return { grade: 'D', label: '보통', color: '#fb923c' };
  return { grade: 'F', label: '부족', color: '#f87171' };
}

const GRADE_GUIDE = [
  { grade: 'S', range: '9.0~10.0', label: '마스터', desc: '수상작/전시 수준의 뛰어난 완성도', color: '#e2b340' },
  { grade: 'A', range: '8.0~8.9', label: '프로급', desc: '전문 포트폴리오에 넣을 수 있는 수준', color: '#4ade80' },
  { grade: 'B', range: '7.0~7.9', label: '우수', desc: '기술적으로 탄탄하고 매력적인 사진', color: '#60a5fa' },
  { grade: 'C', range: '5.0~6.9', label: '양호', desc: '기본기는 갖추었으나 개선 여지 있음', color: '#fbbf24' },
  { grade: 'D', range: '3.0~4.9', label: '보통', desc: '기초적인 부분에서 보완이 필요', color: '#fb923c' },
  { grade: 'F', range: '0~2.9', label: '부족', desc: '전반적으로 큰 개선이 필요', color: '#f87171' },
];

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

export default function SidePanel({ photo, isOpen, onClose, onAddComment, onReEvaluate, onDebateEvaluate, isAdmin, onDeletePhoto, currentUser, highlightCommentId, onHighlightDone }) {
  const [activeTab, setActiveTab] = useState('critique');
  const [reEvalLoading, setReEvalLoading] = useState(false);
  const [debateLoading, setDebateLoading] = useState(false);
  const [showGuide, setShowGuide] = useState(false);
  const [exifSettings, setExifSettings] = useState(getExifSettings);
  const [showExifConfig, setShowExifConfig] = useState(false);
  const [liveComments, setLiveComments] = useState([]);
  const [flashingId, setFlashingId] = useState(null);

  // 알림에서 클릭한 댓글 → comments 탭으로 전환 + 점멸 + 스크롤
  useEffect(() => {
    if (highlightCommentId && isOpen) {
      setActiveTab('comments');
      setFlashingId(highlightCommentId);
      // 스크롤
      setTimeout(() => {
        const el = document.getElementById(`comment-${highlightCommentId}`);
        if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }, 300);
      const timer = setTimeout(() => {
        setFlashingId(null);
        if (onHighlightDone) onHighlightDone();
      }, 3500);
      return () => clearTimeout(timer);
    }
  }, [highlightCommentId, isOpen]);

  // 댓글 서브컬렉션 실시간 구독
  useEffect(() => {
    if (!photo?.id) { setLiveComments([]); return; }
    let unsub;
    (async () => {
      const { subscribeToComments } = await import('../services/firebaseService');
      unsub = subscribeToComments(photo.id, (comments) => {
        setLiveComments(comments);
      });
    })();
    return () => { if (unsub) unsub(); };
  }, [photo?.id]);

  const toggleExifField = (key) => {
    const next = { ...exifSettings, [key]: !exifSettings[key] };
    setExifSettings(next);
    saveExifSettings(next);
  };

  if (!photo) return <div className={`side-panel ${isOpen ? 'open' : ''}`}></div>;

  const comments = liveComments.length > 0 ? liveComments : (photo.comments || []);
  const aiStatus = photo.aiStatus || (photo.aiEvaluated ? 'done' : 'none');
  const isPending = aiStatus === 'pending' || aiStatus === 'processing';
  const hasDebate = photo.debate || photo.individualEvaluations;
  const isDebateModel = photo.aiModel === 'multi-ai-debate';
  const isMyPhoto = isAdmin || (
    (photo.uploaderUid && currentUser?.uid) ? photo.uploaderUid === currentUser.uid
    : photo.uploaderName === (currentUser?.displayName || currentUser?.email)
  );

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

      {photo.uploaderName && (
        <div style={{
          padding: '6px 14px',
          fontSize: '12px',
          color: 'var(--text-muted)',
          borderBottom: '1px solid var(--border)',
          display: 'flex',
          alignItems: 'center',
          gap: '5px',
        }}>
          <span style={{ opacity: 0.6 }}>👤</span>
          <span>{photo.uploaderName}</span>
          {photo.date && (
            <span style={{ marginLeft: 'auto', fontSize: '11px', opacity: 0.5 }}>
              {new Date(photo.date?.seconds ? photo.date.seconds * 1000 : photo.date).toLocaleDateString('ko-KR')}
            </span>
          )}
        </div>
      )}

      <img className="panel-image" src={photo.imageUrl} alt={photo.title} />

      {/* EXIF Info */}
      {photo.exif && (
        <div style={{
          padding: '8px 14px', fontSize: '11px', color: 'var(--text-muted)',
          borderBottom: '1px solid var(--border)',
          background: 'rgba(255,255,255,0.02)'
        }}>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 12px', alignItems: 'center' }}>
            {exifSettings.camera && photo.exif.camera && (
              <span title="카메라" style={{ display: 'flex', alignItems: 'center', gap: '3px' }}>
                <span style={{ opacity: 0.6 }}>📷</span> {photo.exif.camera}
              </span>
            )}
            {exifSettings.lens && photo.exif.lens && (
              <span title="렌즈" style={{ display: 'flex', alignItems: 'center', gap: '3px' }}>
                <span style={{ opacity: 0.6 }}>🔭</span> {photo.exif.lens}
              </span>
            )}
            {exifSettings.settings && (photo.exif.focalLength || photo.exif.aperture || photo.exif.shutterSpeed || photo.exif.iso) && (
              <span title="촬영 설정" style={{ display: 'flex', alignItems: 'center', gap: '3px' }}>
                <span style={{ opacity: 0.6 }}>⚙️</span>
                {[photo.exif.focalLength, photo.exif.aperture, photo.exif.shutterSpeed, photo.exif.iso].filter(Boolean).join(' · ')}
              </span>
            )}
            {exifSettings.dateTime && photo.exif.dateTime && (
              <span title="촬영 일시" style={{ display: 'flex', alignItems: 'center', gap: '3px' }}>
                <span style={{ opacity: 0.6 }}>📅</span> {new Date(photo.exif.dateTime).toLocaleString('ko-KR')}
              </span>
            )}
            {exifSettings.gps && photo.exif.gps && (
              <a href={`https://maps.google.com/?q=${photo.exif.gps.lat},${photo.exif.gps.lng}`}
                target="_blank" rel="noopener noreferrer"
                title="촬영 위치 (Google Maps)"
                style={{ display: 'flex', alignItems: 'center', gap: '3px', color: 'var(--accent)', textDecoration: 'none' }}>
                <span style={{ opacity: 0.6 }}>📍</span> 위치 보기
              </a>
            )}
            {exifSettings.resolution && photo.exif.resolution && (
              <span title="원본 해상도">
                {photo.exif.resolution}
              </span>
            )}
            {isAdmin && (
              <span
                onClick={() => setShowExifConfig(!showExifConfig)}
                style={{ cursor: 'pointer', marginLeft: 'auto', opacity: 0.5, fontSize: '13px' }}
                title="표시 항목 설정"
              >⚙</span>
            )}
          </div>
          {showExifConfig && isAdmin && (
            <div style={{
              marginTop: '8px', paddingTop: '8px',
              borderTop: '1px solid var(--border)',
              display: 'flex', flexWrap: 'wrap', gap: '6px'
            }}>
              {EXIF_FIELDS.map(f => (
                <label key={f.key} style={{
                  display: 'flex', alignItems: 'center', gap: '4px',
                  padding: '3px 8px', borderRadius: '4px', cursor: 'pointer',
                  background: exifSettings[f.key] ? 'rgba(200,168,110,0.12)' : 'rgba(255,255,255,0.04)',
                  border: `1px solid ${exifSettings[f.key] ? 'rgba(200,168,110,0.3)' : 'var(--border)'}`,
                  fontSize: '11px', color: exifSettings[f.key] ? 'var(--text)' : 'var(--text-muted)'
                }}>
                  <input type="checkbox" checked={exifSettings[f.key]}
                    onChange={() => toggleExifField(f.key)}
                    style={{ width: '12px', height: '12px', accentColor: 'var(--accent)' }} />
                  <span>{f.icon}</span>
                  <span>{f.label}</span>
                </label>
              ))}
            </div>
          )}
        </div>
      )}

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
            {onReEvaluate && isAdmin && (
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
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <div className="score-total-label">종합 점수</div>
                {photo.totalScore > 0 && (() => {
                  const g = getGrade(photo.totalScore);
                  return (
                    <span style={{
                      padding: '1px 8px', borderRadius: '4px', fontSize: '12px', fontWeight: 700,
                      background: `${g.color}22`, color: g.color, letterSpacing: '0.5px'
                    }}>
                      {g.grade} · {g.label}
                    </span>
                  );
                })()}
              </div>
              <div style={{ fontSize: '11px', color: '#555', display: 'flex', alignItems: 'center', gap: '6px', marginTop: '4px' }}>
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
                <span onClick={() => setShowGuide(!showGuide)}
                  style={{ cursor: 'pointer', fontSize: '11px', color: 'var(--text-muted)', textDecoration: 'underline', textUnderlineOffset: '2px' }}>
                  {showGuide ? '기준 닫기' : '등급 기준?'}
                </span>
              </div>
            </div>
            {photo.aiEvaluated && !isPending && isAdmin && (
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

          {showGuide && (
            <div style={{
              margin: '10px 0', padding: '10px 12px',
              background: 'var(--bg)', borderRadius: '8px',
              border: '1px solid var(--border)'
            }}>
              <div style={{ fontSize: '11px', fontWeight: 600, marginBottom: '6px', color: 'var(--text-secondary)' }}>
                점수 등급 기준
              </div>
              {GRADE_GUIDE.map(g => (
                <div key={g.grade} style={{
                  display: 'flex', alignItems: 'center', gap: '8px',
                  padding: '3px 0', fontSize: '11px'
                }}>
                  <span style={{
                    width: '20px', textAlign: 'center', fontWeight: 700,
                    color: g.color
                  }}>{g.grade}</span>
                  <span style={{ width: '52px', color: 'var(--text-muted)', fontSize: '10px' }}>{g.range}</span>
                  <span style={{ color: g.color, fontWeight: 600, width: '40px' }}>{g.label}</span>
                  <span style={{ color: 'var(--text-secondary)', flex: 1 }}>{g.desc}</span>
                </div>
              ))}
            </div>
          )}

          <div className="score-bars">
            {Object.keys(scoreLabels).map(key => {
              const val = photo.scores[key];
              if (val == null) return null;
              const g = getGrade(val);
              return (
                <div key={key} className="score-bar-row">
                  <span className="score-bar-label">{scoreLabels[key]?.ko}</span>
                  <div className="score-bar-track">
                    <div className="score-bar-fill" style={{ width: `${val * 10}%`, background: getScoreColor(val) }} />
                  </div>
                  <span style={{
                    fontSize: '10px', fontWeight: 700, color: g.color,
                    width: '14px', textAlign: 'center'
                  }}>{g.grade}</span>
                  <span className="score-bar-value" style={{ color: getScoreColor(val) }}>{val.toFixed(1)}</span>
                </div>
              );
            })}
          </div>
        </div>

        {/* AI Tags */}
        {photo.aiTags && photo.aiTags.length > 0 && (
          <div className="tags">
            {photo.aiTags.map(tag => <span key={tag} className="tag ai-tag">#{tag}</span>)}
          </div>
        )}
        {/* User Tags */}
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
                {photo.references && photo.references.length > 0 && (
                  <div className="critique-section">
                    <div className="section-title">참고 작가 & 작품</div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                      {photo.references.map((ref, i) => (
                        <div key={i} style={{
                          padding: '10px 12px',
                          background: 'rgba(200, 168, 110, 0.06)',
                          border: '1px solid rgba(200, 168, 110, 0.15)',
                          borderRadius: '8px'
                        }}>
                          <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px', marginBottom: '4px' }}>
                            <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text)' }}>
                              {ref.photographer}
                            </span>
                            {ref.work && (
                              <span style={{ fontSize: '11px', color: 'var(--accent)' }}>
                                {ref.work}
                              </span>
                            )}
                          </div>
                          {ref.reason && (
                            <div style={{ fontSize: '12px', color: 'var(--text-secondary)', lineHeight: '1.5' }}>
                              {ref.reason}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
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
              <div key={c.id || i} className={`comment-card ${flashingId && flashingId === c.id ? 'comment-flash' : ''}`} id={`comment-${c.id}`}>
                <div className="comment-header">
                  <span className="comment-author">{c.author}</span>
                  <span className="comment-date">{c.date}</span>
                  {isAdmin && c.id && (
                    <button
                      className="comment-delete-btn"
                      title="크리틱 삭제"
                      onClick={async () => {
                        if (!window.confirm(`${c.author}님의 크리틱을 삭제하시겠습니까?`)) return;
                        const { deleteComment } = await import('../services/firebaseService');
                        await deleteComment(photo.id, c.id);
                      }}
                    >✕</button>
                  )}
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
            <CommentForm photoId={photo.id} onSubmit={(comment) => onAddComment(photo.id, comment)} currentUser={currentUser} />
          </div>
        )}
      </div>

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
}
