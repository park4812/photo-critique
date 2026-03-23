import { useState } from 'react';

export default function ContestList({ contests, onContestClick, onCreateContest, isAdmin, currentUser }) {
  const [showCreate, setShowCreate] = useState(false);
  const [title, setTitle] = useState('');
  const [desc, setDesc] = useState('');

  const handleCreate = () => {
    if (!title.trim()) return;
    onCreateContest({
      title: title.trim(),
      description: desc.trim(),
      createdByUid: currentUser?.uid || '',
      createdByName: currentUser?.displayName || currentUser?.email || '',
    });
    setTitle('');
    setDesc('');
    setShowCreate(false);
  };

  const activeContests = contests.filter(c => c.status === 'submitting' || c.status === 'voting');
  const closedContests = contests.filter(c => c.status === 'closed');

  const statusLabel = (s) => {
    if (s === 'submitting') return { text: '접수 중', cls: 'submitting' };
    if (s === 'voting') return { text: '투표 중', cls: 'voting' };
    return { text: '종료', cls: 'closed' };
  };

  const renderCard = (c) => {
    const sl = statusLabel(c.status);
    return (
      <div key={c.id} className={`contest-card ${sl.cls}`} onClick={() => onContestClick(c)}>
        <div className={`contest-card-status ${sl.cls}`}>{sl.text}</div>
        <div className="contest-card-title">{c.title}</div>
        {c.description && <div className="contest-card-desc">{c.description}</div>}
        <div className="contest-card-meta">
          <span>{c.entryCount || 0}명 참가</span>
          <span>·</span>
          <span>by {c.createdByName}</span>
        </div>
      </div>
    );
  };

  return (
    <div className="contest-list-container">
      <div className="contest-list-header">
        <h2 className="contest-list-title">투표</h2>
        {isAdmin && (
          <button className="album-create-btn" onClick={() => setShowCreate(true)}>
            + 새 투표
          </button>
        )}
      </div>

      {showCreate && (
        <div className="album-create-form">
          <input
            type="text"
            placeholder="투표 제목 (예: 3월 베스트 사진)"
            value={title}
            onChange={e => setTitle(e.target.value)}
            className="album-input"
            autoFocus
          />
          <textarea
            placeholder="설명 (선택)"
            value={desc}
            onChange={e => setDesc(e.target.value)}
            className="album-textarea"
            rows={2}
          />
          <div className="album-create-actions">
            <button className="album-save-btn" onClick={handleCreate}>만들기</button>
            <button className="album-cancel-btn" onClick={() => setShowCreate(false)}>취소</button>
          </div>
        </div>
      )}

      {activeContests.length > 0 && (
        <div className="contest-section">
          <h3 className="album-section-title">진행 중</h3>
          <div className="contest-grid">
            {activeContests.map(renderCard)}
          </div>
        </div>
      )}

      {closedContests.length > 0 && (
        <div className="contest-section">
          <h3 className="album-section-title">종료됨</h3>
          <div className="contest-grid">
            {closedContests.map(renderCard)}
          </div>
        </div>
      )}

      {contests.length === 0 && (
        <div className="album-empty">
          <div style={{ fontSize: '48px', marginBottom: '16px' }}>🏆</div>
          <p>아직 투표가 없습니다</p>
          {isAdmin && <p style={{ fontSize: '13px', opacity: 0.6 }}>새 투표를 만들어보세요!</p>}
        </div>
      )}
    </div>
  );
}
