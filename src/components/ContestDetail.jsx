import { useState, useEffect, useMemo, useRef } from 'react';

const RANK_STYLES = {
  1: { emoji: '🥇', frame: 'contest-frame-gold', label: '1위' },
  2: { emoji: '🥈', frame: 'contest-frame-silver', label: '2위' },
  3: { emoji: '🥉', frame: 'contest-frame-bronze', label: '3위' },
};

const STATUS_INFO = {
  submitting: { label: '접수 중', color: '#60a5fa', desc: '사진을 등록하세요. 등록 기간이 끝나면 투표가 시작됩니다.' },
  voting: { label: '투표 중', color: '#fbbf24', desc: '마음에 드는 사진에 투표하세요!' },
  closed: { label: '종료', color: '#888', desc: '투표가 종료되었습니다.' },
};

// localStorage 기반 토큰 관리
function getEditToken(contestId) {
  try { return localStorage.getItem(`contest_token_${contestId}`) || ''; } catch { return ''; }
}
function setEditToken(contestId, token) {
  try { localStorage.setItem(`contest_token_${contestId}`, token); } catch {}
}
function getAnonEntryId(contestId) {
  try { return localStorage.getItem(`contest_entry_${contestId}`) || ''; } catch { return ''; }
}
function setAnonEntryId(contestId, entryId) {
  try { localStorage.setItem(`contest_entry_${contestId}`, entryId); } catch {}
}
function clearAnonData(contestId) {
  try {
    localStorage.removeItem(`contest_token_${contestId}`);
    localStorage.removeItem(`contest_entry_${contestId}`);
  } catch {}
}
function generateToken() {
  return Math.random().toString(36).substring(2) + Date.now().toString(36);
}

export default function ContestDetail({ contest, onBack, currentUser, isAdmin }) {
  const [entries, setEntries] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [preview, setPreview] = useState(null);
  const [imageBlob, setImageBlob] = useState(null);
  const [votingId, setVotingId] = useState(null);
  const [viewImage, setViewImage] = useState(null);
  const [replacing, setReplacing] = useState(false);
  const [replacePreview, setReplacePreview] = useState(null);
  const [replaceBlob, setReplaceBlob] = useState(null);
  const [anonName, setAnonName] = useState('');
  const [anonToken, setAnonToken] = useState(() => getEditToken(contest.id));
  const [anonEntryId, setAnonEntryIdState] = useState(() => getAnonEntryId(contest.id));
  const fileRef = useRef(null);
  const replaceFileRef = useRef(null);

  const status = contest.status || 'submitting';
  const isSubmitting = status === 'submitting';
  const isVoting = status === 'voting';
  const isClosed = status === 'closed';
  const statusInfo = STATUS_INFO[status] || STATUS_INFO.submitting;

  // 내 출품작 찾기: 로그인=uid, 비로그인=editToken (React 상태 기반)
  const myEntry = useMemo(() => {
    if (currentUser?.uid) {
      return entries.find(e => e.uploaderUid === currentUser.uid);
    }
    if (anonToken && anonEntryId) {
      return entries.find(e => e.id === anonEntryId && e.editToken === anonToken);
    }
    return null;
  }, [entries, currentUser, anonToken, anonEntryId]);

  const hasSubmitted = !!myEntry;

  // 엔트리 실시간 구독
  useEffect(() => {
    let unsub;
    (async () => {
      const { subscribeToEntries } = await import('../services/firebaseService');
      unsub = subscribeToEntries(contest.id, setEntries);
    })();
    return () => { if (unsub) unsub(); };
  }, [contest.id]);

  // 정렬: closed면 투표순
  const sortedEntries = useMemo(() => {
    if (isClosed) {
      return [...entries].sort((a, b) => (b.voteCount || 0) - (a.voteCount || 0));
    }
    return entries;
  }, [entries, isClosed]);

  // 이미지 선택
  const handleFileSelect = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const MAX = 1600;
        let w = img.width, h = img.height;
        if (w > MAX || h > MAX) {
          if (w > h) { h = Math.round(h * MAX / w); w = MAX; }
          else { w = Math.round(w * MAX / h); h = MAX; }
        }
        canvas.width = w;
        canvas.height = h;
        canvas.getContext('2d').drawImage(img, 0, 0, w, h);
        canvas.toBlob((blob) => {
          setImageBlob(blob);
          setPreview(canvas.toDataURL('image/jpeg', 0.9));
        }, 'image/jpeg', 0.9);
      };
      img.src = ev.target.result;
    };
    reader.readAsDataURL(file);
  };

  // 출품
  const handleSubmit = async () => {
    if (!imageBlob) return;
    const uploaderUid = currentUser?.uid || '';
    const uploaderName = currentUser
      ? (currentUser.displayName || currentUser.email || '익명')
      : (anonName.trim() || '익명');
    if (!currentUser && !anonName.trim()) {
      alert('이름을 입력해주세요.');
      return;
    }
    setUploading(true);
    try {
      const { submitEntry } = await import('../services/firebaseService');
      const token = currentUser ? '' : generateToken();
      const entryId = await submitEntry(contest.id, imageBlob, uploaderUid, uploaderName, token);
      // 비로그인: localStorage + React 상태 동시 업데이트
      if (!currentUser && token) {
        setEditToken(contest.id, token);
        setAnonEntryId(contest.id, entryId);
        setAnonToken(token);
        setAnonEntryIdState(entryId);
      }
      setPreview(null);
      setImageBlob(null);
      setAnonName('');
    } catch (err) {
      alert(err.message);
    } finally {
      setUploading(false);
    }
  };

  // 투표
  const handleVote = async (entryId) => {
    if (!currentUser) return;
    setVotingId(entryId);
    try {
      const { voteEntry } = await import('../services/firebaseService');
      await voteEntry(contest.id, entryId, currentUser.uid);
    } catch (err) {
      console.error('Vote failed:', err);
    } finally {
      setVotingId(null);
    }
  };

  // 단계 진행
  const handleAdvance = async () => {
    let nextStatus, msg;
    if (isSubmitting) {
      nextStatus = 'voting';
      msg = '접수를 마감하고 투표를 시작하시겠습니까?\n등록된 사진이 모두에게 공개됩니다.';
    } else if (isVoting) {
      nextStatus = 'closed';
      msg = '투표를 종료하시겠습니까?\n결과와 출품자 이름이 공개됩니다.';
    }
    if (!nextStatus || !window.confirm(msg)) return;
    const { advanceContest } = await import('../services/firebaseService');
    await advanceContest(contest.id, nextStatus);
  };

  // 삭제
  const handleDelete = async () => {
    if (!window.confirm('이 투표를 완전히 삭제하시겠습니까?')) return;
    const { deleteContest } = await import('../services/firebaseService');
    await deleteContest(contest.id);
    onBack();
  };

  // 내 출품작 삭제
  const handleDeleteMyEntry = async (entryId) => {
    if (!window.confirm('출품을 취소하시겠습니까?')) return;
    const { deleteEntry } = await import('../services/firebaseService');
    await deleteEntry(contest.id, entryId);
    clearAnonData(contest.id);
    setAnonToken('');
    setAnonEntryIdState('');
  };

  // 사진 교체 파일 선택
  const handleReplaceFileSelect = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const MAX = 1600;
        let w = img.width, h = img.height;
        if (w > MAX || h > MAX) {
          if (w > h) { h = Math.round(h * MAX / w); w = MAX; }
          else { w = Math.round(w * MAX / h); h = MAX; }
        }
        canvas.width = w;
        canvas.height = h;
        canvas.getContext('2d').drawImage(img, 0, 0, w, h);
        canvas.toBlob((blob) => {
          setReplaceBlob(blob);
          setReplacePreview(canvas.toDataURL('image/jpeg', 0.9));
        }, 'image/jpeg', 0.9);
      };
      img.src = ev.target.result;
    };
    reader.readAsDataURL(file);
  };

  // 사진 교체 실행
  const handleReplace = async (entryId) => {
    if (!replaceBlob) return;
    setReplacing(true);
    try {
      const { replaceEntry } = await import('../services/firebaseService');
      await replaceEntry(contest.id, entryId, replaceBlob);
      setReplacePreview(null);
      setReplaceBlob(null);
    } catch (err) {
      alert('사진 교체 실패: ' + err.message);
    } finally {
      setReplacing(false);
    }
  };

  // 출품 가능 여부: 접수 중이고 아직 출품 안 한 경우 (로그인/비로그인 모두)
  const canSubmit = isSubmitting && !hasSubmitted;

  return (
    <div className="contest-detail-container">
      {/* 헤더 */}
      <div className="contest-detail-header">
        <button className="album-back-btn" onClick={onBack}>← 투표 목록</button>
        <div className="contest-detail-title-row">
          <h2 className="album-detail-name">{contest.title}</h2>
          <span className="contest-status-badge" style={{ background: `${statusInfo.color}22`, color: statusInfo.color }}>
            {statusInfo.label}
          </span>
          {isAdmin && (
            <div className="album-detail-actions">
              {!isClosed && (
                <button className="album-action-btn" onClick={handleAdvance} title={isSubmitting ? '투표 시작' : '투표 종료'}>
                  {isSubmitting ? '🗳️' : '🏁'}
                </button>
              )}
              <button className="album-action-btn album-delete" onClick={handleDelete} title="삭제">🗑</button>
            </div>
          )}
        </div>
        {contest.description && <p className="album-detail-desc">{contest.description}</p>}
        <div className="album-detail-meta">
          <span>{entries.length}명 참가</span>
          <span>·</span>
          <span style={{ color: statusInfo.color }}>{statusInfo.desc}</span>
        </div>
        {/* 관리자용 단계 진행 가이드 */}
        {isAdmin && !isClosed && (
          <div className="contest-admin-guide">
            <div className="contest-phase-bar">
              <div className={`contest-phase ${isSubmitting ? 'active' : 'done'}`}>① 접수</div>
              <div className="contest-phase-arrow">→</div>
              <div className={`contest-phase ${isVoting ? 'active' : isClosed ? 'done' : ''}`}>② 투표</div>
              <div className="contest-phase-arrow">→</div>
              <div className={`contest-phase ${isClosed ? 'active' : ''}`}>③ 결과</div>
            </div>
          </div>
        )}
      </div>

      {/* 접수 단계: 출품 영역 (로그인/비로그인 모두) */}
      {canSubmit && (
        <div className="contest-submit-area">
          {/* 비로그인 시 이름 입력 */}
          {!currentUser && (
            <div className="contest-anon-name">
              <input
                type="text"
                placeholder="이름을 입력하세요"
                value={anonName}
                onChange={(e) => setAnonName(e.target.value)}
                maxLength={20}
                className="contest-anon-input"
              />
            </div>
          )}
          {!preview ? (
            <div className="contest-drop-zone" onClick={() => fileRef.current?.click()}>
              <div style={{ fontSize: '36px', marginBottom: '8px' }}>📸</div>
              <div>사진을 선택하여 출품하세요</div>
              <div style={{ fontSize: '11px', opacity: 0.5, marginTop: '4px' }}>1인 1장만 가능</div>
              <input ref={fileRef} type="file" accept="image/*" onChange={handleFileSelect} style={{ display: 'none' }} />
            </div>
          ) : (
            <div className="contest-preview-area">
              <img src={preview} alt="미리보기" className="contest-preview-img" />
              <div className="contest-preview-actions">
                <button className="album-save-btn" onClick={handleSubmit} disabled={uploading}>
                  {uploading ? '출품 중...' : '출품하기'}
                </button>
                <button className="album-cancel-btn" onClick={() => { setPreview(null); setImageBlob(null); }}>취소</button>
              </div>
            </div>
          )}
        </div>
      )}
      {isSubmitting && hasSubmitted && (
        <div className="contest-submitted-badge">출품 완료! 접수 마감 후 투표가 시작됩니다.</div>
      )}

      {/* 접수 단계: 사진은 숨기고 참가자 수만 표시 */}
      {isSubmitting && (
        <div className="contest-waiting">
          <div style={{ fontSize: '48px', marginBottom: '12px' }}>🔒</div>
          <p>{entries.length}명이 출품했습니다</p>
          <p style={{ fontSize: '12px', opacity: 0.5 }}>접수 마감 후 사진이 공개됩니다</p>
          {/* 본인 출품작만 미리보기 + 수정/취소 가능 */}
          {myEntry && (() => {
            return (
              <div className="contest-my-preview">
                <p style={{ fontSize: '12px', marginBottom: '8px', opacity: 0.7 }}>내 출품작:</p>
                {replacePreview ? (
                  <div className="contest-replace-area">
                    <div className="contest-replace-compare">
                      <div className="contest-replace-col">
                        <span style={{ fontSize: '11px', opacity: 0.5 }}>현재</span>
                        <img src={myEntry.imageUrl} alt="" className="contest-my-thumb" />
                      </div>
                      <span style={{ fontSize: '20px', opacity: 0.4 }}>→</span>
                      <div className="contest-replace-col">
                        <span style={{ fontSize: '11px', opacity: 0.5 }}>변경</span>
                        <img src={replacePreview} alt="" className="contest-my-thumb" />
                      </div>
                    </div>
                    <div className="contest-preview-actions" style={{ marginTop: '8px' }}>
                      <button className="album-save-btn" onClick={() => handleReplace(myEntry.id)} disabled={replacing}>
                        {replacing ? '교체 중...' : '교체하기'}
                      </button>
                      <button className="album-cancel-btn" onClick={() => { setReplacePreview(null); setReplaceBlob(null); }}>취소</button>
                    </div>
                  </div>
                ) : (
                  <>
                    <img src={myEntry.imageUrl} alt="" className="contest-my-thumb" onClick={() => setViewImage(myEntry.imageUrl)} />
                    <div style={{ display: 'flex', gap: '8px', marginTop: '8px' }}>
                      <button className="contest-my-badge change" onClick={() => replaceFileRef.current?.click()}>📷 사진 변경</button>
                      <button className="contest-my-badge" onClick={() => handleDeleteMyEntry(myEntry.id)}>출품 취소</button>
                    </div>
                    <input ref={replaceFileRef} type="file" accept="image/*" onChange={handleReplaceFileSelect} style={{ display: 'none' }} />
                  </>
                )}
              </div>
            );
          })()}
        </div>
      )}

      {/* 투표 단계 & 종료 단계: 사진 그리드 */}
      {(isVoting || isClosed) && sortedEntries.length > 0 && (
        <div className={`contest-entries-grid ${isClosed ? 'results' : ''}`}>
          {sortedEntries.map((entry, idx) => {
            const rank = isClosed ? idx + 1 : null;
            const rankStyle = rank && RANK_STYLES[rank];
            const voted = entry.votes?.includes(currentUser?.uid);

            return (
              <div
                key={entry.id}
                className={`contest-entry ${rankStyle?.frame || ''} ${isClosed && rank > 3 ? 'contest-frame-normal' : ''}`}
              >
                {/* 순위 뱃지 */}
                {rankStyle && (
                  <div className="contest-rank-badge">
                    <span className="contest-rank-emoji">{rankStyle.emoji}</span>
                    <span className="contest-rank-label">{rankStyle.label}</span>
                  </div>
                )}
                {isClosed && rank > 3 && (
                  <div className="contest-rank-badge normal">
                    <span className="contest-rank-label">{rank}위</span>
                  </div>
                )}

                {/* 사진 */}
                <div className="contest-entry-img-wrap" onClick={() => setViewImage(entry.imageUrl)}>
                  <img src={entry.imageUrl} alt="" className="contest-entry-img" />
                </div>

                {/* 하단 정보 */}
                <div className="contest-entry-info">
                  {/* 종료 후만 이름 공개 */}
                  {isClosed && (
                    <div className="contest-entry-name">{entry.uploaderName}</div>
                  )}

                  <div className="contest-entry-vote-row">
                    {isVoting && currentUser && (
                      <button
                        className={`contest-vote-btn ${voted ? 'voted' : ''}`}
                        onClick={() => handleVote(entry.id)}
                        disabled={votingId === entry.id}
                      >
                        {voted ? '❤️' : '🤍'} {entry.voteCount || 0}
                      </button>
                    )}
                    {isClosed && (
                      <span className="contest-entry-votes">❤️ {entry.voteCount || 0}표</span>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {(isVoting || isClosed) && sortedEntries.length === 0 && (
        <div className="album-empty">
          <div style={{ fontSize: '48px', marginBottom: '16px' }}>🏆</div>
          <p>출품작이 없습니다</p>
        </div>
      )}

      {/* 이미지 확대 */}
      {viewImage && (
        <div className="modal-overlay" onClick={() => setViewImage(null)}>
          <img src={viewImage} alt="" style={{ maxWidth: '90vw', maxHeight: '85vh', borderRadius: '12px' }} />
        </div>
      )}
    </div>
  );
}
